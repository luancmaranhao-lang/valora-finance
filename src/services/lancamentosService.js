import { supabase } from "./supabaseClient"

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
  const { data, error } = await supabase.from("lancamentos").insert(lancamento).select("*").single()

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

  let query = supabase.from("lancamentos").update(lancamento).eq("id", id)

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

