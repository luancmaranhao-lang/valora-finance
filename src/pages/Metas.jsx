import { useEffect, useMemo, useState } from "react"
import EmptyState from "../components/EmptyState"
import PageHeader from "../components/PageHeader"
import ProgressBar from "../components/ProgressBar"
import StatusBadge from "../components/StatusBadge"
import { metasService } from "../services/metasService"

const initialForm = {
  name: "",
  target: "",
  current: "",
  deadline: "",
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function Metas() {
  const [goals, setGoals] = useState([])
  const [form, setForm] = useState(initialForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")

  async function loadMetas() {
    try {
      setIsLoading(true)
      const data = await metasService.listarMetas()
      setGoals(data ?? [])
    } catch (error) {
      setMessage(error?.message || "Nao foi possivel carregar as metas.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadMetas()
    }, 0)

    return () => clearTimeout(timer)
  }, [])

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const target = Number(form.target)
    const current = Number(form.current)
    if (!form.name || !target || !form.deadline) return

    try {
      setIsSaving(true)
      setMessage("")

      await metasService.salvarMeta({
        nome: form.name.trim(),
        valor_alvo: target,
        valor_atual: Number.isFinite(current) ? current : 0,
        prazo: form.deadline,
      })

      setForm(initialForm)
      setMessage("Meta salva com sucesso!")
      await loadMetas()
      window.dispatchEvent(new Event("metas:updated"))
    } catch (error) {
      setMessage(error?.message || "Nao foi possivel salvar a meta.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemove(goalId) {
    try {
      setMessage("")
      await metasService.removerMeta(goalId)
      setMessage("Meta removida com sucesso!")
      await loadMetas()
      window.dispatchEvent(new Event("metas:updated"))
    } catch (error) {
      setMessage(error?.message || "Nao foi possivel remover a meta.")
    }
  }

  const enrichedGoals = useMemo(() => {
    const today = new Date()
    return goals.map((goal) => {
      const current = Number(goal.current ?? goal.valor_atual ?? goal.currentValue ?? 0)
      const target = Number(goal.target ?? goal.valor_alvo ?? goal.targetValue ?? 0)
      const deadline = goal.deadline ?? goal.prazo ?? ""
      const progress = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0
      const isConcluded = progress >= 100
      const isLate = !isConcluded && deadline ? new Date(deadline) < today : false
      const status = isConcluded ? "Concluida" : isLate ? "Atrasada" : "Em andamento"
      return {
        ...goal,
        name: goal.name ?? goal.nome ?? "Meta",
        current,
        target,
        deadline,
        progress,
        status,
      }
    })
  }, [goals])

  return (
    <div className="space-y-6">
      <PageHeader title="Metas" subtitle="Planeje objetivos financeiros e acompanhe sua evolucao mensal." />

      {message ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">{message}</div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Nova meta</h2>
        <form className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleSubmit}>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Nome da meta"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
          />
          <input
            name="target"
            type="number"
            min="0"
            value={form.target}
            onChange={handleChange}
            placeholder="Valor alvo"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
          />
          <input
            name="current"
            type="number"
            min="0"
            value={form.current}
            onChange={handleChange}
            placeholder="Valor atual"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
          />
          <input
            name="deadline"
            type="date"
            value={form.deadline}
            onChange={handleChange}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
          />
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800 md:col-span-2 xl:col-span-4"
          >
            {isSaving ? "Salvando..." : "Adicionar meta"}
          </button>
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            Carregando metas...
          </div>
        ) : null}
        {!isLoading && enrichedGoals.length === 0 ? (
          <EmptyState
            title="Nenhuma meta cadastrada"
            description="Adicione uma meta para acompanhar seu progresso financeiro."
          />
        ) : !isLoading ? (
          enrichedGoals.map((goal) => (
          <article key={goal.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{goal.name}</h3>
                <p className="text-xs text-slate-500">Prazo: {goal.deadline}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge
                  label={goal.status}
                  tone={goal.status === "Concluida" ? "success" : goal.status === "Atrasada" ? "danger" : "info"}
                />
                <button
                  type="button"
                  onClick={() => void handleRemove(goal.id)}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition-all hover:bg-rose-100"
                >
                  Excluir
                </button>
              </div>
            </div>

            <div className="space-y-1 text-sm text-slate-600">
              <p className="flex items-center justify-between">
                <span>Atual</span>
                <span className="font-semibold text-slate-900">{formatCurrency(goal.current)}</span>
              </p>
              <p className="flex items-center justify-between">
                <span>Alvo</span>
                <span className="font-semibold text-slate-900">{formatCurrency(goal.target)}</span>
              </p>
            </div>

            <div className="mt-3">
              <ProgressBar value={goal.current} max={goal.target} label="Progresso" tone="bg-emerald-500" />
            </div>
          </article>
          ))
        ) : null}
      </section>
    </div>
  )
}

export default Metas

