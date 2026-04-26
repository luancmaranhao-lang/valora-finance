import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { Buffer } from "node:buffer"

export const config = {
  api: {
    bodyParser: false,
  },
}

function getEnv() {
  return globalThis?.process?.env ?? {}
}

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const env = getEnv()
    const stripeSecretKey = env.STRIPE_SECRET_KEY
    const stripeWebhookSecret = env.STRIPE_WEBHOOK_SECRET
    const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL
    const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

    if (!stripeSecretKey || !stripeWebhookSecret) {
      return res.status(500).json({ error: "STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET sao obrigatorias." })
    }

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return res.status(500).json({ error: "SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorias." })
    }

    const stripe = new Stripe(stripeSecretKey)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const signature = req.headers["stripe-signature"]
    if (!signature) {
      return res.status(400).json({ error: "Assinatura stripe-signature ausente." })
    }

    const rawBody = await readRawBody(req)
    let event

    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret)
    } catch (error) {
      return res.status(400).json({ error: `Assinatura invalida: ${error?.message || "erro desconhecido"}` })
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object
      const userId = session?.client_reference_id || session?.metadata?.user_id

      if (!userId) {
        return res.status(400).json({ error: "user_id nao encontrado em client_reference_id ou metadata." })
      }

      const updatePayload = {
        plano: "premium",
      }

      if (session?.customer) {
        updatePayload.stripe_customer_id = String(session.customer)
      }

      const { error: updateError } = await supabaseAdmin.from("profiles").update(updatePayload).eq("id", userId)

      if (updateError) {
        return res.status(500).json({ error: updateError.message || "Falha ao atualizar plano no Supabase." })
      }
    }

    return res.status(200).json({ received: true })
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erro interno no webhook." })
  }
}

