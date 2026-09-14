#!/usr/bin/env python3
"""Disposable PostgreSQL integration tests. No production access or credentials."""
from pathlib import Path
import subprocess
import os
import tempfile

ROOT = Path(__file__).resolve().parents[2]
# PostgreSQL 15+ is required for invoker views (production uses 17).
pg_bin = os.environ.get('PG_BIN')
if not pg_bin and Path('/opt/homebrew/opt/postgresql@17/bin').is_dir():
    pg_bin = '/opt/homebrew/opt/postgresql@17/bin'
if pg_bin:
    os.environ['PATH'] = pg_bin + os.pathsep + os.environ['PATH']
def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True)

with tempfile.TemporaryDirectory(prefix='rejunk-access-') as temp:
    data = str(Path(temp)/'data')
    run('initdb','-D',data,'-A','trust','-U','postgres')
    run('pg_ctl','-D',data,'-l',str(Path(temp)/'log'),'-o',f"-k {temp} -c listen_addresses=''",'-w','start')
    try:
        cmd = ['psql','-X','-At','-h',temp,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
        def sql(s): return run(*cmd,'-c',s).stdout.strip()
        def actor(s, user=1, role='authenticated'):
            return sql(f"set role {role}; select set_config('request.jwt.claims','{{\"role\":\"{role}\"}}',false); select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-{user:012d}',false); {s}").splitlines()[-1]
        def denied(s,user=1,role='authenticated'):
            try: actor(s,user,role)
            except subprocess.CalledProcessError as e:
                assert any(x in e.stderr for x in ('permission denied','row-level security','required','Invalid','Report range')), e.stderr
            else: raise AssertionError('Expected denial: '+s)
        run(*cmd,'-f',str(ROOT/'scripts/security/business-access-fixture.sql'))
        run(*cmd,"-f",str(ROOT/"scripts/security/owner-financial-fixture.sql"))
        for migration in ('20260910042932_bind_business_identity.sql','20260910043256_restrict_business_data.sql','20260910060045_owner_financial_access.sql','20260910060647_enforce_owner_financial_access.sql','20260912000001_app_employees_fleet.sql','20260912000002_ticket_shape.sql','20260914100450_persistent_abuse_limits.sql'):
            run(*cmd,'-f',str(ROOT/'supabase/migrations'/migration))

        from concurrent.futures import ThreadPoolExecutor
        def reserve(ip="192.0.2.1",staff="null"):
            return actor(f"select reserve_vision_analysis('{ip}',{staff})->>'allowed'",role='service_role')
        # Separate connections and concurrent workers simulate independent warm/cold servers.
        with ThreadPoolExecutor(max_workers=12) as pool:
            admitted=list(pool.map(lambda _: reserve(),range(32)))
        assert admitted.count('true')==20, admitted
        assert reserve()=='false'
        assert actor("select (reserve_vision_analysis('192.0.2.1',null)->>'retry_after')::int>0",role='service_role')=='t'
        denied("select reserve_vision_analysis('192.0.2.2',null)")
        denied("select reserve_vision_analysis('192.0.2.2',null)",role='anon')
        denied("select * from app_private.abuse_windows")
        denied("select app_private.take_abuse_budget('reset',100,300,1)")
        # A persisted counter survives an actual PostgreSQL restart.
        run('pg_ctl','-D',data,'-l',str(Path(temp)/'restart.log'),'-m','fast','-w','restart')
        assert reserve()=='false'
        sql("update app_private.abuse_windows set hits=array_fill(now()-interval '6 minutes',array[20]) where bucket like 'vision:ip:%'")
        assert reserve()=='true'
        # Canonical IPv6 spellings share one budget.
        sql("delete from app_private.abuse_windows")
        for _ in range(20): assert reserve('2001:db8::1')=='true'
        assert reserve('2001:0db8:0:0:0:0:0:1')=='false'
        # Rotating IPs cannot avoid the public rolling daily ceiling.
        sql("delete from app_private.abuse_windows")
        sql("insert into app_private.abuse_windows values('vision:public:day',array_fill(now(),array[200]),now()+interval '1 day')")
        assert reserve('192.0.2.9')=='false'
        assert reserve('192.0.2.10')=='false'
        staff="'00000000-0000-0000-0000-000000000011'"
        assert reserve('192.0.2.11',staff)=='true' # Public quota cannot starve staff.
        sql("delete from app_private.abuse_windows")
        for i in range(60): assert reserve(f'192.0.2.{i+1}',staff)=='true'
        assert reserve('192.0.2.100',staff)=='false'
        sql("delete from app_private.abuse_windows")
        sql("insert into app_private.abuse_windows values('vision:staff:day:00000000-0000-0000-0000-000000000011',array_fill(now(),array[500]),now()+interval '1 day')")
        assert reserve('192.0.2.101',staff)=='false'
        print('PASS: concurrent/restarted AI counters, rolling expiry, canonical IPs, daily ceilings and private grants')
        sql("delete from app_private.abuse_windows")
        assert actor("select bind_business_identity(repeat('o',64),null)",5)=='t'
        for _ in range(4):
            assert actor("select jsonb_array_length(dashboard_metrics_series('progressive',current_date,90))",5)=='90'
        try: actor("select dashboard_metrics('progressive',current_date)",5)
        except subprocess.CalledProcessError as e: assert 'Too many dashboard requests' in e.stderr
        else: raise AssertionError("Report-day budget bypass")
        # A second token/transport for the same staff account shares the budget.
        sql("insert into staff_sessions values(repeat('n',64),'00000000-0000-0000-0000-000000000011',now()+interval '1 day')")
        actor("select bind_business_identity(repeat('n',64),null)",1)
        try: actor("select dashboard_metrics('progressive',current_date)")
        except subprocess.CalledProcessError as e: assert 'Too many dashboard requests' in e.stderr
        else: raise AssertionError("Session rotation bypass")
        assert actor("select jsonb_array_length(dashboard_metrics_series('progressive',current_date,90))",role='service_role')=='90'
        sql("delete from app_private.abuse_windows")
        assert actor("select dashboard_metrics('progressive',current_date)::text like '%revenue%'",5)=='f'
        for _ in range(59): actor("select dashboard_metrics('progressive',current_date)",5)
        try: actor("select dashboard_metrics('progressive',current_date)",5)
        except subprocess.CalledProcessError as e: assert 'Too many dashboard requests' in e.stderr
        else: raise AssertionError("Request budget bypass")
        denied("select dashboard_metrics_series('progressive',current_date,91)",5)
        print('PASS: shared single/series limits, weighted report cost, token rotation, owner masking and trusted service access')
    finally:
        run('pg_ctl','-D',data,'-m','immediate','-w','stop')
