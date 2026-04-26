import { supabase } from "./supabaseClient"

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  return data.user
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    throw error
  }

  return data.user
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    throw error
  }

  return data.user
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw error
  }
}

export async function createGroupAndInvite({ groupName, inviteEmail }) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) {
    throw userError
  }
  if (!user?.id) {
    throw new Error("Usuario nao autenticado.")
  }
  if (!groupName?.trim()) {
    throw new Error("Nome do grupo e obrigatorio.")
  }

  const { data: group, error: groupError } = await supabase
    .from("grupos")
    .insert({ nome: groupName.trim(), dono_id: user.id })
    .select("*")
    .single()

  if (groupError) {
    throw groupError
  }

  const membersToInsert = [{ grupo_id: group.id, user_id: user.id, role: "dono" }]

  if (inviteEmail?.trim()) {
    const { data: inviteeProfile, error: inviteeError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", inviteEmail.trim().toLowerCase())
      .maybeSingle()

    if (inviteeError) {
      throw inviteeError
    }

    if (!inviteeProfile?.id) {
      throw new Error("Usuario convidado nao encontrado. Crie a conta antes de adicionar ao grupo.")
    }

    membersToInsert.push({ grupo_id: group.id, user_id: inviteeProfile.id, role: "membro" })
  }

  const { error: membersError } = await supabase.from("membros_grupo").insert(membersToInsert)

  if (membersError) {
    throw membersError
  }

  return group
}

