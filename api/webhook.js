import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export const config = {
  api: {
    bodyParser: false, // Necessário para o Stripe validar a assinatura
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks);

  let event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId || session.metadata?.user_id;
    const priceId = session.metadata?.priceId;

    // 🎯 A MÁGICA ACONTECE AQUI:
    // O código compara o ID do que foi pago com as variáveis da Vercel
    let limite = 1;

    if (priceId === process.env.STRIPE_PRICE_ID_PLUS) {
      limite = 2;
    } else if (priceId === process.env.STRIPE_PRICE_ID_PREMIUM) {
      limite = 3;
    } else if (priceId === process.env.STRIPE_PRICE_ID_ELITE) {
      limite = 5;
    } else {
      limite = 1; // Padrão para o Start
    }

    if (!userId) {
      console.error("Webhook sem userId nos metadados:", session?.id);
      return res.status(400).json({ error: "userId nao encontrado no metadata." });
    }

    // 💾 Atualiza o banco de dados (tabela profiles)
    const { error } = await supabase
      .from('profiles')
      .update({ 
        is_premium: true, 
        limite_acessos: limite,
        plano: 'premium',
        assinatura_status: 'active',
        stripe_customer_id: session.customer 
      })
      .eq('id', userId);

    if (error) console.error("Erro no Supabase:", error);
  }

  res.json({ received: true });
}
