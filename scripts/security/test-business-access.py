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
        for migration in ('20260910042932_bind_business_identity.sql','20260910043256_restrict_business_data.sql'):
            run(*cmd,'-f',str(ROOT/'supabase/migrations'/migration))
        assert actor('select count(*) from jobs')=='0'
        assert actor('select count(*) from app_leads_v')=='0'
        assert actor("select count(*) from storage.objects")=='0'
        denied("insert into clients values('bad','bad')")
        denied('truncate jobs')
        denied('select * from app_private.identity_bindings')
        denied("select public.dashboard_metrics('progressive',current_date)")
        denied('select public.forward_fill_negotiation_job_map()')
        denied('select * from jobs',role='anon')
        denied("select public.bind_business_identity(repeat('s',64),null)",role='anon')
        assert actor("select public.bind_business_identity('forged',null)")=='f'
        print('PASS: anonymous, unbound, forged credentials, privileged RPCs and TRUNCATE denied')
        assert actor("select public.bind_business_identity(repeat('s',64),null)",2)=='t'
        assert actor('select count(*) from jobs',2)=='3'
        assert actor('select count(*) from clients',2)=='1'
        assert actor('select count(*) from pricebook_items',2)=='1'
        assert actor('select count(*) from app_leads_v',2)=='1'
        assert actor('select count(*) from app_settings',2)=='1'
        actor("insert into clients values('office','allowed')",2)
        denied("insert into pricebook_items values('bad','wellsentry')",2)
        denied("select public.dashboard_metrics('wellsentry',current_date)",2)
        denied("select public.dashboard_metrics_series('progressive',current_date,1000000)",2)
        denied("select public.dashboard_metrics_series('progressive',current_date,null)",2)
        assert actor("select jsonb_array_length(public.dashboard_metrics_series('progressive',current_date,8))",2)=='8'
        assert actor("select public.dashboard_metrics('progressive',current_date)->>'tenant'",role='service_role')=='progressive'
        print('PASS: verified staff reads/writes, tenant boundaries, reporting authorization and bounds')
        assert actor("select public.bind_business_identity(null,repeat('d',64))",3)=='t'
        assert actor('select count(*) from clients',3)=='0'
        assert actor('select count(*) from jobs',3)=='0'
        assert actor('select count(*) from driver_sessions',3)=='1'
        assert actor("select jsonb_array_length(public.get_driver_today())",3)=='1'
        assert actor("select (public.get_driver_today()->0->'job') ?| array['quotedAmount','actuals','futureSecret']",3)=='f'
        assert actor("select count(*) from storage.objects",3)=='1'
        denied("insert into storage.objects(bucket_id,name) values('job-photos','job-b/forged.jpg')",3)
        denied("insert into driver_location_history(session_id,employee_id,lat) values('00000000-0000-0000-0000-000000000031','driver-b',1)",3)
        actor("insert into driver_location_history(session_id,employee_id,lat) values('00000000-0000-0000-0000-000000000030','driver-a',1)",3)
        assert actor("with changed as(update driver_sessions set last_lat=999 where employee_id='driver-b' returning id) select count(*) from changed",3)=='0'
        actor("select public.driver_update_job_status('job-a','en_route')",3)
        denied("select public.driver_update_job_status('job-b','en_route')",3)
        denied("select public.driver_update_job_status('job-a','completed')",3)
        denied("select public.driver_create_thread('broadcast')",3)
        denied("select public.driver_create_thread('job','job-b')",3)
        thread = actor("select public.driver_create_thread('direct')",3)
        assert actor("select public.driver_create_thread('direct')",3)==thread
        actor(f"insert into dispatch_messages(thread_id,sender_id,sender_name,body) values('{thread}','driver-a','Driver A','ok')",3)
        denied(f"insert into dispatch_messages(thread_id,sender_id,sender_name,body) values('{thread}','driver-b','Driver B','spoof')",3)
        assert actor("select public.bind_business_identity(null,repeat('e',64))",4)=='t'
        assert actor('select count(*) from dispatch_messages',4)=='0'
        denied(f"insert into dispatch_thread_participants(thread_id,employee_id) values('{thread}','driver-b')",4)
        assert sql("select data->>'quotedAmount' from jobs where id='job-a'")=='999'
        job_thread = actor("select public.driver_create_thread('job','job-a')",3)
        actor(f"insert into dispatch_messages(thread_id,sender_id,sender_name,body) values('{job_thread}','driver-a','Driver A','job chat')",3)
        sql("insert into driver_activations values('00000000-0000-0000-0000-000000000022','duplicate-name','Driver A','activated')")
        assert actor('select jsonb_array_length(public.get_driver_today())',3)=='0'
        assert actor(f"select count(*) from dispatch_messages where thread_id='{job_thread}'",3)=='0'
        sql("update jobs set data=jsonb_set(data,'{assignment,employeeIds}','[\"driver-a\"]') where id='job-a'")
        assert actor('select jsonb_array_length(public.get_driver_today())',3)=='1'
        assert actor(f"select count(*) from dispatch_messages where thread_id='{job_thread}'",3)=='1'
        sql("update jobs set data=jsonb_set(data,'{assignment,employeeIds}','[]') where id='job-a'")
        assert actor('select jsonb_array_length(public.get_driver_today())',3)=='0'
        assert actor(f"select count(*) from dispatch_messages where thread_id='{job_thread}'",3)=='0'
        print('PASS: driver assignment, masked jobs, GPS ownership, private photos, chat membership and sender identity')
        print('PASS: financial fields preserved on status writes; ambiguous names denied; stable IDs and reassignment enforced')
        sql("update staff set active=false")
        assert actor('select count(*) from clients',2)=='0'
        sql("update staff set active=true; update staff_sessions set expires_at=now()-interval '1 second'")
        assert actor('select count(*) from clients',2)=='0'
        sql("update driver_sessions set session_token_hash=null where employee_id='driver-a'")
        assert actor('select count(*) from driver_sessions',3)=='0'
        assert actor('select jsonb_array_length(public.get_driver_today())',3)=='0'
        sql("update driver_activations set status='revoked' where employee_id='driver-b'")
        assert actor('select count(*) from driver_sessions',4)=='0'
        assert actor('select count(*) from clients',role='service_role')=='2'
        assert sql("select public from storage.buckets where id='job-photos'")=='f'
        print('PASS: staff expiry/deactivation, driver logout/revocation, private bucket, service-role pipeline access')
    except subprocess.CalledProcessError as e:
        print(e.stderr)
        raise
    finally:
        run('pg_ctl','-D',data,'-m','fast','-w','stop')
