import { useMemo } from "react"
import EmptyState from "./EmptyState"
import SectionCard from "./SectionCard"

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function FinanceInsightCard({ transactions = [] }) {
  const insight = useMemo(() => {
    const expenses = transactions.filter((item) => {
      const type = (item.tipo ?? item.type ?? "").toString().toLowerCase()
      return type === "despesa" || type === "expense"
    })

    if (expenses.length === 0) {
      return null
    }

    const totalExpenses = expenses.reduce((sum, item) => sum + Number(item.valor ?? item.value ?? 0), 0)

    const biggestExpense = expenses.reduce((currentBiggest, item) => {
      const value = Number(item.valor ?? item.value ?? 0)
      if (!currentBiggest) return item

      const biggestValue = Number(currentBiggest.valor ?? currentBiggest.value ?? 0)
      return value > biggestValue ? item : currentBiggest
    }, null)

    const biggestValue = Number(biggestExpense?.valor ?? biggestExpense?.value ?? 0)
    const biggestLabel =
      biggestExpense?.descricao ??
      biggestExpense?.description ??
      biggestExpense?.categoria ??
      biggestExpense?.category ??
      "Despesa sem descricao"

    return {
      totalExpenses,
      biggestValue,
      biggestLabel,
    }
  }, [transactions])

  return (
    <SectionCard
      title="Analise Inteligente do Mes"
      description="Leitura automatica com base nos seus lancamentos reais."
    >
      {insight ? (
        <div className="space-y-3">
          <div
            className="rounded-xl border border-violet-100 bg-violet-50/70 p-3 text-sm leading-relaxed text-slate-700"
          >
            Total de gastos registrados no periodo:{" "}
            <span className="font-semibold text-slate-900">{formatCurrency(insight.totalExpenses)}</span>
          </div>
          <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-sm leading-relaxed text-slate-700">
            Maior gasto real: <span className="font-semibold text-slate-900">{insight.biggestLabel}</span> (
            <span className="font-semibold text-slate-900">{formatCurrency(insight.biggestValue)}</span>)
          </div>
        </div>
      ) : (
        <EmptyState
          title="Nenhum dado encontrado"
          description="Cadastre despesas para gerar uma analise inteligente real."
        />
      )}
    </SectionCard>
  )
}

export default FinanceInsightCard

