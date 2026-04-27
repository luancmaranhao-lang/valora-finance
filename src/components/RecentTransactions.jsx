import EmptyState from "./EmptyState"
import SectionCard from "./SectionCard"

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function RecentTransactions({ transactions = [] }) {
  const normalizedTransactions = transactions.map((transaction) => {
    const type = (transaction.tipo ?? transaction.type ?? "").toString().toLowerCase()
    return {
      id: transaction.id,
      description: transaction.descricao ?? transaction.description ?? "Lancamento",
      date: String(transaction.data ?? transaction.date ?? "").slice(0, 10),
      category: transaction.categoria ?? transaction.category ?? "Sem categoria",
      value: Number(transaction.valor ?? transaction.value ?? 0),
      isIncome: type === "receita" || type === "income",
    }
  })

  return (
    <SectionCard title="Lancamentos Recentes" description="Ultimas movimentacoes registradas no periodo.">
      <div className="space-y-3">
        {normalizedTransactions.length === 0 ? (
          <EmptyState
            title="Nenhum dado encontrado"
            description="Cadastre lancamentos para ver as movimentacoes recentes."
          />
        ) : (
          normalizedTransactions.map((transaction) => (
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

              <p className={`text-sm font-semibold ${transaction.isIncome ? "text-emerald-600" : "text-rose-600"}`}>
                {transaction.isIncome ? "+" : "-"}
                {formatCurrency(transaction.value)}
              </p>
            </article>
          ))
        )}
      </div>
    </SectionCard>
  )
}

export default RecentTransactions

