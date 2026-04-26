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
    const appUrl = env.APP_URL || "http://localhost:5173"

    if (!secretKey || !priceId) {
      return res.status(500).json({ error: "Variaveis STRIPE_SECRET_KEY/STRIPE_PRICE_ID nao configuradas." })
    }

    const params = new URLSearchParams()
    params.append("mode", "subscription")
    params.append("success_url", `${appUrl}/?checkout=success`)
    params.append("cancel_url", `${appUrl}/?checkout=cancel`)
    params.append("customer_email", email)
    params.append("line_items[0][price]", priceId)
    params.append("line_items[0][quantity]", "1")
    params.append("metadata[user_id]", userId)

    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    })

    const stripeData = await stripeResponse.json()
    if (!stripeResponse.ok) {
      return res.status(500).json({ error: stripeData?.error?.message || "Falha ao criar Checkout Session." })
    }

    return res.status(200).json({ url: stripeData.url, id: stripeData.id })
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Erro inesperado ao criar checkout." })
  }
}

