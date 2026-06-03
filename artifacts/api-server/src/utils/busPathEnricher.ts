/**
 * Bus route data enrichment pipeline.
 *
 * Cairo's Mapbox `driving` profile treats buses like small cars and cuts
 * through narrow side-alleys. This pipeline injects "common sense" before
 * snapping:
 *
 *   1. AI "breadcrumb" pre-processor — an LLM acting as a Cairo Transit
 *      Engineer expands vague stops (["Roxy","Abbassia"]) into precise hubs +
 *      intermediate main-road breadcrumbs (["Roxy Square","Khalifa El-Maamon
 *      Street", "Abbassia Square Bus Hub"]) so the route is pinned to primary
 *      corridors.
 *   2. Geocode each breadcrumb to a coordinate (reuses geocodeStop).
 *   3. Strict snap via Mapbox Directions `driving-traffic` with a 50 m radius
 *      per coordinate, chunked to respect the 25-waypoint limit and stitched.
 *   4. Caller saves the resulting LineString to transit_lines.route_path.
 */
import { getAIClient, getAIModel } from "./aiClient";
import { geocodeStop } from "./routePathGenerator";

function getToken(): string | null {
  return process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN || null;
}

// Great-circle distance in km between two [lng, lat] points.
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ─── 1. AI breadcrumb pre-processor ─────────────────────────────────────────

const breadcrumbCache = new Map<string, string[]>();

const SYSTEM_PROMPT =
  `You are a veteran Cairo public-transit engineer who has driven and surveyed ` +
  `the city's bus, microbus and serfis network for 20 years. You know exactly ` +
  `which major squares, bridges and primary thoroughfares (main roads) real ` +
  `buses use, and which narrow residential side-streets they NEVER enter.\n\n` +
  `Given an ORDERED list of vague bus-stop area names for a single route, ` +
  `rewrite it into an ordered list of PRECISE, geocodable waypoints that force ` +
  `the route to stay on major corridors. Rules:\n` +
  `- Keep the same overall direction and order (first stop stays first, last ` +
  `stays last).\n` +
  `- Convert each vague area into a specific, well-known landmark or hub ` +
  `(e.g. "Roxy" -> "Roxy Square, Heliopolis"; "Abbassia" -> "Abbassia Square").\n` +
  `- BETWEEN consecutive stops, INSERT 1-3 intermediate "breadcrumb" waypoints ` +
  `naming the actual MAIN road / axis / bridge the bus travels on ` +
  `(e.g. "Khalifa El-Maamon Street", "Salah Salem Road", "6th October Bridge"). ` +
  `Never invent tiny residential streets.\n` +
  `- Every waypoint must be a real, searchable place in the given city so a ` +
  `geocoder can resolve it.\n` +
  `- Aim for clarity over quantity; do not exceed ~40 total waypoints.\n` +
  `Respond ONLY with strict JSON: {"waypoints": ["...", "..."]}.`;

export async function expandStopsWithAI(
  stops: string[],
  city = "Cairo",
): Promise<string[]> {
  const clean = stops.map(s => s?.trim()).filter(Boolean) as string[];
  if (clean.length < 2) return clean;

  const cacheKey = `${city}|${clean.join(">")}`;
  const cached = breadcrumbCache.get(cacheKey);
  if (cached) return cached;

  const client = getAIClient();
  if (!client) return clean; // no key → degrade to raw stops

  try {
    const completion = await client.chat.completions.create({
      model: getAIModel(),
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `City: ${city}, Egypt\n` +
            `Bus route stops (in order):\n` +
            clean.map((s, i) => `${i + 1}. ${s}`).join("\n"),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return clean;

    const parsed = JSON.parse(raw) as { waypoints?: unknown };
    const wp = Array.isArray(parsed.waypoints)
      ? parsed.waypoints.map(x => String(x).trim()).filter(Boolean)
      : [];
    if (wp.length < 2) return clean;

    // Hard guard: the AI must never drop the route's true terminals. Re-anchor
    // the original first/last stop so the polyline always starts/ends at the
    // real endpoints (coordinate dedup later collapses any near-duplicate hub).
    if (wp[0] !== clean[0]) wp.unshift(clean[0]);
    if (wp[wp.length - 1] !== clean[clean.length - 1]) wp.push(clean[clean.length - 1]);

    breadcrumbCache.set(cacheKey, wp);
    return wp;
  } catch (err) {
    console.error("AI breadcrumb expansion failed:", err instanceof Error ? err.message : err);
    return clean;
  }
}

// ─── 3. Strict road snapping (driving-traffic + 50 m radiuses, chunked) ──────

const RADIUS_M = 50;          // strict snap radius per coordinate
const MAX_WAYPOINTS = 24;     // per request (Mapbox hard limit is 25; +1 overlap)

async function fetchDirections(
  chunk: [number, number][],
  useRadius: boolean,
  profile: string,
): Promise<[number, number][] | null> {
  const token = getToken();
  if (!token || chunk.length < 2) return null;

  const coordStr = chunk.map(p => `${p[0]},${p[1]}`).join(";");
  let url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordStr}`
    + `?geometries=geojson&overview=full&access_token=${token}`;
  if (useRadius) {
    url += `&radiuses=${chunk.map(() => RADIUS_M).join(";")}`;
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const data = await res.json() as {
      code?: string;
      routes?: Array<{ geometry: { coordinates: [number, number][] } }>;
    };
    if (data.code && data.code !== "Ok") return null;
    const coords = data.routes?.[0]?.geometry?.coordinates;
    return coords && coords.length >= 2 ? coords : null;
  } catch {
    return null;
  }
}

/**
 * Snap an ordered list of coordinates onto the real road network using the
 * `driving-traffic` profile with a strict per-coordinate radius. Splits into
 * overlapping ≤25-point chunks and stitches the polylines back together.
 *
 * Per chunk, attempts (in order): driving-traffic+50 m, driving-traffic (no
 * radius), driving (no radius). Falls back to the raw chunk points if all fail
 * so a noisy snap never drops a whole route.
 */
export async function snapToRoadsStrict(points: [number, number][]): Promise<[number, number][]> {
  const token = getToken();
  if (!token || points.length < 2) return points;

  const allCoords: [number, number][] = [];

  for (let i = 0; i < points.length - 1; i += MAX_WAYPOINTS) {
    const chunk = points.slice(i, Math.min(i + MAX_WAYPOINTS + 1, points.length));
    if (chunk.length < 2) continue;

    const snapped =
      (await fetchDirections(chunk, true, "driving-traffic"))
      ?? (await fetchDirections(chunk, false, "driving-traffic"))
      ?? (await fetchDirections(chunk, false, "driving"))
      ?? chunk;

    if (allCoords.length === 0) allCoords.push(...snapped);
    else allCoords.push(...snapped.slice(1)); // stitch: drop duplicated overlap point

    await new Promise(r => setTimeout(r, 80)); // gentle rate limit
  }

  return allCoords.length >= 2 ? allCoords : points;
}

// ─── Full pipeline ──────────────────────────────────────────────────────────

export interface EnrichResult {
  routePath: { type: "LineString"; coordinates: [number, number][] } | null;
  expandedCount: number;
  geocodedCount: number;
  usedAI: boolean;
}

/**
 * area names -> AI breadcrumbs -> geocoded points -> driving-traffic snapped
 * LineString. Returns routePath=null when there is no Mapbox token or fewer
 * than 2 points could be geocoded.
 */
export async function buildBusRoutePathAI(
  fromArea: string,
  toArea: string,
  viaStops: string[],
  city = "Cairo",
): Promise<EnrichResult> {
  const empty: EnrichResult = { routePath: null, expandedCount: 0, geocodedCount: 0, usedAI: false };
  if (!getToken()) return empty;

  const rawStops = [fromArea, ...(viaStops || []), toArea].filter(Boolean);
  if (rawStops.length < 2) return empty;

  // 1. AI breadcrumb expansion
  const expanded = await expandStopsWithAI(rawStops, city);
  const usedAI = expanded.length !== rawStops.length
    || expanded.some((s, i) => s !== rawStops[i]);

  // 2. Geocode each waypoint (gentle rate limit, drop consecutive name dups and
  //    near-coincident coordinates so re-anchored endpoints don't zigzag).
  const points: [number, number][] = [];
  let last = "";
  for (const stop of expanded) {
    if (stop === last) continue;
    last = stop;
    const pt = await geocodeStop(stop, city);
    if (pt) {
      const prev = points[points.length - 1];
      if (!prev || haversineKm(prev, pt) > 0.12) points.push(pt);
    }
    await new Promise(r => setTimeout(r, 60));
  }

  if (points.length < 2) return { ...empty, expandedCount: expanded.length, usedAI };

  // 3. Strict snap to roads
  const snapped = await snapToRoadsStrict(points);
  const routePath = snapped.length >= 2
    ? { type: "LineString" as const, coordinates: snapped }
    : null;

  return { routePath, expandedCount: expanded.length, geocodedCount: points.length, usedAI };
}
