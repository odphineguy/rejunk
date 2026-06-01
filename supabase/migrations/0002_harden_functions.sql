-- Security hardening flagged by Supabase advisors after 0001_init.

-- Pin search_path on the trigger helper.
alter function public.set_updated_at() set search_path = public;

-- Trigger-only functions are not meant to be called via the REST RPC endpoint.
-- Triggers fire as the table owner, so revoking EXECUTE does not break them.
revoke execute on function public.set_updated_at() from public;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- is_manager() is referenced inside RLS policies targeting the authenticated role,
-- so it must remain executable by authenticated users — but not by anon/public.
revoke execute on function public.is_manager() from public, anon;
grant execute on function public.is_manager() to authenticated;
