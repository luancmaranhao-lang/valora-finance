import { useEffect, useState } from "react"
import PageHeader from "../components/PageHeader"
import { getCurrentUser } from "../services/authService"

const APP_VERSION = "1.2.0"

/**
 * @param {{ onSignOut?: () => void | Promise<void> }} props
 */
function Configuracoes({ onSignOut }) {
  const [user, setUser] = useState(null)

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

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader title="Configurações" />

      <article className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Perfil do usuário</h2>
        <p className="mt-1 text-sm text-slate-500">Informações da conta conectada ao Valora.</p>
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/90 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">E-mail</p>
          <p className="mt-1.5 text-sm font-medium text-slate-900">{user?.email ?? "Carregando…"}</p>
        </div>
      </article>

      <article className="w-full rounded-2xl border border-[#d8c08a]/45 bg-[#f8f2e3]/90 p-6 shadow-sm ring-1 ring-[#d8c08a]/15">
        <h2 className="text-base font-semibold text-[#3f3011]">Sobre o app</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">
          <span className="font-semibold text-slate-900">Valora Finance</span>, versão{" "}
          <span className="valora-num font-semibold text-slate-900">{APP_VERSION}</span>. O assistente de IA financeira está
          integrado de forma segura na aplicação; não é necessário configurar chaves de API nesta tela.
        </p>
      </article>

      {onSignOut ? (
        <div className="flex flex-col gap-3 border-t border-slate-200/80 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Encerra a sessão neste dispositivo.</p>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="w-full rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-900 shadow-sm transition hover:border-rose-300 hover:bg-rose-100 sm:w-auto sm:min-w-[11rem]"
          >
            Sair da conta
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default Configuracoes
