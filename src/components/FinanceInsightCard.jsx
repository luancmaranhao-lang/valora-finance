import { useMemo } from "react"
import EmptyState from "./EmptyState"
import SectionCard from "./SectionCard"
import { removeLancamentoMetaTags } from "../utils/lancamentoDisplay"

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

/**
 * @param {{
 *   receitaTotalMes: number
 *   despesasRealizadasMes: number
 *   despesasPendentesMes: number
 *   metasComprometidasMes: number
 *   provisionPendenteMes: number
 *   saldoPrevistoMes: number
 * } | null} flowBreakdown
 */
function FinanceInsightCard({ transactions = [], flowBreakdown = null }) {
  const insight = useMemo(() => {
    const expenses = transactions.filter((item) => {
      const type = (item.tipo ?? item.type ?? "").toString().toLowerCase()
      return type === "despesa" || type === "expense"
    })

    if (expenses.length === 0 && !flowBreakdown) {
      return null
    }

    const totalExpenses = expenses.reduce((sum, item) => sum + Number(item.valor ?? item.value ?? 0), 0)

    const biggestExpense = expenses.reduce((currentBiggest, item) => {
      const value = Number(item.valor ?? item.value ?? 0)
      if (!currentBiggest) return item

      const biggestValue = Number(currentBiggest.valor ?? currentBiggest.value ?? 0)
      return value > biggestValue ? item : currentBiggest
    }, null)

    const biggestValue = Number(biggestExpense?.valor ?? biggestExpense?.value ?? 0) || 0
    const biggestLabel = removeLancamentoMetaTags(
      biggestExpense?.descricao ?? biggestExpense?.description ?? biggestExpense?.categoria ?? biggestExpense?.category ?? "",
    ).trim() || "Despesa sem descricao"

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
      {flowBreakdown ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-sky-100 bg-sky-50/80 p-3 text-sm leading-relaxed text-slate-700">
            <p className="font-semibold text-slate-900">Saldo previsto (cenário completo)</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Receitas do mês menos despesas <strong className="text-slate-800">pagas</strong>, menos{" "}
              <strong className="text-slate-800">pendentes</strong>, menos compromisso em{" "}
              <strong className="text-slate-800">metas com prazo neste mês</strong>, menos{" "}
              <strong className="text-slate-800">provisões pendentes</strong> (conta no total).
            </p>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              <li>
                Receita do mês:{" "}
                <span className="font-semibold text-slate-900">{formatCurrency(flowBreakdown.receitaTotalMes)}</span>
              </li>
              <li>
                − Despesas pagas:{" "}
                <span className="font-semibold text-slate-900">{formatCurrency(flowBreakdown.despesasRealizadasMes)}</span>
              </li>
              <li>
                − Despesas pendentes:{" "}
                <span className="font-semibold text-slate-900">{formatCurrency(flowBreakdown.despesasPendentesMes)}</span>
              </li>
              <li>
                − Metas (prazo no mês):{" "}
                <span className="font-semibold text-slate-900">{formatCurrency(flowBreakdown.metasComprometidasMes)}</span>
              </li>
              <li>
                − Provisões pendentes:{" "}
                <span className="font-semibold text-slate-900">{formatCurrency(flowBreakdown.provisionPendenteMes)}</span>
              </li>
            </ul>
            <p className="mt-2 text-base font-bold text-slate-900">
              = {formatCurrency(flowBreakdown.saldoPrevistoMes)}
            </p>
          </div>
          {insight && insight.totalExpenses > 0 ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-sm leading-relaxed text-slate-700">
              Maior gasto registrado no histórico carregado:{" "}
              <span className="font-semibold text-slate-900">{insight.biggestLabel}</span> (
              <span className="font-semibold text-slate-900">{formatCurrency(insight.biggestValue)}</span>)
            </div>
          ) : null}
        </div>
      ) : insight ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-3 text-sm leading-relaxed text-slate-700">
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
