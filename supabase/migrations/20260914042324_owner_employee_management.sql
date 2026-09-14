-- Preserve staff reads for dispatch crew pickers; only owners manage employees.
begin;
create policy owner_employee_insert on public.app_employees as restrictive
for insert to authenticated with check (app_private.staff_role()='owner');
create policy owner_employee_update on public.app_employees as restrictive
for update to authenticated using (app_private.staff_role()='owner')
with check (app_private.staff_role()='owner');
create policy owner_employee_delete on public.app_employees as restrictive
for delete to authenticated using (app_private.staff_role()='owner');
commit;
