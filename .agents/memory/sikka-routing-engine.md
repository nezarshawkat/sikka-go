---
name: Sikka deterministic routing engine
description: Hard rules and design constraints for the city trip-planning engine (artifacts/api-server/src/engine)
---

# Sikka deterministic routing engine

The city trip planner (`POST /api/trips/plan`, city mode) is a deterministic
transfer-graph + Dijkstra search over verified DB data only. It lives in
`artifacts/api-server/src/engine/`.

## Hard rule (non-negotiable)
Routing must NEVER invent routes and must NOT use AI to generate them. Every
transit leg must reference a real `transit_lines` row (`lineId`). AI is allowed
ONLY for optional explanations, and must have a deterministic fallback.

**Why:** product correctness — users follow these directions on the ground; a
hallucinated metro line / imaginary station is worse than no answer.

**How to apply:**
- Do not reintroduce a fallback that fabricates metro/bus/serfis segments. The
  only legitimate non-graph fallback is a door-to-door taxi (Uber/Careem):
  a real, metered origin→dest ride with real coords, used solely when the
  engine throws. The engine's own ladder already has a full-taxi rung, so that
  fallback should almost never fire.
- `computeEnginePlan` is a hard validation gate: return a plan ONLY if
  `validatePlan(plan).ok`. Never return a best-effort invalid plan.

## Constrained search (walk budget)
Total walking (cap 30 min, single-walk cap 20 min) is a path-dependent resource.
A plain one-label-per-node Dijkstra is INCORRECT here — it can discard a feasible
low-walk path for a cheaper high-walk one that later breaks the cap. The
pathfinder uses full Pareto-dominance labeling: per node keep all non-dominated
`(weight, walk)` labels; `(w,k)` dominates `(w',k')` iff `w<=w' AND k<=k'`.
First goal label popped from the weight-ordered heap is optimal.

**Why:** bucket-coalescing (an earlier attempt) still drops feasible labels and
fails the architect review; exact dominance is the correct fix.

## Distances
Compute transit-leg `distanceKm` from consecutive `line.stops[]` haversine, NOT
from `pathLengthKm(route_path)` — some stored polylines are noisy/corrupt and
inflate distance wildly (saw a 162 km Maadi→Heliopolis metro leg). The polyline
is kept for map display only.

## Scope boundary
The intercity flow (`buildIntercityPlan`, SuperJet/GoBus/BlueBus adapters) is a
SEPARATE feature. Its synthetic-estimate fallback when adapters return no live
trips predates this engine and is intentionally left unchanged — it is not part
of the city routing-engine spec.
