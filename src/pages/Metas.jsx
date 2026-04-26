import { useMemo, useState } from "react"
import EmptyState from "../components/EmptyState"
import PageHeader from "../components/PageHeader"
import ProgressBar from "../components/ProgressBar"
import StatusBadge from "../components/StatusBadge"

const initialGoals = [
  { id: "g1", name: "Reserva de emergencia", target: 30000, current: 14500, deadline: "2026-12-31" },
  { id: "g2", name: "Viagem em familia", target: 9000, current: 6200, deadline: "2026-08-30" },
]

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
  const [goals, setGoals] = useState(initialGoals)
  const [form, setForm] = useState(initialForm)

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    const target = Number(form.target)
    const current = Number(form.current)
    if (!form.name || !target || !form.deadline) return

    setGoals((prev) => [
      {
        id: crypto.randomUUID(),
        name: form.name.trim(),
        target,
        current: Number.isFinite(current) ? current : 0,
        deadline: form.deadline,
      },
      ...prev,
    ])
    setForm(initialForm)
  }

  const enrichedGoals = useMemo(() => {
    const today = new Date()
    return goals.map((goal) => {
      const progress = Math.min(Math.round((goal.current / goal.target) * 100), 100)
      const isConcluded = progress >= 100
      const isLate = !isConcluded && new Date(goal.deadline) < today
      const status = isConcluded ? "Concluida" : isLate ? "Atrasada" : "Em andamento"
      return { ...goal, progress, status }
    })
  }, [goals])

  return (
    <div className="space-y-6">
      <PageHeader title="Metas" subtitle="Planeje objetivos financeiros e acompanhe sua evolucao mensal." />

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
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800 md:col-span-2 xl:col-span-4"
          >
            Adicionar meta
          </button>
        </form>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {enrichedGoals.length === 0 ? (
          <EmptyState
            title="Nenhuma meta cadastrada"
            description="Adicione uma meta para acompanhar seu progresso financeiro."
          />
        ) : (
          enrichedGoals.map((goal) => (
          <article key={goal.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{goal.name}</h3>
                <p className="text-xs text-slate-500">Prazo: {goal.deadline}</p>
              </div>
              <StatusBadge
                label={goal.status}
                tone={goal.status === "Concluida" ? "success" : goal.status === "Atrasada" ? "danger" : "info"}
              />
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
        )}
      </section>
    </div>
  )
}

export default Metas

