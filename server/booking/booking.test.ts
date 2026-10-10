import { describe, expect, it } from "vitest";

import { bookingServiceById, inServiceArea, priceBooking } from "../../shared/bookingCatalog";
import { occupancyFromHcp, occupancyFromJob, windowsForDay, type AvailabilityRules } from "./availability";

const svc = (id: string) => {
  const s = bookingServiceById(id);
  if (!s) throw new Error(id);
  return s;
};

// Wed Oct 14 2026 is a weekday; Sat Oct 17 is a weekend.
const WEEKDAY = "2026-10-14";
const WEEKEND = "2026-10-17";
const rules: AvailabilityRules = {
  today: "2026-10-09",
  nowMs: Date.parse("2026-10-09T09:00:00-07:00"),
  allowSameDay: true,
  leadHours: 2,
};

describe("priceBooking", () => {
  it("charges the weekday / weekend package price", () => {
    expect(priceBooking(svc("studio_1br"), WEEKDAY, [0, 0]).total).toBe(525);
    expect(priceBooking(svc("studio_1br"), WEEKEND, [0, 0]).total).toBe(595);
  });

  it("includes the first flight per address, then $75 per extra flight", () => {
    const price = priceBooking(svc("studio_1br"), WEEKDAY, [1, 3]);
    expect(price.lines.at(-1)).toMatchObject({ name: "Additional flight of stairs", amount: 75, quantity: 2 });
    expect(price.total).toBe(525 + 150);
  });

  it("never charges dollars for stairs on hourly work", () => {
    const price = priceBooking(svc("hourly_2"), WEEKDAY, [3, 3]);
    expect(price.total).toBe(109 * 2);
    expect(price.hourly).toBe(true);
  });

  it("charges pianos per location with stairs", () => {
    expect(priceBooking(svc("piano_upright"), WEEKDAY, [2, 0]).total).toBe(299 + 75);
  });
});

describe("service area", () => {
  it("accepts Phoenix metro ZIPs only", () => {
    expect(inServiceArea("85225")).toBe(true);
    expect(inServiceArea("86301")).toBe(false);
  });
});

describe("windowsForDay", () => {
  const open = (id: string, occupied: Parameters<typeof windowsForDay>[2], date = WEEKDAY) =>
    windowsForDay(svc(id), date, occupied, rules).windows.filter(w => w.open).map(w => w.key);

  it("offers both windows on an empty day, morning only for full-day moves", () => {
    expect(open("studio_1br", [])).toEqual(["am", "pm"]);
    expect(open("two_br", [])).toEqual(["am"]);
  });

  it("blocks the truck window an HCP appointment takes", () => {
    const hcp = occupancyFromHcp({ scheduled_start: `${WEEKDAY}T16:30:00Z`, scheduled_end: `${WEEKDAY}T18:30:00Z`, resource: "truck", status: "scheduled", canceled: false });
    expect(open("studio_1br", [hcp!])).toEqual(["pm"]);
    expect(open("two_br", [hcp!])).toEqual([]);
    expect(open("junk_half", [hcp!])).toEqual(["am", "pm"]);
  });

  it("ignores canceled HCP appointments", () => {
    expect(occupancyFromHcp({ scheduled_start: `${WEEKDAY}T15:00:00Z`, scheduled_end: null, resource: "truck", status: "canceled", canceled: true })).toBeNull();
  });

  it("treats a 2BR ticket as the whole truck day", () => {
    const job = occupancyFromJob(
      { id: "j1", status: "scheduled", scheduled_start: `${WEEKDAY}T15:00:00Z`, data: { serviceType: "moving", movingKind: "two_br", vehicleId: "box-01", scheduledEnd: `${WEEKDAY}T19:00:00Z` } },
      new Map([["box-01", "box_truck"]])
    );
    expect(job).toMatchObject({ am: true, pm: true, vehicleClass: "box_truck" });
    expect(open("small_move", [job!])).toEqual([]);
  });

  it("uses the truck crew for labor-only tickets with no vehicle", () => {
    const job = occupancyFromJob(
      { id: "j2", status: "scheduled", scheduled_start: `${WEEKDAY}T20:00:00Z`, data: { serviceType: "moving", movingKind: "labor_only", scheduledEnd: `${WEEKDAY}T23:59:00Z` } },
      new Map()
    );
    expect(open("hourly_2", [job!])).toEqual(["am"]);
  });

  it("respects lead time and same-day settings", () => {
    expect(windowsForDay(svc("junk_half"), "2026-10-09", [], rules).windows.map(w => w.open)).toEqual([false, true]);
    expect(windowsForDay(svc("junk_half"), "2026-10-09", [], { ...rules, allowSameDay: false }).windows.some(w => w.open)).toBe(false);
  });
});
