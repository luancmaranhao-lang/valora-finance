import { useCallback, useEffect, useMemo, useState } from "react"
import CreditCardsPanel from "../components/CreditCardsPanel"
import EmptyState from "../components/EmptyState"
import FinanceInsightCard from "../components/FinanceInsightCard"
import GoalsPanel from "../components/GoalsPanel"
import PageHeader from "../components/PageHeader"
import PlanningAlertCard from "../components/PlanningAlertCard"
import RecentTransactions from "../components/RecentTransactions"
import StatCard from "../components/StatCard"
import { listarLancamentos } from "../services/lancamentosService"
import { metasService } from "../services/metasService"
import { supabase } from "../services/supabaseClient"
import {
  extractTagValue,
  getFirstName,
  payerTagPrefix,
  removeLancamentoMetaTags,
  resolvePayerShortLabel,
} from "../utils/lancamentoDisplay"

const subscriptionCategory = "🔄 Assinaturas"

function parseDateOnly(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDayLocal(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.getTime()
}

function isDueDateBeforeToday(isoDate) {
  const due = parseDateOnly(isoDate)
  if (!due) return false
  return startOfDayLocal(due) < startOfDayLocal(new Date())
}

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

function profileFirstLabel(profile, authUserId) {
  const nome = String(profile?.nome_exibicao ?? "").trim()
  if (nome) return profile?.id === authUserId ? "Você" : getFirstName(nome)
  const email = String(profile?.email ?? "")
  if (email) {
    const local = email.split("@")[0]
    const pretty = local ? local.charAt(0).toUpperCase() + local.slice(1) : ""
    if (pretty) return profile?.id === authUserId ? "Você" : pretty
  }
  return profile?.id === authUserId ? "Você" : "Parceiro(a)"
}

function Dashboard() {
  const [transactions, setTransactions] = useState([])
  const [metas, setMetas] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [currentUserId, setCurrentUserId] = useState("")
  const [nameByUserId, setNameByUserId] = useState({})

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

  useEffect(() => {
    const timer = setTimeout(() => {
      async function loadProfileLabels() {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser()
          if (!user?.id) {
            setCurrentUserId("")
            setNameByUserId({})
            return
          }
          setCurrentUserId(user.id)

          const { data: memberEntry } = await supabase
            .from("membros_grupo")
            .select("grupo_id")
            .eq("user_id", user.id)
            .maybeSingle()

          let profiles = []
          if (memberEntry?.grupo_id) {
            const { data: membersRows } = await supabase
              .from("membros_grupo")
              .select("user_id")
              .eq("grupo_id", memberEntry.grupo_id)
            const userIds = (membersRows ?? []).map((m) => m.user_id).filter(Boolean)
            const { data } = userIds.length
              ? await supabase.from("profiles").select("id, nome_exibicao, email").in("id", userIds)
              : { data: [] }
            profiles = data ?? []
          } else {
            const { data } = await supabase
              .from("profiles")
              .select("id, nome_exibicao, email")
              .eq("id", user.id)
              .maybeSingle()
            profiles = data ? [data] : []
          }

          const map = {}
          for (const p of profiles) {
            if (p?.id) map[p.id] = profileFirstLabel(p, user.id)
          }
          setNameByUserId(map)
        } catch {
          setCurrentUserId("")
          setNameByUserId({})
        }
      }
      void loadProfileLabels()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

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

    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    function dateOnOrBeforeToday(dateValue) {
      const date = parseDate(dateValue)
      if (!date) return false
      return date.getTime() <= todayEnd.getTime()
    }

    function isStatusPago(item) {
      return (item.status ?? "").toString().toLowerCase() === "pago"
    }

    const receitasPagasHistorico = transactions
      .filter((item) => {
        const tipo = (item.tipo ?? item.type ?? "").toString().toLowerCase()
        return tipo === "receita" && isStatusPago(item) && dateOnOrBeforeToday(item.data ?? item.date)
      })
      .reduce((sum, item) => sum + Number(item.valor ?? item.value ?? 0), 0)

    const despesasPagasHistorico = transactions
      .filter((item) => {
        const tipo = (item.tipo ?? item.type ?? "").toString().toLowerCase()
        return tipo === "despesa" && isStatusPago(item) && dateOnOrBeforeToday(item.data ?? item.date)
      })
      .reduce((sum, item) => sum + Number(item.valor ?? item.value ?? 0), 0)

    const saldoMomento = receitasPagasHistorico - despesasPagasHistorico

    const receitaTotalMes = sumByType(currentMonthTransactions, "receita")

    const despesasRealizadasMes = currentMonthTransactions
      .filter((item) => {
        const tipo = (item.tipo ?? item.type ?? "").toString().toLowerCase()
        return tipo === "despesa" && isStatusPago(item)
      })
      .reduce((sum, item) => sum + Number(item.valor ?? item.value ?? 0), 0)

    const despesasPendentesMes = currentMonthTransactions
      .filter((item) => {
        const tipo = (item.tipo ?? item.type ?? "").toString().toLowerCase()
        const status = (item.status ?? "").toString().toLowerCase()
        return tipo === "despesa" && pendingStatuses.has(status)
      })
      .reduce((sum, item) => sum + Number(item.valor ?? item.value ?? 0), 0)

    const saldoPrevistoMes = receitaTotalMes - despesasRealizadasMes - despesasPendentesMes

    const previousReceitaMes = sumByType(previousMonthTransactions, "receita")
    const previousDespesasPagasMes = previousMonthTransactions
      .filter((item) => {
        const tipo = (item.tipo ?? item.type ?? "").toString().toLowerCase()
        return tipo === "despesa" && isStatusPago(item)
      })
      .reduce((sum, item) => sum + Number(item.valor ?? item.value ?? 0), 0)
    const previousDespesasPendentesMes = previousMonthTransactions
      .filter((item) => {
        const tipo = (item.tipo ?? item.type ?? "").toString().toLowerCase()
        const status = (item.status ?? "").toString().toLowerCase()
        return tipo === "despesa" && pendingStatuses.has(status)
      })
      .reduce((sum, item) => sum + Number(item.valor ?? item.value ?? 0), 0)

    const previousSaldoPrevistoMes =
      previousReceitaMes - previousDespesasPagasMes - previousDespesasPendentesMes

    const monthlyPendingAccounts = sumPendingByStatus(currentMonthPendingTransactions)
    const previousPending = sumPendingByStatus(previousMonthPendingTransactions)

    function attachUiFields(item) {
      const rawDesc = item.descricao ?? item.description ?? ""
      const statusLow = (item.status ?? "").toString().toLowerCase()
      const pendente =
        pendingStatuses.has(statusLow) &&
        ((item.tipo ?? item.type ?? "").toString().toLowerCase() === "despesa")
      const vencida = pendente && isDueDateBeforeToday(item.data ?? item.date)
      return {
        ...item,
        displayDesc: removeLancamentoMetaTags(rawDesc),
        displayDescription: removeLancamentoMetaTags(rawDesc),
        payerChip: resolvePayerShortLabel(extractTagValue(rawDesc, payerTagPrefix), {
          currentUserId,
          nameByUserId,
        }),
        isVencida: vencida,
      }
    }

    const pendingExpenseAll = [...transactions]
      .filter((item) => {
        const tipo = (item.tipo ?? item.type ?? "").toString().toLowerCase()
        const status = (item.status ?? "").toString().toLowerCase()
        return tipo === "despesa" && pendingStatuses.has(status)
      })
      .sort((a, b) => new Date(a.data ?? a.date ?? 0) - new Date(b.data ?? b.date ?? 0))

    const contasPagarPendentesUi = pendingExpenseAll.map(attachUiFields)

    const upcomingForUi = pendingExpenseAll.slice(0, 10).map(attachUiFields)

    const ultimosPagamentosUi = [...transactions]
      .filter((item) => (item.status ?? "").toString().toLowerCase() === "pago")
      .sort((a, b) => new Date(b.data ?? b.date ?? 0) - new Date(a.data ?? a.date ?? 0))
      .slice(0, 8)
      .map(attachUiFields)

    const monthlySubscriptions = currentMonthTransactions
      .filter((item) => {
        const recurrence = (item.recorrencia ?? "unica").toString().toLowerCase()
        const category = (item.categoria ?? item.category ?? "").toString().trim()
        return recurrence === "recorrente_fixa" && category === subscriptionCategory
      })
      .map((item) => ({
        id: item.id,
        name: removeLancamentoMetaTags(String(item.descricao ?? item.description ?? "Assinatura")).trim(),
        value: Number(item.valor ?? item.value ?? 0),
      }))

    const monthlySubscriptionsTotal = monthlySubscriptions.reduce((sum, item) => sum + item.value, 0)

    const quickSummary =
      saldoPrevistoMes >= 0
        ? "Fluxo projetado positivo para o mes atual."
        : "Fluxo projetado negativo, priorize cortes e reprogramacao."

    const recommendedActions = [
      monthlyPendingAccounts > 0
        ? "Antecipe contas de maior valor para reduzir risco de atraso."
        : "Mantenha o ritmo: nao ha contas pendentes relevantes no periodo.",
      despesasRealizadasMes > receitaTotalMes * 0.75 && receitaTotalMes > 0
        ? "Reavalie despesas variaveis para preservar margem de seguranca."
        : "Seu nivel de despesas realizadas esta equilibrado frente a receita planejada.",
      pendingExpenseAll.length > 0
        ? `Proximo na fila: ${String(pendingExpenseAll[0].data ?? pendingExpenseAll[0].date ?? "").slice(0, 10)}.`
        : "Sem vencimentos proximos mapeados no momento.",
    ]

    return {
      saldoMomento,
      receitaTotalMes,
      despesasRealizadasMes,
      despesasPendentesMes,
      saldoPrevistoMes,
      monthlyPendingAccounts,
      incomeVariation: calculateVariation(receitaTotalMes, previousReceitaMes),
      expensesPaidVariation: calculateVariation(despesasRealizadasMes, previousDespesasPagasMes),
      pendingVariation: calculateVariation(monthlyPendingAccounts, previousPending),
      forecastVariation: calculateVariation(saldoPrevistoMes, previousSaldoPrevistoMes),
      contasPagarPendentes: contasPagarPendentesUi,
      upcomingAccounts: upcomingForUi,
      ultimosPagamentos: ultimosPagamentosUi,
      quickSummary,
      recommendedActions,
      monthlySubscriptions,
      monthlySubscriptionsTotal,
    }
  }, [transactions, currentUserId, nameByUserId])

  const pendingTone = dashboardData.monthlyPendingAccounts > 0 ? "negative" : "neutral"
  const forecastTone = dashboardData.saldoPrevistoMes >= 0 ? "positive" : "negative"
  const saldoMomentoTone = dashboardData.saldoMomento >= 0 ? "positive" : "negative"

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
          title="Saldo do momento"
          value={dashboardData.saldoMomento}
          subtitle="Receitas pagas menos despesas pagas (ate hoje)"
          tone={saldoMomentoTone}
        />
        <StatCard
          title="Receita total do mes"
          value={dashboardData.receitaTotalMes}
          subtitle={`${dashboardData.incomeVariation} vs mes anterior`}
          tone="positive"
        />
        <StatCard
          title="Despesas realizadas"
          value={dashboardData.despesasRealizadasMes}
          subtitle={`So pagas neste mes • ${dashboardData.expensesPaidVariation} vs anterior`}
          tone="negative"
        />
        <StatCard
          title="Saldo previsto"
          value={dashboardData.saldoPrevistoMes}
          subtitle={`Receita mes - realizadas - pendentes • ${dashboardData.forecastVariation} vs anterior`}
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
            Saldo previsto: <span className="font-semibold text-slate-900">{formatCurrency(dashboardData.saldoPrevistoMes)}</span>
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
          <h3 className="text-base font-semibold text-slate-900">Resumo de Assinaturas</h3>
        </div>
        {dashboardData.monthlySubscriptions.length === 0 ? (
          <EmptyState
            title="Nenhuma assinatura marcada"
            description="Use a categoria 🔄 Assinaturas em lançamentos recorrentes fixos para preencher este resumo."
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
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800">
              Custo Mensal de Assinaturas: {formatCurrency(dashboardData.monthlySubscriptionsTotal)}
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <RecentTransactions
          transactions={dashboardData.contasPagarPendentes}
          title="Contas a pagar (pendentes)"
          description="Despesas pendentes, ordenadas pelo vencimento."
          emptyTitle="Nada pendente"
          emptyDescription="Quando houver despesas com status pendente, elas aparecem aqui."
          payerMeta={{ compact: false }}
        />
        <RecentTransactions
          transactions={dashboardData.ultimosPagamentos}
          title="Últimos pagamentos realizados"
          description="Lançamentos com status pago, do mais recente ao mais antigo."
          emptyTitle="Nenhum pagamento registrado"
          emptyDescription="Confirme pagamentos nos lançamentos para preencher este painel."
          payerMeta={{ compact: false }}
        />
      </section>

      <PlanningAlertCard />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Próximas contas</h3>
          <span className="text-xs font-medium text-slate-500">Próximos vencimentos e atrasos em destaque</span>
        </div>
        <div className="space-y-2">
          {dashboardData.upcomingAccounts.length === 0 ? (
            <EmptyState
              title="Sem contas próximas"
              description="Nenhuma despesa pendente na fila."
            />
          ) : (
            dashboardData.upcomingAccounts.map((account) => (
              <article
                key={account.id}
                className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${
                  account.isVencida ? "border-rose-300 bg-rose-50/60 ring-1 ring-rose-200/80" : "border-slate-200"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {account.isVencida ? (
                      <span className="rounded-md border border-rose-500 bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-rose-800">
                        Vencida
                      </span>
                    ) : null}
                    {account.payerChip ? (
                      <span
                        title={account.payerChip.label}
                        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          account.payerChip.tone === "partner"
                            ? "bg-violet-100 text-violet-800"
                            : account.payerChip.tone === "split"
                              ? "bg-emerald-100 text-emerald-800"
                              : account.payerChip.tone === "joint"
                                ? "bg-slate-200 text-slate-700"
                                : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {account.payerChip.initial}
                      </span>
                    ) : null}
                    <p className="min-w-0 truncate text-sm font-semibold text-slate-900">
                      {account.displayDesc || "Lançamento"}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
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

    </div>
  )
}

export default Dashboard

