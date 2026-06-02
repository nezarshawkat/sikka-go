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
import { findRoute, type SearchOverlay, type SearchResult } from "./pathfinder.js";
import { PROFILES, directFare, walkMinutes } from "./cost.js";
import { haversineKm, slicePath } from "./geo.js";
import { estimateCrowding } from "./crowding.js";
import { scorePlan, planConfidence } from "./score.js";
import { explainPlan } from "./explain.js";
import { validatePlan } from "./validate.js";

const WALK_ACCESS_KM = 1.3; // origin/dest → stop on foot
const TAXI_CONNECT_KM = 5; // origin/dest → stop by car (first/last mile)
const TUKTUK_CONNECT_KM = 3; // spec: tuktuk max distance
const ACCESS_STOP_LIMIT = 35;

const PUBLIC: ModeKey[] = ["metro", "monorail", "train", "bus", "serfis", "microbus"];

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

// Build origin/dest nodes plus access, egress and direct connectors as a
// per-request overlay so the cached graph is never mutated.
function buildOverlay(
  graph: TransitGraph,
  origin: Coord,
  dest: Coord,
): SearchOverlay {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, Edge[]>();
  nodes.set("origin", { id: "origin", coord: origin, kind: "origin" });
  nodes.set("dest", { id: "dest", coord: dest, kind: "dest" });

  const taxiType = pickType(graph, "taxi", /uber|careem/i);
  const tuktukType = pickType(graph, "tuktuk");

  const nearO = nearestStops(graph, origin, TAXI_CONNECT_KM, ACCESS_STOP_LIMIT);
  for (const s of nearO) {
    if (s.distKm <= WALK_ACCESS_KM) {
      const t = walkMinutes(s.distKm);
      pushEdge(edges, "origin", {
        to: s.id, kind: "walk", timeMin: t, costEgp: 0, walkMin: t, isBoarding: false, mode: "walk",
      });
    }
    if (taxiType) {
      pushEdge(edges, "origin", {
        to: s.id, kind: "taxi", timeMin: (s.distKm / taxiType.speedKmh) * 60,
        costEgp: directFare(taxiType, s.distKm), walkMin: 0, isBoarding: true,
        mode: "taxi", typeId: taxiType.id,
      });
    }
    if (tuktukType && s.distKm <= TUKTUK_CONNECT_KM) {
      pushEdge(edges, "origin", {
        to: s.id, kind: "tuktuk", timeMin: (s.distKm / tuktukType.speedKmh) * 60,
        costEgp: directFare(tuktukType, s.distKm), walkMin: 0, isBoarding: true,
        mode: "tuktuk", typeId: tuktukType.id,
      });
    }
  }

  const nearD = nearestStops(graph, dest, TAXI_CONNECT_KM, ACCESS_STOP_LIMIT);
  for (const s of nearD) {
    if (s.distKm <= WALK_ACCESS_KM) {
      const t = walkMinutes(s.distKm);
      pushEdge(edges, s.id, {
        to: "dest", kind: "walk", timeMin: t, costEgp: 0, walkMin: t, isBoarding: false, mode: "walk",
      });
    }
    if (taxiType) {
      pushEdge(edges, s.id, {
        to: "dest", kind: "taxi", timeMin: (s.distKm / taxiType.speedKmh) * 60,
        costEgp: directFare(taxiType, s.distKm), walkMin: 0, isBoarding: true,
        mode: "taxi", typeId: taxiType.id,
      });
    }
    if (tuktukType && s.distKm <= TUKTUK_CONNECT_KM) {
      pushEdge(edges, s.id, {
        to: "dest", kind: "tuktuk", timeMin: (s.distKm / tuktukType.speedKmh) * 60,
        costEgp: directFare(tuktukType, s.distKm), walkMin: 0, isBoarding: true,
        mode: "tuktuk", typeId: tuktukType.id,
      });
    }
  }

  // Direct origin → dest
  const direct = haversineKm(origin, dest);
  const wt = walkMinutes(direct);
  if (wt <= 20) {
    // Only offer a direct walk when it respects the single-walk limit.
    pushEdge(edges, "origin", {
      to: "dest", kind: "walk", timeMin: wt, costEgp: 0, walkMin: wt, isBoarding: false, mode: "walk",
    });
  }
  if (taxiType) {
    pushEdge(edges, "origin", {
      to: "dest", kind: "taxi", timeMin: (direct / taxiType.speedKmh) * 60,
      costEgp: directFare(taxiType, direct), walkMin: 0, isBoarding: true, mode: "taxi", typeId: taxiType.id,
    });
  }
  if (tuktukType && direct <= TUKTUK_CONNECT_KM) {
    pushEdge(edges, "origin", {
      to: "dest", kind: "tuktuk", timeMin: (direct / tuktukType.speedKmh) * 60,
      costEgp: directFare(tuktukType, direct), walkMin: 0, isBoarding: true, mode: "tuktuk", typeId: tuktukType.id,
    });
  }

  return { nodes, edges };
}

function ladderFor(planKey: PlanKey): Set<ModeKey>[] {
  const rungs: ModeKey[][] = [];
  if (planKey === "economic") {
    rungs.push([...PUBLIC]);
    rungs.push([...PUBLIC, "tuktuk"]);
    rungs.push([...PUBLIC, "tuktuk", "taxi"]);
  } else if (planKey === "comfortable") {
    rungs.push([...PUBLIC, "taxi", "tuktuk"]);
  } else {
    rungs.push([...PUBLIC, "taxi", "tuktuk"]);
  }
  rungs.push([...PUBLIC, "taxi", "tuktuk"]); // widen
  rungs.push([]); // walking only
  rungs.push(["taxi"]); // full taxi
  return rungs.map((r) => new Set(r));
}

function nodeCoord(graph: TransitGraph, overlay: SearchOverlay, id: string): Coord {
  return (overlay.nodes.get(id) ?? graph.nodes.get(id))!.coord;
}

// Convert a raw search path into structured legs (collapsing rides per line).
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
      if (i < edges.length && edges[i].kind === "alight") i++; // consume alight

      if (rides.length === 0 || !line) continue; // degenerate, skip

      const firstRide = rides[0];
      const lastRide = rides[rides.length - 1];
      const fromIdx = firstRide.fromStopIndex ?? 0;
      const toIdx = lastRide.toStopIndex ?? (line.path?.length ?? 1) - 1;
      const geometry = line.path ? slicePath(line.path, fromIdx, toIdx) : [];

      // board.to and lastRide.to are line-stop node ids → resolve to line.stops
      const boardLs = graph.nodes.get(board.to);
      const endLs = graph.nodes.get(lastRide.to);
      const startStop = boardLs?.stopIndex != null ? line.stops[boardLs.stopIndex] : line.stops[0];
      const endStop = endLs?.stopIndex != null ? line.stops[endLs.stopIndex] : line.stops[line.stops.length - 1];

      const rideTime = rides.reduce((s, r) => s + r.timeMin, 0);
      const rideCost = rides.reduce((s, r) => s + r.costEgp, 0);
      // Distance from consecutive stop coordinates — reliable even when a stored
      // route_path polyline is noisy. The polyline is kept for display only.
      const bIdx = boardLs?.stopIndex ?? 0;
      const eIdx = endLs?.stopIndex ?? line.stops.length - 1;
      const lo = Math.min(bIdx, eIdx);
      const hi = Math.max(bIdx, eIdx);
      let distance = 0;
      for (let k = lo; k < hi; k++) {
        distance += haversineKm(line.stops[k].coord, line.stops[k + 1].coord);
      }
      if (distance <= 0) distance = haversineKm(startStop.coord, endStop.coord);

      legs.push({
        mode: board.mode, typeId: board.typeId ?? null, lineId: line.id, lineNumber: line.lineNumber,
        startName: startStop.name, endName: endStop.name,
        startCoord: startStop.coord, endCoord: endStop.coord,
        timeMin: board.timeMin + rideTime, waitMin: board.timeMin, costEgp: board.costEgp + rideCost,
        distanceKm: distance,
        geometry: geometry.length >= 2 ? geometry : [
          [startStop.coord.lng, startStop.coord.lat],
          [endStop.coord.lng, endStop.coord.lat],
        ],
        crowding: estimateCrowding(board.mode, startStop.coord, graph.heatPoints),
        stopsCount: rides.length,
      });
      continue;
    }

    i++; // skip orphan alight/unknown
  }

  // Drop negligible walk legs (<1.5 min, <120 m) unless they are the only leg.
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
    legs: finalLegs,
    totalTimeMin,
    totalCostEgp,
    totalWalkMin,
    transfers,
    distanceKm,
    qualityScore: 0,
    confidence: planConfidence(finalLegs),
    plan: planKey,
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

// ── Output adapter: EnginePlan → existing API segment shape ──
const UI_ICON: Record<ModeKey, string> = {
  metro: "metro", monorail: "monorail", train: "train",
  bus: "bus", serfis: "bus", microbus: "bus",
  taxi: "car", tuktuk: "bike", walk: "walk",
};

function legInstructions(
  leg: PlanLeg,
  type: TransportTypeInfo | null,
  isArabic: boolean,
): string[] {
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
  if (isArabic) {
    return [
      `اذهب إلى ${leg.startName} واركب ${name}${ln}.`,
      `ادفع حوالي ${cost} جنيه.`,
      `اركب ${stops} محطة/محطات حتى ${leg.endName}.`,
      `انزل عند ${leg.endName}.`,
    ];
  }
  return [
    `Go to ${leg.startName} and board ${name}${ln}.`,
    `Pay about ${cost} EGP.`,
    `Ride ${stops} stop${stops === 1 ? "" : "s"} to ${leg.endName}.`,
    `Get off at ${leg.endName}.`,
  ];
}

export function adaptPlanToApi(
  graph: TransitGraph,
  plan: EnginePlan,
  isArabic: boolean,
) {
  const taxiType = pickType(graph, "taxi", /uber|careem/i);
  const segments = plan.legs.map((leg) => {
    const type = leg.typeId ? graph.types.get(leg.typeId) ?? null : null;
    const name = type
      ? `${isArabic ? type.nameAr : type.nameEn}${leg.lineNumber ? ` ${leg.lineNumber}` : ""}`
      : isArabic
        ? "مشي"
        : "Walk";
    const taxiAlt =
      taxiType && leg.mode !== "taxi" && leg.distanceKm > 0
        ? [
            {
              transport_type_id: taxiType.id,
              transport_name: isArabic ? taxiType.nameAr : taxiType.nameEn,
              cost_egp: directFare(taxiType, leg.distanceKm),
              duration_minutes: Math.round((leg.distanceKm / taxiType.speedKmh) * 60),
              color: taxiType.color,
              icon: "car",
            },
          ]
        : [];
    return {
      transport_type_id: leg.typeId ?? leg.mode,
      transport_name: name,
      government_type: type?.governmentType ?? "private",
      category: type?.category ?? "economic",
      start_name: leg.startName,
      end_name: leg.endName,
      cost_egp: Math.round(leg.costEgp),
      duration_minutes: Math.max(1, Math.round(leg.timeMin)),
      color: type?.color ?? "#64748B",
      icon: UI_ICON[leg.mode],
      line_id: leg.lineId,
      line_number: leg.lineNumber,
      info: `${Math.round(leg.distanceKm * 10) / 10} km · ${leg.crowding} crowding`,
      instructions: legInstructions(leg, type, isArabic),
      route_geometry: leg.geometry,
      crowding: leg.crowding,
      alternatives: taxiAlt,
    };
  });

  return {
    segments,
    total_cost_egp: Math.round(plan.totalCostEgp),
    total_duration_minutes: Math.max(1, Math.round(plan.totalTimeMin)),
    budget_range: {
      min: Math.round(plan.totalCostEgp * 0.85),
      max: Math.round(plan.totalCostEgp * 1.25),
    },
    distance_km: Math.round(plan.distanceKm * 10) / 10,
    quality_score: plan.qualityScore,
    confidence: plan.confidence,
    transfers: plan.transfers,
    total_walk_minutes: Math.round(plan.totalWalkMin),
    explanation: explainPlan(plan, isArabic),
    plan: plan.plan,
    engine: "deterministic-graph",
  };
}

// Main entry: build graph, run fallback ladder, validate, return best EnginePlan.
export async function computeEnginePlan(req: PlanRequest): Promise<EnginePlan | null> {
  const graph = await buildGraph();
  const overlay = buildOverlay(graph, req.origin, req.dest);
  const profile = PROFILES[req.planKey];
  const rungs = ladderFor(req.planKey);

  // Validation is a hard gate: we ONLY return a plan that passes simulation.
  // An invalid plan (disconnected transfer, walk-limit breach, unverified leg)
  // is never adapted or returned — the caller falls back to a verified taxi
  // option instead of showing the user an impossible journey.
  for (const allowed of rungs) {
    const res = findRoute(graph, overlay, "origin", "dest", profile, allowed);
    if (!res) continue;
    const plan = reconstruct(graph, overlay, res, req.planKey, req.isArabic);
    if (plan.legs.length === 0) continue;
    if (validatePlan(plan).ok) return plan;
  }
  return null;
}

export async function planTripApi(req: PlanRequest) {
  const graph = await buildGraph();
  const plan = await computeEnginePlan(req);
  if (!plan) return null;
  return adaptPlanToApi(graph, plan, req.isArabic);
}
