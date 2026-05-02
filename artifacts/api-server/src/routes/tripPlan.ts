import { Router } from "express";
import { db } from "@workspace/db";
import { transportTypesTable, transitLinesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.post("/", requireAuth, async (req, res) => {
  const { startLat, startLng, endLat, endLng, tripType, budget, language } = req.body;

  const distanceKm = (() => {
    const R = 6371;
    const dLat = (endLat - startLat) * Math.PI / 180;
    const dLng = (endLng - startLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(startLat * Math.PI / 180) * Math.cos(endLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  })();

  const transportTypes = await db.select().from(transportTypesTable).where(eq(transportTypesTable.isActive, true));
  const transitLines   = await db.select().from(transitLinesTable).where(eq(transitLinesTable.isActive, true));

  // Heatmap-only types — never used as route segments
  const HEATMAP_ONLY = ["white taxi", "tuktuk"];
  const routeTypes = transportTypes.filter(t => {
    const n = t.nameEn.toLowerCase();
    return !HEATMAP_ONLY.some(h => n.includes(h));
  });

  const uberType = transportTypes.find(t => t.nameEn.toLowerCase().includes("uber"));
  const taxiEst  = Math.round(15 + distanceKm * (uberType?.pricePerKmEgp ?? 4));

  const transportContext = routeTypes.map(t =>
    `- ${t.nameEn} (${t.nameAr}): base ${t.basePriceEgp} EGP + ${t.pricePerKmEgp} EGP/km, speed ${t.averageSpeedKmh} km/h`
  ).join("\n");

  // Fixed-stop lines (Metro / Monorail / Train) — for AI chaining
  const fixedLines = transitLines
    .filter(l => {
      const type = routeTypes.find(t => t.id === l.transportTypeId);
      if (!type) return false;
      const n = type.nameEn.toLowerCase();
      return n.includes("metro") || n.includes("monorail") || n.includes("train");
    })
    .slice(0, 60)
    .map(l => {
      const typeName = routeTypes.find(t => t.id === l.transportTypeId)?.nameEn ?? "Transit";
      return `- [${typeName}] ${l.lineNumber}: ${l.fromArea} → ${l.toArea} (${l.priceEgp} EGP)`;
    });

  // Bus & Serfis lines passing near start/end areas (sample relevant ones)
  const busLines = transitLines
    .filter(l => {
      const type = routeTypes.find(t => t.id === l.transportTypeId);
      if (!type) return false;
      const n = type.nameEn.toLowerCase();
      return n.includes("bus") || n.includes("serfis") || n.includes("microbus");
    })
    .slice(0, 25)
    .map(l => {
      const typeName = routeTypes.find(t => t.id === l.transportTypeId)?.nameEn ?? "Bus";
      const via = (l.viaStops ?? []).slice(0, 4).join(" → ");
      return `- [${typeName}] Line ${l.lineNumber}: ${l.fromArea} → ${l.toArea}${via ? ` via ${via}` : ""} (${l.priceEgp} EGP)`;
    });

  const allLinesContext = [...fixedLines, ...busLines].join("\n");
  const isArabic = language === "ar";

  const prompt = `You are an expert Cairo transit planner with deep local knowledge. Plan the optimal trip in ${isArabic ? "Arabic" : "English"}.

KEY RULES — follow exactly:
1. ALL places refer to Cairo (القاهرة), Egypt unless stated otherwise.
2. Use real Cairo geography: Heliopolis/Masr El Gedida is northeast, Maadi is south, Dokki/Mohandessin is west, Downtown is center, New Cairo/5th Settlement is east.
3. ALWAYS include Uber/Careem as a fallback alternative (~${taxiEst} EGP total for the full trip).
4. Fill gaps <600 m with walking. Fill 600 m–3 km gaps with Serfis or Microbus (~5–10 EGP) or Uber.
5. Budget priority: economic = NTA Bus/Serfis first, metro second; comfortable = metro preferred; premium = Uber/Careem.
6. Plan segments covering the COMPLETE journey — no missing gaps.
7. Coincident routes: prefer the route that takes the passenger furthest toward the destination.
8. Metro and Monorail run on fixed stops — chain their stop-pair segments to build the full ride.
9. NTA Bus (شركات النقل الجماعي): passengers board/alight anywhere along the route (not fixed stops). Price 19–25 EGP.
10. CTA Bus (هيئة): big government buses, slower, price 13 EGP, board anywhere.
11. Serfis (السرفيس): shared taxi on a fixed route, price ~10 EGP, fast, board anywhere.
12. White Taxi is heatmap-only — NEVER suggest it. Use "Uber / Careem" for app-based taxis.
13. Alexandria routes (ALEX-*) are only relevant if the trip destination is in Alexandria.

Trip details:
- Distance: ${distanceKm.toFixed(1)} km
- Trip type: ${tripType}
- Budget: ${budget ? budget + " EGP" : "flexible"}

Available transport types:
${transportContext}

Fixed-stop transit lines (Metro/Monorail/Train — chain segments for full route):
${fixedLines.join("\n") || "(none loaded)"}

Bus/Serfis/Microbus lines (passengers board anywhere on these routes):
${busLines.join("\n") || "(none loaded — use Cairo transit knowledge)"}

Return a JSON object with EXACTLY this structure (no markdown, no extra keys):
{
  "segments": [
    {
      "transport_type_id": "metro",
      "transport_name": "Cairo Metro – Line 2",
      "start_name": "Station or area in ${isArabic ? "Arabic" : "English"}",
      "end_name": "Station or area in ${isArabic ? "Arabic" : "English"}",
      "cost_egp": 10,
      "duration_minutes": 12,
      "color": "#8B5CF6",
      "icon": "metro",
      "line_id": null,
      "line_number": "M2",
      "info": "Board at [stop/area]. Alight at [stop/area]. [Directions for passenger.]",
      "route_geometry": null,
      "alternatives": [
        { "transport_type_id": "car", "transport_name": "Uber / Careem", "cost_egp": ${taxiEst}, "duration_minutes": ${Math.round(distanceKm * 2.5)}, "color": "#06B6D4", "icon": "car" }
      ]
    }
  ],
  "total_cost_egp": 30,
  "total_duration_minutes": 45,
  "budget_range": { "min": 20, "max": 50 },
  "distance_km": ${distanceKm.toFixed(1)}
}

Icon values: bus, metro, train, car, bike, walk, monorail.
Plan 1–5 segments. Return ONLY valid JSON.`;

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

    if (!apiKey) return res.json(generateFallbackPlan(distanceKm, tripType, taxiEst));

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.15,
      }),
    });

    if (!response.ok) throw new Error(`AI API error: ${response.status}`);

    interface OpenAIResponse { choices: Array<{ message: { content: string } }> }
    const data = await response.json() as OpenAIResponse;
    const plan = JSON.parse(data.choices[0].message.content);
    return res.json(plan);
  } catch (err: unknown) {
    console.error("AI trip plan error:", err);
    return res.json(generateFallbackPlan(distanceKm, tripType, taxiEst));
  }
});

function generateFallbackPlan(distanceKm: number, tripType: string, taxiEst: number) {
  const taxiAlt = {
    transport_type_id: "car", transport_name: "Uber / Careem",
    cost_egp: taxiEst, duration_minutes: Math.round(distanceKm * 2.5),
    color: "#06B6D4", icon: "car",
  };
  const segments = tripType === "premium"
    ? [{ transport_type_id: "car", transport_name: "Uber / Careem", start_name: "Your Location", end_name: "Destination", cost_egp: taxiEst, duration_minutes: Math.round(distanceKm * 2.5), color: "#06B6D4", icon: "car", line_id: null, line_number: "", info: "Open Uber or Careem app and enter your destination.", route_geometry: null, alternatives: [] }]
    : tripType === "economic"
    ? [{ transport_type_id: "bus", transport_name: "NTA Bus / Serfis", start_name: "Your Location", end_name: "Near Destination", cost_egp: 19, duration_minutes: Math.round(distanceKm * 3.5), color: "#2563EB", icon: "bus", line_id: null, line_number: "", info: "Ask any bus or serfis driver for your destination area. Price 19–25 EGP.", route_geometry: null, alternatives: [taxiAlt] }]
    : [
        { transport_type_id: "metro", transport_name: "Cairo Metro", start_name: "Nearest Metro Station", end_name: "Closest Station to Destination", cost_egp: 10, duration_minutes: Math.round(distanceKm * 2), color: "#8B5CF6", icon: "metro", line_id: null, line_number: "", info: "Buy ticket at station kiosk (10–20 EGP). Fastest option in Cairo.", route_geometry: null, alternatives: [taxiAlt] },
        { transport_type_id: "bus", transport_name: "Serfis / Microbus", start_name: "Metro Station Exit", end_name: "Destination", cost_egp: 10, duration_minutes: Math.round(distanceKm * 1.5), color: "#16A34A", icon: "bus", line_id: null, line_number: "", info: "Take a serfis or microbus for the final leg (~10 EGP).", route_geometry: null, alternatives: [] },
      ];
  const totalCost = segments.reduce((s, seg) => s + seg.cost_egp, 0);
  const totalTime = segments.reduce((s, seg) => s + seg.duration_minutes, 0);
  return { segments, total_cost_egp: totalCost, total_duration_minutes: totalTime, budget_range: { min: Math.round(totalCost * 0.8), max: Math.round(totalCost * 1.3) }, distance_km: parseFloat(distanceKm.toFixed(1)) };
}

export default router;
