import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Distance from a point to a line's nearest coordinate (km)
function nearestPointOnPath(lat: number, lng: number, coords: [number, number][]): { dist: number; point: [number, number] } {
  let best = { dist: Infinity, point: coords[0] as [number, number] };
  for (const c of coords) {
    const d = haversineKm(lat, lng, c[1], c[0]);
    if (d < best.dist) best = { dist: d, point: c };
  }
  return best;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { startLat, startLng, endLat, endLng, tripType, budget, language } = await req.json();

    if (startLat == null || startLng == null || endLat == null || endLng == null || !tripType) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const distanceKm = haversineKm(startLat, startLng, endLat, endLng);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const [ttRes, tlRes] = await Promise.all([
      supabase.from('transport_types').select('*').eq('is_active', true),
      supabase.from('transit_lines').select('id, transport_type_id, line_number, name_en, from_area, to_area, via_stops, route_path, price_egp, has_fixed_stops').eq('is_active', true),
    ]);

    const transportTypes = ttRes.data || [];
    const transitLines = tlRes.data || [];

    // Filter to ONLY lines whose path comes within ~3km of either start or end (i.e. actually relevant)
    const RELEVANCE_KM = 3.5;
    const relevantLines = transitLines
      .map((l: any) => {
        const coords: [number, number][] = l.route_path?.coordinates || [];
        if (!coords.length) return null;
        const fromStart = nearestPointOnPath(startLat, startLng, coords);
        const fromEnd = nearestPointOnPath(endLat, endLng, coords);
        const minRelevance = Math.min(fromStart.dist, fromEnd.dist);
        if (minRelevance > RELEVANCE_KM) return null;
        return {
          ...l,
          board_distance_km: fromStart.dist,
          alight_distance_km: fromEnd.dist,
          board_point: fromStart.point,
          alight_point: fromEnd.point,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => (a.board_distance_km + a.alight_distance_km) - (b.board_distance_km + b.alight_distance_km))
      .slice(0, 30);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const systemPrompt = `You are an Egyptian transportation route planner AI.

ABSOLUTE RULES (violating any of them = bad plan):
1. The route MUST be FULLY CONNECTED from start point to destination — no gaps.
2. You may ONLY pick a transit line from the "RELEVANT TRANSIT LINES" list below. NEVER invent a bus number, NEVER use a line that does not appear in that list.
3. For each transit segment, set transport_name to "<TYPE> <LINE_NUMBER>" (e.g. "هيئة النقل العام 24" or "Metro M1") AND set line_number = the line_number from the list AND set line_id = the database id of the line.
4. Walking segments MUST be ≤ 10 minutes (≈ 800 m). If a gap is bigger than that, you MUST insert another transit line from the list (or a tuk-tuk / taxi if no listed line covers it). Never produce a walking segment longer than 10 minutes.
5. Force-complete the route to the destination EVEN IF the total cost exceeds the user's budget. Get as close to budget as possible but never leave the trip incomplete.
6. The first segment must start at the user's start coordinates, the last segment must end at the destination coordinates. Each segment's end must equal the next segment's start (same name).
7. Tuk-tuks ONLY operate inside residential neighborhoods. Microbuses use semi-fixed routes. Metro/monorail/train/plane use FIXED stops only.
8. For "economic" prefer: tuk-tuk, public buses (النقل الجماعي / هيئة النقل العام), microbus.
   For "comfortable" prefer: metro, monorail, CTA bus, white taxi.
   For "premium" prefer: Uber/Careem, train, aeroplane.

Taxi pricing fallback: White taxi 10 + 3.5/km · Uber/Careem 15 + 4.5/km × surge (1.0–2.5).

RELEVANT TRANSIT LINES (these are the ONLY transit lines you may name in this trip):
${JSON.stringify(relevantLines.map((l: any) => ({
  line_id: l.id,
  type_id: l.transport_type_id,
  line_number: l.line_number,
  name: l.name_en,
  from: l.from_area,
  to: l.to_area,
  price_egp: l.price_egp,
  walk_to_board_km: +l.board_distance_km.toFixed(2),
  walk_from_alight_km: +l.alight_distance_km.toFixed(2),
})), null, 1)}

Use the listed price exactly. If NO line is relevant, fall back to taxi/microbus and clearly say "no fixed line available".`;

    const userPrompt = `Plan a ${tripType} trip:
- Start coordinates: ${startLat}, ${startLng}
- End coordinates: ${endLat}, ${endLng}
- Straight-line distance: ${distanceKm.toFixed(1)} km
- Budget: ${budget ? budget + ' EGP (target — exceed if needed to complete the trip)' : 'not specified'}
- Language: ${language || 'en'}

Transport types:
${JSON.stringify(transportTypes.map((t: any) => ({ id: t.id, name: t.name_en, speed: t.average_speed_kmh, base_price: t.base_price_egp, price_per_km: t.price_per_km_egp, service_level: t.service_level })), null, 1)}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'create_trip_plan',
            description: 'Create a complete connected trip plan with walking segments ≤ 10 min and named line numbers',
            parameters: {
              type: 'object',
              properties: {
                segments: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      transport_type_id: { type: 'string' },
                      transport_name: { type: 'string', description: 'Display name including the route number, e.g. "هيئة النقل العام 24"' },
                      line_id: { type: 'string', description: 'database id of the transit line, or empty for walking/taxi' },
                      line_number: { type: 'string', description: 'Route/line number, or empty for walking/taxi' },
                      info: { type: 'string', description: 'Short rider info: where to board, frequency, fare details' },
                      start_name: { type: 'string' },
                      end_name: { type: 'string' },
                      cost_egp: { type: 'number' },
                      duration_minutes: { type: 'number' },
                      alternatives: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            transport_type_id: { type: 'string' },
                            transport_name: { type: 'string' },
                            line_number: { type: 'string' },
                            cost_egp: { type: 'number' },
                            duration_minutes: { type: 'number' },
                          },
                          required: ['transport_type_id', 'transport_name', 'cost_egp', 'duration_minutes'],
                        },
                      },
                    },
                    required: ['transport_type_id', 'transport_name', 'start_name', 'end_name', 'cost_egp', 'duration_minutes', 'alternatives'],
                  },
                },
                total_cost_egp: { type: 'number' },
                total_duration_minutes: { type: 'number' },
                budget_range: { type: 'object', properties: { min: { type: 'number' }, max: { type: 'number' } }, required: ['min', 'max'] },
              },
              required: ['segments', 'total_cost_egp', 'total_duration_minutes', 'budget_range'],
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'create_trip_plan' } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (status === 402) return new Response(JSON.stringify({ error: 'AI credits exhausted' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      throw new Error('AI planning failed');
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let plan;
    if (toolCall?.function?.arguments) {
      plan = typeof toolCall.function.arguments === 'string' ? JSON.parse(toolCall.function.arguments) : toolCall.function.arguments;
    } else {
      const content = aiData.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) plan = JSON.parse(jsonMatch[0]);
      else throw new Error('Could not parse AI response');
    }

    const enrichedSegments = plan.segments.map((seg: any) => {
      const tt = transportTypes.find((t: any) => t.id === seg.transport_type_id);
      const isWalk = seg.transport_name?.toLowerCase().includes('walk') || seg.icon === 'walk' || tt?.icon === 'walk';
      // Look up the line geometry if line_id provided
      const line = seg.line_id ? transitLines.find((l: any) => l.id === seg.line_id) : null;
      const route_geometry = line?.route_path?.coordinates || null;
      // Cap walking at 10 min in display (safety net — shouldn't trigger if AI obeyed)
      const cappedDuration = isWalk ? Math.min(Number(seg.duration_minutes || 0), 10) : Number(seg.duration_minutes || 0);
      if (isWalk) {
        return { ...seg, color: '#9CA3AF', icon: 'walk', duration_minutes: cappedDuration, alternatives: seg.alternatives || [], line_number: '', info: seg.info || `Walk ${Math.round(cappedDuration)} min` };
      }
      return {
        ...seg,
        color: tt?.color || '#3B82F6',
        icon: tt?.icon || 'bus',
        line_id: seg.line_id || null,
        line_number: seg.line_number || line?.line_number || '',
        info: seg.info || (line ? `${tt?.name_en} ${line.line_number}: ${line.from_area} → ${line.to_area}. ${line.price_egp} EGP.` : `${tt?.name_en || 'Transit'} segment`),
        route_geometry,
        alternatives: (seg.alternatives || []).map((alt: any) => {
          const altTt = transportTypes.find((t: any) => t.id === alt.transport_type_id);
          return { ...alt, color: altTt?.color || '#6366F1', icon: altTt?.icon || 'bus' };
        }),
      };
    });

    const correctedTotal = enrichedSegments.reduce((sum: number, seg: any) => sum + Number(seg.cost_egp || 0), 0);
    const correctedDuration = enrichedSegments.reduce((sum: number, seg: any) => sum + Number(seg.duration_minutes || 0), 0);
    const correctedBudgetRange = {
      min: Math.max(0, Math.floor(correctedTotal)),
      max: Math.ceil(correctedTotal * 1.1),
    };

    return new Response(JSON.stringify({
      ...plan,
      segments: enrichedSegments,
      total_cost_egp: correctedTotal,
      total_duration_minutes: correctedDuration,
      budget_range: correctedBudgetRange,
      distance_km: distanceKm,
      transport_types: transportTypes,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('plan-trip error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
