import { financialGoals } from "../data/mockFinanceData"
import SectionCard from "./SectionCard"

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function GoalsPanel() {
  return (
    <SectionCard title="Metas Financeiras" description="Acompanhe a evolucao das metas prioritarias.">
      <div className="space-y-4">
        {financialGoals.map((goal) => {
          const progress = Math.round((goal.currentValue / goal.targetValue) * 100)

          return (
            <article key={goal.id} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{goal.name}</p>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  {progress}%
                </span>
              </div>

              <div className="mb-2 h-2.5 rounded-full bg-slate-100">
                <div
                  className="h-2.5 rounded-full bg-emerald-500"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{formatCurrency(goal.currentValue)} atual</span>
                <span>{formatCurrency(goal.targetValue)} alvo</span>
              </div>
            </article>
          )
        })}
      </div>
    </SectionCard>
  )
}

export default GoalsPanel

