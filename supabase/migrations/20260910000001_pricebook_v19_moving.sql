-- Moving pricing v19 → progressive pricebook rows (MOVING_ESTIMATOR_V19_SPEC §1b).
-- Applied to rejunk-prod through the Supabase MCP (like 202609040001), not the CLI.
--
-- Rules: every statement is scoped to tenant_id = 'progressive'; existing `id` and
-- `external_id` (HCP uuid) are preserved; never delete a row that carries an
-- external_id; wellsentry rows and the junk / assembly / handyman rows are untouched.
-- The app's moving quote engine reads `data/movingRates.ts`, not these rows — they
-- exist for the Pricebook page and the HCP sync.

begin;

-- ── Updates (existing ids) ─────────────────────────────────────────────────
update public.pricebook_items set
  name = 'Small Move - Up to 8 Items (No Full Rooms)', price = 303, crew_size = 2, price_unit = 'flat',
  description = '2 movers, 26-ft liftgate truck, blankets, shrink wrap. First 2 hours + travel included; extra time at the hourly rate.',
  mode = 'moving', photo_required = true, updated_at = now()
where tenant_id = 'progressive' and id = 'prog-small-local-move-2-movers-truck';

update public.pricebook_items set
  name = 'Apartment Move - Studio/1 Bedroom', price = 525, crew_size = 2, price_unit = 'flat',
  description = 'Flat price, weekday. 2 movers, 26-ft liftgate truck. 4 on-site hours included, then $109/hr.',
  mode = 'moving', photo_required = true, updated_at = now()
where tenant_id = 'progressive' and id = 'prog-apartment-move-studio-1-bedroom';

update public.pricebook_items set
  name = 'Apartment Move - 2 Bedroom', price = 750, crew_size = 3, price_unit = 'flat',
  description = 'Flat price, weekday. 3 movers, 26-ft liftgate truck. 6 on-site hours included, then $109/hr.',
  mode = 'moving', photo_required = true, updated_at = now()
where tenant_id = 'progressive' and id = 'prog-apartment-move-2-bedroom';

update public.pricebook_items set
  name = 'Home Move - Small House', price = 750, crew_size = 3, price_unit = 'flat',
  description = 'Flat price, weekday. Up to 3 bedrooms, single level or one flight. 3 movers, 26-ft liftgate truck. 6 on-site hours included, then $109/hr.',
  mode = 'moving', photo_required = true, updated_at = now()
where tenant_id = 'progressive' and id = 'prog-home-move-small-house';

update public.pricebook_items set
  name = 'Labor Only – 2 Movers, 2 Hours', price = 218, crew_size = 2, price_unit = 'flat',
  description = '2 movers, no truck, 2-hour minimum ($109/hr weekday, $124/hr weekend). No trip charge. Full payment at booking.',
  mode = 'moving', photo_required = true, updated_at = now()
where tenant_id = 'progressive' and id = 'prog-moving-labor-2-movers-2-hours';

update public.pricebook_items set
  name = 'Moving Labor - Additional Hour (Weekday)', price = 109, price_unit = 'hourly',
  description = 'Each additional hour past the included time, weekday rate. Billed in quarter-hour increments.',
  mode = 'moving', photo_required = true, updated_at = now()
where tenant_id = 'progressive' and id = 'prog-moving-labor-additional-hour';

update public.pricebook_items set
  name = 'Cargo Van Small Item Delivery', price = 120, crew_size = 1, price_unit = 'flat',
  description = '1 driver + cargo van. Single small item pickup and delivery within the Phoenix metro. No trip fee.',
  mode = 'moving', photo_required = true, updated_at = now()
where tenant_id = 'progressive' and id = 'prog-supply-moving-and-delivery';

update public.pricebook_items set
  name = 'Piano Moving - Upright', price = 299, crew_size = 2, price_unit = 'flat',
  notes = 'flat tier; add $75 per location with stairs', mode = 'moving', photo_required = true, updated_at = now()
where tenant_id = 'progressive' and id = 'prog-piano-moving';

update public.pricebook_items set
  name = 'Safe Moving - Basic', price = 300, price_unit = 'flat',
  notes = 'ESCALATE — final price by weight/access; never auto-quote', mode = 'moving', photo_required = true, updated_at = now()
where tenant_id = 'progressive' and id = 'prog-safe-moving-basic';

update public.pricebook_items set
  name = 'Trip Fee (truck jobs, baked in)', price = 85, price_unit = 'flat', mode = 'surcharge_fee',
  notes = 'never itemized to the customer', updated_at = now()
where tenant_id = 'progressive' and id = 'prog-trip-service-fee';

-- TV mounting rows already exist under prog-mounting — v19 prices + names.
update public.pricebook_items set
  name = 'TV Mounting up to 65 Inch', price = 125, updated_at = now()
where tenant_id = 'progressive' and id = 'prog-tv-mounting-under-55-inch';

update public.pricebook_items set
  name = 'TV Mounting 65 Inch Plus', price = 149, updated_at = now()
where tenant_id = 'progressive' and id = 'prog-tv-mounting-65-inch-plus';

-- ── Inserts (new ids; external_id = HCP uuid where the v19.1 CSV has one) ──
insert into public.pricebook_items
  (id, tenant_id, name, price, cost, category_id, item_type, description, crew_size, price_unit, mode, notes, photo_required, add_to_online_booking, taxable, external_id)
values
  ('prog-small-move-weekend', 'progressive', 'Small Move - Up to 8 Items (Weekend)', 333, 0, 'prog-moving', 'Service',
   'Weekend/month-end pricing: Fri, Sat, Sun and the first two and last two days of any month. 2 movers, 26-ft liftgate truck. First 2 hours + travel included.', 2, 'flat', 'moving', null, true, false, true, null),
  ('prog-apartment-move-studio-1-bedroom-weekend', 'progressive', 'Apartment Move - Studio/1 Bedroom (Weekend)', 595, 0, 'prog-moving', 'Service',
   'Weekend/month-end pricing. Flat price, studio or 1-bedroom apartment. 2 movers, 4 on-site hours included, then $124/hr.', 2, 'flat', 'moving', null, true, false, true, null),
  ('prog-apartment-move-2-bedroom-weekend', 'progressive', 'Apartment Move - 2 Bedroom (Weekend)', 850, 0, 'prog-moving', 'Service',
   'Weekend/month-end pricing. Flat price, 2-bedroom apartment. 3 movers, 6 on-site hours included, then $124/hr.', 3, 'flat', 'moving', null, true, false, true, null),
  ('prog-home-move-small-house-weekend', 'progressive', 'Home Move - Small House (Weekend)', 850, 0, 'prog-moving', 'Service',
   'Weekend/month-end pricing. Flat price, small house (up to 3 bedrooms). 3 movers, 6 on-site hours included, then $124/hr.', 3, 'flat', 'moving', null, true, false, true, null),
  ('prog-moving-labor-additional-hour-weekend', 'progressive', 'Moving Labor - Additional Hour (Weekend)', 124, 0, 'prog-moving', 'Service',
   'Weekend/month-end pricing. Each additional hour past the included time. Billed in quarter-hour increments.', null, 'hourly', 'moving', null, true, false, true, null),
  ('prog-moving-hourly-2-movers-truck', 'progressive', 'Hourly Move - 2 Movers + 26-ft Truck (Weekday)', 109, 0, 'prog-moving', 'Service',
   '2 movers + 26-ft liftgate truck, per hour, weekday. 2-hour minimum. Trip fee baked in (travel included).', 2, 'hourly', 'moving', null, true, false, true, null),
  ('prog-moving-hourly-2-movers-truck-weekend', 'progressive', 'Hourly Move - 2 Movers + 26-ft Truck (Weekend)', 124, 0, 'prog-moving', 'Service',
   '2 movers + 26-ft liftgate truck, per hour, weekend/month-end. 2-hour minimum. Trip fee baked in (travel included).', 2, 'hourly', 'moving', null, true, false, true, null),
  ('prog-moving-extra-mover-hour', 'progressive', 'Additional Mover (per hour)', 50, 0, 'prog-moving', 'Service',
   'Each mover beyond the second, per hour. 3 movers $159/$174, 4 movers $209/$224 (4-hour minimum).', null, 'hourly', 'moving', null, true, false, true, null),
  ('prog-additional-flight-of-stairs', 'progressive', 'Additional Flight of Stairs', 75, 0, 'prog-moving', 'Service',
   'Per additional flight beyond the first, per address. Added to apartment and home packages only.', null, 'per_item', 'moving', 'packages only', true, false, true, null),
  ('prog-cargo-van-moving-and-delivery', 'progressive', 'Cargo Van Flat - Single Large Item', 199, 0, 'prog-moving', 'Service',
   'Flat price, one large furniture item or one item plus its matching set, up to 15 miles between addresses. Excludes appliances, power recliners, exercise equipment, items over 150 lb, safes.', 1, 'flat', 'moving', null, true, false, true, 'olit_9442003ddd494312a6df373ed1b8edb3'),
  ('prog-piano-moving-large-upright', 'progressive', 'Piano Moving - Large Upright (48"+)', 349, 0, 'prog-moving', 'Service',
   'Flat tier, added on top of the move. Add $75 per location with stairs / difficult access.', 2, 'flat', 'moving', 'flat tier; add $75 per location with stairs', true, false, true, null),
  ('prog-piano-moving-baby-grand', 'progressive', 'Piano Moving - Baby Grand', 399, 0, 'prog-moving', 'Service',
   'Flat tier, added on top of the move. Add $75 per location with stairs / difficult access.', 3, 'flat', 'moving', 'flat tier; add $75 per location with stairs', true, false, true, null),
  ('prog-piano-moving-grand', 'progressive', 'Piano Moving - Grand', 499, 0, 'prog-moving', 'Service',
   'Flat tier, added on top of the move. Add $75 per location with stairs / difficult access.', 3, 'flat', 'moving', 'flat tier; add $75 per location with stairs', true, false, true, null),
  ('prog-piano-stairs-per-location', 'progressive', 'Piano - Stairs / Difficult Access (per location)', 75, 0, 'prog-moving', 'Service',
   'Per location with stairs or difficult access. Escalate if more than 2 flights, crane, balcony, or spiral.', null, 'per_item', 'moving', null, true, false, true, null)
on conflict (id) do update set
  name = excluded.name, price = excluded.price, category_id = excluded.category_id, description = excluded.description,
  crew_size = excluded.crew_size, price_unit = excluded.price_unit, mode = excluded.mode, notes = excluded.notes,
  photo_required = excluded.photo_required, external_id = coalesce(public.pricebook_items.external_id, excluded.external_id),
  updated_at = now()
where public.pricebook_items.tenant_id = 'progressive';

-- ── Deprecate: replaced by the extra-mover row; carries no external_id ─────
delete from public.pricebook_items
where tenant_id = 'progressive' and id = 'prog-moving-labor-3-movers-hour' and external_id is null;

-- ── Categories: "Summit — …" → "Progressive — …" (ids unchanged) ───────────
update public.pricebook_categories
set name = replace(name, 'Summit — ', 'Progressive — '), updated_at = now()
where tenant_id = 'progressive' and name like 'Summit — %';

commit;
