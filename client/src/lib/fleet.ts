import { vehicleClassForType, type SlotVehicleClass } from "@/lib/scheduleSlots";
import type { Vehicle } from "@/types/pricing";

/**
 * Fleet units only — real vans and the box truck (SPR-01 … SPR-06, BOX-01),
 * never the generic pricing templates. This is the list every ticket / calendar
 * vehicle picker uses (JOB_TICKET_REDESIGN_SPEC D4). Pricing keeps reading the
 * templates by id for cost math.
 */
export function fleetVehicles(vehicles: Vehicle[]): Vehicle[] {
  return vehicles.filter((vehicle) => vehicle.isActive !== false && !vehicle.isTemplate);
}

/** Short unit code for a fleet vehicle: "SPR-01", "BOX-01". Falls back to the name. */
export function vehicleUnitCode(vehicle: Pick<Vehicle, "id" | "vehicleName"> | undefined): string {
  if (!vehicle) return "";
  const match = vehicle.vehicleName.match(/^([A-Z]{2,4}-\d{2})/);
  return match ? match[1] : vehicle.id.toUpperCase();
}

export function fleetVehiclesOfClass(vehicles: Vehicle[], vehicleClass: SlotVehicleClass | undefined): Vehicle[] {
  return fleetVehicles(vehicles).filter((vehicle) => vehicleClassForType(vehicle.vehicleType) === vehicleClass);
}
