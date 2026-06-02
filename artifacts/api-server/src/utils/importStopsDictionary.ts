/**
 * Transit stop dictionary import (Task: data import foundation).
 *
 * Builds a verified, geo-located stop dictionary from the ONLY trustworthy
 * coordinate source we have: each transit_line's Mapbox-snapped `route_path`
 * geometry. For every line we walk its ordered stops (from_area, via_stops,
 * to_area) and resolve each name to a coordinate exactly the way the routing
 * engine's graph builder does (endpoints = exact terminal vertices, via stops =
 * interpolated along the polyline by cumulative distance). Coordinates are then
 * reconciled ACROSS all lines that touch the same normalized stop name, so a
 * physical place referenced by many lines gets ONE consensus coordinate instead
 * of per-line interpolation drift.
 *
 * No coordinates are invented. A stop that never appears on any line's path is
 * not imported (we have no verified location for it).
 *
 * Outputs:
 *  - `locations`  — the full bilingual stop dictionary (isStation = true for
 *                   rail stops: Metro / Monorail / Train).
 *  - `mawaqef`    — the non-rail pickup areas (bus / serfis / microbus), tagged
 *                   with the transport type ids that serve them. The engine
 *                   registers ALL mawaqef as authoritative coordinates, so this
 *                   is what feeds non-rail stops into the routing graph.
 *  - `transport_heatmaps` (microbus) — coverage zones where microbuses actually
 *                   operate, derived from microbus line stops. Tuktuk / White
 *                   Taxi zones are curated separately by seed-heatmaps.
 *
 * Names are kept in their source language. Translation/transliteration is out of
 * scope here; when only one language exists for a name it is mirrored into both
 * `name_en` and `name_ar` so the engine can register the stop under its real key
 * without fabricating a translation.
 *
 * Idempotent: the dictionary is fully rebuilt from the deterministic source on
 * every run (locations + mawaqef replaced; microbus heatmap rows replaced).
 */
import { db } from "@workspace/db";
import {
  transitLinesTable,
  transportTypesTable,
  locationsTable,
  mawaqefTable,
  transportHeatmapsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  normalizeName,
  distributeStopsAlongPath,
  pathPointToCoord,
  haversineKm,
} from "../engine/geo.js";
import type { Coord } from "../engine/types.js";

const RAIL_TYPES = new Set(["Metro", "Monorail", "Train"]);

// Greater-Cairo sanity box (incl. 6th October, New Capital, Helwan, Qalyub).
// Drops any obviously broken path vertex before it pollutes the dictionary.
const BOX = { latMin: 29.0, latMax: 30.6, lngMin: 30.5, lngMax: 32.1 };
function inBox(c: Coord): boolean {
  return (
    c.lat >= BOX.latMin &&
    c.lat <= BOX.latMax &&
    c.lng >= BOX.lngMin &&
    c.lng <= BOX.lngMax
  );
}

function isArabic(s: string): boolean {
  return /[\u0600-\u06FF]/.test(s);
}

// Coordinate that minimizes total distance to the rest — robust to outliers,
// unlike a plain mean. Cheap for the handful of candidates per stop.
function medoid(coords: Coord[]): Coord {
  if (coords.length === 1) return coords[0];
  let best = coords[0];
  let bestSum = Infinity;
  for (const a of coords) {
    let sum = 0;
    for (const b of coords) sum += haversineKm(a, b);
    if (sum < bestSum) {
      bestSum = sum;
      best = a;
    }
  }
  return best;
}

interface StopAgg {
  display: Map<string, number>; // original spelling -> times seen
  endpointCoords: Coord[]; // exact terminal vertices (most reliable)
  viaCoords: Coord[]; // interpolated intermediate stops
  typeIds: Set<string>;
  microbusCoords: Coord[]; // candidates contributed by microbus lines only
  isStation: boolean;
}

export interface StopImportSummary {
  linesProcessed: number;
  uniqueStops: number;
  locationsInserted: number;
  mawaqefInserted: number;
  microbusHeatmapInserted: number;
  stationStops: number;
  skippedLinesNoPath: number;
  fallbackCoordsDetected: number;
  stopsDroppedNoLocation: number;
}

// A 5-decimal coordinate key (~1m). Two physically distinct stops never share a
// coordinate at this precision; when many DO, it is a geocoder fallback point
// (failed lookups all snapped to one default), so it must not be trusted.
function coordKey(c: Coord): string {
  return `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
}
const FALLBACK_MIN_STOPS = 3;

export async function runStopImport(): Promise<StopImportSummary> {
  const lines = await db.select().from(transitLinesTable);
  const types = await db.select().from(transportTypesTable);
  const typeById = new Map(types.map((t) => [t.id, t]));
  const microbusType = types.find((t) => t.nameEn.toLowerCase().includes("microbus"));

  const agg = new Map<string, StopAgg>();
  const getAgg = (key: string): StopAgg => {
    let a = agg.get(key);
    if (!a) {
      a = {
        display: new Map(),
        endpointCoords: [],
        viaCoords: [],
        typeIds: new Set(),
        microbusCoords: [],
        isStation: false,
      };
      agg.set(key, a);
    }
    return a;
  };

  let linesProcessed = 0;
  let skippedLinesNoPath = 0;

  for (const l of lines) {
    if (!l.isActive) continue;
    const path = (l.routePath?.coordinates ?? null) as [number, number][] | null;
    if (!path || path.length < 2) {
      skippedLinesNoPath++;
      continue;
    }
    const type = typeById.get(l.transportTypeId);
    const isRail = type ? RAIL_TYPES.has(type.nameEn) : false;
    const isMicrobus = !!microbusType && l.transportTypeId === microbusType.id;
    const via = l.viaStops ?? [];
    const stopNames = [l.fromArea, ...via, l.toArea];
    const viaIndices = distributeStopsAlongPath(path, via.length);

    stopNames.forEach((raw, i) => {
      const name = (raw || "").trim();
      const key = normalizeName(name);
      if (!key) return;

      let coord: Coord;
      let endpoint = false;
      if (i === 0) {
        coord = pathPointToCoord(path[0]);
        endpoint = true;
      } else if (i === stopNames.length - 1) {
        coord = pathPointToCoord(path[path.length - 1]);
        endpoint = true;
      } else {
        const idx =
          viaIndices[i - 1] ??
          Math.round((path.length - 1) * (i / (stopNames.length - 1)));
        coord = pathPointToCoord(path[Math.min(idx, path.length - 1)]);
      }
      if (!inBox(coord)) return;

      const a = getAgg(key);
      a.display.set(name, (a.display.get(name) ?? 0) + 1);
      if (endpoint) a.endpointCoords.push(coord);
      else a.viaCoords.push(coord);
      if (type) a.typeIds.add(type.id);
      if (isRail) a.isStation = true;
      if (isMicrobus) a.microbusCoords.push(coord);
    });

    linesProcessed++;
  }

  // Detect synthetic geocoder-fallback coordinates: a high-precision point
  // shared by FALLBACK_MIN_STOPS or more DISTINCT stop names is not a real
  // place (failed geocodes all snapped to one default). Such coordinates are
  // untrusted and excluded; stops left with no trusted candidate are not
  // imported (we never invent a location).
  const coordUsers = new Map<string, Set<string>>();
  for (const [key, a] of agg) {
    const keys = new Set<string>();
    for (const c of a.endpointCoords) keys.add(coordKey(c));
    for (const c of a.viaCoords) keys.add(coordKey(c));
    for (const ck of keys) {
      let s = coordUsers.get(ck);
      if (!s) {
        s = new Set();
        coordUsers.set(ck, s);
      }
      s.add(key);
    }
  }
  const blacklist = new Set<string>();
  for (const [ck, s] of coordUsers) {
    if (s.size >= FALLBACK_MIN_STOPS) blacklist.add(ck);
  }

  // Resolve each stop to a name + consensus coordinate.
  const bestName = (a: StopAgg): string => {
    let best = "";
    let bestCount = -1;
    for (const [n, c] of a.display) {
      if (c > bestCount || (c === bestCount && n.length > best.length)) {
        best = n;
        bestCount = c;
      }
    }
    return best;
  };
  const trusted = (coords: Coord[]): Coord[] =>
    coords.filter((c) => !blacklist.has(coordKey(c)));
  const chooseCoord = (a: StopAgg): Coord | null => {
    // Prefer exact terminal vertices; fall back to interpolated via stops.
    // Only consider coordinates that survived fallback detection.
    const ep = trusted(a.endpointCoords);
    const vi = trusted(a.viaCoords);
    const pool = ep.length ? ep : vi;
    if (!pool.length) return null;
    return medoid(pool);
  };

  const locationRows: (typeof locationsTable.$inferInsert)[] = [];
  const mawaqefRows: (typeof mawaqefTable.$inferInsert)[] = [];
  let stationStops = 0;
  let stopsDroppedNoLocation = 0;

  for (const a of agg.values()) {
    const name = bestName(a);
    if (!name) continue;
    const coord = chooseCoord(a);
    if (!coord) {
      stopsDroppedNoLocation++;
      continue;
    }
    // Mirror the single available language into both fields (no fabrication).
    const nameEn = name;
    const nameAr = name;

    locationRows.push({
      nameEn,
      nameAr,
      latitude: coord.lat,
      longitude: coord.lng,
      city: "cairo",
      isStation: a.isStation,
    });
    if (a.isStation) stationStops++;

    if (!a.isStation) {
      mawaqefRows.push({
        nameEn,
        nameAr,
        city: "cairo",
        latitude: coord.lat,
        longitude: coord.lng,
        transportTypeIds: [...a.typeIds],
        isActive: true,
      });
    }
  }

  // Microbus coverage zones — one per microbus stop, weighted by how many
  // microbus stop occurrences land there.
  const microbusHeatRows: (typeof transportHeatmapsTable.$inferInsert)[] = [];
  if (microbusType) {
    for (const a of agg.values()) {
      const mb = trusted(a.microbusCoords);
      if (mb.length === 0) continue;
      const coord = medoid(mb);
      const intensity = Math.min(1, 0.5 + 0.1 * mb.length);
      microbusHeatRows.push({
        transportTypeId: microbusType.id,
        latitude: coord.lat,
        longitude: coord.lng,
        intensity,
        radiusKm: 1.5,
      });
    }
  }

  // ── Idempotent replace ──────────────────────────────────────────────────
  await db.transaction(async (tx) => {
    await tx.delete(locationsTable);
    await tx.delete(mawaqefTable);
    if (locationRows.length) {
      for (let i = 0; i < locationRows.length; i += 500) {
        await tx.insert(locationsTable).values(locationRows.slice(i, i + 500));
      }
    }
    if (mawaqefRows.length) {
      for (let i = 0; i < mawaqefRows.length; i += 500) {
        await tx.insert(mawaqefTable).values(mawaqefRows.slice(i, i + 500));
      }
    }
    if (microbusType) {
      await tx
        .delete(transportHeatmapsTable)
        .where(eq(transportHeatmapsTable.transportTypeId, microbusType.id));
      if (microbusHeatRows.length) {
        for (let i = 0; i < microbusHeatRows.length; i += 500) {
          await tx
            .insert(transportHeatmapsTable)
            .values(microbusHeatRows.slice(i, i + 500));
        }
      }
    }
  });

  return {
    linesProcessed,
    uniqueStops: agg.size,
    locationsInserted: locationRows.length,
    mawaqefInserted: mawaqefRows.length,
    microbusHeatmapInserted: microbusHeatRows.length,
    stationStops,
    skippedLinesNoPath,
    fallbackCoordsDetected: blacklist.size,
    stopsDroppedNoLocation,
  };
}
