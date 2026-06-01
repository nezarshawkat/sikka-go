import { Router } from "express";
import { db } from "@workspace/db";
import { transportTypesTable, transitLinesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { EGYPT_CITIES } from "../lib/intercitySearch.js";
import { runIntercitySearch } from "../lib/intercitySearch.js";

const router = Router();

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Cairo + Giza are one metro area — travel within them stays "city" mode.
const GREATER_CAIRO = new Set(["Cairo", "Giza"]);

function nearestCity(lat: number, lng: number) {
  let best: (typeof EGYPT_CITIES)[number] | null = null;
  let bestDist = Infinity;
  for (const c of EGYPT_CITIES) {
    if (c.lat == null || c.lng == null) continue;
    const d = haversineKm(lat, lng, c.lat, c.lng);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best ? { city: best, dist: bestDist } : null;
}

function zoneOf(governorate: string) {
  return GREATER_CAIRO.has(governorate) ? "greater_cairo" : governorate;
}

router.post("/", requireAuth, async (req, res) => {
  const { startLat, startLng, endLat, endLng, tripType, budget, language } = req.body;

  const distanceKm = haversineKm(startLat, startLng, endLat, endLng);
  const isArabicLang = language === "ar";

  // ── Intercity auto-mode: destination in a different governorate / far away ──
  const startNear = nearestCity(startLat, startLng);
  const endNear = nearestCity(endLat, endLng);
  if (
    startNear && endNear &&
    distanceKm > 50 &&
    zoneOf(startNear.city.governorate) !== zoneOf(endNear.city.governorate)
  ) {
    try {
      const intercityPlan = await buildIntercityPlan(
        startNear.city, endNear.city, distanceKm, isArabicLang,
      );
      if (intercityPlan) return res.json(intercityPlan);
    } catch (err) {
      console.error("Intercity plan error:", err);
      // fall through to normal city planning
    }
  }

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
    `- ${t.nameEn} (${t.nameAr}) [category: ${t.category}, operator: ${t.governmentType}]: base ${t.basePriceEgp} EGP + ${t.pricePerKmEgp} EGP/km, speed ${t.averageSpeedKmh} km/h`
  ).join("\n");

  // Fixed-stop lines (Metro / Monorail) — for AI chaining
  const fixedLines = transitLines
    .filter(l => {
      const type = routeTypes.find(t => t.id === l.transportTypeId);
      if (!type) return false;
      const n = type.nameEn.toLowerCase();
      return n.includes("metro") || n.includes("monorail");
    })
    .slice(0, 60)
    .map(l => {
      const typeName = routeTypes.find(t => t.id === l.transportTypeId)?.nameEn ?? "Transit";
      return `- [${typeName}] ${l.lineNumber ?? ""}: ${l.fromArea} → ${l.toArea} (${l.priceEgp} EGP)`;
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
      return `- [${typeName}] Line ${l.lineNumber ?? "(no number)"}: ${l.fromArea} → ${l.toArea}${via ? ` via ${via}` : ""} (${l.priceEgp} EGP)`;
    });

  const isArabic = language === "ar";
  const langName = isArabic ? "Arabic" : "English";

  const prompt = `You are an expert Cairo transit planner with deep local knowledge. Plan the optimal trip and write ALL passenger-facing text (names, station names, instructions) in ${langName}.

KEY RULES — follow exactly:
1. ALL places refer to Cairo (القاهرة), Egypt unless stated otherwise.
2. Use real Cairo geography: Heliopolis/Masr El Gedida is northeast, Maadi is south, Dokki/Mohandessin is west, Downtown is center, New Cairo/5th Settlement is east.
3. ALWAYS include Uber/Careem as a fallback alternative (~${taxiEst} EGP total for the full trip).
4. Fill gaps <600 m with walking. Fill 600 m–3 km gaps with Serfis or Microbus (~5–10 EGP) or Uber.
5. Plan segments covering the COMPLETE journey — no missing gaps.
6. Coincident routes: prefer the route that takes the passenger furthest toward the destination.
7. Metro and Monorail run on fixed stops — chain their stop-pair segments to build the full ride.
8. NTA Bus (شركات النقل الجماعي): passengers board/alight anywhere along the route. Price 19–25 EGP.
9. CTA Bus (هيئة): big government buses, slower, price 13 EGP, board anywhere.
10. Serfis (السرفيس): shared taxi on a fixed route, ~5–10 EGP, fast, board anywhere.
11. Microbus (ميكروباص): private shared van, cheap, board anywhere, no fixed number.
12. White Taxi & Tuktuk are heatmap-only — NEVER suggest them. Use "Uber / Careem" for app-based taxis.

TRIP CATEGORY (tripType = "${tripType}") — choose transport whose [category] matches and optimize accordingly:
- economic: cheapest viable path. Prefer category=economic types (NTA/CTA Bus, Serfis, Microbus). Minimize cost above all.
- comfortable: balance cost and comfort. Prefer category=comfortable (Metro, White Taxi via Uber). Fewer transfers, reliable timing.
- premium: fastest and most comfortable. Prefer category=premium (Uber/Careem, Monorail). Minimize transfers and walking even at higher cost.
Use nearby transport availability and density to improve pricing and category accuracy. Improve budget estimation so total_cost_egp is realistic for ${langName} Cairo prices.

DETAILED INSTRUCTIONS — every segment MUST include an "instructions" array (3–6 short steps, in ${langName}) covering, as relevant:
- Where to head / walk to (direction + landmark).
- Where and how to pay (kiosk, conductor, app), and the fare.
- Which station/stop to enter and which exit/stop to leave at.
- For buses/serfis/microbus: how to wave the vehicle down, what to say to the driver (e.g. ask for the destination area), and boarding/alighting tips.
- For metro/monorail: which platform/direction and how many stops.

Trip details:
- Distance: ${distanceKm.toFixed(1)} km
- Trip type: ${tripType}
- Budget: ${budget ? budget + " EGP" : "flexible"}

Available transport types:
${transportContext}

Fixed-stop transit lines (Metro/Monorail — chain segments for full route):
${fixedLines.join("\n") || "(none loaded)"}

Bus/Serfis/Microbus lines (passengers board anywhere on these routes):
${busLines.join("\n") || "(none loaded — use Cairo transit knowledge)"}

Return a JSON object with EXACTLY this structure (no markdown, no extra keys):
{
  "segments": [
    {
      "transport_type_id": "metro",
      "transport_name": "Cairo Metro – Line 2",
      "government_type": "government",
      "category": "comfortable",
      "start_name": "Station or area in ${langName}",
      "end_name": "Station or area in ${langName}",
      "cost_egp": 10,
      "duration_minutes": 12,
      "color": "#8B5CF6",
      "icon": "metro",
      "line_id": null,
      "line_number": "M2",
      "info": "One-line summary in ${langName}.",
      "instructions": ["step 1 in ${langName}", "step 2 in ${langName}", "step 3 in ${langName}"],
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
government_type is "government" or "private". category is "economic", "comfortable" or "premium".
Plan 1–5 segments. Return ONLY valid JSON.`;

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

    if (!apiKey) return res.json(generateFallbackPlan(distanceKm, tripType, taxiEst, isArabic));

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
    return res.json(generateFallbackPlan(distanceKm, tripType, taxiEst, isArabic));
  }
});

type IntercityCity = (typeof EGYPT_CITIES)[number];

async function buildIntercityPlan(
  fromCity: IntercityCity,
  toCity: IntercityCity,
  distanceKm: number,
  isArabic: boolean,
) {
  const tr = (en: string, ar: string) => (isArabic ? ar : en);
  const fromName = isArabic ? fromCity.nameAr : fromCity.nameEn;
  const toName = isArabic ? toCity.nameAr : toCity.nameEn;

  const date = new Date().toISOString().slice(0, 10);
  let trips: Awaited<ReturnType<typeof runIntercitySearch>>["trips"] = [];
  try {
    const result = await runIntercitySearch(fromCity.nameEn, toCity.nameEn, date);
    trips = result.trips;
  } catch (err) {
    console.error("Intercity search failed inside plan:", err);
  }

  // Cheapest trip becomes the primary segment; others become alternatives.
  trips = [...trips].sort((a, b) => a.priceEgp - b.priceEgp);
  const primary = trips[0];

  const estPrice = primary?.priceEgp ?? Math.round(80 + distanceKm * 0.9);
  const estDuration = primary?.durationMinutes ?? Math.round((distanceKm / 80) * 60);

  const operatorName = primary?.operator ?? tr("Intercity Bus", "أتوبيس السفر");

  const instructions = primary
    ? [
        tr(
          `Go to ${primary.fromStation || fromName} station.`,
          `اذهب إلى محطة ${primary.fromStation || fromName}.`,
        ),
        tr(
          `Take the ${primary.operator} bus departing at ${primary.departure}.`,
          `اركب أتوبيس ${primary.operator} المغادر الساعة ${primary.departure}.`,
        ),
        tr(
          primary.bookingUrl
            ? `Book online or at the office (~${estPrice} EGP).`
            : `Buy your ticket at the station office (~${estPrice} EGP).`,
          primary.bookingUrl
            ? `احجز أونلاين أو من المكتب (~${estPrice} جنيه).`
            : `اشترِ تذكرتك من مكتب المحطة (~${estPrice} جنيه).`,
        ),
        tr(
          `Arrive in ${toName}${primary.arrival ? ` around ${primary.arrival}` : ""}.`,
          `تصل إلى ${toName}${primary.arrival ? ` حوالي ${primary.arrival}` : ""}.`,
        ),
      ]
    : [
        tr(`Head to the intercity bus terminal in ${fromName}.`, `توجه إلى موقف أتوبيس السفر في ${fromName}.`),
        tr(`Take an intercity bus toward ${toName}.`, `اركب أتوبيس سفر متجه إلى ${toName}.`),
        tr(`Pay at the station (~${estPrice} EGP).`, `ادفع في المحطة (~${estPrice} جنيه).`),
      ];

  const alternatives = trips.slice(1, 4).map((t) => ({
    transport_type_id: "intercity",
    transport_name: `${t.operator} — ${t.departure}`,
    cost_egp: t.priceEgp,
    duration_minutes: t.durationMinutes,
    color: "#0EA5E9",
    icon: "bus",
  }));

  const segment = {
    transport_type_id: "intercity",
    transport_name: `${operatorName} — ${fromName} → ${toName}`,
    government_type: "private",
    category: "comfortable",
    start_name: primary?.fromStation || fromName,
    end_name: primary?.toStation || toName,
    cost_egp: estPrice,
    duration_minutes: estDuration,
    color: "#0EA5E9",
    icon: "bus",
    line_id: null,
    line_number: null,
    info: tr(
      `Intercity trip from ${fromName} to ${toName} (~${Math.round(distanceKm)} km).`,
      `رحلة سفر من ${fromName} إلى ${toName} (~${Math.round(distanceKm)} كم).`,
    ),
    instructions,
    route_geometry: null,
    booking_url: primary?.bookingUrl ?? null,
    alternatives,
  };

  return {
    segments: [segment],
    total_cost_egp: estPrice,
    total_duration_minutes: estDuration,
    budget_range: { min: Math.round(estPrice * 0.8), max: Math.round(estPrice * 1.4) },
    distance_km: parseFloat(distanceKm.toFixed(1)),
    intercity: true,
    from_city: fromName,
    to_city: toName,
  };
}

function generateFallbackPlan(distanceKm: number, tripType: string, taxiEst: number, isArabic: boolean) {
  const tr = (en: string, ar: string) => (isArabic ? ar : en);
  const taxiAlt = {
    transport_type_id: "car", transport_name: tr("Uber / Careem", "أوبر / كريم"),
    cost_egp: taxiEst, duration_minutes: Math.round(distanceKm * 2.5),
    color: "#06B6D4", icon: "car",
  };

  type Seg = {
    transport_type_id: string; transport_name: string; government_type: string; category: string;
    start_name: string; end_name: string; cost_egp: number; duration_minutes: number;
    color: string; icon: string; line_id: null; line_number: string; info: string;
    instructions: string[]; route_geometry: null; alternatives: typeof taxiAlt[];
  };

  let segments: Seg[];
  if (tripType === "premium") {
    segments = [{
      transport_type_id: "car", transport_name: tr("Uber / Careem", "أوبر / كريم"),
      government_type: "private", category: "premium",
      start_name: tr("Your Location", "موقعك"), end_name: tr("Destination", "الوجهة"),
      cost_egp: taxiEst, duration_minutes: Math.round(distanceKm * 2.5),
      color: "#06B6D4", icon: "car", line_id: null, line_number: "",
      info: tr("Door-to-door ride.", "رحلة من الباب للباب."),
      instructions: [
        tr("Open the Uber or Careem app.", "افتح تطبيق أوبر أو كريم."),
        tr("Enter your destination and confirm pickup at your location.", "أدخل وجهتك وأكد مكان الالتقاء عند موقعك."),
        tr(`Pay in-app or cash (~${taxiEst} EGP).`, `ادفع عبر التطبيق أو نقدًا (~${taxiEst} جنيه).`),
      ],
      route_geometry: null, alternatives: [],
    }];
  } else if (tripType === "economic") {
    segments = [{
      transport_type_id: "bus", transport_name: tr("NTA Bus / Serfis", "أتوبيس النقل الجماعي / سرفيس"),
      government_type: "government", category: "economic",
      start_name: tr("Your Location", "موقعك"), end_name: tr("Near Destination", "قرب الوجهة"),
      cost_egp: 19, duration_minutes: Math.round(distanceKm * 3.5),
      color: "#2563EB", icon: "bus", line_id: null, line_number: "",
      info: tr("Cheapest route by public bus or serfis.", "أرخص طريق بالأتوبيس العام أو السرفيس."),
      instructions: [
        tr("Walk to the nearest main road.", "امشِ إلى أقرب شارع رئيسي."),
        tr("Wave down a bus or serfis heading toward your destination.", "لوّح لأتوبيس أو سرفيس متجه نحو وجهتك."),
        tr("Tell the driver your destination area before boarding.", "أخبر السائق بمنطقة وجهتك قبل الركوب."),
        tr("Pay the driver or conductor (19–25 EGP).", "ادفع للسائق أو الكمساري (19–25 جنيه)."),
      ],
      route_geometry: null, alternatives: [taxiAlt],
    }];
  } else {
    segments = [
      {
        transport_type_id: "metro", transport_name: tr("Cairo Metro", "مترو القاهرة"),
        government_type: "government", category: "comfortable",
        start_name: tr("Nearest Metro Station", "أقرب محطة مترو"), end_name: tr("Closest Station to Destination", "أقرب محطة للوجهة"),
        cost_egp: 10, duration_minutes: Math.round(distanceKm * 2),
        color: "#8B5CF6", icon: "metro", line_id: null, line_number: "",
        info: tr("Fast and reliable.", "سريع وموثوق."),
        instructions: [
          tr("Walk to the nearest metro station.", "امشِ إلى أقرب محطة مترو."),
          tr("Buy a ticket at the kiosk or machine (10–20 EGP).", "اشترِ تذكرة من الشباك أو الماكينة (10–20 جنيه)."),
          tr("Take the line in the correct direction toward your destination.", "اركب الخط في الاتجاه الصحيح نحو وجهتك."),
          tr("Exit at the station closest to your destination.", "انزل في المحطة الأقرب لوجهتك."),
        ],
        route_geometry: null, alternatives: [taxiAlt],
      },
      {
        transport_type_id: "bus", transport_name: tr("Serfis / Microbus", "سرفيس / ميكروباص"),
        government_type: "private", category: "economic",
        start_name: tr("Metro Station Exit", "مخرج محطة المترو"), end_name: tr("Destination", "الوجهة"),
        cost_egp: 10, duration_minutes: Math.round(distanceKm * 1.5),
        color: "#16A34A", icon: "bus", line_id: null, line_number: "",
        info: tr("Final leg by serfis or microbus.", "المرحلة الأخيرة بالسرفيس أو الميكروباص."),
        instructions: [
          tr("At the station exit, find the serfis/microbus stop.", "عند مخرج المحطة، ابحث عن موقف السرفيس/الميكروباص."),
          tr("Ask the driver if he passes your destination.", "اسأل السائق إن كان يمر بوجهتك."),
          tr("Pay the fare (~10 EGP) and tell the driver where to stop.", "ادفع الأجرة (~10 جنيه) وأخبر السائق أين تنزل."),
        ],
        route_geometry: null, alternatives: [],
      },
    ];
  }
  const totalCost = segments.reduce((s, seg) => s + seg.cost_egp, 0);
  const totalTime = segments.reduce((s, seg) => s + seg.duration_minutes, 0);
  return { segments, total_cost_egp: totalCost, total_duration_minutes: totalTime, budget_range: { min: Math.round(totalCost * 0.8), max: Math.round(totalCost * 1.3) }, distance_km: parseFloat(distanceKm.toFixed(1)) };
}

export default router;
