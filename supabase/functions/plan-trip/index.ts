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

    const { data: transportTypes, error: dbError } = await supabase
      .from('transport_types')
      .select('*')
      .eq('is_active', true);

    if (dbError) throw dbError;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const systemPrompt = `You are an Egyptian transportation route planner AI. You must create COMPLETE routes from start to destination.

CRITICAL RULES:
1. The route MUST be fully connected - from the user's exact starting location to their exact destination
2. If a single transport cannot cover the full journey, you MUST add connecting segments
3. Consider what transport is accessible from the user's CURRENT position (urban vs rural, near metro station, etc)
4. Each segment's end_name must match the next segment's start_name
5. Tuk-tuks only operate in specific neighborhoods (not on highways or between cities)
6. Microbuses operate on fixed routes between specific areas
7. Metro only in Cairo (3 lines), Monorail connects 6th October and New Capital
8. For taxi pricing: base fare + per-km rate. Uber/Careem use surge pricing
9. Bus numbers matter - use real CTA bus numbers when possible

Service levels:
- economic: tuk-tuk, public bus, microbus (cheapest options)
- comfortable: metro, monorail, white taxi, inter-city bus (balanced)
- premium: Uber/Careem, train 1st class/VIP, domestic flight (best comfort)

Distance categories:
- Short (0-5km): tuk-tuk, taxi, bus, walking connection
- Medium (5-30km): metro, monorail, bus, taxi
- Long (30km+): train, inter-city bus (SuperJet/Go Bus), domestic flight

Taxi pricing algorithm:
- White taxi: 10 EGP flag + 3.5 EGP/km
- Uber/Careem: 15 EGP base + 4.5 EGP/km + surge factor (1.0-2.5x)

Return JSON via the create_trip_plan function. ENSURE the route is COMPLETE and CONNECTED.`;

    const userPrompt = `Plan a ${tripType} trip:
- Start: ${startLat}, ${startLng}
- End: ${endLat}, ${endLng}
- Distance: ${distanceKm.toFixed(1)} km
- Budget: ${budget ? budget + ' EGP' : 'not specified'}
- Language: ${language || 'en'}

Available transport types:
${JSON.stringify(transportTypes?.map(t => ({
  id: t.id, name: t.name_en, name_ar: t.name_ar,
  speed: t.average_speed_kmh, base_price: t.base_price_egp,
  price_per_km: t.price_per_km_egp, service_level: t.service_level,
  min_dist_min: t.min_distance_minutes, max_dist_min: t.max_distance_minutes,
})), null, 2)}

IMPORTANT: Create a COMPLETE connected route. Every segment must connect to the next. The first segment starts where the user IS, the last segment ends at their destination.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'create_trip_plan',
            description: 'Create a complete, connected trip plan',
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
                budget_range: {
                  type: 'object',
                  properties: { min: { type: 'number' }, max: { type: 'number' } },
                  required: ['min', 'max'],
                },
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
      if (status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited, please try again later' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errText = await aiResponse.text();
      console.error('AI error:', status, errText);
      throw new Error('AI planning failed');
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let plan;
    if (toolCall?.function?.arguments) {
      plan = typeof toolCall.function.arguments === 'string'
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } else {
      const content = aiData.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) plan = JSON.parse(jsonMatch[0]);
      else throw new Error('Could not parse AI response');
    }

    const enrichedSegments = plan.segments.map((seg: any) => {
      const tt = transportTypes?.find(t => t.id === seg.transport_type_id);
      return {
        ...seg,
        color: tt?.color || '#3B82F6',
        icon: tt?.icon || 'bus',
        alternatives: seg.alternatives?.map((alt: any) => {
          const altTt = transportTypes?.find(t => t.id === alt.transport_type_id);
          return { ...alt, color: altTt?.color || '#6366F1', icon: altTt?.icon || 'bus' };
        }) || [],
      };
    });

    return new Response(JSON.stringify({
      ...plan,
      segments: enrichedSegments,
      distance_km: distanceKm,
      transport_types: transportTypes,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('plan-trip error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
