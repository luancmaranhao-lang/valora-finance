import SectionCard from "./SectionCard"

function PlanningAlertCard() {
  return (
    <SectionCard title="Planejamento do proximo mes">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-600">
          Semana de Alinhamento: Sugerimos que entre os dias 23 e 30, voces reservem 30 minutos para projetar o
          proximo mes.
        </p>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Status</p>
          <p className="mt-1 text-sm font-semibold text-amber-800">Atencao recomendada nesta semana.</p>
        </div>
      </div>
    </SectionCard>
  )
}

export default PlanningAlertCard

