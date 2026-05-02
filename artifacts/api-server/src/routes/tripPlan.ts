import { Router } from "express";
import { db } from "@workspace/db";
import { transportTypesTable, transitLinesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.post("/", async (req, res) => {
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

  const transportContext = transportTypes.map(t =>
    `- ${t.nameEn} (${t.nameAr}): base ${t.basePriceEgp} EGP + ${t.pricePerKmEgp} EGP/km, speed ${t.averageSpeedKmh} km/h, foreigners_allowed=${t.foreignerAllowed}`
  ).join("\n");

  const relevantLines = transitLines.slice(0, 30).map(l =>
    `- Line ${l.lineNumber}: ${l.fromArea} → ${l.toArea} via ${(l.viaStops || []).slice(0, 3).join(", ")} (${l.priceEgp} EGP)`
  ).join("\n");

  const prompt = `You are a Cairo transit planning expert. Plan the optimal trip in ${language === 'ar' ? 'Arabic' : 'English'}.

Trip details:
- Distance: ${distanceKm.toFixed(1)} km
- Type: ${tripType} (economic=cheapest, comfortable=balanced, premium=fastest/most comfortable)
- Budget: ${budget ? budget + ' EGP' : 'flexible'}

Available transport types:
${transportContext}

Sample transit lines for reference:
${relevantLines}

Return a JSON object with this exact structure:
{
  "segments": [
    {
      "transport_type_id": "uuid-or-name",
      "transport_name": "Bus / Metro / etc",
      "start_name": "Start Area",
      "end_name": "End Area",
      "cost_egp": 15,
      "duration_minutes": 25,
      "color": "#3B82F6",
      "icon": "bus",
      "line_id": null,
      "line_number": "72",
      "info": "Tip about this segment",
      "route_geometry": null,
      "alternatives": [
        {
          "transport_type_id": "uuid-or-name",
          "transport_name": "Alternative",
          "cost_egp": 20,
          "duration_minutes": 20,
          "color": "#10B981",
          "icon": "metro"
        }
      ]
    }
  ],
  "total_cost_egp": 30,
  "total_duration_minutes": 50,
  "budget_range": { "min": 25, "max": 45 },
  "distance_km": ${distanceKm.toFixed(1)}
}

Plan 1-3 segments. Use realistic Cairo transport. Icon values: bus, metro, train, car, bike, walk. Return ONLY valid JSON.`;

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
        temperature: 0.3,
      }),
    });

    if (!response.ok) throw new Error(`AI API error: ${response.status}`);
    const data = await response.json() as any;
    const plan = JSON.parse(data.choices[0].message.content);
    return res.json(plan);
  } catch (err) {
    console.error("AI trip plan error:", err);
    return res.json(generateFallbackPlan(distanceKm, tripType, startLat, startLng, endLat, endLng));
  }
});

function generateFallbackPlan(distanceKm: number, tripType: string, startLat: number, startLng: number, endLat: number, endLng: number) {
  const isEconomic = tripType === "economic";
  const isPremium = tripType === "premium";

  const segments = isPremium
    ? [{ transport_type_id: "taxi", transport_name: "Taxi / Ride-share", start_name: "Your Location", end_name: "Destination", cost_egp: Math.round(15 + distanceKm * 4.5), duration_minutes: Math.round(distanceKm * 2.5), color: "#F59E0B", icon: "car", line_id: null, line_number: "", info: "Use Uber or Careem for best rates", route_geometry: null, alternatives: [] }]
    : isEconomic
    ? [
        { transport_type_id: "bus", transport_name: "CTA Bus", start_name: "Your Location", end_name: "Midpoint", cost_egp: 13, duration_minutes: Math.round(distanceKm * 3), color: "#3B82F6", icon: "bus", line_id: null, line_number: distanceKm > 10 ? "72" : "50", info: "Pay conductor upon boarding", route_geometry: null, alternatives: [{ transport_type_id: "metro", transport_name: "Metro", cost_egp: 10, duration_minutes: Math.round(distanceKm * 1.8), color: "#8B5CF6", icon: "metro" }] },
      ]
    : [
        { transport_type_id: "metro", transport_name: "Cairo Metro", start_name: "Your Location", end_name: "Transfer Point", cost_egp: 10, duration_minutes: Math.round(distanceKm * 2), color: "#8B5CF6", icon: "metro", line_id: null, line_number: "M2", info: "Fast and reliable", route_geometry: null, alternatives: [{ transport_type_id: "bus", transport_name: "CTA Bus", cost_egp: 13, duration_minutes: Math.round(distanceKm * 3.5), color: "#3B82F6", icon: "bus" }] },
        { transport_type_id: "bus", transport_name: "Minibus", start_name: "Transfer Point", end_name: "Destination", cost_egp: 8, duration_minutes: Math.round(distanceKm * 2.5), color: "#10B981", icon: "bus", line_id: null, line_number: "", info: "Final leg by minibus", route_geometry: null, alternatives: [] },
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
