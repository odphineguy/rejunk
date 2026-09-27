-- BOOKING_TO_CREW_SPEC deliverable 3: drivers see the service name and the hours
-- the package includes — never the price. get_driver_today gains exactly one field,
-- `includedHours` (a number copied from quote.includedHours); the rest of `quote`
-- (David's price sentence, low/high dollars) stays off the driver's phone.
-- Body is otherwise identical to 20260912000002_ticket_shape.sql.
create or replace function public.get_driver_today() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('job',
   coalesce(safe.data,'{}'::jsonb)
   || jsonb_build_object('id',j.id,'status',j.status,
        'includedHours',case when jsonb_typeof(j.data#>'{quote,includedHours}')='number' then j.data#>'{quote,includedHours}' end,
        'assignment',jsonb_build_object('crewLead',j.data#>'{assignment,crewLead}','crewMembers',coalesce(j.data#>'{assignment,crewMembers}','[]'::jsonb),
          'vehicleId',j.data#>'{assignment,vehicleId}','vehicleName',j.data#>'{assignment,vehicleName}'),
        'crew',(select coalesce(jsonb_agg(
                  c || jsonb_build_object('name', coalesce(nullif(btrim(concat_ws(' ',e.first_name,e.last_name)),''), act.employee_name, c->>'employeeId'))
                  order by ord),'[]'::jsonb)
                from jsonb_array_elements(case when jsonb_typeof(j.data->'crew')='array' then j.data->'crew' else '[]'::jsonb end) with ordinality t(c,ord)
                left join public.app_employees e on e.id=c->>'employeeId'
                left join lateral (select employee_name from public.driver_activations
                                   where employee_id=c->>'employeeId' and status='activated' limit 1) act on true),
        'disposalEvents',(select coalesce(jsonb_agg(d - 'disposalCost' order by ord),'[]'::jsonb)
                from jsonb_array_elements(case when jsonb_typeof(j.data->'disposalEvents')='array' then j.data->'disposalEvents' else '[]'::jsonb end) with ordinality t(d,ord)))
   )), '[]'::jsonb)
 from public.jobs j cross join lateral (
   select jsonb_object_agg(key,value) as data from jsonb_each(j.data)
   where key=any(array['jobNumber','customerName','jobLabel','phone','address','city','state','zip',
     'scheduledStart','scheduledEnd','vehicleId','vehicleName','notes','internalNotes','materialName','materialType',
     'createdAt','updatedAt','facilityId','facilityName','cubicYards','estimatedWeightLbs','estimatedTons',
     'serviceType','movingKind','deliveryKind','requiredCrew','stops','items','dayType','paymentTerms',
     'thirdPartyPickup','tvInstall','moving','priority','estimatedDurationMinutes'])
 ) safe where app_private.assigned_job(j.id);
$$;
