import { useEffect, useState } from "react"
import GroupPrivacyPanel from "../components/GroupPrivacyPanel"
import PageHeader from "../components/PageHeader"
import PlanningAlertCard from "../components/PlanningAlertCard"
import { getViteGeminiKey, STORAGE_GEMINI_KEY } from "../constants/geminiStorage"
import { fetchMyProfilePrefs, updateMyProfilePrefs } from "../services/profilePreferencesService"
import { getCurrentUser } from "../services/authService"

function Configuracoes() {
  const [user, setUser] = useState(null)
  const [geminiInput, setGeminiInput] = useState("")
  const [prefsLoading, setPrefsLoading] = useState(true)
  const [geminiSaving, setGeminiSaving] = useState(false)
  const [geminiMsg, setGeminiMsg] = useState("")
  const [geminiConfigured, setGeminiConfigured] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      async function loadUser() {
        try {
          const currentUser = await getCurrentUser()
          setUser(currentUser)
        } catch {
          setUser(null)
        }
      }
      void loadUser()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadGeminiPref() {
      try {
        const prefs = await fetchMyProfilePrefs()
        const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_GEMINI_KEY) : ""
        const envKey = getViteGeminiKey()
        const hasKey = Boolean(prefs?.gemini_api_key || stored || envKey)
        if (!cancelled) {
          setGeminiConfigured(hasKey)
          setGeminiInput("")
        }
      } catch {
        const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_GEMINI_KEY) : ""
        if (!cancelled) {
          setGeminiConfigured(Boolean(stored))
          setGeminiInput("")
        }
      } finally {
        if (!cancelled) setPrefsLoading(false)
      }
    }
    void loadGeminiPref()
    return () => {
      cancelled = true
    }
  }, [])

  async function saveGeminiKey(event) {
    event.preventDefault()
    const trimmed = geminiInput.trim()
    try {
      setGeminiSaving(true)
      setGeminiMsg("")
      await updateMyProfilePrefs({ gemini_api_key: trimmed || null })
      if (typeof window !== "undefined") {
        if (trimmed) {
          window.localStorage.setItem(STORAGE_GEMINI_KEY, trimmed)
        } else {
          window.localStorage.removeItem(STORAGE_GEMINI_KEY)
        }
      }
      setGeminiInput("")
      setGeminiConfigured(Boolean(trimmed))
      setGeminiMsg(trimmed ? "Chave salva no perfil (e backup local)." : "Chave removida do perfil.")
    } catch (error) {
      setGeminiMsg(error?.message ?? "Não foi possível salvar. Verifique o Supabase e a policy de update em profiles.")
    } finally {
      setGeminiSaving(false)
    }
  }

  async function clearGeminiKey() {
    try {
      setGeminiSaving(true)
      setGeminiMsg("")
      await updateMyProfilePrefs({ gemini_api_key: null })
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(STORAGE_GEMINI_KEY)
      }
      setGeminiInput("")
      setGeminiConfigured(false)
      setGeminiMsg("Chave removida do perfil e do armazenamento local.")
    } catch (error) {
      setGeminiMsg(error?.message ?? "Não foi possível remover.")
    } finally {
      setGeminiSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuracoes"
        subtitle="Privacidade, modo colaborativo e chave da IA (Gemini) centralizados aqui — o dashboard fica só para numeros."
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">Perfil do usuario</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Email</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{user?.email ?? "Nao identificado"}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Modo de uso</p>
              <p className="mt-1 text-sm text-slate-600">Defina abaixo em Modo colaborativo (perfil + grupo).</p>
            </div>
          </div>
        </article>

        <PlanningAlertCard />
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 shadow-sm">
        <h2 className="text-base font-semibold text-amber-900">IA Financeira — chave Gemini</h2>
        <p className="mt-2 text-sm text-amber-950/90">
          O app lê <code className="rounded bg-white/80 px-1">import.meta.env.VITE_GEMINI_API_KEY</code> (arquivo{" "}
          <code className="rounded bg-white/80 px-1">.env</code> na raiz) e, em seguida, a chave que você salvar abaixo no
          perfil Supabase e o backup no navegador. Prioridade na hora de chamar a API: variável de ambiente → backup local →
          perfil.
        </p>
        {getViteGeminiKey() ? (
          <p className="mt-2 rounded-lg border border-emerald-300/80 bg-emerald-50/90 px-3 py-2 text-sm text-emerald-900">
            <strong>Chave ativa via .env</strong> (VITE_GEMINI_API_KEY). Reinicie o <code className="text-xs">npm run dev</code> após
            alterar o arquivo.
          </p>
        ) : null}
        {prefsLoading ? (
          <p className="mt-3 text-sm text-amber-800">Carregando preferências...</p>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={saveGeminiKey}>
            {geminiConfigured ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Uma chave já está configurada (perfil, backup local ou variável de ambiente). Digite abaixo apenas para substituir.
              </p>
            ) : null}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-800">Chave API (Gemini)</span>
              <input
                type="password"
                autoComplete="off"
                value={geminiInput}
                onChange={(e) => setGeminiInput(e.target.value)}
                placeholder="Cole a chave (AIza...)"
                className="w-full max-w-lg rounded-xl border border-amber-300/80 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={geminiSaving}
                className="rounded-xl bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-900 disabled:opacity-60"
              >
                {geminiSaving ? "Salvando..." : "Salvar chave no perfil"}
              </button>
              <button
                type="button"
                onClick={() => void clearGeminiKey()}
                className="rounded-xl border border-amber-600 bg-white px-4 py-2.5 text-sm font-semibold text-amber-900"
              >
                Remover chave
              </button>
            </div>
            {geminiMsg ? <p className="text-sm text-amber-900">{geminiMsg}</p> : null}
          </form>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <GroupPrivacyPanel compactFootnote="Essas regras guiam o compartilhamento; a edicao fina continua em cada lancamento." />
        </div>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Dica</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Convidar o parceiro pelo e-mail fica na pagina Grupos. Execute o SQL de convites (em <code className="text-xs">sql/perfil_prefs_convites.sql</code>)
            se ainda nao criou as tabelas/colunas.
          </p>
        </article>
      </section>
    </div>
  )
}

export default Configuracoes
