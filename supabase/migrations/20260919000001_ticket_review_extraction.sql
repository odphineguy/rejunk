-- BOOKING_TO_CREW_SPEC 1e (2026-09-19): the pipeline's ticket extractor writes
-- `jobs.data.extraction` (per-field source message id / confidence / quote,
-- review flags, Thumbtack attachment links). Owners already see the whole blob;
-- this lets the OFFICE projection carry it too so office staff can review
-- "New from Thumbtack" tickets. No money lives in `extraction` (hcpTotal /
-- hcpPaid are the HCP invoice figures — stripped below for office).
-- Additive; safe to re-run. Drivers are unaffected (get_driver_today is untouched).
create or replace function app_private.office_job(value jsonb)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select app_private.pick_fields(value,array[
    'id','jobNumber','source','sourceEstimateId','createdAt','updatedAt','customerName',
    'jobLabel','leadSource','serviceType','movingKind','deliveryKind','priority','estimatedDurationMinutes','crewSequence',
    'crewSize','requiredCrew','crew','stops','items','dayType','quote','paymentTerms','thirdPartyPickup','tvInstall',
    'escalation','leadRef','clientId','slot','moving',
    'phone','email','address','city','state','zip','scheduledStart','scheduledEnd',
    'status','materialType','materialName','cubicYards','estimatedWeightLbs','estimatedTons',
    'facilityId','facilityName','vehicleId','vehicleName','quotedAmount','notes','internalNotes'])
  || case when value ? 'assignment' then jsonb_build_object('assignment',
       app_private.pick_fields(value->'assignment',array['employeeIds','crewLead','crewMembers','vehicleId','vehicleName'])) else '{}'::jsonb end
  || case when jsonb_typeof(value->'extraction')='object' then jsonb_build_object('extraction',
       (value->'extraction') - 'hcpTotal' - 'hcpPaid' - 'raw') else '{}'::jsonb end;
$$;
