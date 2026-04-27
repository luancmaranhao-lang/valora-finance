import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { Buffer } from "node:buffer"

export const config = {
  api: {
    bodyParser: false,
  },
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
    const env = globalThis?.process?.env ?? {}
    const stripeSecret = env.STRIPE_SECRET_KEY
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET
    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

    if (!stripeSecret || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: "Variaveis de ambiente obrigatorias ausentes." })
    }

    const stripe = new Stripe(stripeSecret)
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const signature = req.headers["stripe-signature"]
    if (!signature) {
      return res.status(400).json({ error: "Header stripe-signature ausente." })
    }

    const rawBody = await readRawBody(req)
    let event
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    } catch (error) {
      return res.status(400).json({ error: `Assinatura invalida: ${error?.message || "erro desconhecido"}` })
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object
      const customerEmail = session?.customer_details?.email
      const priceId = session?.metadata?.priceId

      let limite = 1
      if (priceId === "price_1PQ...") limite = 3
      if (priceId === "price_XYZ...") limite = 5

      if (!customerEmail) {
        return res.status(400).json({ error: "customer_details.email nao encontrado na session." })
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          is_premium: true,
          limite_acessos: limite,
          plano: "premium",
          stripe_customer_id: session.customer ? String(session.customer) : null,
          assinatura_status: "active",
        })
        .eq("email", customerEmail)

      if (error) {
        console.error("Erro ao atualizar profiles:", error)
        return res.status(500).json({ error: error.message || "Falha ao atualizar perfil premium." })
      }
    }

    return res.status(200).json({ received: true })
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erro interno no webhook." })
  }
}

