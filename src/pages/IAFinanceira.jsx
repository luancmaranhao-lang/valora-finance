import { useEffect, useMemo, useState } from "react"
import EmptyState from "../components/EmptyState"
import PageHeader from "../components/PageHeader"
import StatusBadge from "../components/StatusBadge"
import { listarContas } from "../services/contasService"
import { listarLancamentos } from "../services/lancamentosService"

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function IAFinanceira() {
  const [transactions, setTransactions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => {
      async function loadData() {
        try {
          setIsLoading(true)
          setErrorMessage("")
          const [transactionsData, accountsData] = await Promise.all([listarLancamentos(), listarContas()])
          setTransactions(transactionsData ?? [])
          setAccounts(accountsData ?? [])
        } catch {
          setErrorMessage("Nao foi possivel carregar a analise inteligente no momento.")
        } finally {
          setIsLoading(false)
        }
      }
      void loadData()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  const analysis = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    const pendingStatuses = new Set(["pendente", "agendada", "atrasada"])

    function isCurrentMonth(dateValue) {
      if (!dateValue) return false
      const date = new Date(dateValue)
      if (Number.isNaN(date.getTime())) return false
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear
    }

    const monthlyTransactions = transactions.filter((item) => isCurrentMonth(item.data ?? item.date))
    const monthlyAccounts = accounts.filter((item) => isCurrentMonth(item.vencimento ?? item.dueDate))

    const receitas = monthlyTransactions
      .filter((item) => (item.tipo ?? item.type ?? "").toString().toLowerCase() === "receita")
      .reduce((sum, item) => sum + Number(item.valor ?? item.value ?? 0), 0)

    const despesas = monthlyTransactions
      .filter((item) => (item.tipo ?? item.type ?? "").toString().toLowerCase() === "despesa")
      .reduce((sum, item) => sum + Number(item.valor ?? item.value ?? 0), 0)

    const contasPendentes = monthlyAccounts
      .filter((item) => pendingStatuses.has((item.status ?? "").toString().toLowerCase()))
      .reduce((sum, item) => sum + Number(item.valor ?? item.value ?? 0), 0)

    const saldoPrevisto = receitas - despesas - contasPendentes
    const comprometimento = receitas > 0 ? ((despesas + contasPendentes) / receitas) * 100 : 0

    const healthLevel =
      saldoPrevisto >= receitas * 0.25 && comprometimento < 55
        ? "Excelente"
        : saldoPrevisto >= 0 && comprometimento < 75
          ? "Estavel"
          : saldoPrevisto < 0 || comprometimento >= 90
            ? "Critico"
            : "Atencao"

    const recommendations = []
    if (contasPendentes > 0) {
      recommendations.push("Priorize as contas pendentes de maior valor para reduzir risco de juros.")
    } else {
      recommendations.push("Sem pendencias relevantes no periodo: mantenha a disciplina de pagamentos.")
    }
    if (despesas > receitas * 0.7) {
      recommendations.push("Revisite categorias variaveis e defina um teto semanal de gastos.")
    } else {
      recommendations.push("Mantenha o padrao atual de despesas, com revisao semanal leve.")
    }
    recommendations.push(
      saldoPrevisto > 0
        ? "Direcione parte do saldo previsto para metas ou reserva de emergencia."
        : "Renegocie vencimentos e reduza custos nao essenciais para recuperar margem.",
    )

    const consultiveText =
      `Com base no mes atual, sua renda foi ${formatCurrency(receitas)} e o comprometimento total chegou a ${comprometimento.toFixed(
        0,
      )}%. ` +
      `As contas pendentes somam ${formatCurrency(contasPendentes)} e o saldo previsto esta em ${formatCurrency(
        saldoPrevisto,
      )}.`

    return {
      receitas,
      despesas,
      contasPendentes,
      saldoPrevisto,
      comprometimento,
      healthLevel,
      recommendations,
      consultiveText,
    }
  }, [transactions, accounts])

  return (
    <div className="space-y-6">
      <PageHeader
        title="IA Financeira"
        subtitle="Analise consultiva com base em lancamentos e contas a pagar reais do seu perfil."
      />

      {isLoading ? (
        <EmptyState title="Gerando analise inteligente" description="Processando dados financeiros do mes..." />
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Nivel de saude financeira</p>
          <div className="mt-2">
            <StatusBadge
              label={analysis.healthLevel}
              tone={
                analysis.healthLevel === "Excelente"
                  ? "success"
                  : analysis.healthLevel === "Estavel"
                    ? "info"
                    : analysis.healthLevel === "Atencao"
                      ? "warning"
                      : "danger"
              }
            />
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Receitas do mes</p>
          <p className="mt-2 text-lg font-semibold text-emerald-700">{formatCurrency(analysis.receitas)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Despesas + pendencias</p>
          <p className="mt-2 text-lg font-semibold text-rose-700">
            {formatCurrency(analysis.despesas + analysis.contasPendentes)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Saldo previsto</p>
          <p className={`mt-2 text-lg font-semibold ${analysis.saldoPrevisto >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {formatCurrency(analysis.saldoPrevisto)}
          </p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Resumo consultivo</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{analysis.consultiveText}</p>
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Comprometimento da renda</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{analysis.comprometimento.toFixed(0)}%</p>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">3 recomendacoes praticas</h2>
          <div className="mt-3 space-y-2">
            {analysis.recommendations.map((item) => (
              <p key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {item}
              </p>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}

export default IAFinanceira

