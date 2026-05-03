import { supabase } from "./supabaseClient"

const TABLE = "mensagens_mentor"

function startOfLocalDayIso() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Conta mensagens role=user criadas hoje (dia local) — cada envio bem-sucedido grava 1 linha user.
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function countMentorConsultasUsuarioHoje(userId) {
  if (!userId) return 0
  try {
    const { count, error } = await supabase
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user")
      .gte("created_at", startOfLocalDayIso())

    if (error) {
      console.warn("[mentorMensagens] count consultas:", error.message)
      return 0
    }
    return count ?? 0
  } catch (e) {
    console.warn("[mentorMensagens] count consultas exceção:", e)
    return 0
  }
}

/**
 * @param {string} userId
 * @param {string | null} competencia YYYY-MM
 * @param {string} userText
 * @param {string} assistantText
 */
export async function appendMentorExchange(userId, competencia, userText, assistantText) {
  if (!userId) return
  const comp = competencia && /^\d{4}-\d{2}$/.test(competencia) ? competencia : null
  const rows = [
    { user_id: userId, role: "user", content: String(userText ?? "").slice(0, 12000), competencia: comp },
    { user_id: userId, role: "assistant", content: String(assistantText ?? "").slice(0, 12000), competencia: comp },
  ]
  try {
    const { error } = await supabase.from(TABLE).insert(rows)
    if (error) console.warn("[mentorMensagens] insert exchange:", error.message)
  } catch (e) {
    console.warn("[mentorMensagens] insert exchange exceção:", e)
  }
}

/**
 * Remove todo o histórico do mentor para o utilizador (Supabase).
 * @param {string} userId
 */
export async function limparMensagensMentor(userId) {
  if (!userId) throw new Error("Sessão inválida.")
  const { error } = await supabase.from(TABLE).delete().eq("user_id", userId)
  if (error) throw error
}
