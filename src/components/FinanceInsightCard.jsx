import { aiInsights } from "../data/mockFinanceData"
import SectionCard from "./SectionCard"

function FinanceInsightCard() {
  return (
    <SectionCard
      title="Analise Inteligente do Mes"
      description="Recomendacoes simuladas da IA Valora para orientar suas decisoes financeiras."
    >
      <div className="space-y-3">
        {aiInsights.map((insight) => (
          <div
            key={insight}
            className="rounded-xl border border-violet-100 bg-violet-50/70 p-3 text-sm leading-relaxed text-slate-700"
          >
            {insight}
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

export default FinanceInsightCard

