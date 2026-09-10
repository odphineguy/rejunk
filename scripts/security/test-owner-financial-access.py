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
        for migration in ('20260910042932_bind_business_identity.sql','20260910043256_restrict_business_data.sql','20260910060045_owner_financial_access.sql','20260910060647_enforce_owner_financial_access.sql'):
            run(*cmd,'-f',str(ROOT/'supabase/migrations'/migration))

        assert actor("select bind_business_identity(repeat('s',64),null)",2)=='t'
        assert actor("select bind_business_identity(repeat('o',64),null)",5)=='t'
        for table in ('jobs','saved_estimates','pricebook_items','pricing_defaults','thumbtack_leads','thumbtack_messages','app_settings','vehicles','app_payments'):
            assert actor(f'select count(*) from {table}',5)=='0',table
        assert actor("select count(*) from app_leads_v",5)=='0'
        denied("select business_rows('jobs')")
        denied("select business_rows('staff')",5)
        denied("select business_rows('jobs')",3)
        assert actor("select business_rows('jobs')->0->'data'->>'quotedAmount'",5)=='999'
        assert actor("select business_rows('jobs')::text like '%estimatedCost%'",5)=='f'
        assert actor("select business_rows('jobs')::text like '%actuals%'",5)=='f'
        assert actor("select business_rows('jobs')::text like '%futureSecret%'",5)=='f'
        assert actor("select business_rows('jobs')::text like '%estimatedCost%'",2)=='t'
        assert actor("select business_rows('saved_estimates')::text like '%estimatedCost%'",5)=='f'
        assert actor("select business_rows('saved_estimates')::text like '%unitPrice%'",5)=='t'
        assert actor("select business_rows('pricebook_items')::text like '%margin_decimal%'",5)=='f'
        assert actor("select business_rows('pricebook_items')->0->>'price'",5)=='200'
        assert actor("select business_rows('pricing_defaults')",5)=='[]'
        assert actor("select business_conversation('n')::text like '%privateCost%'",5)=='f'
        assert actor("select business_conversation('n')::text like '%$500%'",5)=='t'
        assert actor("select dashboard_metrics('progressive',current_date)::text like '%revenue%'",5)=='f'
        assert actor("select dashboard_metrics('progressive',current_date)::text like '%future_financial_metric%'",5)=='f'
        assert actor("select dashboard_metrics('progressive',current_date)->>'jobs_completed'",5)=='2'
        assert actor("select dashboard_metrics_series('progressive',current_date,2)::text like '%collected%'",5)=='f'
        assert actor("select dashboard_metrics('progressive',current_date)->>'revenue'",2)=='900'
        print('PASS: office reads preserve customer prices and operations; raw financial tables, new fields, and reports are protected')
        actor("""select office_save_job('{"id":"job-a","customerName":"Office edited","quotedAmount":1200,"estimatedCost":0,"paymentStatus":"unpaid","actuals":{"disposalCost":0}}')""",5)
        assert sql("select data->>'estimatedCost' from jobs where id='job-a'")=='123'
        assert sql("select data->'actuals'->>'disposalCost' from jobs where id='job-a'")=='99'
        assert sql("select data->>'paymentStatus' from jobs where id='job-a'")=='paid'
        assert sql("select data->>'customerName' from jobs where id='job-a'")=='Office edited'
        assert sql("select data->>'quotedAmount' from jobs where id='job-a'")=='1200'
        actor("""select office_save_estimate('{"id":"estimate-a","finalQuote":600,"grossProfitDollars":0,"service":{"total":600,"estimatedCost":0}}')""",5)
        assert sql("select data->>'grossProfitDollars' from saved_estimates")=='300'
        assert sql("select data->'service'->>'estimatedCost' from saved_estimates")=='200'
        assert sql("select data->>'finalQuote' from saved_estimates")=='600'
        assert actor("with changed as (update jobs set data='{}' returning id) select count(*) from changed",5)=='0'
        denied("""insert into app_payments values('p','{}',now())""",5)
        actor("""insert into app_payments values('p','{"baseAmount":999}',now())""",2)
        assert actor("select count(*) from app_payments",2)=='1'
        assert actor("select count(*) from app_payments",5)=='0'
        assert actor("select count(*) from jobs",role='service_role')=='3'

        sql("insert into job_photos(job_id,storage_path,photo_type) values('job-a','job-a/receipt.jpg','receipt'),('job-a','job-a/before.jpg','before')")
        sql("insert into storage.objects(bucket_id,name) values('job-photos','job-a/receipt.jpg'),('job-photos','job-a/before.jpg')")
        assert actor("select count(*) from job_photos where photo_type='receipt'",5)=='0'
        assert actor("select count(*) from storage.objects where name='job-a/receipt.jpg'",5)=='0'
        assert actor("select count(*) from storage.objects where name='job-a/before.jpg'",5)=='1'
        assert actor("select count(*) from storage.objects where name='job-a/receipt.jpg'",2)=='1'
        denied("select store_office_quote('00000000-0000-0000-0000-000000000011','{}')",5)
        qid=actor("select store_office_quote('00000000-0000-0000-0000-000000000011','{\"baseCost\":125,\"laborCost\":100}')",role='service_role')
        actor("select office_save_estimate('{\"id\":\"new-junk\",\"finalQuote\":400,\"quoteId\":\""+qid+"\"}')",5)
        assert sql("select data->>'baseCost' from saved_estimates where id='new-junk'")=='125'
        assert actor("select business_rows('saved_estimates')::text like '%laborCost%'",5)=='f'
        denied("select office_save_estimate('{\"id\":\"no-quote\",\"finalQuote\":1}')",5)

        actor("""select office_save_estimate('{"id":"new-service","mode":"service","finalQuote":600,"baseCost":0,"service":{"total":600,"estimatedCost":0,"lineItems":[{"itemId":"p","quantity":2,"unitPrice":200,"lineTotal":400}]}}')""",5)
        assert sql("select data->>'baseCost' from saved_estimates where id='new-service'")=='120.00'
        actor("""select office_save_job('{"id":"from-service","sourceEstimateId":"new-service","quotedAmount":600}')""",5)
        assert sql("select data->>'estimatedCost' from jobs where id='from-service'")=='120.00'
        print('PASS: receipt metadata/files are owner-only for office accounts; server quote snapshots retain owner costs without returning them')
        sql("update staff set role='office' where id='00000000-0000-0000-0000-000000000010'")
        assert actor("select count(*) from jobs",2)=='0'
        assert actor("select business_rows('jobs')::text like '%estimatedCost%'",2)=='f'
        print('PASS: office edits preserve hidden costs/payments; owner payments and immediate role demotion work; service integrations retain access')
    finally:
        run('pg_ctl','-D',data,'-m','immediate','-w','stop')
