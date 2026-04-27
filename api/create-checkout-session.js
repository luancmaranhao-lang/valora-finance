import Stripe from "stripe"

export default async function handler(req, res) {
  try {
    const env = globalThis?.process?.env ?? {}
    if (!env.STRIPE_SECRET_KEY) throw new Error("Chave sk_ faltando")
    if (!env.STRIPE_PRICE_ID) throw new Error("STRIPE_PRICE_ID faltando")
    const stripe = new Stripe(env.STRIPE_SECRET_KEY)

    const { userEmail, email, userId } = req.body ?? {}
    const customerEmail = userEmail || email
    if (!customerEmail) throw new Error("Email do usuario faltando")
    const priceId = env.STRIPE_PRICE_ID

    const session = await stripe.checkout.sessions.create({
      customer_email: customerEmail,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      allow_promotion_codes: true,
      client_reference_id: userId || undefined,
      success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/`,
      metadata: {
        userId: userId || "",
        user_id: userId || "",
        priceId: priceId,
      },
    })

    return res.status(200).json({ id: session.id, url: session.url })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

