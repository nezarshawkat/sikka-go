import type { EnginePlan } from "./types.js";
import { WALK_MAX_SINGLE_MIN, WALK_MAX_TOTAL_MIN } from "./cost.js";

// Small tolerance over the search caps to absorb rounding in merged walk legs.
const MAX_TOTAL_WALK_MIN = WALK_MAX_TOTAL_MIN + 0.5; // ~1.6 km total
const MAX_SINGLE_WALK_MIN = WALK_MAX_SINGLE_MIN + 0.5; // ~0.8 km per segment

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
}

// Simulate the journey end-to-end and reject anything impossible or
// unsupported. A route may only pass if every leg is backed by real data.
export function validatePlan(plan: EnginePlan): ValidationResult {
  const reasons: string[] = [];

  if (plan.legs.length === 0) {
    reasons.push("empty_plan");
    return { ok: false, reasons };
  }

  let totalWalk = 0;
  for (const leg of plan.legs) {
    if (leg.mode === "walk") {
      totalWalk += leg.timeMin;
      if (leg.timeMin > MAX_SINGLE_WALK_MIN) reasons.push("single_walk_exceeded");
    }
    // Transit legs must reference a real line; taxi/tuktuk are point-to-point.
    if (
      leg.mode !== "walk" &&
      leg.mode !== "taxi" &&
      leg.mode !== "tuktuk" &&
      !leg.lineId
    ) {
      reasons.push("unverified_transit_leg");
    }
    // Every leg must have geometry so the user can actually follow it.
    if (!leg.geometry || leg.geometry.length < 2) {
      reasons.push("missing_geometry");
    }
    if (leg.timeMin <= 0 || Number.isNaN(leg.timeMin)) reasons.push("invalid_timing");
  }

  if (totalWalk > MAX_TOTAL_WALK_MIN) reasons.push("total_walk_exceeded");

  // Legs must connect: each leg's start should match the previous leg's end.
  for (let i = 1; i < plan.legs.length; i++) {
    const prev = plan.legs[i - 1];
    const cur = plan.legs[i];
    const gap = Math.hypot(
      prev.endCoord.lat - cur.startCoord.lat,
      prev.endCoord.lng - cur.startCoord.lng,
    );
    // ~250 m tolerance in degrees (transfer points should coincide)
    if (gap > 0.0025) reasons.push("disconnected_transfer");
  }

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}
