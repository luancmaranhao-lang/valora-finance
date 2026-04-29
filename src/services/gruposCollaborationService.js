import { supabase } from "./supabaseClient"

/**
 * Garante um grupo para o usuário (casal/família): cria grupo + vínculo como dono se necessário.
 */
export async function ensureMyCollaborationGroup(nomeGrupo = "Casal / Família") {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user?.id) {
    throw new Error("Sessão inválida.")
  }

  const { data: existing } = await supabase
    .from("membros_grupo")
    .select("grupo_id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (existing?.grupo_id) {
    return existing.grupo_id
  }

  const { data: grupo, error: grupoErr } = await supabase
    .from("grupos")
    .insert({ nome: nomeGrupo, dono_id: user.id })
    .select("id")
    .single()

  if (grupoErr) throw grupoErr

  const { error: memErr } = await supabase.from("membros_grupo").insert({
    grupo_id: grupo.id,
    user_id: user.id,
    role: "dono",
  })
  if (memErr) throw memErr

  return grupo.id
}

export async function invitePartnerByEmail(emailRaw) {
  const email = String(emailRaw ?? "")
    .trim()
    .toLowerCase()
  if (!email || !email.includes("@")) {
    throw new Error("Informe um e-mail válido.")
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user?.id) {
    throw new Error("Sessão inválida.")
  }

  const grupoId = await ensureMyCollaborationGroup()

  const { error } = await supabase.from("convites_grupo").insert({
    grupo_id: grupoId,
    email,
    convidado_por: user.id,
  })

  if (error) throw error
  return true
}

export async function listMyInvites() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user?.id) return []

  const { data: gruposQueSouDono } = await supabase.from("grupos").select("id").eq("dono_id", user.id)

  const ids = (gruposQueSouDono ?? []).map((g) => g.id).filter(Boolean)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from("convites_grupo")
    .select("id, email, criado_em, grupo_id")
    .in("grupo_id", ids)
    .order("criado_em", { ascending: false })

  if (error) return []
  return data ?? []
}
