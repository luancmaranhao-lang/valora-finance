import { supabase } from "./supabaseClient"

function clampDay(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 1
  return Math.min(31, Math.max(1, Math.trunc(num)))
}

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
    .order("created_at", { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function criarCartao(cartao) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) throw authError
  if (!user?.id) throw new Error("Usuario nao autenticado.")

  // user_id é obrigatório para passar nas policies de insert (RLS).
  const payload = {
    user_id: user.id,
    nome_cartao: String(cartao.nome_cartao ?? "").trim(),
    limite_total: Number(cartao.limite_total ?? 0),
    dia_vencimento: clampDay(cartao.dia_vencimento),
    dia_fechamento: clampDay(cartao.dia_fechamento),
    cor_card: String(cartao.cor_card ?? "").trim() || null,
  }
  if (!payload.nome_cartao) throw new Error("Informe o nome do cartão.")

  const { data, error } = await supabase.from("cartoes").insert(payload).select("*").single()
  if (error) throw error
  return data
}

export async function atualizarCartao(cartaoId, cartao) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) throw authError
  if (!user?.id) throw new Error("Usuario nao autenticado.")
  if (!cartaoId) throw new Error("Cartão inválido para atualização.")

  const payload = {
    nome_cartao: String(cartao.nome_cartao ?? "").trim(),
    limite_total: Number(cartao.limite_total ?? 0),
    dia_vencimento: clampDay(cartao.dia_vencimento),
    dia_fechamento: clampDay(cartao.dia_fechamento),
    cor_card: String(cartao.cor_card ?? "").trim() || null,
  }
  if (!payload.nome_cartao) throw new Error("Informe o nome do cartão.")

  const { data, error } = await supabase
    .from("cartoes")
    .update(payload)
    .eq("id", cartaoId)
    .eq("user_id", user.id)
    .select("*")
    .single()
  if (error) throw error
  return data
}

export const createCard = criarCartao

