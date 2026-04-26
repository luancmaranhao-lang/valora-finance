import EmptyState from "../components/EmptyState"
import PageHeader from "../components/PageHeader"
import ProgressBar from "../components/ProgressBar"
import StatusBadge from "../components/StatusBadge"

const cards = [
  {
    id: "card-1",
    name: "Valora Black",
    brand: "Visa Infinite",
    totalLimit: 12000,
    usedLimit: 8740,
    dueDate: "12/05/2026",
    bestPurchaseDay: "05",
    invoices: [
      { id: "i-1", date: "24/04", description: "Supermercado Central", amount: 520.3 },
      { id: "i-2", date: "23/04", description: "Combustivel", amount: 280.0 },
      { id: "i-3", date: "21/04", description: "Streaming anual", amount: 198.9 },
    ],
  },
  {
    id: "card-2",
    name: "Nubank Platinum",
    brand: "Mastercard",
    totalLimit: 6000,
    usedLimit: 2320.55,
    dueDate: "18/05/2026",
    bestPurchaseDay: "11",
    invoices: [
      { id: "i-4", date: "25/04", description: "Farmacia", amount: 140.2 },
      { id: "i-5", date: "22/04", description: "Restaurante", amount: 96.0 },
    ],
  },
]

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function Cartoes() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cartoes"
        subtitle="Controle de limites, faturas e alertas de uso em um unico painel."
      />

      <section className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => {
          const usagePercent = Math.round((card.usedLimit / card.totalLimit) * 100)
          const isHighUsage = usagePercent > 70

          return (
            <article key={card.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{card.name}</h2>
                  <p className="text-xs text-slate-500">{card.brand}</p>
                </div>
                <StatusBadge
                  label={isHighUsage ? "Uso acima de 70%" : "Uso sob controle"}
                  tone={isHighUsage ? "danger" : "success"}
                />
              </div>

              <div className="space-y-2 text-sm text-slate-600">
                <p className="flex items-center justify-between">
                  <span>Limite total</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(card.totalLimit)}</span>
                </p>
                <p className="flex items-center justify-between">
                  <span>Limite usado</span>
                  <span className="font-semibold text-slate-900">{formatCurrency(card.usedLimit)}</span>
                </p>
                <p className="flex items-center justify-between">
                  <span>Vencimento</span>
                  <span className="font-semibold text-slate-900">{card.dueDate}</span>
                </p>
                <p className="flex items-center justify-between">
                  <span>Melhor dia de compra</span>
                  <span className="font-semibold text-slate-900">Dia {card.bestPurchaseDay}</span>
                </p>
              </div>

              <div className="mt-4">
                <ProgressBar
                  value={card.usedLimit}
                  max={card.totalLimit}
                  label="Uso do limite"
                  tone={isHighUsage ? "bg-rose-500" : "bg-blue-500"}
                />
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="mb-2 text-sm font-medium text-slate-700">Compras recentes da fatura</p>
                <div className="space-y-2">
                  {card.invoices.length === 0 ? (
                    <EmptyState title="Sem compras recentes" description="As proximas compras aparecerao nesta area." />
                  ) : (
                    card.invoices.map((invoice) => (
                      <div key={invoice.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-2.5">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{invoice.description}</p>
                          <p className="text-xs text-slate-500">{invoice.date}</p>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{formatCurrency(invoice.amount)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}

export default Cartoes

