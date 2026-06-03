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
Walk caps derive from `WALK_MAX_KM` (0.8 km) in `cost.ts`: single-walk cap
`WALK_MAX_SINGLE_MIN` (~0.8 km worth) and total cap `WALK_MAX_TOTAL_MIN`
(~1.6 km worth, 2x single). Pathfinder + validate import these — do NOT hardcode
20/30 min anymore. **Why:** users complained walks were too long and cut through
blocks; any access gap over 0.8 km must be ridden, not walked. Total walking is a
path-dependent resource.
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
`buildOverlay(graph, origin, dest, planKey)` builds first/last-mile connectors via
a single `connect(from,to,distKm)` helper, and `ladderFor(planKey)` orders the
mode sets tried (most-preferred → fallback). Connector policy (ALL profiles):
walk only if `distKm <= WALK_MAX_KM` (0.8 km); a longer gap is filled on-street by
a tuktuk (economic/comfortable only, ≤3 km) and/or a taxi (every profile, ≤5 km).
Premium additionally always offers a door-to-door taxi for any distance.
`computeEnginePlan` also rejects detours: a plan's total distance must stay under
`max(directKm*2.8 + 3, 5)` km, else the least-distance valid plan is used.

Connector edges (walk/taxi/tuktuk) exist ONLY as overlay injections — there are
no taxi/tuktuk "lines" in the base graph — so `pathfinder.ts` marks them in
`CONNECTOR_MODES` and always lets them be traversed; per-profile availability is
decided entirely in `buildOverlay` (whether the edge is created at all), NOT by
the rung's `allowed` mode set.

**Why:** the original engine forced boarding at sparse named stops, so short
trips detoured through far hubs (real failure: El Narges→Nasr City became a 75-min
2-bus chain or a full-12 km Uber). The 0.8 km walk cap then required motorized
connector fill so tightened walking does not make access gaps unroutable.

## Connector geometry snapping
Connector legs are stored as a straight 2-point line; `adaptPlanToApi` is async
and snaps walk legs (`walking` profile) and taxi/tuktuk legs (`driving`) onto the
real street network via `snapConnector()` (`routePathGenerator.ts`, coord-cached,
returns null → straight-line fallback when no `MAPBOX_TOKEN`/`VITE_MAPBOX_TOKEN`).
Transit legs keep their DB `route_path` polyline. **Why:** straight diagonals cut
through blocks and looked wrong on the map.

## Fare markup + budget band
`cost.ts` `FARE_MARKUP` (1.25) is applied ONCE each in `directFare`,
`boardingFare`, `rideCostPerKm` so transit + taxi/tuktuk fares all rise together
(no double-marking — line fares marked at board/ride edge, connector fares via
`directFare`, totals derive from those). API `budget_range` is `min*0.8 / max*1.6`.
**Why:** users said prices were too strict/low; the band is an estimate, not an
exact fare.

## Distances
Compute transit-leg `distanceKm` from consecutive `line.stops[]` haversine, NOT
from `pathLengthKm(route_path)` — some stored polylines are noisy/corrupt and
inflate distance wildly (saw a 162 km Maadi→Heliopolis metro leg). The polyline
is kept for map display only.

## Pre-delivery validation gates + geometry stitching
`validatePlan(plan, graph?)` is the hard gate before any plan is returned. Beyond
basic connectivity it enforces, for transit legs only (CONNECTOR_MODES walk/taxi/
tuktuk are exempt): `stop_not_on_line` (board/alight coord must be ≤300m from the
line's road-snapped `path`, not just its stop list — checking the path is the
meaningful test; vs the stops list is trivially true), `geometry_cut` (two adjacent
transit legs' drawn polyline endpoints must be ≤50m apart), `unbridgeable_transfer`
(adjacent transit legs' logical transfer ≤800m). `stop_not_on_line` measures
point-to-SEGMENT distance to the path (not nearest-vertex) so sparse polylines
don't false-reject. Slicing uses each stop's authoritative `pathIndex` (falls back
to nearest-vertex only if missing). `adaptPlanToApi` runs `stitchSegmentGeometry`:
it ONLY reshapes connector legs — a connector endpoint is moved to the adjacent
transit endpoint, and first/last is pinned to origin/dest only when that boundary
leg is itself a connector. Transit↔transit boundaries are NEVER snapped (moving a
transit vertex would alter a fixed route); a real transit-transit cut is left
intact and rejected by `geometry_cut` (50m) instead.

**Why:** users saw map polylines that cut/teleported and routes on lines whose
stored geometry doesn't actually serve the boarded stop (the known partly-corrupt
`route_path` data — see sikka-stop-dictionary.md). The rule "never alter a fixed
route, only board/alight may change" means we cannot fake continuity by moving a
transit vertex — so a plan with a real transit-transit cut is REJECTED, not patched.

**How to apply:** when these gates reject every transit candidate, `computeEnginePlan`
returns null and the route layer (`tripPlan.ts`) serves `generateFallbackPlan` (a
verified door-to-door taxi) — the app never shows a blank/"no route". This is the
intended reliability tradeoff (reject unreliable transit, serve a real fallback);
re-enriching the corrupt paths is separate work, not a reason to loosen the gates.
Geometry_cut is intentionally scoped to transit-transit pairs only (connector gaps
are closed by the stitch pass), which deviates from a naive "all boundaries" reading.

## Scope boundary
The intercity flow (`buildIntercityPlan`, SuperJet/GoBus/BlueBus adapters) is a
SEPARATE feature. Its synthetic-estimate fallback when adapters return no live
trips predates this engine and is intentionally left unchanged — it is not part
of the city routing-engine spec.
