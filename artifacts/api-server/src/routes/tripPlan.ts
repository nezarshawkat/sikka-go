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

  // White Taxi and Tuktuk are heatmap-only — never used as route segments
  // CTA/PTA Bus is removed. Filter both out from route options.
  const routeTypes = transportTypes.filter(t => {
    const n = t.nameEn.toLowerCase();
    return !n.includes("white taxi") && !n.includes("tuktuk") && !n.includes("cta") && !n.includes("public transport authority");
  });

  const uberType  = transportTypes.find(t => t.nameEn.toLowerCase().includes("uber"));
  const taxiEst   = Math.round(15 + distanceKm * (uberType?.pricePerKmEgp ?? 4));

  const transportContext = routeTypes.map(t =>
    `- ${t.nameEn} (${t.nameAr}): base ${t.basePriceEgp} EGP + ${t.pricePerKmEgp} EGP/km, speed ${t.averageSpeedKmh} km/h`
  ).join("\n");

  // Gather metro/monorail/train lines as individual stop pairs
  const fixedLines = transitLines
    .filter(l => {
      const type = routeTypes.find(t => t.id === l.transportTypeId);
      return type && (
        type.nameEn.toLowerCase().includes("metro") ||
        type.nameEn.toLowerCase().includes("monorail") ||
        type.nameEn.toLowerCase().includes("train")
      );
    })
    .slice(0, 60)
    .map(l => {
      const typeName = routeTypes.find(t => t.id === l.transportTypeId)?.nameEn ?? "Transit";
      return `- [${typeName}] ${l.lineNumber}: ${l.fromArea} → ${l.toArea} (${l.priceEgp} EGP per segment)`;
    });

  const microbusLines = transitLines
    .filter(l => routeTypes.find(t => t.id === l.transportTypeId && t.nameEn.toLowerCase().includes("microbus")))
    .slice(0, 20)
    .map(l => `- Line ${l.lineNumber}: ${l.fromArea} → ${l.toArea} via ${(l.viaStops || []).slice(0, 3).join(", ")} (${l.priceEgp} EGP)`);

  const allLinesContext = [...fixedLines, ...microbusLines].join("\n");
  const isArabic = language === "ar";

  const prompt = `You are an expert Cairo transit planner with deep knowledge of Cairo's streets, neighborhoods, and transport network. Plan the optimal trip in ${isArabic ? "Arabic" : "English"}.

KEY RULES — follow these exactly:
1. ALL place names refer to Cairo (القاهرة), Egypt unless stated otherwise. Never confuse similar names from other cities.
2. Use real geography: Heliopolis/Masr El Gedida is northeast Cairo, Maadi is south, Dokki/Mohandessin is west, Downtown is center. DO NOT place a location where it does not belong.
3. ALWAYS include Uber/Careem as the fallback if no transit route covers a gap (estimated ~${taxiEst} EGP total).
4. Fill short gaps (<600m) with walking. Fill 600m–3km gaps with tuktuk (~5–15 EGP) if budget is tight, or Uber/Careem otherwise.
5. Budget priority: economic = bus/microbus first, metro second; comfortable = metro preferred; premium = Uber/Careem preferred.
6. Plan segments that cover the COMPLETE journey from start to end — no missing gaps.
7. Coincident routes: if two routes overlap your path, prefer the one that takes you furthest toward the destination.
8. The metro, monorail, and train run on fixed stops. Chain their stop-pair segments together to build the full ride.
9. Microbus and bus fares: flat fare 3–13 EGP depending on distance. Metro: 10–20 EGP per trip (zone-based). Uber/Careem: ~${taxiEst} EGP estimated.
10. White Taxi is heatmap-only — never suggest it as a route. Use "Uber / Careem" for app-based taxis.

Trip details:
- Distance: ${distanceKm.toFixed(1)} km
- Trip type: ${tripType} (economic = cheapest, comfortable = balanced, premium = fastest)
- Budget: ${budget ? budget + " EGP" : "flexible"}

Available transport modes:
${transportContext || `- Microbus: 3 EGP, fast and common\n- Metro: 10–20 EGP, very fast\n- Uber/Careem: ~${taxiEst} EGP`}

Fixed-stop transit lines in the database (chain these for metro/monorail/train rides):
${allLinesContext || "(No fixed lines — use Cairo transit knowledge and Uber/Careem as fallback)"}

Return a JSON object with EXACTLY this structure (no markdown, no extra keys):
{
  "segments": [
    {
      "transport_type_id": "metro",
      "transport_name": "Cairo Metro – Line 2",
      "start_name": "Station or area name in ${isArabic ? "Arabic" : "English"}",
      "end_name": "Station or area name in ${isArabic ? "Arabic" : "English"}",
      "cost_egp": 10,
      "duration_minutes": 12,
      "color": "#8B5CF6",
      "icon": "metro",
      "line_id": null,
      "line_number": "M2",
      "info": "Board at [station]. Exit at [station]. Platform: [direction].",
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

Icon values: bus, metro, train, car, bike (tuktuk), walk, monorail.
Plan 1–5 segments. Return ONLY valid JSON.`;

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

    if (!apiKey) {
      return res.json(generateFallbackPlan(distanceKm, tripType, taxiEst));
    }

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
    ? [{ transport_type_id: "car", transport_name: "Uber / Careem", start_name: "Your Location", end_name: "Destination", cost_egp: taxiEst, duration_minutes: Math.round(distanceKm * 2.5), color: "#06B6D4", icon: "car", line_id: null, line_number: "", info: "Open Uber or Careem app. Show the driver your destination on the map.", route_geometry: null, alternatives: [] }]
    : tripType === "economic"
    ? [
        { transport_type_id: "bus", transport_name: "Microbus", start_name: "Your Location", end_name: "Near Destination", cost_egp: Math.min(13, Math.round(3 + distanceKm * 0.8)), duration_minutes: Math.round(distanceKm * 3.5), color: "#10B981", icon: "bus", line_id: null, line_number: "", info: "Ask any microbus driver for your destination area — they run fixed routes. If unavailable, use Uber/Careem.", route_geometry: null, alternatives: [taxiAlt] },
      ]
    : [
        { transport_type_id: "metro", transport_name: "Cairo Metro", start_name: "Your Location", end_name: "Nearest Metro Station", cost_egp: 10, duration_minutes: Math.round(distanceKm * 2), color: "#8B5CF6", icon: "metro", line_id: null, line_number: "", info: "Buy ticket at station kiosk (10–20 EGP). Fastest option in Cairo.", route_geometry: null, alternatives: [taxiAlt] },
        { transport_type_id: "bus", transport_name: "Microbus", start_name: "Metro Station Exit", end_name: "Destination", cost_egp: 5, duration_minutes: Math.round(distanceKm * 1.5), color: "#10B981", icon: "bus", line_id: null, line_number: "", info: "Take a microbus or tuktuk for the final leg.", route_geometry: null, alternatives: [] },
      ];

  const totalCost = segments.reduce((s, seg) => s + seg.cost_egp, 0);
  const totalTime = segments.reduce((s, seg) => s + seg.duration_minutes, 0);
  return { segments, total_cost_egp: totalCost, total_duration_minutes: totalTime, budget_range: { min: Math.round(totalCost * 0.8), max: Math.round(totalCost * 1.3) }, distance_km: parseFloat(distanceKm.toFixed(1)) };
}

export default router;
