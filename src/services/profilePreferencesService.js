import { supabase } from "./supabaseClient"

/** @typedef {{ modo_contexto?: string, gemini_api_key?: string | null }} ProfilePrefsPatch */

export async function fetchMyProfilePrefs() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user?.id) return { modo_contexto: "individual", gemini_api_key: null }

  const { data, error } = await supabase
    .from("profiles")
    .select("modo_contexto, gemini_api_key")
    .eq("id", user.id)
    .maybeSingle()

  if (error) {
    return { modo_contexto: "individual", gemini_api_key: null }
  }

  return {
    modo_contexto: data?.modo_contexto ?? "individual",
    gemini_api_key: data?.gemini_api_key ?? null,
  }
}

export async function updateMyProfilePrefs(/** @type {ProfilePrefsPatch} */ patch) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user?.id) {
    throw new Error("Sessão inválida.")
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id)
    .select("modo_contexto, gemini_api_key")
    .maybeSingle()

  if (error) {
    throw error
  }
  return data
}
