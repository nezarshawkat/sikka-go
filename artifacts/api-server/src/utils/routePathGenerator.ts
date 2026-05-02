/**
 * Server-side route path generator.
 * Replicates AdminMap's client-side geocodeStop + snapToRoads logic.
 * Requires MAPBOX_TOKEN environment variable. Returns null gracefully if absent.
 */

function getToken(): string | null {
  return process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN || null;
}

const geocodeCache = new Map<string, [number, number]>();

export async function geocodeStop(
  stop: string,
  city = "Cairo",
  country = "Egypt",
): Promise<[number, number] | null> {
  const token = getToken();
  if (!token) return null;

  const cacheKey = `${stop}|${city}`;
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey)!;

  const proximity = city.toLowerCase().includes("alex") ? "29.9553,31.1342" : "31.2357,30.0444";
  const query = encodeURIComponent(`${stop}, ${city}, ${country}`);
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json`
    + `?access_token=${token}`
    + `&country=eg&language=en,ar&limit=1`
    + `&proximity=${proximity}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as { features?: Array<{ center: [number, number] }> };
    if (!data.features?.length) return null;
    const center = data.features[0].center;
    // Sanity: must be within Egypt bounds
    if (center[0] < 24 || center[0] > 38 || center[1] < 21 || center[1] > 32) return null;
    geocodeCache.set(cacheKey, center);
    return center;
  } catch {
    return null;
  }
}

export async function snapToRoads(points: [number, number][]): Promise<[number, number][]> {
  const token = getToken();
  if (!token || points.length < 2) return points;

  const CHUNK = 24;
  const allCoords: [number, number][] = [];

  for (let i = 0; i < points.length - 1; i += CHUNK) {
    const chunk = points.slice(i, Math.min(i + CHUNK + 1, points.length));
    const coordStr = chunk.map(p => `${p[0]},${p[1]}`).join(";");
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}`
      + `?geometries=geojson&overview=full&access_token=${token}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json() as { routes?: Array<{ geometry: { coordinates: [number, number][] } }> };
      const coords = data.routes?.[0]?.geometry?.coordinates;
      if (!coords?.length) continue;
      if (allCoords.length === 0) allCoords.push(...coords);
      else allCoords.push(...coords.slice(1));
    } catch {
      if (allCoords.length === 0) allCoords.push(...chunk);
      else allCoords.push(...chunk.slice(1));
    }
  }
  return allCoords.length >= 2 ? allCoords : points;
}

/** Full pipeline: area names → geocoded points → road-snapped LineString.
 *  Returns null when MAPBOX_TOKEN is absent or geocoding yields fewer than 2 points. */
export async function buildRoutePath(
  fromArea: string,
  toArea: string,
  viaStops: string[],
  city = "Cairo",
): Promise<{ type: string; coordinates: [number, number][] } | null> {
  if (!getToken()) return null;

  const stops = [fromArea, ...viaStops, toArea].filter(Boolean);
  // Sample up to 12 stops to keep API usage manageable
  const sampled = stops.length <= 12
    ? stops
    : [
        stops[0],
        ...stops.slice(1, -1).filter((_, i) => i % Math.ceil((stops.length - 2) / 10) === 0),
        stops[stops.length - 1],
      ].slice(0, 12);

  const points: [number, number][] = [];
  for (const stop of sampled) {
    const pt = await geocodeStop(stop, city);
    if (pt) points.push(pt);
    await new Promise(r => setTimeout(r, 60)); // ~16 req/s rate limit
  }

  if (points.length < 2) return null;
  const snapped = await snapToRoads(points);
  return snapped.length >= 2 ? { type: "LineString", coordinates: snapped } : null;
}
