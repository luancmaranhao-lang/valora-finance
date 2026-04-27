import { supabase } from "./supabaseClient"

export const metasService = {
  async listarMetas() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) throw userError
    if (!user?.id) return []

    const { data, error } = await supabase
      .from("metas")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })

    if (error) throw error
    return data
  },

  async salvarMeta(meta) {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) throw userError
    if (!user?.id) throw new Error("Usuario nao autenticado.")

    const { data, error } = await supabase
      .from("metas")
      .upsert({ ...meta, user_id: user.id })
      .select()

    if (error) throw error
    return data?.[0]
  },
}

