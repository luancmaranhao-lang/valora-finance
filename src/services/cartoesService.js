import { supabase } from "./supabaseClient"

export async function listarCartoes() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) throw authError
  if (!user?.id) return []

  const { data, error } = await supabase
    .from("cartoes")
    .select("*")
    .eq("user_id", user.id)
    .order("criado_em", { ascending: false })

  if (error) throw error
  return data
}

export async function criarCartao(cartao) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) throw authError
  if (!user?.id) throw new Error("Usuario nao autenticado.")

  const payload = {
    user_id: user.id,
    nome: String(cartao.nome ?? "").trim(),
    bandeira: String(cartao.bandeira ?? "").trim(),
    limite_total: Number(cartao.limite_total ?? 0),
    dia_vencimento: Number(cartao.dia_vencimento ?? 1),
    dia_fechamento: Number(cartao.dia_fechamento ?? 1),
  }

  const { data, error } = await supabase.from("cartoes").insert(payload).select("*").single()
  if (error) throw error
  return data
}

