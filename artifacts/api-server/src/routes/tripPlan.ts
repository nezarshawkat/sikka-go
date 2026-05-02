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
  const transitLines = await db.select().from(transitLinesTable).where(eq(transitLinesTable.isActive, true));

  // Filter out white taxi (routes only; it should be heatmap-only) and PTA buses
  const filteredTypes = transportTypes.filter(t => {
    const name = t.nameEn.toLowerCase();
    return !name.includes('white taxi') && !name.includes('public transport authority');
  });

  const transportContext = filteredTypes.map(t =>
    `- ${t.nameEn} (${t.nameAr}): base ${t.basePriceEgp} EGP + ${t.pricePerKmEgp} EGP/km, speed ${t.averageSpeedKmh} km/h, foreigners_allowed=${t.foreignerAllowed}`
  ).join("\n");

  // Include metro, monorail, train lines specifically
  const specialLines = transitLines
    .filter(l => {
      const type = filteredTypes.find(t => t.id === l.transportTypeId);
      return type && (type.nameEn.toLowerCase().includes('metro') || type.nameEn.toLowerCase().includes('train') || type.nameEn.toLowerCase().includes('monorail'));
    })
    .slice(0, 20)
    .map(l => `- [${filteredTypes.find(t => t.id === l.transportTypeId)?.nameEn}] Line ${l.lineNumber}: ${l.fromArea} → ${l.toArea} via ${(l.viaStops || []).slice(0, 4).join(', ')} (${l.priceEgp} EGP)`);

  const regularLines = transitLines
    .filter(l => !specialLines.some(s => s.includes(l.lineNumber)))
    .slice(0, 20)
    .map(l => `- Line ${l.lineNumber}: ${l.fromArea} → ${l.toArea} via ${(l.viaStops || []).slice(0, 3).join(', ')} (${l.priceEgp} EGP)`);

  const allLinesContext = [...specialLines, ...regularLines].join("\n");

  const isArabic = language === 'ar';

  const prompt = `You are an expert Cairo transit planner. You know Cairo, Egypt extremely well — its streets, neighborhoods, metro lines, microbus routes, and taxi apps. Plan the optimal trip in ${isArabic ? 'Arabic' : 'English'}.

IMPORTANT RULES:
1. You are planning routes ONLY in Cairo (القاهرة), Egypt. All place names refer to Cairo neighborhoods unless explicitly stated otherwise.
2. Never confuse similar-sounding Cairo areas. Use geographic logic: e.g., السواح is in Heliopolis area, روكسي is in Heliopolis, مصر الجديدة (Heliopolis/Masr El Gedida) is central-east Cairo.
3. ALWAYS include a taxi/ride-share option (Uber or Careem app: ~${Math.round(15 + distanceKm * 4)} EGP estimated) as an alternative if no direct route exists.
4. When no transit line covers a gap, fill with: walking (under 500m), tuktuk (500m-2km, ~5-15 EGP), or Uber/Careem.
5. Budget-aware: economic = cheapest (bus/microbus priority), comfortable = balanced (metro preferred), premium = fastest (Uber/Careem preferred).
6. Plan segments that together cover the FULL journey from start to destination — no gaps.
7. Consider coincident routes: if two routes overlap the user's path, choose the one going furthest toward the destination.

Trip details:
- Distance: ${distanceKm.toFixed(1)} km
- Trip type: ${tripType} (economic=cheapest, comfortable=balanced, premium=fastest/most comfortable)
- Budget: ${budget ? budget + ' EGP' : 'flexible'}

Available transport types (do NOT use White Taxi as a route — it is heatmap-only):
${transportContext || '- Microbus: base 3 EGP, fast and common\n- Metro: base 10 EGP, very fast\n- Taxi (Uber/Careem): ~' + Math.round(15 + distanceKm * 4.5) + ' EGP estimated'}

Known transit lines in the database:
${allLinesContext || '(No lines loaded — use your Cairo transit knowledge)'}

Return a JSON object with EXACTLY this structure (no extra fields, no markdown):
{
  "segments": [
    {
      "transport_type_id": "bus",
      "transport_name": "Microbus / Bus",
      "start_name": "Area name in ${isArabic ? 'Arabic' : 'English'}",
      "end_name": "Area name in ${isArabic ? 'Arabic' : 'English'}",
      "cost_egp": 15,
      "duration_minutes": 25,
      "color": "#3B82F6",
      "icon": "bus",
      "line_id": null,
      "line_number": "72",
      "info": "Practical tip for this segment (what to say to driver, where to board, etc.)",
      "route_geometry": null,
      "alternatives": [
        {
          "transport_type_id": "taxi",
          "transport_name": "Uber / Careem",
          "cost_egp": 35,
          "duration_minutes": 15,
          "color": "#F59E0B",
          "icon": "car"
        }
      ]
    }
  ],
  "total_cost_egp": 30,
  "total_duration_minutes": 50,
  "budget_range": { "min": 25, "max": 45 },
  "distance_km": ${distanceKm.toFixed(1)}
}

Plan 1-4 segments covering the full trip. Icon values: bus, metro, train, car, bike, walk, monorail. Return ONLY valid JSON, no markdown.`;

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

    if (!apiKey) {
      return res.json(generateFallbackPlan(distanceKm, tripType, startLat, startLng, endLat, endLng));
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!response.ok) throw new Error(`AI API error: ${response.status}`);
    interface OpenAIResponse {
      choices: Array<{ message: { content: string } }>;
    }
    const data = await response.json() as OpenAIResponse;
    const plan = JSON.parse(data.choices[0].message.content);
    return res.json(plan);
  } catch (err: unknown) {
    console.error("AI trip plan error:", err);
    return res.json(generateFallbackPlan(distanceKm, tripType, startLat, startLng, endLat, endLng));
  }
});

function generateFallbackPlan(distanceKm: number, tripType: string, _startLat: number, _startLng: number, _endLat: number, _endLng: number) {
  const isEconomic = tripType === "economic";
  const isPremium = tripType === "premium";

  const taxiCost = Math.round(15 + distanceKm * 4.5);
  const taxiAlt = { transport_type_id: "taxi", transport_name: "Uber / Careem", cost_egp: taxiCost, duration_minutes: Math.round(distanceKm * 2.5), color: "#F59E0B", icon: "car" };

  const segments = isPremium
    ? [{ transport_type_id: "taxi", transport_name: "Uber / Careem", start_name: "Your Location", end_name: "Destination", cost_egp: taxiCost, duration_minutes: Math.round(distanceKm * 2.5), color: "#F59E0B", icon: "car", line_id: null, line_number: "", info: "Open Uber or Careem app for best rates", route_geometry: null, alternatives: [] }]
    : isEconomic
    ? [
        { transport_type_id: "bus", transport_name: "Microbus", start_name: "Your Location", end_name: "Midpoint", cost_egp: Math.min(13, Math.round(3 + distanceKm * 0.8)), duration_minutes: Math.round(distanceKm * 3.5), color: "#3B82F6", icon: "bus", line_id: null, line_number: "", info: "Ask for your destination area — microbuses run fixed routes", route_geometry: null, alternatives: [taxiAlt] },
      ]
    : [
        { transport_type_id: "metro", transport_name: "Cairo Metro", start_name: "Your Location", end_name: "Nearest Metro Station", cost_egp: 10, duration_minutes: Math.round(distanceKm * 2), color: "#8B5CF6", icon: "metro", line_id: null, line_number: "", info: "Fastest option — buy ticket at station", route_geometry: null, alternatives: [taxiAlt] },
        { transport_type_id: "bus", transport_name: "Microbus", start_name: "Metro Station", end_name: "Destination", cost_egp: 7, duration_minutes: Math.round(distanceKm * 2), color: "#10B981", icon: "bus", line_id: null, line_number: "", info: "Final leg by microbus from station area", route_geometry: null, alternatives: [] },
      ];

  const totalCost = segments.reduce((s, seg) => s + seg.cost_egp, 0);
  const totalTime = segments.reduce((s, seg) => s + seg.duration_minutes, 0);

  return {
    segments,
    total_cost_egp: totalCost,
    total_duration_minutes: totalTime,
    budget_range: { min: Math.round(totalCost * 0.8), max: Math.round(totalCost * 1.3) },
    distance_km: parseFloat(distanceKm.toFixed(1)),
  };
}

export default router;
