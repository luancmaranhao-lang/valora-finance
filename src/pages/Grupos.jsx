import { useEffect, useState } from "react"
import EmptyState from "../components/EmptyState"
import PageHeader from "../components/PageHeader"
import { invitePartnerByEmail, listMyInvites } from "../services/gruposCollaborationService"

function Grupos() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [invites, setInvites] = useState([])
  const [loadingInvites, setLoadingInvites] = useState(true)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function refreshInvites() {
    try {
      const rows = await listMyInvites()
      setInvites(rows ?? [])
    } catch {
      setInvites([])
    } finally {
      setLoadingInvites(false)
    }
  }

  useEffect(() => {
    void refreshInvites()
  }, [])

  async function handleInvite(event) {
    event.preventDefault()
    try {
      setLoading(true)
      setError("")
      setMessage("")
      await invitePartnerByEmail(email)
      setEmail("")
      setMessage("Convite registrado para o grupo (pendente até o parceiro criar conta com este e-mail).")
      await refreshInvites()
    } catch (err) {
      setError(err?.message ?? "Erro ao convidar. Execute sql/perfil_prefs_convites.sql e esteja como dono do grupo.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grupos"
        subtitle="Casais e familias — convites por e-mail ficam ligados ao seu grupo principal."
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Convidar parceiro pelo e-mail</h2>
        <p className="mt-2 text-sm text-slate-600">
          Registra um pedido na tabela <code className="rounded bg-slate-100 px-1 text-xs">convites_grupo</code>. É preciso ter grupo (ativo ao escolher Casal / Família ou Grupo nas Configurações).
        </p>

        <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleInvite}>
          <label className="flex-1 space-y-1.5">
            <span className="text-sm font-medium text-slate-700">E-mail</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="parceiro@email.com"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="min-h-11 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Enviando..." : "Registrar convite"}
          </button>
        </form>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}
        {message ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Convites registrados</h2>
        {loadingInvites ? (
          <EmptyState title="Carregando" description="..." />
        ) : invites.length === 0 ? (
          <EmptyState title="Nenhum convite ainda" description="Use o formulário acima quando estiver como dono do grupo." />
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                <span className="font-medium text-slate-900">{inv.email}</span>
                <span className="text-xs text-slate-500">{new Date(inv.criado_em).toLocaleString("pt-BR")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default Grupos
