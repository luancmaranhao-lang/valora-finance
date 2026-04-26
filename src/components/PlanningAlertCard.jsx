import { nextMonthPlanning } from "../data/mockFinanceData"
import SectionCard from "./SectionCard"

function PlanningAlertCard() {
  return (
    <SectionCard title={nextMonthPlanning.title}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-600">{nextMonthPlanning.message}</p>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Status</p>
          <p className="mt-1 text-sm font-semibold text-amber-800">{nextMonthPlanning.status}</p>
        </div>
      </div>
    </SectionCard>
  )
}

export default PlanningAlertCard

