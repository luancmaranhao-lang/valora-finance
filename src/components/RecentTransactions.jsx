import EmptyState from "./EmptyState"
import SectionCard from "./SectionCard"

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

const chipToneClass = {
  self: "bg-blue-100 text-blue-800",
  partner: "bg-violet-100 text-violet-800",
  split: "bg-emerald-100 text-emerald-800",
  joint: "bg-slate-200 text-slate-700",
}

function PayerChip({ label, initial, tone, compact }) {
  const ring = chipToneClass[tone] ?? chipToneClass.self
  if (compact) {
    return (
      <span
        title={label}
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ring}`}
      >
        {initial}
      </span>
    )
  }
  return (
    <span className={`inline-flex max-w-[5.5rem] shrink-0 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${ring}`}>
      {label}
    </span>
  )
}

function RecentTransactions({ transactions = [], payerMeta }) {
  const normalizedTransactions = transactions.map((transaction) => {
    const type = (transaction.tipo ?? transaction.type ?? "").toString().toLowerCase()
    const description =
      transaction.displayDescription ??
      transaction.descricaoLimpa ??
      transaction.descricao ??
      transaction.description ??
      "Lançamento"
    const chip = transaction.payerChip
    return {
      id: transaction.id,
      description,
      date: String(transaction.data ?? transaction.date ?? "").slice(0, 10),
      category: transaction.categoria ?? transaction.category ?? "Sem categoria",
      value: Number(transaction.valor ?? transaction.value ?? 0),
      isIncome: type === "receita" || type === "income",
      chip,
    }
  })

  return (
    <SectionCard title="Lançamentos Recentes" description="Ultimas movimentacoes registradas no periodo.">
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
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  {transaction.chip ? (
                    <PayerChip
                      label={transaction.chip.label}
                      initial={transaction.chip.initial}
                      tone={transaction.chip.tone}
                      compact={payerMeta?.compact}
                    />
                  ) : null}
                  <p className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{transaction.description}</p>
                </div>
                <p className="mt-1 pl-0 text-xs text-slate-500 sm:pl-9">
                  {transaction.date} • {transaction.category}
                </p>
              </div>

              <p className={`shrink-0 text-sm font-semibold ${transaction.isIncome ? "text-emerald-600" : "text-rose-600"}`}>
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
