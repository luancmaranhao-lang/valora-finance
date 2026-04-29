export const STORAGE_GEMINI_KEY = "valora_gemini_api_key"

/**
 * Chave injetada no build pelo Vite (`VITE_GEMINI_API_KEY` no `.env`).
 * Exige reiniciar `npm run dev` após alterar o arquivo.
 * @returns {string}
 */
export function getViteGeminiKey() {
  const v = import.meta.env?.VITE_GEMINI_API_KEY
  return typeof v === "string" && v.length > 0 ? v.trim() : ""
}

/**
 * Ordem: variável de ambiente Vite → localStorage (backup) → vazio.
 * Preferências do perfil Supabase são resolvidas de forma assíncrona no componente.
 * @returns {string}
 */
export function resolveGeminiKeySync() {
  const fromEnv = getViteGeminiKey()
  if (fromEnv) return fromEnv
  if (typeof window !== "undefined") {
    const fromLs = window.localStorage.getItem(STORAGE_GEMINI_KEY)
    if (fromLs) return fromLs.trim()
  }
  return ""
}
