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
`(weight, totalWalk, contiguousWalk)` labels; one dominates another iff it is
`<=` on ALL THREE. First goal label popped from the weight-ordered heap is optimal.

**Why:** bucket-coalescing (an earlier attempt) still drops feasible labels and
fails review; exact dominance is the correct fix. The `contiguousWalk` term
(accumulates across consecutive walk edges, resets on any non-walk edge) is
REQUIRED: without it two sub-20-min walk edges chain through an unboarded stop
into one >20-min walk that a per-edge check misses — and because that all-walk
path is free, the cost-minimizing `economic` profile picked it, then it failed
`validatePlan`, and the whole rung returned "no plan" for short trips.

## Board-anywhere densification
Lines with `hasFixedStops=false` (bus/serfis/microbus) are densified at graph
build: synthetic stops sampled ~every 1 km along `route_path` (each labeled with
the nearest named stop via `displayName`, `synthetic=true`). This is what lets a
rider board at the NEAREST point and ride only the needed slice instead of
detouring to a sparse named hub. Rail keeps named stops only.

**How to apply:** synthetic stops must NOT inflate "ride N stops" counts — count
only non-synthetic stops; when zero named stops are ridden, instruct "stay on
~X km". Densification roughly 10×'s graph size (~3.6k→50k nodes); still tractable.

## Per-profile access + mode ladders
`buildOverlay(graph, origin, dest, planKey)` gates first/last-mile connectors by
profile, and `ladderFor(planKey)` orders the mode sets tried (most-preferred →
fallback). Spec intent: economic = informal cheap modes only (bus/serfis/
microbus + tuktuk first/last mile ≤3 km, NEVER taxi, NEVER rail — rail is a
comfortable mode); comfortable = bus/rail with taxi/tuktuk only for short ≤1.5 km
access hops; premium = taxi-first (taxi connectors ≤5 km + direct door-to-door).
`computeEnginePlan` also rejects detours: a plan's total distance must stay under
`max(directKm*2.8 + 3, 5)` km, else the least-distance valid plan is used.

**Why:** the original engine forced boarding at sparse named stops, so short
trips detoured through far hubs (real failure: El Narges→Nasr City became a 75-min
2-bus chain or a full-12 km Uber). Walk-access threshold is ~1.5 km.

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
