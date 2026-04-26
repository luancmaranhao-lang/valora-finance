import { recentTransactions } from "../data/mockFinanceData"
import SectionCard from "./SectionCard"

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function RecentTransactions() {
  return (
    <SectionCard title="Lancamentos Recentes" description="Ultimas movimentacoes registradas no periodo.">
      <div className="space-y-3">
        {recentTransactions.map((transaction) => {
          const isIncome = transaction.type === "income"

          return (
            <article
              key={transaction.id}
              className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{transaction.description}</p>
                <p className="text-xs text-slate-500">
                  {transaction.date} • {transaction.category}
                </p>
              </div>

              <p className={`text-sm font-semibold ${isIncome ? "text-emerald-600" : "text-rose-600"}`}>
                {isIncome ? "+" : "-"}
                {formatCurrency(transaction.value)}
              </p>
            </article>
          )
        })}
      </div>
    </SectionCard>
  )
}

export default RecentTransactions

