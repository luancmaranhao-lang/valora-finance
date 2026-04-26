import Stripe from "stripe"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const { userId, email } = req.body ?? {}
    if (!userId || !email) {
      return res.status(400).json({ error: "userId e email sao obrigatorios." })
    }

    const env = globalThis?.process?.env ?? {}
    const secretKey = env.STRIPE_SECRET_KEY
    const priceId = env.STRIPE_PRICE_ID
    const baseUrlCandidate = env.APP_URL || env.VERCEL_URL || "http://localhost:5173"

    if (!secretKey || !priceId) {
      return res.status(500).json({ error: "Variaveis STRIPE_SECRET_KEY/STRIPE_PRICE_ID nao configuradas." })
    }

    const normalizedBaseUrl = baseUrlCandidate.startsWith("http")
      ? baseUrlCandidate
      : `https://${baseUrlCandidate}`
    let appUrl = "http://localhost:5173"

    try {
      appUrl = new URL(normalizedBaseUrl).origin
    } catch (urlError) {
      console.error("URL base invalida para checkout, usando fallback local.", {
        baseUrlCandidate,
        normalizedBaseUrl,
        error: urlError?.message,
      })
    }

    if (!priceId.startsWith("price_")) {
      console.error("STRIPE_PRICE_ID invalido.", { priceId })
      return res.status(500).json({ error: "STRIPE_PRICE_ID invalido. Verifique variavel de ambiente." })
    }

    const stripe = new Stripe(secretKey)

    let session
    try {
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        success_url: `${appUrl}/?checkout=success`,
        cancel_url: `${appUrl}/?checkout=cancel`,
        customer_email: email,
        client_reference_id: userId,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { user_id: userId },
      })
    } catch (stripeError) {
      console.error("Erro Stripe ao criar Checkout Session.", {
        message: stripeError?.message,
        type: stripeError?.type,
        code: stripeError?.code,
        userId,
        email,
        priceId,
        appUrl,
      })
      return res.status(500).json({ error: stripeError?.message || "Falha ao criar Checkout Session." })
    }

    return res.status(200).json({ url: session.url, id: session.id })
  } catch (error) {
    console.error("Erro inesperado em /api/create-checkout-session.", {
      message: error?.message,
      stack: error?.stack,
      body: req.body ?? null,
    })
    return res.status(500).json({ error: error?.message || "Erro inesperado ao criar checkout." })
  }
}

