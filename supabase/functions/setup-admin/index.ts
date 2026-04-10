const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { secret } = await req.json()
    if (secret !== 'sikka-setup-2024') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const email = 'admin@sikka.admin'
    const password = 'Sikka@Admin2024!'

    // Try to create admin user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createError && !createError.message.includes('already')) {
      throw createError
    }

    const userId = newUser?.user?.id
    if (userId) {
      // Add admin role
      await supabaseAdmin.from('user_roles').upsert({
        user_id: userId,
        role: 'admin',
      }, { onConflict: 'user_id,role' })

      // Create profile
      await supabaseAdmin.from('profiles').upsert({
        user_id: userId,
        display_name: 'Admin',
        language: 'en',
        nationality: 'egyptian',
      }, { onConflict: 'user_id' })
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Admin created. Username: admin, Password: Sikka@Admin2024!' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
