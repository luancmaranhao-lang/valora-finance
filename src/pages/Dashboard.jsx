import { useCallback, useEffect, useMemo, useState } from "react"
import CreditCardsPanel from "../components/CreditCardsPanel"
import EmptyState from "../components/EmptyState"
import FinanceInsightCard from "../components/FinanceInsightCard"
import GoalsPanel from "../components/GoalsPanel"
import GroupPrivacyPanel from "../components/GroupPrivacyPanel"
import PageHeader from "../components/PageHeader"
import PlanningAlertCard from "../components/PlanningAlertCard"
import RecentTransactions from "../components/RecentTransactions"
import StatCard from "../components/StatCard"
import { listarLancamentos } from "../services/lancamentosService"
import { metasService } from "../services/metasService"

const subscriptionTag = "[ASSINATURA]"

function calculateVariation(current, previous) {
  if (previous === 0 && current > 0) return "+100%"
  if (previous === 0 && current === 0) return "0%"
  const variation = ((current - previous) / previous) * 100
  const roundedVariation = Math.round(variation)
  const signal = roundedVariation > 0 ? "+" : ""
  return `${signal}${roundedVariation}%`
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function Dashboard() {
  const [transactions, setTransactions] = useState([])
  const [metas, setMetas] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  const loadDashboardData = useCallback(async () => {
    try {
      setIsLoading(true)
      setErrorMessage("")
      const [transactionsData, metasData] = await Promise.all([listarLancamentos(), metasService.listarMetas()])
      setTransactions(transactionsData ?? [])
      setMetas(metasData ?? [])
    } catch {
      setErrorMessage("Nao foi possivel carregar os indicadores financeiros agora.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadDashboardData()
    }, 0)

    function handleMetasUpdated() {
      void loadDashboardData()
    }

    window.addEventListener("metas:updated", handleMetasUpdated)

    return () => {
      clearTimeout(timer)
      window.removeEventListener("metas:updated", handleMetasUpdated)
    }
  }, [loadDashboardData])

  const dashboardData = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()
    const previousMonthDate = new Date(currentYear, currentMonth - 1, 1)
    const previousYear = previousMonthDate.getFullYear()
    const previousMonth = previousMonthDate.getMonth()
    const pendingStatuses = new Set(["pendente", "agendada", "atrasada"])

    function parseDate(value) {
      if (!value) return null
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? null : date
    }

    function isFromMonth(dateValue, year, month) {
      const date = parseDate(dateValue)
      if (!date) return false
      return date.getFullYear() === year && date.getMonth() === month
    }

    function sumByType(items, type) {
      return items.reduce((sum, item) => {
        const tipo = (item.tipo ?? item.type ?? "").toString().toLowerCase()
        if (tipo !== type) return sum
        return sum + Number(item.valor ?? item.value ?? 0)
      }, 0)
    }

    function buildRecurringKey(item) {
      return [
        (item.descricao ?? item.description ?? "").toString().trim().toLowerCase(),
        (item.categoria ?? item.category ?? "").toString().trim().toLowerCase(),
        (item.forma_pagamento ?? item.payment_method ?? item.paymentMethod ?? "").toString().trim().toLowerCase(),
        (item.recorrencia ?? "unica").toString().trim().toLowerCase(),
      ].join("|")
    }

    function isMarkedAsSubscription(item) {
      if (Boolean(item.assinatura ?? item.eh_assinatura)) return true
      const description = String(item.descricao ?? item.description ?? "")
      return description.includes(subscriptionTag)
    }

    function projectedRecurringForMonth(allItems, year, month) {
      const recurringTypes = new Set(["recorrente_fixa", "recorrente_variavel"])
      const recurringExpenses = allItems.filter((item) => {
        const tipo = (item.tipo ?? item.type ?? "").toString().toLowerCase()
        const recorrencia = (item.recorrencia ?? "unica").toString().toLowerCase()
        return tipo === "despesa" && recurringTypes.has(recorrencia)
      })

      if (recurringExpenses.length === 0) return 0

      const sortedByDateDesc = [...recurringExpenses].sort(
        (a, b) => new Date(b.data ?? b.date ?? 0) - new Date(a.data ?? a.date ?? 0),
      )

      const latestTemplateByKey = new Map()
      sortedByDateDesc.forEach((item) => {
        const key = buildRecurringKey(item)
        if (!latestTemplateByKey.has(key)) {
          latestTemplateByKey.set(key, item)
        }
      })

      const monthItems = allItems.filter((item) => isFromMonth(item.data ?? item.date, year, month))
      const existingKeysInMonth = new Set(monthItems.map(buildRecurringKey))

      let projected = 0
      latestTemplateByKey.forEach((item, key) => {
        if (existingKeysInMonth.has(key)) return
        projected += Number(item.valor ?? item.value ?? 0)
      })

      return projected
    }

    function sumPendingByStatus(items) {
      return items.reduce((sum, item) => {
        const status = (item.status ?? "").toString().toLowerCase()
        if (!pendingStatuses.has(status)) return sum
        return sum + Number(item.valor ?? item.value ?? 0)
      }, 0)
    }

    const currentMonthTransactions = transactions.filter((item) =>
      isFromMonth(item.data ?? item.date, currentYear, currentMonth),
    )
    const previousMonthTransactions = transactions.filter((item) =>
      isFromMonth(item.data ?? item.date, previousYear, previousMonth),
    )
    const currentMonthPendingTransactions = currentMonthTransactions.filter((item) => {
      const status = (item.status ?? "").toString().toLowerCase()
      return pendingStatuses.has(status)
    })
    const previousMonthPendingTransactions = previousMonthTransactions.filter((item) => {
      const status = (item.status ?? "").toString().toLowerCase()
      return pendingStatuses.has(status)
    })

    const monthlyIncome = sumByType(currentMonthTransactions, "receita")
    const monthlyRealExpenses = sumByType(currentMonthTransactions, "despesa")
    const monthlyProjectedRecurring = projectedRecurringForMonth(transactions, currentYear, currentMonth)
    const monthlyExpenses = monthlyRealExpenses + monthlyProjectedRecurring
    const previousIncome = sumByType(previousMonthTransactions, "receita")
    const previousRealExpenses = sumByType(previousMonthTransactions, "despesa")
    const previousProjectedRecurring = projectedRecurringForMonth(transactions, previousYear, previousMonth)
    const previousExpenses = previousRealExpenses + previousProjectedRecurring
    const monthlyPendingAccounts = sumPendingByStatus(currentMonthPendingTransactions)
    const previousPending = sumPendingByStatus(previousMonthPendingTransactions)
    const forecastBalance = monthlyIncome - monthlyExpenses - monthlyPendingAccounts
    const previousForecast = previousIncome - previousExpenses - previousPending

    const upcomingAccounts = currentMonthPendingTransactions
      .sort((a, b) => new Date(a.data ?? a.date) - new Date(b.data ?? b.date))
      .slice(0, 5)

    const recentTransactions = [...transactions]
      .sort((a, b) => new Date(b.data ?? b.date ?? 0) - new Date(a.data ?? a.date ?? 0))
      .slice(0, 6)

    const monthlySubscriptions = currentMonthTransactions
      .filter((item) => {
        const recurrence = (item.recorrencia ?? "unica").toString().toLowerCase()
        return recurrence === "recorrente_fixa" && isMarkedAsSubscription(item)
      })
      .map((item) => ({
        id: item.id,
        name: String(item.descricao ?? item.description ?? "Assinatura").replace(` ${subscriptionTag}`, "").trim(),
        value: Number(item.valor ?? item.value ?? 0),
      }))

    const monthlySubscriptionsTotal = monthlySubscriptions.reduce((sum, item) => sum + item.value, 0)

    const quickSummary =
      forecastBalance >= 0
        ? "Fluxo projetado positivo para o mes atual."
        : "Fluxo projetado negativo, priorize cortes e reprogramacao."

    const recommendedActions = [
      monthlyPendingAccounts > 0
        ? "Antecipe contas de maior valor para reduzir risco de atraso."
        : "Mantenha o ritmo: nao ha contas pendentes relevantes no periodo.",
      monthlyExpenses > monthlyIncome * 0.75
        ? "Reavalie despesas variaveis para preservar margem de seguranca."
        : "Seu nivel de despesas esta equilibrado frente a receita.",
      upcomingAccounts.length > 0
        ? `Proximo vencimento: ${String(upcomingAccounts[0].data ?? upcomingAccounts[0].date ?? "").slice(0, 10)}.`
        : "Sem vencimentos proximos mapeados no momento.",
    ]

    return {
      monthlyIncome,
      monthlyExpenses,
      monthlyProjectedRecurring,
      monthlyPendingAccounts,
      forecastBalance,
      incomeVariation: calculateVariation(monthlyIncome, previousIncome),
      expensesVariation: calculateVariation(monthlyExpenses, previousExpenses),
      pendingVariation: calculateVariation(monthlyPendingAccounts, previousPending),
      forecastVariation: calculateVariation(forecastBalance, previousForecast),
      upcomingAccounts,
      quickSummary,
      recommendedActions,
      recentTransactions,
      monthlySubscriptions,
      monthlySubscriptionsTotal,
    }
  }, [transactions])

  const pendingTone = dashboardData.monthlyPendingAccounts > 0 ? "negative" : "neutral"
  const forecastTone = dashboardData.forecastBalance >= 0 ? "positive" : "negative"

  return (
    <div className="space-y-7">
      <PageHeader
        title="Valora Finance"
        subtitle="Agregando valor a sua vida"
      >
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Dashboard financeiro</span>
      </PageHeader>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Receita mensal"
          value={dashboardData.monthlyIncome}
          subtitle={`${dashboardData.incomeVariation} vs mes anterior`}
          tone="positive"
        />
        <StatCard
          title="Despesas realizadas"
          value={dashboardData.monthlyExpenses}
          subtitle={`${dashboardData.expensesVariation} vs mes anterior • ${formatCurrency(dashboardData.monthlyProjectedRecurring)} previstas`}
          tone="negative"
        />
        <StatCard
          title="Contas pendentes"
          value={dashboardData.monthlyPendingAccounts}
          subtitle={`${dashboardData.pendingVariation} vs mes anterior`}
          tone={pendingTone}
        />
        <StatCard
          title="Saldo previsto"
          value={dashboardData.forecastBalance}
          subtitle={`${dashboardData.forecastVariation} vs mes anterior`}
          tone={forecastTone}
        />
      </section>

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
          Carregando indicadores financeiros...
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Resumo rapido</h3>
          <p className="mt-2 text-sm text-slate-600">{dashboardData.quickSummary}</p>
          <p className="mt-3 text-sm text-slate-500">
            Saldo previsto: <span className="font-semibold text-slate-900">{formatCurrency(dashboardData.forecastBalance)}</span>
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">Acoes recomendadas</h3>
          <ul className="mt-2 space-y-2 text-sm text-slate-600">
            {dashboardData.recommendedActions.map((action) => (
              <li key={action} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                {action}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">Minhas Assinaturas</h3>
          <p className="text-xs font-semibold text-slate-600">
            Total no mês: {formatCurrency(dashboardData.monthlySubscriptionsTotal)}
          </p>
        </div>
        {dashboardData.monthlySubscriptions.length === 0 ? (
          <EmptyState
            title="Nenhuma assinatura marcada"
            description="Marque lançamentos recorrentes fixos como assinatura para monitorar este total."
          />
        ) : (
          <div className="space-y-2">
            {dashboardData.monthlySubscriptions.map((subscription) => (
              <article
                key={subscription.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
              >
                <p className="text-sm font-medium text-slate-800">{subscription.name}</p>
                <p className="text-sm font-semibold text-slate-900">{formatCurrency(subscription.value)}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <GroupPrivacyPanel />
        </div>
        <PlanningAlertCard />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Proximas contas</h3>
          <span className="text-xs font-medium text-slate-500">Ate 5 vencimentos mais proximos</span>
        </div>
        <div className="space-y-2">
          {dashboardData.upcomingAccounts.length === 0 ? (
            <EmptyState
              title="Sem contas proximas"
              description="Nenhuma conta pendente encontrada para os proximos dias."
            />
          ) : (
            dashboardData.upcomingAccounts.map((account) => (
              <article
                key={account.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{account.descricao ?? account.description ?? "Lancamento"}</p>
                  <p className="text-xs text-slate-500">
                    Vencimento: {String(account.data ?? account.date ?? "").slice(0, 10)}
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-900">
                  {formatCurrency(Number(account.valor ?? account.value ?? 0))}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <FinanceInsightCard transactions={transactions} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <CreditCardsPanel cards={[]} />
        <GoalsPanel metas={metas} />
      </section>

      <RecentTransactions transactions={dashboardData.recentTransactions} />
    </div>
  )
}

export default Dashboard

