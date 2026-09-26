-- BOOKING_TO_CREW_SPEC deliverable 2: crew taps text the customer.
-- "On My Way" and "Complete" queue one customer text each (never twice per job). The pipeline
-- (rejunk-webhook-services, thumbtack-send drain → _shared/customer_notify.ts) picks the number,
-- writes the words, sends through the one A2P Twilio number (or a Thumbtack message for
-- relay-only customers) and records the outcome here. The browser never sees phone numbers or
-- Twilio: drivers read only the outcome through driver_job_notifications(); office staff read it
-- through job_customer_notifications(). Additive; replaces driver_update_job_status in place.
begin;

create table public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'progressive',
  job_id text not null,
  kind text not null check (kind in ('omw','finish')),
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
  channel text check (channel in ('sms','thumbtack')),
  to_phone text,
  negotiation_id text,
  driver_employee_id text,
  body text,
  reason text,
  send_after timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  twilio_sid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, kind)
);
create index customer_notifications_queue_idx on public.customer_notifications (status, send_after);
create index customer_notifications_phone_idx on public.customer_notifications (to_phone, sent_at desc);
alter table public.customer_notifications enable row level security;
revoke all on table public.customer_notifications from public, anon, authenticated;

create or replace function public.driver_update_job_status(target_job_id text,next_status text,note text default null) returns void
language plpgsql security definer set search_path='' as $$
declare prior text; tap text; allowed jsonb := '{"assigned":["en_route","delayed","issue"],"en_route":["arrived","in_progress","delayed","issue"],"arrived":["in_progress","delayed","issue"],"in_progress":["paused","loaded","completed","delayed","issue"],"paused":["in_progress","completed","issue"],"loaded":["en_route_to_next_stop","en_route_to_disposal","paused","completed","delayed","issue"],"en_route_to_next_stop":["arrived","paused","completed","delayed","issue"],"en_route_to_disposal":["dumping","paused","completed","delayed","issue"],"dumping":["completed","paused","delayed","issue"],"delayed":["en_route","arrived","in_progress","loaded","issue"],"issue":["in_progress"],"completed":[],"canceled":[]}';
begin
  if not app_private.assigned_job(target_job_id) then raise exception 'Assigned driver required' using errcode='42501'; end if;
  select status into prior from public.jobs where id=target_job_id for update;
  if not app_private.assigned_job(target_job_id) then raise exception 'Assigned driver required' using errcode='42501'; end if;
  prior := case prior when 'open' then 'assigned' when 'scheduled' then 'assigned' when 'on_my_way' then 'en_route' else prior end;
  if next_status is null or not (allowed ? next_status) or (next_status<>prior and not ((allowed->prior) ? next_status)) then
    raise exception 'Invalid status transition' using errcode='22023';
  end if;
  update public.jobs set status=next_status,updated_at=now(),
    data=jsonb_set(jsonb_set(data,'{status}',to_jsonb(next_status)),'{updatedAt}',to_jsonb(now())) where id=target_job_id;

  if next_status<>prior then
    tap := case
      when next_status='in_progress' then
        case when prior='paused' or exists(select 1 from public.job_time_events e
          where e.job_id=target_job_id and e.kind='start' and e.source='driver') then 'resume' else 'start' end
      when next_status='completed' then 'complete'
      when next_status in ('paused','delayed','issue')
        and prior in ('in_progress','loaded','en_route_to_next_stop','en_route_to_disposal','dumping') then 'pause'
    end;
    if tap is not null then
      insert into public.job_time_events(job_id,kind,source,employee_id,occurred_at,note)
        values(target_job_id,tap,'driver',app_private.driver_employee(),now(),note);
    end if;

    -- Customer texts: one "on the way" and one "all done" per job, ever (re-taps don't resend).
    if next_status in ('en_route','completed') then
      insert into public.customer_notifications(job_id,kind,driver_employee_id)
        values(target_job_id, case next_status when 'en_route' then 'omw' else 'finish' end, app_private.driver_employee())
        on conflict (job_id,kind) do nothing;
    end if;
  end if;
end $$;
revoke all on function public.driver_update_job_status(text,text,text) from public,anon;
grant execute on function public.driver_update_job_status(text,text,text) to authenticated;

-- What the driver sees next to the buttons: outcome only, never the number or the words.
create function public.driver_job_notifications(target_job_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not app_private.assigned_job(target_job_id) then raise exception 'Assigned driver required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('kind',n.kind,'status',n.status,'channel',n.channel,
      'reason',n.reason,'sendAfter',n.send_after,'sentAt',n.sent_at) order by n.created_at)
    from public.customer_notifications n where n.job_id=target_job_id), '[]'::jsonb);
end $$;

-- Office view (Dispatch Center / job page): the words and the outcome.
create function public.job_customer_notifications(target_job_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if app_private.staff_role() is null then raise exception 'Office login required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('kind',n.kind,'status',n.status,'channel',n.channel,
      'reason',n.reason,'body',n.body,'sendAfter',n.send_after,'sentAt',n.sent_at,'createdAt',n.created_at) order by n.created_at)
    from public.customer_notifications n where n.job_id=target_job_id), '[]'::jsonb);
end $$;

revoke all on function public.driver_job_notifications(text), public.job_customer_notifications(text) from public,anon;
grant execute on function public.driver_job_notifications(text), public.job_customer_notifications(text) to authenticated;

commit;
