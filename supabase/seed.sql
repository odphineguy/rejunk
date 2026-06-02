-- Seed config tables from client/src/data/defaultPricing.ts + facilities.ts.
-- Idempotent: ON CONFLICT DO NOTHING preserves any edits made in-app.

-- Vehicles ------------------------------------------------------------------
insert into public.vehicles
  (id, vehicle_name, vehicle_type, usable_cubic_yards, max_payload_lbs, empty_weight_lbs,
   gvwr_lbs, fuel_type, mpg_unloaded, mpg_loaded, hourly_vehicle_cost, mileage_cost,
   has_liftgate, has_dump_capability, requires_tow_vehicle, notes, is_default, is_active)
values
  ('ford-transit-t250', 'Ford Transit Cargo Van', 'cargo_van', 9.1, 3880, 4920, 8800, 'gasoline', 15, 12, 20, 0.75, false, false, false, 'Fleet Transit T-250 estimate from local fleet sheet.', true, true),
  ('promaster-1500', 'Ram ProMaster Cargo Van', 'cargo_van', 9.7, 4160, 4390, 8550, 'gasoline', 16, 13, 20, 0.75, false, false, false, 'Fleet ProMaster estimate from local fleet sheet.', false, true),
  ('box-truck-liftgate', 'Box Truck with Liftgate', 'box_truck', 50, 10000, null, 25999, 'diesel', 10, 8, 45, 1.65, true, false, false, 'Use for bulky but not extremely dense loads.', false, true),
  ('14k-dump-trailer', '14K Dump Trailer', 'dump_trailer', 14, 9500, null, 14000, 'tow_vehicle', 11, 8, 35, 1.35, false, true, true, 'Payload depends on trailer weight and tow setup. Verify before heavy debris.', false, true)
on conflict (id) do nothing;

-- Material pricing rules ----------------------------------------------------
insert into public.material_pricing_rules
  (id, material_name, material_category, default_density_lbs_per_yard, density_range_min, density_range_max,
   pricing_mode, requires_weight_override, preferred_facility_types, warning_text,
   labor_difficulty_multiplier, disposal_difficulty_multiplier, is_active)
values
  ('household-junk', 'Household Junk', 'household_junk', 125, 75, 150, 'volume_based', false, '{transfer_station,landfill}', null, 1, 1, true),
  ('furniture', 'Furniture', 'furniture', 150, 100, 200, 'hybrid', false, '{transfer_station,landfill}', 'Bulky furniture can add labor time even when weight is modest.', 1.15, 1, true),
  ('mixed-c-and-d', 'C&D / Demo Debris', 'mixed_c_and_d', 500, 300, 700, 'hybrid', false, '{transfer_station,landfill}', 'Includes brick, tile, wood, drywall and mixed remodel/demo debris. A pure brick or tile load is far heavier than typical mixed debris — enter a manual weight for those so it is not underpriced.', 1.25, 1.2, true),
  ('clean-concrete', 'Clean Concrete', 'clean_concrete', 2400, 1800, 3000, 'weight_based', true, '{clean_fill,recycling_center}', 'Do not price concrete by volume alone. Confirm payload and facility acceptance.', 1.5, 1.35, true),
  ('dirt', 'Dirt', 'dirt', 2200, 2000, 3000, 'weight_based', true, '{clean_fill,landfill}', 'Dirt is heavy. Use strict payload limits and avoid volume-only pricing.', 1.6, 1.35, true),
  ('green-waste', 'Green Waste', 'green_waste', 250, 100, 400, 'hybrid', false, '{green_waste,transfer_station}', 'Wet green waste can weigh much more than dry brush.', 1.1, 1, true),
  ('metal-appliances', 'Metal / Appliances', 'appliances', 250, null, null, 'item_based', false, '{scrap_yard,recycling_center,transfer_station}', 'Check appliance fees, refrigerant rules, and possible scrap offset.', 1.2, 1.1, true),
  ('hazardous', 'Hazardous / Excluded', 'hazardous_excluded', 0, null, null, 'excluded', true, '{specialty_facility}', 'Do not accept hazardous material through normal junk removal pricing.', 1, 1, true)
on conflict (id) do nothing;

-- Volume benchmarks ---------------------------------------------------------
insert into public.volume_benchmarks (id, label, fraction, price) values
  ('minimum', 'Minimum', 0, 150),
  ('one-eighth', '1/8 Load', 0.125, 295),
  ('one-sixth', '1/6 Load', 0.16666666666666666, 395),
  ('one-quarter', '1/4 Load', 0.25, 495),
  ('one-third', '1/3 Load', 0.3333333333333333, 575),
  ('three-eighths', '3/8 Load', 0.375, 655),
  ('one-half', '1/2 Load', 0.5, 695),
  ('five-eighths', '5/8 Load', 0.625, 745),
  ('two-thirds', '2/3 Load', 0.6666666666666666, 815),
  ('three-quarters', '3/4 Load', 0.75, 865),
  ('seven-eighths', '7/8 Load', 0.875, 995),
  ('full', 'Full Load', 1, 1195)
on conflict (id) do nothing;

-- Pricing defaults (single row) ---------------------------------------------
insert into public.pricing_defaults
  (id, fuel_price_per_gallon, workers, hourly_labor_cost, estimated_hours,
   target_margin_decimal, minimum_profit_dollars, default_facility_rate_per_ton)
values (1, 4, 2, 25, 2, 0.6, 150, 65)
on conflict (id) do nothing;

-- Facilities ----------------------------------------------------------------
insert into public.facilities
  (id, facility_name, facility_type, address, city, state, zip, phone, website, latitude, longitude,
   accepted_materials, rejected_materials, price_type, default_rate, minimum_charge, environmental_fee,
   fuel_surcharge, extra_fees, hours, notes, best_use_case, pricing_impact_label, last_verified_date,
   is_default, is_active)
values
  ('sky-harbor-transfer', 'Sky Harbor Transfer Station', 'transfer_station', '2425 S 40th St', 'Phoenix', 'AZ', '85034', '602-262-6251', 'https://www.phoenix.gov/publicworks/garbage/disposable', 33.4257, -111.9951,
   '{household_junk,furniture,mixed_c_and_d,green_waste,cardboard}', '{hazardous_excluded,tires}', 'per_ton', 65, 35, 0, 0, 0,
   '{"Mon-Sat: 5:30 AM - 5:00 PM","Sun: Closed"}', 'Verify current public/commercial rules before dispatch.', 'Central Phoenix transfer for common household junk and mixed loads.', 'Standard transfer station disposal', '2026-05-31', true, true),
  ('deer-valley-transfer', 'Deer Valley Transfer Station', 'transfer_station', '22300 N 21st Ave', 'Phoenix', 'AZ', '85027', '602-262-6251', 'https://www.phoenix.gov/publicworks/garbage/disposable', 33.6876, -112.1051,
   '{household_junk,furniture,mixed_c_and_d,green_waste,cardboard}', '{hazardous_excluded,tires}', 'per_ton', 65, 35, 0, 0, 0,
   '{"Mon-Sat: 5:30 AM - 5:00 PM","Sun: Closed"}', 'Good north Phoenix option. Confirm exact commercial rates before quoting.', 'North Phoenix household junk and mixed C&D.', 'Standard transfer station disposal', '2026-05-31', false, true),
  ('weinberger-cooper-transfer', 'Weinberger Waste Disposal - Cooper', 'transfer_station', '619 N Cooper Rd', 'Gilbert', 'AZ', '85233', '602-278-9155', 'https://www.wasteconnections.com/', 33.3593, -111.8065,
   '{household_junk,furniture,mixed_c_and_d,green_waste}', '{hazardous_excluded}', 'per_ton', 65, 35, 0, 0, 0,
   '{"Call to verify current hours"}', 'Imported from existing Phoenix disposal research notes.', 'East Valley transfer station alternative.', 'Standard transfer station disposal', '2026-05-31', false, true),
  ('buesing-recycling', 'Buesing Recycling', 'clean_fill', '18522 S Hamilton St', 'Chandler', 'AZ', '85286', '602-799-5713', 'https://www.buesingcorp.com/', 33.2829, -111.9758,
   '{clean_concrete,rock}', '{household_junk,furniture,mixed_c_and_d,green_waste,hazardous_excluded}', 'per_ton', 45, 35, 0, 0, 0,
   '{"Call to verify current hours"}', 'Clean-concrete-only recycler (concrete/asphalt crushing). Load must be clean — contamination gets it rejected to landfill as mixed C&D.', 'Clean concrete and rock only.', 'Can reduce clean concrete disposal cost', '2026-05-31', false, true),
  ('crm-tires', 'CRM of America', 'specialty_facility', '11400 E Pecos Rd', 'Mesa', 'AZ', '85212', '480-987-3006', 'https://www.crmrecycling.com/', 33.291, -111.588,
   '{tires}', '{household_junk,furniture,hazardous_excluded,mixed_c_and_d}', 'per_item', 8, 25, 0, 0, 0,
   '{"Call to verify current hours"}', 'Tire-only specialty facility. Price per tire varies by size and condition.', 'Tire disposal loads.', 'Use item count pricing', '2026-05-31', false, true),
  ('republic-germann-transfer', 'Republic Services - Germann', 'transfer_station', '11530 E Germann Rd', 'Chandler', 'AZ', '85286', '480-222-8434', 'https://www.republicservices.com/', 33.2781897, -111.8348656,
   '{household_junk,furniture,mixed_c_and_d,tires,appliances,cardboard,metal}', '{hazardous_excluded}', 'per_ton', 70, 20, 0, 0, 0,
   '{"Mon-Fri: 6:00 AM - 4:00 PM"}', 'Accepts tires and appliances (fees apply; ~$20 for refrigerant units). Confirm commercial gate rates before dispatch.', 'Southeast Valley mixed loads, plus tires and appliances in one stop.', 'Standard transfer station disposal', '2026-05-31', false, true),
  ('wm-san-tan-transfer', 'San Tan Transfer Station', 'transfer_station', '4040 S 80th St', 'Mesa', 'AZ', '85212', '602-308-0915', 'https://www.wmsolutions.com/', 33.3420798, -111.6639574,
   '{household_junk,furniture,mixed_c_and_d,green_waste,cardboard}', '{hazardous_excluded,tires,appliances}', 'per_ton', 65, 40, 0, 0, 0,
   '{"Mon-Fri: 7:00 AM - 4:00 PM","Sat: 7:00 AM - 12:00 PM","Sun: Closed"}', 'Does not accept tires or appliances. Typical 1-ton minimum or small-load flat fee.', 'Southeast Valley (Mesa/Queen Creek) household junk and mixed C&D.', 'Standard transfer station disposal', '2026-05-31', false, true),
  ('white-tank-transfer', 'White Tank Transfer Station', 'transfer_station', '18605 W McDowell Rd', 'Goodyear', 'AZ', '85338', '623-853-1707', 'https://www.wmsolutions.com/', 33.464579, -112.4613901,
   '{household_junk,furniture,mixed_c_and_d,green_waste,cardboard}', '{hazardous_excluded,tires,appliances}', 'per_ton', 65, 40, 0, 0, 0,
   '{"Mon-Fri: 7:00 AM - 4:00 PM","Sat: 7:00 AM - 12:00 PM"}', 'West Valley WM transfer station. Does not accept tires or appliances.', 'West Valley (Goodyear/Buckeye) household junk and mixed C&D.', 'Standard transfer station disposal', '2026-05-31', false, true),
  ('butterfield-landfill', 'Butterfield Station Landfill', 'landfill', '40404 S 99th Ave', 'Mobile', 'AZ', '85139', '602-256-0630', 'https://www.wmsolutions.com/', 33.0560779, -112.2717758,
   '{household_junk,furniture,mixed_c_and_d,dirt,rock}', '{hazardous_excluded,tires,appliances}', 'per_ton', 45, 40, 0, 0, 0,
   '{"Mon-Fri: 6:00 AM - 3:00 PM"}', 'Direct-haul landfill, generally cheapest per ton but farther south. Best for large/heavy loads where the drive pays off.', 'Large or heavy loads where the lower per-ton rate beats the longer drive.', 'Lower per-ton disposal cost', '2026-05-31', false, true),
  ('phoenix-27th-ave-transfer', 'City of Phoenix - 27th Ave', 'transfer_station', '3060 S 27th Ave', 'Phoenix', 'AZ', '85009', '602-262-6251', 'https://www.phoenix.gov/publicworks/garbage/disposal', 33.4166606, -112.1173265,
   '{household_junk,furniture,mixed_c_and_d,tires,appliances,cardboard,metal,green_waste}', '{hazardous_excluded}', 'per_ton', 55, 40, 0, 0, 0,
   '{"Mon-Fri: 5:30 AM - 5:00 PM","Sat: 6:00 AM - 3:00 PM"}', 'City facility. $20 fee for refrigerant appliances. Commercial tires generally not accepted (resident drop-off only).', 'Central/west Phoenix mixed loads with appliances and clean green waste.', 'Lower city transfer station rate', '2026-05-31', false, true),
  ('phoenix-north-gateway-transfer', 'City of Phoenix - North Gateway', 'transfer_station', '30205 N Black Canyon Hwy', 'Phoenix', 'AZ', '85085', '602-262-6251', 'https://www.phoenix.gov/publicworks/garbage/disposal', 33.759342, -112.1160558,
   '{household_junk,furniture,mixed_c_and_d,tires,appliances,cardboard,metal,green_waste}', '{hazardous_excluded}', 'per_ton', 55, 40, 0, 0, 0,
   '{"Mon-Fri: 5:30 AM - 5:00 PM","Sat: 6:00 AM - 3:00 PM"}', 'City facility serving north Phoenix. $20 fee for refrigerant appliances. Commercial tires generally not accepted.', 'North Phoenix mixed loads with appliances and clean green waste.', 'Lower city transfer station rate', '2026-05-31', false, true)
on conflict (id) do nothing;
