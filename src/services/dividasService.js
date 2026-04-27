import { criarLancamento } from "./lancamentosService"
import { supabase } from "./supabaseClient"

export const dividaStatusOptions = ["Em aberto", "Em negociação", "Atrasada", "Quitada"]

export async function listarDividas() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!user?.id) throw new Error("Sessão inválida.")

  const { data, error } = await supabase
    .from("dividas_macro")
    .select("*")
    .eq("user_id", user.id)
    .order("criado_em", { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function criarDivida({ credor, valorTotal, valorRestante, status }) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!user?.id) throw new Error("Sessão inválida.")

  const total = Number(valorTotal)
  const restante = valorRestante === undefined || valorRestante === "" ? total : Number(valorRestante)

  const { data, error } = await supabase
    .from("dividas_macro")
    .insert({
      user_id: user.id,
      credor: String(credor ?? "").trim(),
      valor_total_original: total,
      valor_restante: restante,
      status: status || "Em aberto",
    })
    .select("*")
    .single()

  if (error) throw error
  return data
}

export async function atualizarDivida(id, patch) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!user?.id) throw new Error("Sessão inválida.")

  const query = supabase.from("dividas_macro").update(patch).eq("id", id).eq("user_id", user.id)
  const { data, error } = await query.select("*").single()
  if (error) throw error
  return data
}

const debtCategory = "⚖️ Jurídico"

function todayDateLocal() {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-")
}

export async function registrarPagamentoDivida(dividaId, valorPagamento, credorLabel) {
  const amount = Number(valorPagamento)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Informe um valor de pagamento válido.")
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!user?.id) throw new Error("Sessão inválida.")

  const { data: row, error: fetchError } = await supabase
    .from("dividas_macro")
    .select("*")
    .eq("id", dividaId)
    .eq("user_id", user.id)
    .single()

  if (fetchError || !row) {
    throw new Error("Dívida não encontrada.")
  }

  const restante = Number(row.valor_restante ?? 0)
  if (restante <= 0) {
    throw new Error("Esta dívida já está quitada.")
  }

  const aplicado = Math.min(amount, restante)
  const novoRestante = Math.max(0, restante - aplicado)
  const novoStatus = novoRestante <= 0 ? "Quitada" : row.status

  await criarLancamento({
    user_id: user.id,
    tipo: "despesa",
    descricao: `Pagamento dívida macro — ${String(credorLabel ?? row.credor ?? "Credor").trim()}`,
    categoria: debtCategory,
    valor: aplicado,
    data: todayDateLocal(),
    forma_pagamento: "Dívida macro",
    recorrencia: "unica",
    status: "pago",
    visibilidade: "privado",
    metodo_divisao: null,
  })

  await atualizarDivida(dividaId, {
    valor_restante: novoRestante,
    status: novoStatus,
  })

  return { aplicado, valor_restante: novoRestante, status: novoStatus }
}
