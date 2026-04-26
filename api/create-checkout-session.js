const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

export default async function handler(req, res) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error("Chave sk_ faltando")

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      mode: "subscription",
      success_url: `${req.headers.origin}/?success=true`,
      cancel_url: `${req.headers.origin}/?cancel=true`,
    })

    return res.status(200).json({ id: session.id })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

