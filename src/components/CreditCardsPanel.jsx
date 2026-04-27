import EmptyState from "./EmptyState"
import SectionCard from "./SectionCard"

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function CreditCardsPanel({ cards = [] }) {
  return (
    <SectionCard title="Cartoes de Credito" description="Uso de limite atualizado por cartao.">
      <div className="space-y-4">
        {cards.length === 0 ? (
          <EmptyState
            title="Nenhum dado encontrado"
            description="Conecte seus cartoes para acompanhar limites e utilizacao."
          />
        ) : (
          cards.map((card) => {
            const usage = Math.round((card.usedLimit / card.totalLimit) * 100)

            return (
              <article key={card.id} className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{card.name}</p>
                  <span className="text-xs text-slate-500">Venc.: {card.dueDate}</span>
                </div>

                <div className="mb-2 h-2.5 rounded-full bg-slate-100">
                  <div
                    className="h-2.5 rounded-full bg-blue-500"
                    style={{ width: `${Math.min(usage, 100)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{formatCurrency(card.usedLimit)} utilizado</span>
                  <span>{formatCurrency(card.totalLimit)} limite</span>
                </div>
              </article>
            )
          })
        )}
      </div>
    </SectionCard>
  )
}

export default CreditCardsPanel

