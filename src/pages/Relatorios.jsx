import { useEffect, useMemo, useState } from "react"
import EmptyState from "../components/EmptyState"
import PageHeader from "../components/PageHeader"
import { listarContas } from "../services/contasService"
import { listarLancamentos } from "../services/lancamentosService"

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function Relatorios() {
  const [transactions, setTransactions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => {
      async function loadReportData() {
        try {
          setIsLoading(true)
          setErrorMessage("")
          const [transactionsData, accountsData] = await Promise.all([listarLancamentos(), listarContas()])
          setTransactions(transactionsData ?? [])
          setAccounts(accountsData ?? [])
        } catch {
          setErrorMessage("Nao foi possivel carregar os dados do relatorio.")
        } finally {
          setIsLoading(false)
        }
      }
      void loadReportData()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  const summary = useMemo(() => {
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

    const categoryTotals = monthlyTransactions
      .filter((item) => (item.tipo ?? item.type ?? "").toString().toLowerCase() === "despesa")
      .reduce((acc, item) => {
        const category = item.categoria ?? item.category ?? "Outros"
        acc[category] = (acc[category] ?? 0) + Number(item.valor ?? item.value ?? 0)
        return acc
      }, {})

    const topCategories = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, total]) => ({ name, total }))

    const dueSoonAccounts = accounts
      .filter((item) => pendingStatuses.has((item.status ?? "").toString().toLowerCase()))
      .sort((a, b) => new Date(a.vencimento ?? a.dueDate) - new Date(b.vencimento ?? b.dueDate))
      .slice(0, 5)

    const decisionSummary =
      saldoPrevisto < 0
        ? "O saldo previsto esta negativo. Priorize reducao de despesas variaveis e renegociacao de contas pendentes."
        : contasPendentes > receitas * 0.5
          ? "As contas pendentes representam alta parcela da receita. Planeje pagamentos antecipados para reduzir pressao."
          : "Seu fluxo mensal esta equilibrado. Continue mantendo disciplina nas categorias de maior peso."

    return {
      receitas,
      despesas,
      contasPendentes,
      saldoPrevisto,
      topCategories,
      dueSoonAccounts,
      decisionSummary,
    }
  }, [transactions, accounts])

  return (
    <div className="space-y-6">
      <PageHeader title="Relatorios" subtitle="Visao executiva consolidada para apoiar decisoes mensais." />

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
          Carregando relatorio mensal...
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Receitas</p>
          <p className="mt-2 text-xl font-semibold text-emerald-700">{formatCurrency(summary.receitas)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Despesas realizadas</p>
          <p className="mt-2 text-xl font-semibold text-rose-700">{formatCurrency(summary.despesas)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Contas pendentes</p>
          <p className="mt-2 text-xl font-semibold text-amber-700">{formatCurrency(summary.contasPendentes)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Saldo previsto</p>
          <p className={`mt-2 text-xl font-semibold ${summary.saldoPrevisto >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {formatCurrency(summary.saldoPrevisto)}
          </p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Top categorias de despesa</h2>
          <div className="mt-4 space-y-2">
            {summary.topCategories.length === 0 ? (
              <EmptyState
                title="Sem despesas no periodo"
                description="Registre despesas em Lancamentos para visualizar as categorias."
              />
            ) : (
              summary.topCategories.map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded-xl border border-slate-200 p-2.5">
                  <span className="text-sm text-slate-700">{item.name}</span>
                  <span className="text-sm font-semibold text-slate-900">{formatCurrency(item.total)}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Contas proximas do vencimento</h2>
          <div className="mt-4 space-y-2">
            {summary.dueSoonAccounts.length === 0 ? (
              <EmptyState title="Sem contas proximas" description="Nao ha contas pendentes com vencimento proximo." />
            ) : (
              summary.dueSoonAccounts.map((account) => (
                <div key={account.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{account.nome ?? account.name ?? "Conta"}</p>
                    <p className="text-xs text-slate-500">{String(account.vencimento ?? account.dueDate ?? "").slice(0, 10)}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatCurrency(Number(account.valor ?? account.value ?? 0))}
                  </span>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Resumo para decisao</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{summary.decisionSummary}</p>
      </section>
    </div>
  )
}

export default Relatorios

