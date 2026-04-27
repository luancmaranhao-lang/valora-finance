import { supabase } from "./supabaseClient"

function normalizeLancamentoPayload(lancamento = {}) {
  const payload = { ...lancamento }

  if ("recorrencia" in payload && payload.recorrencia == null) {
    payload.recorrencia = "unica"
  }

  if ("dia_vencimento" in payload) {
    payload.dia_vencimento =
      payload.dia_vencimento === null || payload.dia_vencimento === undefined || payload.dia_vencimento === ""
        ? null
        : Number(payload.dia_vencimento)
  }

  return payload
}

export async function listarLancamentos() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    throw authError
  }

  let query = supabase.from("lancamentos").select("*")

  if (user?.id) {
    query = query.eq("user_id", user.id)
  }

  const { data, error } = await query.order("data", { ascending: false }).order("criado_em", { ascending: false })

  if (error) {
    throw error
  }

  return data
}

export async function criarLancamento(lancamento) {
  const payload = normalizeLancamentoPayload(lancamento)
  const { data, error } = await supabase.from("lancamentos").insert(payload).select("*").single()

  if (error) {
    throw error
  }

  return data
}

export async function importarLancamentosAutomaticos(lancamentos) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    throw authError
  }
  if (!user?.id) {
    throw new Error("Usuario nao autenticado.")
  }

  const normalized = (lancamentos ?? []).map((item) => ({
    ...item,
    user_id: user.id,
    fonte: "automatico",
    status_conciliacao: "pendente_revisao",
    visibilidade: "privado",
  }))

  if (normalized.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from("lancamentos")
    .upsert(normalized, { onConflict: "user_id,external_id", ignoreDuplicates: false })
    .select("*")

  if (error) {
    throw error
  }

  return data
}

export async function revisarLancamentoConciliacao(id, { visibilidade, aprovado = true }) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    throw authError
  }

  let query = supabase
    .from("lancamentos")
    .update({
      visibilidade: visibilidade ?? "privado",
      status_conciliacao: aprovado ? "aprovado" : "pendente_revisao",
    })
    .eq("id", id)

  if (user?.id) {
    query = query.eq("user_id", user.id)
  }

  const { data, error } = await query.select("*").single()

  if (error) {
    throw error
  }

  return data
}

export async function atualizarLancamento(id, lancamento) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    throw authError
  }

  const payload = normalizeLancamentoPayload(lancamento)
  let query = supabase.from("lancamentos").update(payload).eq("id", id)

  if (user?.id) {
    query = query.eq("user_id", user.id)
  }

  const { data, error } = await query.select("*").single()

  if (error) {
    throw error
  }

  return data
}

export async function removerLancamento(id) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    throw authError
  }

  let query = supabase.from("lancamentos").delete().eq("id", id)

  if (user?.id) {
    query = query.eq("user_id", user.id)
  }

  const { error } = await query

  if (error) {
    throw error
  }

  return true
}

