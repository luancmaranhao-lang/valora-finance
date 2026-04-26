import { useEffect, useState } from "react"
import GroupPrivacyPanel from "../components/GroupPrivacyPanel"
import PageHeader from "../components/PageHeader"
import PlanningAlertCard from "../components/PlanningAlertCard"
import { getCurrentUser } from "../services/authService"

function Configuracoes() {
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
    <div className="space-y-6">
      <PageHeader
        title="Configuracoes"
        subtitle="Gerencie como suas financas sao organizadas e compartilhadas."
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
              <div className="mt-1 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-900 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                  Individual
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  Casal
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  Familia
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  Grupo
                </span>
              </div>
            </div>
          </div>
        </article>

        <PlanningAlertCard />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <GroupPrivacyPanel />
        </div>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Em breve: grupos financeiros reais</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Estamos preparando convites por email, permissao por membro e consolidacao automatica por grupo.
            Esta evolucao vai permitir relatorios colaborativos completos com governanca de privacidade.
          </p>
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Roadmap MVP+</p>
            <p className="mt-1 text-sm text-blue-800">Convidar membros, definir papeis e ativar compartilhamento seletivo.</p>
          </div>
        </article>
      </section>
    </div>
  )
}

export default Configuracoes

