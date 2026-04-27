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

    const payload = {
      id: meta.id,
      nome: meta.nome ?? meta.name ?? "Meta",
      valor_alvo: Number(meta.valor_alvo ?? meta.target ?? 0),
      valor_atual: Number(meta.valor_atual ?? meta.current ?? 0),
      prazo: meta.prazo ?? meta.deadline ?? null,
      user_id: user.id,
    }
    if (!payload.id) delete payload.id

    const { data, error } = await supabase
      .from("metas")
      .upsert(payload)
      .select()

    if (error) throw error
    return data?.[0]
  },

  async removerMeta(metaId) {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) throw userError
    if (!user?.id) throw new Error("Usuario nao autenticado.")

    const { error } = await supabase.from("metas").delete().eq("id", metaId).eq("user_id", user.id)
    if (error) throw error
  },
}

