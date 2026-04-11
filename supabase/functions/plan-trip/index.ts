import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { startLat, startLng, endLat, endLng, tripType, budget, language } = await req.json();

    if (!startLat || !startLng || !endLat || !endLng || !tripType) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate distance using Haversine formula
    const R = 6371;
    const dLat = (endLat - startLat) * Math.PI / 180;
    const dLng = (endLng - startLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(startLat * Math.PI / 180) * Math.cos(endLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Fetch transport types from DB
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: transportTypes, error: dbError } = await supabase
      .from('transport_types')
      .select('*')
      .eq('is_active', true);

    if (dbError) throw dbError;

    // Use AI to plan the optimal route
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const systemPrompt = `You are an Egyptian transportation route planner. Given transport options, distance, trip type, and budget, create an optimal multi-segment route.

Rules:
- Trip types: "economic" = cheapest options, "comfortable" = balanced, "premium" = best comfort
- Filter transports by service_level matching or near the trip type
- Consider distance categories: short (0-30 min), medium (30-60 min), long (60+ min)
- Each segment needs: transport_type_id, start_name, end_name, estimated cost and duration
- Mix transport modes for optimal routes (e.g., tuk-tuk to metro station, then metro)
- Stay within or near the budget if provided
- For short trips (<5km), prefer: tuk-tuk, taxi, bus
- For medium trips (5-30km), prefer: metro, bus, monorail
- For long trips (>30km), prefer: train, long-distance bus, flight
- Provide 1-3 segments that make geographical sense
- Also provide 2-3 alternative transport options per segment

Return JSON with this exact structure:
{
  "segments": [
    {
      "transport_type_id": "uuid",
      "transport_name": "name",
      "start_name": "location name",
      "end_name": "location name", 
      "cost_egp": number,
      "duration_minutes": number,
      "alternatives": [
        { "transport_type_id": "uuid", "transport_name": "name", "cost_egp": number, "duration_minutes": number }
      ]
    }
  ],
  "total_cost_egp": number,
  "total_duration_minutes": number,
  "budget_range": { "min": number, "max": number }
}`;

    const userPrompt = `Plan a ${tripType} trip:
- Distance: ${distanceKm.toFixed(1)} km
- Budget: ${budget ? budget + ' EGP' : 'not specified'}
- Language: ${language || 'en'}

Available transport types:
${JSON.stringify(transportTypes?.map(t => ({
  id: t.id,
  name: t.name_en,
  name_ar: t.name_ar,
  speed: t.average_speed_kmh,
  base_price: t.base_price_egp,
  price_per_km: t.price_per_km_egp,
  service_level: t.service_level,
  min_dist_min: t.min_distance_minutes,
  max_dist_min: t.max_distance_minutes,
  foreigner_allowed: t.foreigner_allowed,
})), null, 2)}

Create a practical route plan.`;

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
            description: 'Create a structured trip plan with segments and alternatives',
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
                  properties: {
                    min: { type: 'number' },
                    max: { type: 'number' },
                  },
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
      // Fallback: try parsing content
      const content = aiData.choices?.[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) plan = JSON.parse(jsonMatch[0]);
      else throw new Error('Could not parse AI response');
    }

    // Enrich with transport type details
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
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
