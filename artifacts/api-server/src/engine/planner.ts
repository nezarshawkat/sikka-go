import type {
  Coord,
  Edge,
  EnginePlan,
  GraphNode,
  ModeKey,
  PlanKey,
  PlanLeg,
  TransitGraph,
  TransportTypeInfo,
} from "./types.js";
import { buildGraph, nearestStops } from "./graph.js";
import { findRoutes, type SearchOverlay, type SearchResult } from "./pathfinder.js";
import { PROFILES, directFare, walkMinutes, WALK_MAX_KM } from "./cost.js";
import { haversineKm } from "./geo.js";
import { snapConnector, snapFootOsrm } from "../utils/routePathGenerator.js";
import { estimateCrowding } from "./crowding.js";
import { scorePlan, planConfidence } from "./score.js";
import { explainPlan } from "./explain.js";
import { validatePlan } from "./validate.js";

const TAXI_CONNECT_KM = 5;
const TUKTUK_CONNECT_KM = 3;
const ACCESS_STOP_LIMIT = 120;

function pushEdge(map: Map<string, Edge[]>, from: string, e: Edge) {
  const arr = map.get(from);
  if (arr) arr.push(e);
  else map.set(from, [e]);
}

function pickType(graph: TransitGraph, mode: ModeKey, prefer?: RegExp): TransportTypeInfo | null {
  const all = [...graph.types.values()].filter((t) => t.mode === mode);
  if (prefer) {
    const p = all.find((t) => prefer.test(t.nameEn));
    if (p) return p;
  }
  return all[0] ?? null;
}

function findClosestPathIndex(path: [number, number][], coord: Coord): number {
  let minIdx = 0;
  let minDist = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = haversineKm({ lng: path[i][0], lat: path[i][1] }, coord);
    if (d < minDist) {
      minDist = d;
      minIdx = i;
    }
  }
  return minIdx;
}

function buildOverlay(
  graph: TransitGraph,
  origin: Coord,
  dest: Coord,
  planKey: PlanKey,
): SearchOverlay {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, Edge[]>();
  nodes.set("origin", { id: "origin", coord: origin, kind: "origin" });
  nodes.set("dest", { id: "dest", coord: dest, kind: "dest" });

  const taxiType = pickType(graph, "taxi", /uber|careem/i);
  const tuktukType = pickType(graph, "tuktuk");
  const useTuktukFill = planKey === "economic";

  const connect = (fromId: string, toId: string, distKm: number) => {
    if (distKm <= WALK_MAX_KM) {
      const t = walkMinutes(distKm);
      pushEdge(edges, fromId, {
        to: toId, kind: "walk", timeMin: t, costEgp: 0, walkMin: t, isBoarding: false, mode: "walk",
      });
      return;
    }
    if (useTuktukFill && tuktukType && distKm <= TUKTUK_CONNECT_KM) {
      pushEdge(edges, fromId, {
        to: toId, kind: "tuktuk", timeMin: (distKm / tuktukType.speedKmh) * 60,
        costEgp: directFare(tuktukType, distKm), walkMin: 0, isBoarding: true,
        mode: "tuktuk", typeId: tuktukType.id,
      });
    }
    if (taxiType && distKm <= TAXI_CONNECT_KM) {
      pushEdge(edges, fromId, {
        to: toId, kind: "taxi", timeMin: (distKm / taxiType.speedKmh) * 60,
        costEgp: directFare(taxiType, distKm), walkMin: 0, isBoarding: true,
        mode: "taxi", typeId: taxiType.id,
      });
    }
  };

  for (const s of nearestStops(graph, origin, TAXI_CONNECT_KM, ACCESS_STOP_LIMIT)) {
    connect("origin", s.id, s.distKm);
  }
  for (const s of nearestStops(graph, dest, TAXI_CONNECT_KM, ACCESS_STOP_LIMIT)) {
    connect(s.id, "dest", s.distKm);
  }

  const direct = haversineKm(origin, dest);
  if (direct <= WALK_MAX_KM) {
    const wt = walkMinutes(direct);
    pushEdge(edges, "origin", {
      to: "dest", kind: "walk", timeMin: wt, costEgp: 0, walkMin: wt, isBoarding: false, mode: "walk",
    });
  }

  if (taxiType && (planKey === "premium" || (direct > WALK_MAX_KM && direct <= TAXI_CONNECT_KM))) {
    pushEdge(edges, "origin", {
      to: "dest", kind: "taxi", timeMin: (direct / taxiType.speedKmh) * 60,
      costEgp: directFare(taxiType, direct), walkMin: 0, isBoarding: true, mode: "taxi", typeId: taxiType.id,
    });
  }

  return { nodes, edges };
}

// Single mode pool: every transit + connector mode competes in one search. The
// rider's tier (economic/comfortable/premium) only changes the cost weights and
// mode preferences in PROFILES — NOT which modes exist — so the rung ladder is
// gone. Per-mode admissibility (tuktuk heatmap gate, walk budget) is enforced
// inside the pathfinder; connector availability is decided in buildOverlay.
const ALL_MODES = new Set<ModeKey>([
  "metro", "monorail", "train", "bus", "serfis", "microbus", "taxi", "tuktuk",
]);

function nodeCoord(graph: TransitGraph, overlay: SearchOverlay, id: string): Coord {
  return (overlay.nodes.get(id) ?? graph.nodes.get(id))!.coord;
}

function reconstruct(
  graph: TransitGraph,
  overlay: SearchOverlay,
  res: SearchResult,
  planKey: PlanKey,
  isArabic: boolean,
): EnginePlan {
  const nameOf = (id: string): string => {
    if (id === "origin") return isArabic ? "موقعك" : "Your location";
    if (id === "dest") return isArabic ? "الوجهة" : "Destination";
    return graph.nodes.get(id)?.name ?? overlay.nodes.get(id)?.name ?? "";
  };
  const legs: PlanLeg[] = [];
  const edges = res.edges;
  const ids = res.nodeIds;
  let i = 0;

  while (i < edges.length) {
    const e = edges[i];

    if (e.kind === "walk") {
      const startId = ids[i];
      let j = i;
      let time = 0;
      while (j < edges.length && edges[j].kind === "walk") {
        time += edges[j].timeMin;
        j++;
      }
      const endId = ids[j];
      const a = nodeCoord(graph, overlay, startId);
      const b = nodeCoord(graph, overlay, endId);
      legs.push({
        mode: "walk", typeId: null, lineId: null, lineNumber: null,
        startName: nameOf(startId), endName: nameOf(endId),
        startCoord: a, endCoord: b, timeMin: time, waitMin: 0, costEgp: 0,
        distanceKm: haversineKm(a, b),
        geometry: [[a.lng, a.lat], [b.lng, b.lat]], crowding: "low",
      });
      i = j;
      continue;
    }

    if (e.kind === "taxi" || e.kind === "tuktuk") {
      const a = nodeCoord(graph, overlay, ids[i]);
      const b = nodeCoord(graph, overlay, ids[i + 1]);
      legs.push({
        mode: e.mode, typeId: e.typeId ?? null, lineId: null, lineNumber: null,
        startName: nameOf(ids[i]), endName: nameOf(ids[i + 1]),
        startCoord: a, endCoord: b, timeMin: e.timeMin, waitMin: 0, costEgp: e.costEgp,
        distanceKm: haversineKm(a, b),
        geometry: [[a.lng, a.lat], [b.lng, b.lat]],
        crowding: estimateCrowding(e.mode, a, graph.heatPoints),
      });
      i++;
      continue;
    }

    if (e.kind === "board") {
      const board = e;
      const line = board.lineId ? graph.lines.get(board.lineId) : null;
      i++;
      const rides: Edge[] = [];
      while (i < edges.length && edges[i].kind === "ride") {
        rides.push(edges[i]);
        i++;
      }
      if (i < edges.length && edges[i].kind === "alight") i++;

      if (rides.length === 0 || !line) continue;

      // Declare lastRide to prevent ReferenceError crash.
      const lastRide = rides[rides.length - 1];
      const boardLs = graph.nodes.get(board.to);
      const endLs = graph.nodes.get(lastRide.to);
      const startStop = boardLs?.stopIndex != null ? line.stops[boardLs.stopIndex] : line.stops[0];
      const endStop = endLs?.stopIndex != null ? line.stops[endLs.stopIndex] : line.stops[line.stops.length - 1];

      // Geometry slice from the high-res path. Travel direction is derived from
      // the true stop sequence (not path-index magnitude) so a line ridden
      // against its stored orientation still renders in the rider's direction.
      // The stored route_path is NEVER reshaped — only sliced and, when riding
      // in reverse, flipped — so a transport's fixed route cannot be altered.
      let geometry: [number, number][] = [];
      if (line.path && line.path.length > 0) {
        // Prefer each stop's authoritative pathIndex (set at graph build from the
        // stop's true position along route_path); only fall back to nearest-vertex
        // search when an index is missing/out of range. This avoids picking the
        // wrong arc on looped or self-near paths.
        const N = line.path.length;
        const inRange = (i: number | undefined): i is number =>
          typeof i === "number" && i >= 0 && i < N;
        const fromPathIdx = inRange(startStop.pathIndex)
          ? startStop.pathIndex
          : findClosestPathIndex(line.path, startStop.coord);
        const toPathIdx = inRange(endStop.pathIndex)
          ? endStop.pathIndex
          : findClosestPathIndex(line.path, endStop.coord);
        const lo = Math.min(fromPathIdx, toPathIdx);
        const hi = Math.max(fromPathIdx, toPathIdx);
        let slice = line.path.slice(lo, hi + 1);
        // Degenerate slice (both stops resolve to one path vertex on a coarse
        // path): widen to a 2-point window taken FROM the stored path rather than
        // synthesizing a straight line between stop coords — the leg must stay on
        // the real fixed route.
        if (slice.length < 2) {
          const a = Math.max(0, Math.min(lo, N - 2));
          slice = line.path.slice(a, a + 2);
        }
        const isForward = (boardLs?.stopIndex ?? 0) <= (endLs?.stopIndex ?? 0);
        geometry = isForward ? slice : slice.slice().reverse();
      }

      const rideTime = rides.reduce((s, r) => s + r.timeMin, 0);
      const rideCost = rides.reduce((s, r) => s + r.costEgp, 0);

      const bIdx = boardLs?.stopIndex ?? 0;
      const eIdx = endLs?.stopIndex ?? line.stops.length - 1;
      const lo = Math.min(bIdx, eIdx);
      const hi = Math.max(bIdx, eIdx);
      let distance = 0;
      for (let k = lo; k < hi; k++) {
        distance += haversineKm(line.stops[k].coord, line.stops[k + 1].coord);
      }
      if (distance <= 0) distance = haversineKm(startStop.coord, endStop.coord);

      let namedRidden = 0;
      for (let k = lo + 1; k <= hi; k++) {
        if (!line.stops[k]?.synthetic) namedRidden++;
      }

      legs.push({
        mode: board.mode, typeId: board.typeId ?? null, lineId: line.id, lineNumber: line.lineNumber,
        startName: startStop.displayName ?? startStop.name,
        endName: endStop.displayName ?? endStop.name,
        startCoord: startStop.coord, endCoord: endStop.coord,
        timeMin: board.timeMin + rideTime, waitMin: board.timeMin, costEgp: board.costEgp + rideCost,
        distanceKm: distance,
        geometry: geometry.length >= 2 ? geometry : [
          [startStop.coord.lng, startStop.coord.lat],
          [endStop.coord.lng, endStop.coord.lat],
        ],
        crowding: estimateCrowding(board.mode, startStop.coord, graph.heatPoints),
        stopsCount: namedRidden,
      });
      continue;
    }

    i++;
  }

  const cleaned = legs.filter(
    (l, idx) => !(l.mode === "walk" && l.timeMin < 1.5 && l.distanceKm < 0.12 && legs.length > 1) || idx === -1,
  );
  const finalLegs = cleaned.length ? cleaned : legs;

  const totalTimeMin = finalLegs.reduce((s, l) => s + l.timeMin, 0);
  const totalCostEgp = finalLegs.reduce((s, l) => s + l.costEgp, 0);
  const totalWalkMin = finalLegs.filter((l) => l.mode === "walk").reduce((s, l) => s + l.timeMin, 0);
  const nonWalk = finalLegs.filter((l) => l.mode !== "walk").length;
  const transfers = Math.max(0, nonWalk - 1);
  const distanceKm = finalLegs.reduce((s, l) => s + l.distanceKm, 0);

  const plan: EnginePlan = {
    legs: finalLegs, totalTimeMin, totalCostEgp, totalWalkMin, transfers, distanceKm,
    qualityScore: 0, confidence: planConfidence(finalLegs), plan: planKey,
  };
  plan.qualityScore = scorePlan(plan);
  return plan;
}

export interface PlanRequest {
  origin: Coord;
  dest: Coord;
  planKey: PlanKey;
  isArabic: boolean;
}

const UI_ICON: Record<ModeKey, string> = {
  metro: "metro", monorail: "monorail", train: "train",
  bus: "bus", serfis: "bus", microbus: "bus",
  taxi: "car", tuktuk: "bike", walk: "walk",
};

function legInstructions(leg: PlanLeg, type: TransportTypeInfo | null, isArabic: boolean): string[] {
  const name = type ? (isArabic ? type.nameAr : type.nameEn) : "";
  const cost = Math.round(leg.costEgp);
  const mins = Math.round(leg.timeMin);
  if (leg.mode === "walk") {
    return isArabic
      ? [`امشِ حوالي ${mins} دقيقة إلى ${leg.endName || "النقطة التالية"}.`]
      : [`Walk about ${mins} min to ${leg.endName || "the next point"}.`];
  }
  if (leg.mode === "taxi" || leg.mode === "tuktuk") {
    return isArabic
      ? [
          `اطلب ${name} من ${leg.startName || "موقعك"}.`,
          `اتجه إلى ${leg.endName || "وجهتك"} (~${cost} جنيه، ${mins} دقيقة).`,
        ]
      : [
          `Order ${name} from ${leg.startName || "your location"}.`,
          `Head to ${leg.endName || "your destination"} (~${cost} EGP, ${mins} min).`,
        ];
  }
  const ln = leg.lineNumber ? ` ${leg.lineNumber}` : "";
  const stops = leg.stopsCount ?? 0;
  const km = Math.round(leg.distanceKm * 10) / 10;
  if (isArabic) {
    return [
      `اذهب إلى ${leg.startName} واركب ${name}${ln}.`,
      `ادفع حوالي ${cost} جنيه.`,
      stops > 0
        ? `اركب ${stops} محطة/محطات حتى ${leg.endName}.`
        : `ابقَ على الخط حوالي ${km} كم حتى ${leg.endName}.`,
      `انزل عند ${leg.endName}.`,
    ];
  }
  return [
    `Go to ${leg.startName} and board ${name}${ln}.`,
    `Pay about ${cost} EGP.`,
    stops > 0
      ? `Ride ${stops} stop${stops === 1 ? "" : "s"} to ${leg.endName}.`
      : `Stay on for about ${km} km to ${leg.endName}.`,
    `Get off at ${leg.endName}.`,
  ];
}

// Straight-line fallback for a connector whose snap failed: a few linearly
// interpolated points between the leg's OWN endpoints. Never routes through a
// fixed city centroid (which would warp cross-city legs across Cairo).
function interpolateLine(a: Coord, b: Coord, n = 5): number[][] {
  const pts: number[][] = [];
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0 : k / (n - 1);
    pts.push([a.lng + (b.lng - a.lng) * t, a.lat + (b.lat - a.lat) * t]);
  }
  return pts;
}

// Snap connector legs to the street network; pin start/end after snapping so the
// polyline anchors exactly at the logical endpoints. On failure, fall back to a
// localized interpolated straight line (not the stored 2-point straight line).
async function onStreetGeometry(leg: PlanLeg): Promise<number[][]> {
  if (leg.mode === "walk" || leg.mode === "taxi" || leg.mode === "tuktuk") {
    const a: [number, number] = [leg.startCoord.lng, leg.startCoord.lat];
    const b: [number, number] = [leg.endCoord.lng, leg.endCoord.lat];
    try {
      // Walk legs follow the pedestrian network (OSRM foot); taxi/tuktuk legs use
      // the driving network (Mapbox). For walking, prefer OSRM foot and fall back
      // to Mapbox walking so a transient OSRM failure still yields snapped geometry.
      let snapped: [number, number][] | null = null;
      if (leg.mode === "walk") {
        snapped = await snapFootOsrm(a, b);
        if (!snapped || snapped.length < 2) snapped = await snapConnector("walking", a, b);
      } else {
        snapped = await snapConnector("driving", a, b);
      }
      if (snapped && snapped.length >= 2) {
        // Clone before pinning so we never mutate an array still held in the
        // snap helpers' coord caches.
        const out = snapped.map((p) => [p[0], p[1]] as [number, number]);
        out[0] = a;
        out[out.length - 1] = b;
        return out;
      }
    } catch (e) {
      console.error("Connector snapped geometry lookup failed", e);
    }
    return interpolateLine(leg.startCoord, leg.endCoord);
  }
  return leg.geometry;
}

const STITCH_CONNECTOR_MODES = new Set<ModeKey>(["walk", "taxi", "tuktuk"]);

// Eliminate visual cuts between consecutive segment polylines WITHOUT ever
// altering a fixed transit route. Only flexible connector legs (walk/taxi/tuktuk)
// are reshaped: a connector endpoint is moved to meet the adjacent transit
// polyline, and the journey's very first/last point is pinned to the true
// origin/destination ONLY when that boundary leg is itself a connector. Two
// adjacent transit polylines are NEVER snapped — moving a transit vertex would
// change a fixed route — so a real transit↔transit gap is left intact and
// rejected by validatePlan (geometry_cut) instead of being papered over.
function stitchSegmentGeometry(
  segments: { route_geometry: number[][] }[],
  legs: PlanLeg[],
): void {
  if (segments.length && legs.length) {
    const first = segments[0].route_geometry;
    if (first?.length && STITCH_CONNECTOR_MODES.has(legs[0].mode)) {
      first[0] = [legs[0].startCoord.lng, legs[0].startCoord.lat];
    }
    const last = segments[segments.length - 1].route_geometry;
    const lastLeg = legs[legs.length - 1];
    if (last?.length && STITCH_CONNECTOR_MODES.has(lastLeg.mode)) {
      last[last.length - 1] = [lastLeg.endCoord.lng, lastLeg.endCoord.lat];
    }
  }
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i].route_geometry;
    const b = segments[i + 1].route_geometry;
    if (!a?.length || !b?.length) continue;
    const aEnd = a[a.length - 1];
    const bStart = b[0];
    const aConn = STITCH_CONNECTOR_MODES.has(legs[i].mode);
    const bConn = STITCH_CONNECTOR_MODES.has(legs[i + 1].mode);
    // Move only the connector side(s). Transit↔transit (neither connector) is
    // left untouched on purpose.
    if (aConn && !bConn) {
      a[a.length - 1] = [bStart[0], bStart[1]];
    } else if (!aConn && bConn) {
      b[0] = [aEnd[0], aEnd[1]];
    } else if (aConn && bConn) {
      b[0] = [aEnd[0], aEnd[1]];
    }
  }
}

export async function adaptPlanToApi(graph: TransitGraph, plan: EnginePlan, isArabic: boolean) {
  const taxiType = pickType(graph, "taxi", /uber|careem/i);
  const segments = await Promise.all(plan.legs.map(async (leg) => {
    const type = leg.typeId ? graph.types.get(leg.typeId) ?? null : null;
    const name = type
      ? `${isArabic ? type.nameAr : type.nameEn}${leg.lineNumber ? ` ${leg.lineNumber}` : ""}`
      : isArabic ? "مشي" : "Walk";
    const taxiAlt = taxiType && leg.mode !== "taxi" && leg.distanceKm > 0
      ? [{
          transport_type_id: taxiType.id,
          transport_name: isArabic ? taxiType.nameAr : taxiType.nameEn,
          cost_egp: directFare(taxiType, leg.distanceKm),
          duration_minutes: Math.round((leg.distanceKm / taxiType.speedKmh) * 60),
          color: taxiType.color, icon: "car",
        }]
      : [];
    return {
      transport_type_id: leg.typeId ?? leg.mode,
      transport_name: name,
      government_type: type?.governmentType ?? "private",
      category: type?.category ?? "economic",
      start_name: leg.startName, end_name: leg.endName,
      cost_egp: Math.round(leg.costEgp), duration_minutes: Math.max(1, Math.round(leg.timeMin)),
      color: type?.color ?? "#64748B", icon: UI_ICON[leg.mode],
      line_id: leg.lineId, line_number: leg.lineNumber,
      info: `${Math.round(leg.distanceKm * 10) / 10} km · ${leg.crowding} crowding`,
      instructions: legInstructions(leg, type, isArabic),
      route_geometry: await onStreetGeometry(leg),
      crowding: leg.crowding, alternatives: taxiAlt,
    };
  }));

  stitchSegmentGeometry(segments, plan.legs);

  return {
    segments, total_cost_egp: Math.round(plan.totalCostEgp),
    total_duration_minutes: Math.max(1, Math.round(plan.totalTimeMin)),
    budget_range: { min: Math.round(plan.totalCostEgp * 0.8), max: Math.round(plan.totalCostEgp * 1.6) },
    distance_km: Math.round(plan.distanceKm * 10) / 10,
    quality_score: plan.qualityScore, confidence: plan.confidence, transfers: plan.transfers,
    total_walk_minutes: Math.round(plan.totalWalkMin), explanation: explainPlan(plan, isArabic),
    plan: plan.plan, engine: "deterministic-graph",
  };
}

// Main entry: ONE pooled Dijkstra over every mode. The search returns its
// best-weight Pareto candidates; we reconstruct + validate them in order and
// return the first that passes the hard plan gates (a real, verified route is
// still mandatory — invalid plans are never returned). When none validate the
// caller serves a verified door-to-door taxi fallback.
export async function computeEnginePlan(req: PlanRequest): Promise<EnginePlan | null> {
  const graph = await buildGraph();
  const overlay = buildOverlay(graph, req.origin, req.dest, req.planKey);
  const profile = PROFILES[req.planKey];

  const candidates = findRoutes(graph, overlay, "origin", "dest", profile, ALL_MODES);

  let bestPlan: EnginePlan | null = null;
  for (const res of candidates) {
    const plan = reconstruct(graph, overlay, res, req.planKey, req.isArabic);
    if (!plan || plan.legs.length === 0) continue;
    if (validatePlan(plan, graph).ok) {
      bestPlan = plan;
      break;
    }
  }

  if (!bestPlan) return null;

  for (const leg of bestPlan.legs as (typeof bestPlan.legs[number] & { allowedSwaps?: string[] })[]) {
    if (leg.mode === "walk" || leg.mode === "taxi" || leg.mode === "tuktuk") {
      leg.allowedSwaps = ["walk", "taxi"];
    }
  }

  return bestPlan;
}

export async function planTripApi(req: PlanRequest) {
  const graph = await buildGraph();
  const plan = await computeEnginePlan(req);
  if (!plan) return null;
  return adaptPlanToApi(graph, plan, req.isArabic);
}
