import { db } from "@workspace/db";
import {
  transportTypesTable,
  transitLinesTable,
  mawaqefTable,
  locationsTable,
  transportHeatmapsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import type {
  Coord,
  Edge,
  GraphNode,
  HeatPoint,
  LineInfo,
  LineStop,
  ModeKey,
  SpatialGrid,
  TransitGraph,
  TransportTypeInfo,
} from "./types.js";
import {
  distributeStopsAlongPath,
  haversineKm,
  nearestPathIndex,
  normalizeName,
  pathPointToCoord,
} from "./geo.js";
import {
  boardingFare,
  modeOfType,
  rideCostPerKm,
  waitMinutesFor,
  walkMinutes,
} from "./cost.js";

const WALK_TRANSFER_KM = 0.45; // stops closer than this are walk-transferable
const MAX_TRANSFER_LINKS = 6; // cap transfer edges per stop
const GRID_CELL_DEG = 0.01; // ~1.1 km

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: TransitGraph | null = null;

function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lat / GRID_CELL_DEG)}:${Math.floor(lng / GRID_CELL_DEG)}`;
}

function gridInsert(grid: SpatialGrid, id: string, c: Coord) {
  const k = cellKey(c.lat, c.lng);
  const arr = grid.buckets.get(k);
  if (arr) arr.push(id);
  else grid.buckets.set(k, [id]);
}

// Return stop-node ids whose cell lies within `radiusKm` of `c`.
export function stopIdsNear(graph: TransitGraph, c: Coord, radiusKm: number): string[] {
  const cells = Math.ceil(radiusKm / (GRID_CELL_DEG * 111)) + 1;
  const baseLat = Math.floor(c.lat / GRID_CELL_DEG);
  const baseLng = Math.floor(c.lng / GRID_CELL_DEG);
  const out: string[] = [];
  for (let dy = -cells; dy <= cells; dy++) {
    for (let dx = -cells; dx <= cells; dx++) {
      const arr = graph.stopGrid.buckets.get(`${baseLat + dy}:${baseLng + dx}`);
      if (arr) out.push(...arr);
    }
  }
  return out;
}

export function nearestStops(
  graph: TransitGraph,
  c: Coord,
  radiusKm: number,
  limit: number,
): { id: string; node: GraphNode; distKm: number }[] {
  const ids = stopIdsNear(graph, c, radiusKm);
  const scored: { id: string; node: GraphNode; distKm: number }[] = [];
  for (const id of ids) {
    const node = graph.nodes.get(id);
    if (!node) continue;
    const d = haversineKm(c, node.coord);
    if (d <= radiusKm) scored.push({ id, node, distKm: d });
  }
  scored.sort((a, b) => a.distKm - b.distKm);
  return scored.slice(0, limit);
}

function addEdge(edges: Map<string, Edge[]>, from: string, e: Edge) {
  const arr = edges.get(from);
  if (arr) arr.push(e);
  else edges.set(from, [e]);
}

export async function buildGraph(force = false): Promise<TransitGraph> {
  if (!force && cached && Date.now() - cached.builtAt < CACHE_TTL_MS) return cached;

  const [typeRows, lineRows, mawaqef, locations, heatRows] = await Promise.all([
    db.select().from(transportTypesTable).where(eq(transportTypesTable.isActive, true)),
    db.select().from(transitLinesTable).where(eq(transitLinesTable.isActive, true)),
    db.select().from(mawaqefTable).where(eq(mawaqefTable.isActive, true)),
    db.select().from(locationsTable),
    db.select().from(transportHeatmapsTable),
  ]);

  const types = new Map<string, TransportTypeInfo>();
  for (const t of typeRows) {
    types.set(t.id, {
      id: t.id,
      nameEn: t.nameEn,
      nameAr: t.nameAr,
      icon: t.icon,
      color: t.color,
      category: t.category,
      governmentType: t.governmentType,
      speedKmh: t.averageSpeedKmh,
      basePriceEgp: t.basePriceEgp,
      pricePerKmEgp: t.pricePerKmEgp,
      mode: modeOfType(t.nameEn),
    });
  }

  // ── Authoritative coordinate dictionary (name -> coord) ──
  const nameCoord = new Map<string, Coord>();
  const register = (name: string, c: Coord, override = false) => {
    const key = normalizeName(name);
    if (!key) return;
    if (override || !nameCoord.has(key)) nameCoord.set(key, c);
  };
  for (const m of mawaqef) {
    register(m.nameEn, { lat: m.latitude, lng: m.longitude });
    register(m.nameAr, { lat: m.latitude, lng: m.longitude });
  }
  for (const l of locations) {
    if (!l.isStation) continue;
    register(l.nameEn, { lat: l.latitude, lng: l.longitude });
    register(l.nameAr, { lat: l.latitude, lng: l.longitude });
  }
  // Line path endpoints are exact terminal coordinates — register if unknown.
  for (const l of lineRows) {
    const path = (l.routePath?.coordinates ?? null) as [number, number][] | null;
    if (!path || path.length < 2) continue;
    register(l.fromArea, pathPointToCoord(path[0]));
    register(l.toArea, pathPointToCoord(path[path.length - 1]));
  }

  // ── Build LineInfo with ordered, coordinate-resolved stops ──
  const lines = new Map<string, LineInfo>();
  for (const l of lineRows) {
    const type = types.get(l.transportTypeId);
    if (!type) continue;
    const path = (l.routePath?.coordinates ?? null) as [number, number][] | null;
    const via = l.viaStops ?? [];
    const stopNames = [l.fromArea, ...via, l.toArea].filter((s) => s && s.trim());
    if (stopNames.length < 2 || !path || path.length < 2) {
      // Without a path we cannot place stops geographically — skip (never guess).
      continue;
    }

    const viaIndices = distributeStopsAlongPath(path, via.length);
    const stops: LineStop[] = [];
    stopNames.forEach((name, i) => {
      let pathIdx: number;
      if (i === 0) pathIdx = 0;
      else if (i === stopNames.length - 1) pathIdx = path.length - 1;
      else pathIdx = viaIndices[i - 1] ?? Math.round((path.length - 1) * (i / (stopNames.length - 1)));

      const dictCoord = nameCoord.get(normalizeName(name));
      let coord: Coord;
      if (dictCoord) {
        coord = dictCoord;
        // realign path index to the authoritative coordinate for clean geometry
        pathIdx = nearestPathIndex(path, dictCoord);
      } else {
        coord = pathPointToCoord(path[Math.min(pathIdx, path.length - 1)]);
        register(name, coord);
      }
      stops.push({ name, coord, pathIndex: pathIdx });
    });

    lines.set(l.id, {
      id: l.id,
      transportTypeId: l.transportTypeId,
      lineNumber: l.lineNumber,
      nameEn: l.nameEn,
      nameAr: l.nameAr,
      fromArea: l.fromArea,
      toArea: l.toArea,
      priceEgp: l.priceEgp,
      frequencyMinutes: l.frequencyMinutes,
      hasFixedStops: l.hasFixedStops,
      path,
      stops,
    });
  }

  // ── Build nodes & edges (transfer-graph model) ──
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, Edge[]>();
  const grid: SpatialGrid = { cell: GRID_CELL_DEG, buckets: new Map() };

  const ensureStopNode = (name: string, coord: Coord): string => {
    const id = `stop:${normalizeName(name)}`;
    if (!nodes.has(id)) {
      nodes.set(id, { id, coord, kind: "stop", name });
      gridInsert(grid, id, coord);
    }
    return id;
  };

  for (const line of lines.values()) {
    const type = types.get(line.transportTypeId)!;
    const wait = waitMinutesFor(line, type.mode);
    const fare = boardingFare(type, line);
    const perKm = rideCostPerKm(type);

    const lsIds: string[] = [];
    line.stops.forEach((s, i) => {
      const lsId = `ls:${line.id}:${i}`;
      nodes.set(lsId, {
        id: lsId,
        coord: s.coord,
        kind: "linestop",
        name: s.name,
        lineId: line.id,
        stopIndex: i,
        typeId: type.id,
      });
      lsIds.push(lsId);

      const stopId = ensureStopNode(s.name, s.coord);
      // board: pay fare + wait to get on this line here
      addEdge(edges, stopId, {
        to: lsId,
        kind: "board",
        timeMin: wait,
        costEgp: fare,
        walkMin: 0,
        isBoarding: true,
        mode: type.mode,
        lineId: line.id,
        typeId: type.id,
      });
      // alight: free, instant
      addEdge(edges, lsId, {
        to: stopId,
        kind: "alight",
        timeMin: 0,
        costEgp: 0,
        walkMin: 0,
        isBoarding: false,
        mode: type.mode,
        lineId: line.id,
        typeId: type.id,
      });
    });

    // ride edges between consecutive line-stops (bidirectional — lines run both ways)
    for (let i = 0; i < line.stops.length - 1; i++) {
      const a = line.stops[i];
      const b = line.stops[i + 1];
      const dist = Math.max(0.05, haversineKm(a.coord, b.coord));
      const timeMin = (dist / Math.max(8, type.speedKmh)) * 60;
      const cost = perKm * dist;
      addEdge(edges, lsIds[i], {
        to: lsIds[i + 1],
        kind: "ride",
        timeMin,
        costEgp: cost,
        walkMin: 0,
        isBoarding: false,
        mode: type.mode,
        lineId: line.id,
        typeId: type.id,
        fromStopIndex: a.pathIndex,
        toStopIndex: b.pathIndex,
      });
      addEdge(edges, lsIds[i + 1], {
        to: lsIds[i],
        kind: "ride",
        timeMin,
        costEgp: cost,
        walkMin: 0,
        isBoarding: false,
        mode: type.mode,
        lineId: line.id,
        typeId: type.id,
        fromStopIndex: b.pathIndex,
        toStopIndex: a.pathIndex,
      });
    }
  }

  // ── Walk-transfer edges between nearby physical stops ──
  const stopNodes = [...nodes.values()].filter((n) => n.kind === "stop");
  const tmpGraph: TransitGraph = {
    nodes,
    edges,
    types,
    lines,
    stopGrid: grid,
    heatPoints: [],
    builtAt: Date.now(),
  };
  for (const s of stopNodes) {
    const near = nearestStops(tmpGraph, s.coord, WALK_TRANSFER_KM, MAX_TRANSFER_LINKS + 1);
    for (const n of near) {
      if (n.id === s.id) continue;
      const t = walkMinutes(n.distKm);
      addEdge(edges, s.id, {
        to: n.id,
        kind: "walk",
        timeMin: t,
        costEgp: 0,
        walkMin: t,
        isBoarding: false,
        mode: "walk",
      });
    }
  }

  const heatPoints: HeatPoint[] = [];
  const typeById = new Map(typeRows.map((t) => [t.id, t]));
  for (const h of heatRows) {
    const t = typeById.get(h.transportTypeId);
    const mode: ModeKey = t ? modeOfType(t.nameEn) : "taxi";
    heatPoints.push({
      mode,
      coord: { lat: h.latitude, lng: h.longitude },
      intensity: h.intensity ?? 0.5,
      radiusKm: h.radiusKm ?? 2,
    });
  }
  tmpGraph.heatPoints = heatPoints;

  cached = tmpGraph;
  console.log(
    `[engine] graph built: ${nodes.size} nodes, ${[...edges.values()].reduce((a, e) => a + e.length, 0)} edges, ${lines.size} lines, ${heatPoints.length} heat points`,
  );
  return tmpGraph;
}

export function invalidateGraph() {
  cached = null;
}
