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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { startLat, startLng, endLat, endLng, tripType, budget, language } = await req.json();

    if (!startLat || !startLng || !endLat || !endLng || !tripType) {
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
      supabase.from('transit_lines').select('id, transport_type_id, line_number, from_area, to_area, via_stops, price_egp, has_fixed_stops').eq('is_active', true),
    ]);

    const transportTypes = ttRes.data || [];
    const transitLines = tlRes.data || [];

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const systemPrompt = `You are an Egyptian transportation route planner AI.

CRITICAL RULES:
1. Route MUST be fully connected from start to destination. Each segment's end must connect to next segment's start.
2. If walking is needed to reach nearest transport, add a walking segment (icon: "walk", cost: 0).
3. For economic trips: prefer tuk-tuk, public buses (النقل الجماعي, هيئة النقل العام), microbus.
4. For comfortable: prefer metro, monorail, CTA bus, white taxi.
5. For premium: prefer Uber/Careem, train, aeroplane.
6. Tuk-tuks ONLY operate in residential neighborhoods, NOT highways or between cities.
7. Microbuses operate on semi-fixed routes, riders board from anywhere on the path.
8. Metro only in Cairo (3 lines). Monorail connects 6th October and New Capital.
9. Governmental transport (metro, train, monorail, aeroplane, cruise) has FIXED stops only.
10. All other transport (bus, microbus, tuk-tuk) can be boarded from anywhere along the route.

Taxi pricing:
- White taxi: 10 EGP base + 3.5 EGP/km
- Uber/Careem: 15 EGP base + 4.5 EGP/km × surge (1.0-2.5)

Available transit lines in database (use these when relevant):
${JSON.stringify(transitLines.slice(0, 50).map(l => ({ id: l.id, type_id: l.transport_type_id, num: l.line_number, from: l.from_area, to: l.to_area, price: l.price_egp })), null, 1)}

Return JSON via create_trip_plan. ENSURE route is COMPLETE and CONNECTED with walking segments where needed.`;

    const userPrompt = `Plan a ${tripType} trip:
- Start: ${startLat}, ${startLng}
- End: ${endLat}, ${endLng}
- Distance: ${distanceKm.toFixed(1)} km
- Budget: ${budget ? budget + ' EGP' : 'not specified'}
- Language: ${language || 'en'}

Transport types:
${JSON.stringify(transportTypes.map(t => ({ id: t.id, name: t.name_en, speed: t.average_speed_kmh, base_price: t.base_price_egp, price_per_km: t.price_per_km_egp, service_level: t.service_level })), null, 1)}`;

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
            description: 'Create a complete connected trip plan with walking segments where needed',
            parameters: {
              type: 'object',
              properties: {
                segments: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      transport_type_id: { type: 'string' },
                      transport_name: { type: 'string' },
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
      const tt = transportTypes.find(t => t.id === seg.transport_type_id);
      // Walking segments
      if (seg.transport_name?.toLowerCase().includes('walk') || seg.icon === 'walk') {
        return { ...seg, color: '#9CA3AF', icon: 'walk', alternatives: seg.alternatives || [] };
      }
      return {
        ...seg,
        color: tt?.color || '#3B82F6',
        icon: tt?.icon || 'bus',
        alternatives: (seg.alternatives || []).map((alt: any) => {
          const altTt = transportTypes.find(t => t.id === alt.transport_type_id);
          return { ...alt, color: altTt?.color || '#6366F1', icon: altTt?.icon || 'bus' };
        }),
      };
    });

    return new Response(JSON.stringify({
      ...plan, segments: enrichedSegments, distance_km: distanceKm, transport_types: transportTypes,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('plan-trip error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
