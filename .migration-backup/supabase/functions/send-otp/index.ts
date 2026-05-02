const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

const BodySchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
})

const getTwilioErrorMessage = (message?: string) => {
  const normalizedMessage = message?.toLowerCase() || ''

  if (normalizedMessage.includes('trial accounts cannot send messages to unverified numbers')) {
    return 'This Twilio account is in trial mode; verify this exact phone number inside the same Twilio account or upgrade the account.'
  }

  if (normalizedMessage.includes('invalid parameter `to`')) {
    return 'Invalid phone number format. Choose the correct country code and enter the number without the leading 0.'
  }

  return message || 'Failed to send OTP'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid phone number format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { phone } = parsed.data
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const serviceSid = Deno.env.get('TWILIO_VERIFY_SERVICE_SID')

    if (!accountSid || !authToken || !serviceSid) {
      return new Response(JSON.stringify({ error: 'Twilio is not configured correctly' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone,
          Channel: 'sms',
        }),
      }
    )

    const data = await response.json()
    if (!response.ok) {
      return new Response(JSON.stringify({ error: getTwilioErrorMessage(data.message) }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, sid: data.sid }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
