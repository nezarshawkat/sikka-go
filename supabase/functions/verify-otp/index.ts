import { corsHeaders } from '@supabase/supabase-js/cors'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

const BodySchema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().length(6),
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid input' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { phone, code } = parsed.data
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!
    const serviceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID')!

    // Verify OTP with Twilio
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone,
          Code: code,
        }),
      }
    )

    const data = await response.json()
    if (!response.ok || data.status !== 'approved') {
      return new Response(JSON.stringify({ error: 'Invalid or expired code' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // OTP verified - sign in/up user via Supabase Admin
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Check if user exists by phone
    const { data: users } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = users?.users?.find(u => u.phone === phone)

    let session
    if (existingUser) {
      // Generate a magic link / session for existing user
      const { data: tokenData, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: `phone_${phone.replace(/\+/g, '')}@sikka.app`,
      })
      if (error) throw error
      
      // Sign in directly
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.admin.updateUserById(
        existingUser.id,
        { phone_confirm: true }
      )
      if (signInError) throw signInError

      // Generate session token
      const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: existingUser.email || `phone_${phone.replace(/\+/g, '')}@sikka.app`,
      })
      
      return new Response(JSON.stringify({ 
        success: true, 
        user_id: existingUser.id,
        is_new: false,
        token_hash: sessionData?.properties?.hashed_token,
        verification_url: sessionData?.properties?.action_link,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else {
      // Create new user
      const email = `phone_${phone.replace(/\+/g, '')}@sikka.app`
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        phone,
        phone_confirm: true,
        email,
        email_confirm: true,
        password: crypto.randomUUID(), // random password, user logs in via OTP
      })
      if (createError) throw createError

      const { data: sessionData } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
      })

      return new Response(JSON.stringify({ 
        success: true, 
        user_id: newUser.user.id,
        is_new: true,
        token_hash: sessionData?.properties?.hashed_token,
        verification_url: sessionData?.properties?.action_link,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
