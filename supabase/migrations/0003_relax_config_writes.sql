-- No auth gate yet: the app uses anonymous sign-in and there is no role-assignment
-- UI, so allow any authenticated (incl. anonymous) session to edit pricing config.
-- Re-tighten to is_manager() once a real login + role management exists.

do $$
declare t text;
begin
  foreach t in array array[
    'facilities', 'vehicles', 'material_pricing_rules', 'volume_benchmarks', 'pricing_defaults'
  ] loop
    execute format('drop policy if exists "config writable by managers" on public.%I', t);
    execute format(
      'create policy "config writable by authenticated" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
