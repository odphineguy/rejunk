-- Job photos: storage bucket + metadata table (standalone/additive).
-- Extracted from 202606070001_driver_phase1.sql so driver photo upload works
-- on the live DB without applying the full phase-1 migration. Differences from
-- phase 1, on purpose:
--   * No FKs to job_stops / employee_profiles (those tables are not live).
--   * RLS relaxed to any authenticated user, matching the app's anonymous-session
--     model (same as migration 0003) — the phase-1 is_dispatch_user /
--     current_user_is_assigned_to_job helpers do not exist live.
--   * Bucket is PUBLIC (read) because the client renders photos via getPublicUrl.
-- Phase 1 uses `create table if not exists` / `on conflict do update`, so applying
-- it later will not conflict with this migration.

create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs (id) on delete cascade,
  stop_id uuid,
  uploaded_by uuid,
  storage_path text not null,
  photo_type text not null default 'other' check (photo_type in ('before', 'progress', 'after', 'damage', 'issue', 'receipt', 'equipment', 'other')),
  visibility text not null default 'internal' check (visibility in ('internal', 'customer_ready')),
  caption text,
  created_at timestamptz not null default now()
);

create index if not exists job_photos_job_created_idx on public.job_photos (job_id, created_at desc);

alter table public.job_photos enable row level security;

drop policy if exists "authenticated read job photos" on public.job_photos;
drop policy if exists "authenticated create job photos" on public.job_photos;
drop policy if exists "authenticated update job photos" on public.job_photos;

create policy "authenticated read job photos"
  on public.job_photos for select to authenticated using (true);
create policy "authenticated create job photos"
  on public.job_photos for insert to authenticated with check (true);
create policy "authenticated update job photos"
  on public.job_photos for update to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "authenticated upload job photos" on storage.objects;
drop policy if exists "authenticated read job photo objects" on storage.objects;

create policy "authenticated upload job photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos');

create policy "authenticated read job photo objects"
  on storage.objects for select to authenticated
  using (bucket_id = 'job-photos');
