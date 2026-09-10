async page => {
  const user = {
    id: "00000000-0000-0000-0000-000000000005",
    aud: "authenticated",
    role: "authenticated",
    is_anonymous: true,
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const jwt =
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiAiMDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDA1IiwgInJvbGUiOiAiYXV0aGVudGljYXRlZCIsICJleHAiOiA0MTAyNDQ0ODAwfQ.fixture";
  const rows = {
    jobs: [
      {
        data: {
          id: "test-job",
          jobNumber: "TEST-1",
          customerName: "Test Customer",
          source: "manual",
          status: "scheduled",
          quotedAmount: 650,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    ],
    saved_estimates: [],
    facilities: [
      {
        id: "f",
        facility_name: "Test facility",
        facility_type: "landfill",
        accepted_materials: [],
        rejected_materials: [],
        hours: {},
        is_active: true,
      },
    ],
    vehicles: [
      {
        id: "v",
        vehicle_name: "Test van",
        vehicle_type: "cargo_van",
        usable_cubic_yards: 15,
        max_payload_lbs: 4000,
        is_active: true,
      },
    ],
    material_pricing_rules: [
      {
        id: "m",
        material_name: "Mixed junk",
        material_category: "household_junk",
        default_density_lbs_per_yard: 100,
        preferred_facility_types: [],
        is_active: true,
      },
    ],
    volume_benchmarks: [{ id: "full", label: "Full", fraction: 1, price: 650 }],
    pricing_defaults: [],
    pricebook_categories: [
      { id: "cat", name: "Assembly", mode: "service", sort_order: 0 },
    ],
    pricebook_items: [],
    app_leads_v: [],
  };
  await page.unroute("**/*");
  await page.route("**/*", async route => {
    const req = route.request();
    const url = {
      hostname: req.url().startsWith("http://localhost:3000/")
        ? "localhost"
        : "external",
      pathname: req
        .url()
        .replace(/^https?:\/\/[^/]+/, "")
        .split("?")[0],
    };
    const json = body =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.hostname === "localhost" && !url.pathname.startsWith("/api/"))
      return route.continue();
    if (url.pathname === "/api/staff")
      return json({
        valid: true,
        role: "office",
        fullName: "Test Office",
        email: "test@example.com",
        mustChangePin: false,
      });
    if (url.pathname === "/api/quote")
      return json({
        quote: {
          quoteId: "test-quote",
          cubicYards: 5,
          estimatedWeightLbs: 500,
          estimatedTons: 0.25,
          finalRecommendedQuote: 650,
          payloadStatus: "ok",
          warnings: [],
        },
      });
    if (url.pathname.includes("/auth/v1/signup"))
      return json({
        access_token: jwt,
        refresh_token: "fixture-refresh",
        expires_in: 3600,
        token_type: "bearer",
        user,
      });
    if (url.pathname.includes("/auth/v1/user")) return json(user);
    if (url.pathname.endsWith("/bind_business_identity")) return json(true);
    if (url.pathname.endsWith("/business_rows"))
      return json(rows[req.postDataJSON().resource] || []);
    if (url.pathname.endsWith("/business_conversation")) return json([]);
    if (url.pathname.includes("/rest/v1/")) return json([]);
    return route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "rejunk_staff_session",
      JSON.stringify({
        staffId: "fixture",
        fullName: "Test Office",
        email: "test@example.com",
        role: "office",
        token: "fixture-token",
        expiresAt: Date.now() + 3600000,
      })
    );
    localStorage.setItem(
      "junk_estimator_jobs_v1",
      JSON.stringify([{ id: "old-owner", estimatedCost: 987654 }])
    );
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://localhost:3000/estimate-builder");
  await page
    .getByRole("heading", { name: "Estimate Builder", exact: true })
    .waitFor();
  await page.getByLabel("Job / pickup address").fill("123 Test Street");
  await page
    .getByRole("combobox", { name: "Material", exact: true })
    .selectOption("m");
  await page
    .getByRole("combobox", { name: "Vehicle", exact: true })
    .selectOption("v");
  await page
    .getByRole("combobox", { name: "Facility", exact: true })
    .selectOption("f");
  await page.getByLabel("Volume (cubic yards)").fill("5");
  await page
    .getByRole("button", { name: "Calculate quote", exact: true })
    .click();
  await page.getByText("$650.00", { exact: true }).waitFor();
  if (await page.getByText("Est. Profit", { exact: true }).count())
    throw new Error("Office profit displayed");
  await page.screenshot({
    path: "/tmp/rejunk-office-quote-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/rejunk-office-quote-mobile.png",
    fullPage: true,
  });
  await page.goto("http://localhost:3000/jobs/test-job");
  await page.getByText("TEST-1 · Test Customer", { exact: true }).waitFor();
  await page.getByText("$650", { exact: true }).waitFor();
  if (await page.getByText("Financial Summary", { exact: true }).count())
    throw new Error("Office financial summary displayed");
  if (await page.getByText("Actual Costs & Receipt", { exact: true }).count())
    throw new Error("Office costs displayed");
  const oldCache = await page.evaluate(() =>
    localStorage.getItem("junk_estimator_jobs_v1")
  );
  if (oldCache !== null) throw new Error("Legacy owner job cache retained");
  console.log(
    "PASS: office quote calculation and job page render; financial panels absent; legacy owner cache cleared."
  );
};
