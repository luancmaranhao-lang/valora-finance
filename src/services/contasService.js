import { supabase } from "./supabaseClient"

export async function listarContas() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    throw authError
  }

  let query = supabase.from("contas_pagar").select("*")

  if (user?.id) {
    query = query.eq("user_id", user.id)
  }

  const { data, error } = await query.order("vencimento", { ascending: true })

  if (error) {
    throw error
  }

  return data
}

export async function criarConta(conta) {
  const { data, error } = await supabase.from("contas_pagar").insert(conta).select("*").single()

  if (error) {
    throw error
  }

  return data
}

export async function atualizarConta(id, conta) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    throw authError
  }

  let query = supabase.from("contas_pagar").update(conta).eq("id", id)

  if (user?.id) {
    query = query.eq("user_id", user.id)
  }

  const { data, error } = await query.select("*").single()

  if (error) {
    throw error
  }

  return data
}

export async function removerConta(id) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    throw authError
  }

  let query = supabase.from("contas_pagar").delete().eq("id", id)

  if (user?.id) {
    query = query.eq("user_id", user.id)
  }

  const { error } = await query

  if (error) {
    throw error
  }

  return true
}

