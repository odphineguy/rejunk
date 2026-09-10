#!/usr/bin/env python3
"""Regression test in a disposable PostgreSQL cluster; never connects to Supabase.

Requires initdb, pg_ctl and psql on PATH. Run: python3 scripts/security/test-profile-privileges.py
"""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20260910035327_lock_profile_privileges.sql"


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


with tempfile.TemporaryDirectory(prefix="rejunk-profile-security-") as temp:
    data = str(Path(temp) / "data")
    run("initdb", "-D", data, "-A", "trust", "-U", "postgres")
    # Unix socket only in a private directory: no exposed TCP test server.
    run("pg_ctl", "-D", data, "-l", str(Path(temp) / "postgres.log"),
        "-o", f"-k {temp} -c listen_addresses=''", "-w", "start")
    try:
        psql = ["psql", "-X", "-h", temp, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]

        def sql(statement):
            return run(*psql, "-c", statement).stdout

        sql("""
          create role anon;
          create role authenticated;
          create role service_role bypassrls;
          create schema auth;
          create table auth.users (
            id uuid primary key, email text, raw_user_meta_data jsonb,
            is_anonymous boolean default false
          );
          create function auth.uid() returns uuid language sql stable as
            $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
          grant usage on schema auth to authenticated;
        """)
        run(*psql, "-f", str(ROOT / "supabase/migrations/0001_init.sql"))
        run(*psql, "-f", str(ROOT / "supabase/migrations/0002_harden_functions.sql"))
        # Model Supabase default grants plus a separately granted column privilege.
        sql("""
          grant all on all tables in schema public to authenticated, anon, service_role;
          grant update(role) on public.profiles to authenticated;
          insert into auth.users values
            ('00000000-0000-0000-0000-000000000001', null, '{}', true),
            ('00000000-0000-0000-0000-000000000002', null, '{}', true);
          set role authenticated;
          select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
          update public.profiles set role='owner' where id=auth.uid();
          do $$ begin
            if not public.is_manager() then raise exception 'Original exploit did not reproduce'; end if;
          end $$;
          reset role;
        """)
        print("PASS: reproduced anonymous self-promotion before the fix")
        run(*psql, "-f", str(MIGRATION))
        run(*psql, "-f", str(MIGRATION))  # safe to reapply
        sql("""
          set role authenticated;
          select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
          do $$ begin
            if public.is_manager() then raise exception 'Anonymous owner retains manager access'; end if;
          end $$;
          reset role;
        """)

        for role in ("anon", "authenticated"):
            for statement in (
                "update public.profiles set role='admin' where id=auth.uid()",
                "update public.profiles set is_active=true where id=auth.uid()",
                "insert into public.profiles (id,role) values (auth.uid(),'owner')",
                "insert into public.profiles (id,role) values (auth.uid(),'owner') on conflict(id) do update set role='owner'",
                "delete from public.profiles where id=auth.uid()",
                "truncate public.profiles cascade",
            ):
                try:
                    sql(f"set role {role}; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false); {statement}")
                except subprocess.CalledProcessError as error:
                    if 'permission denied' not in error.stderr:
                        raise
                else:
                    raise AssertionError(f"Unexpected permission: {role}: {statement}")
        print("PASS: insert, update, upsert, delete, truncate blocked for both browser roles")
        sql("""
          -- Empty-table signup must no longer bootstrap an owner.
          delete from public.profiles;
          insert into auth.users values
            ('00000000-0000-0000-0000-000000000003', null, '{"role":"owner"}', true),
            ('00000000-0000-0000-0000-000000000004', 'fixture@example.invalid', '{"role":"admin"}', false);
          do $$ begin
            if exists(select 1 from public.profiles where role <> 'crew') then
              raise exception 'Signup assigned a privileged role';
            end if;
          end $$;
          set role service_role;
          update public.profiles set role='owner' where id='00000000-0000-0000-0000-000000000004';
          reset role;
          set role authenticated;
          select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
          do $$ begin
            if not public.is_manager() then raise exception 'Trusted non-anonymous owner lost access'; end if;
          end $$;
          reset role;
          update public.profiles set is_active=false where id='00000000-0000-0000-0000-000000000004';
          set role authenticated;
          do $$ begin
            if public.is_manager() then raise exception 'Inactive owner retained access'; end if;
          end $$;
        """)
        print("PASS: safe signup, metadata ignored, server provisioning works, inactive owner denied")
    finally:
        run("pg_ctl", "-D", data, "-m", "fast", "-w", "stop")
