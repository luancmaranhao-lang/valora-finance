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

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
      mode: "subscription",
      customer_email: customerEmail,
      client_reference_id: userId || undefined,
      metadata: {
        priceId: env.STRIPE_PRICE_ID,
        user_id: userId || "",
      },
      success_url: `${req.headers.origin}/?success=true`,
      cancel_url: `${req.headers.origin}/?cancel=true`,
    })

    return res.status(200).json({ id: session.id, url: session.url })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

