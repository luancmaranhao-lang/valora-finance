import { useCallback, useEffect, useMemo, useState } from "react"
import EmptyState from "../components/EmptyState"
import { CategoryBarChart, CategoryPieChart } from "../components/reporting/CategoryCharts"
import { GOTO_PAGE_EVENT, CATEGORY_DRILLDOWN_KEY } from "../constants/navigationEvents"
import { listarContas } from "../services/contasService"
import { listarGastosEsporadicosPorCompetencia } from "../services/gastosEsporadicosService"
import { listarLancamentos } from "../services/lancamentosService"
import { buildProjectedRawRows, buildProjectedRawRowsForYear } from "../utils/projectedRecurringExpenses"
import { getYearMonthKeyFromParts, mergeGastosEsporadicosToPlanningItems, VARIABLE_PLANNING_UPDATED_EVENT } from "../utils/variablePlanningStore"

const REPORT_CONTEXT_STORAGE_KEY = "valora:reportContext"

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function parseDateOnly(value) {
  const raw = String(value ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const fallback = new Date(value)
    return Number.isNaN(fallback.getTime()) ? null : fallback
  }
  const [y, m, d] = raw.split("-").map(Number)
  const local = new Date(y, m - 1, d)
  return Number.isNaN(local.getTime()) ? null : local
}

function drillDownToCategory(categoryLabel) {
  sessionStorage.setItem(CATEGORY_DRILLDOWN_KEY, categoryLabel)
  window.dispatchEvent(new CustomEvent(GOTO_PAGE_EVENT, { detail: { page: "Lançamentos de Despesas" } }))
}

function roundMoney2(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function Relatorios() {
  const [transactions, setTransactions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [planningItemsForReport, setPlanningItemsForReport] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [periodType, setPeriodType] = useState("mensal")
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth())

  const loadReportData = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadReportData()
    }, 0)
    window.addEventListener("lancamentos:updated", loadReportData)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("lancamentos:updated", loadReportData)
    }
  }, [loadReportData])

  useEffect(() => {
    if (periodType !== "mensal") {
      setPlanningItemsForReport([])
      return
    }
    let cancelled = false
    const key = getYearMonthKeyFromParts(selectedYear, selectedMonth)
    async function loadPlanning() {
      try {
        const rows = await listarGastosEsporadicosPorCompetencia(key)
        if (cancelled) return
        setPlanningItemsForReport(mergeGastosEsporadicosToPlanningItems(rows, selectedYear, selectedMonth))
      } catch {
        if (!cancelled) setPlanningItemsForReport([])
      }
    }
    void loadPlanning()
    function onPlanningUpdated() {
      void loadPlanning()
    }
    window.addEventListener(VARIABLE_PLANNING_UPDATED_EVENT, onPlanningUpdated)
    return () => {
      cancelled = true
      window.removeEventListener(VARIABLE_PLANNING_UPDATED_EVENT, onPlanningUpdated)
    }
  }, [periodType, selectedYear, selectedMonth])

  const summary = useMemo(() => {
    const pendingStatuses = new Set(["pendente", "agendada", "atrasada", "previsto", "planned"])

    function isDateInSelectedPeriod(dateValue) {
      if (!dateValue) return false
      const date = parseDateOnly(dateValue)
      if (!date) return false
      if (periodType === "anual") {
        return date.getFullYear() === selectedYear
      }
      return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear
    }

    const realScoped = transactions.filter((item) => isDateInSelectedPeriod(item.data ?? item.date))
    const projectedScoped =
      periodType === "mensal"
        ? buildProjectedRawRows(transactions, selectedYear, selectedMonth)
        : periodType === "anual"
          ? buildProjectedRawRowsForYear(transactions, selectedYear)
          : []
    const scopedTransactions = [...realScoped, ...projectedScoped]
    const scopedAccounts = accounts.filter((item) => isDateInSelectedPeriod(item.vencimento ?? item.dueDate))

    const receitas = scopedTransactions
      .filter((item) => (item.tipo ?? item.type ?? "").toString().toLowerCase() === "receita")
      .reduce((sum, item) => sum + Number(item.valor ?? item.value ?? 0), 0)

    const despesasPagas = scopedTransactions
      .filter((item) => {
        const tipo = (item.tipo ?? item.type ?? "").toString().toLowerCase()
        const status = (item.status ?? "").toString().toLowerCase()
        return tipo === "despesa" && status === "pago"
      })
      .reduce((sum, item) => sum + Math.abs(Number(item.valor ?? item.value ?? 0)), 0)

    const despesasPendentesMes = scopedTransactions
      .filter((item) => {
        const tipo = (item.tipo ?? item.type ?? "").toString().toLowerCase()
        const status = (item.status ?? "").toString().toLowerCase()
        return tipo === "despesa" && pendingStatuses.has(status)
      })
      .reduce((sum, item) => sum + Math.abs(Number(item.valor ?? item.value ?? 0)), 0)

    const contasPendentes = scopedAccounts
      .filter((item) => pendingStatuses.has((item.status ?? "").toString().toLowerCase()))
      .reduce((sum, item) => sum + Math.abs(Number(item.valor ?? item.value ?? 0)), 0)

    const saldoPrevisto = receitas - despesasPagas - despesasPendentesMes

    const expenseRows = scopedTransactions.filter(
      (item) => (item.tipo ?? item.type ?? "").toString().toLowerCase() === "despesa",
    )
    const incomeRows = scopedTransactions.filter(
      (item) => (item.tipo ?? item.type ?? "").toString().toLowerCase() === "receita",
    )

    const categoryTotals = expenseRows.reduce((acc, item) => {
      const rawCat = item.categoria ?? item.category
      const category = String(rawCat ?? "").trim() || "Sem categoria"
      const v = Math.abs(Number(item.valor ?? item.value ?? 0))
      if (!Number.isFinite(v) || v <= 0) return acc
      acc[category] = (acc[category] ?? 0) + v
      return acc
    }, {})

    for (const item of planningItemsForReport) {
      if (item.status !== "pendente") continue
      if (item.contabilizaNoTotal === false) continue
      const v = roundMoney2(Number(item.plannedValue ?? 0))
      if (v <= 0) continue
      const label = String(item.displayLabel || item.descricao || "Provisão").trim() || "Provisão"
      categoryTotals[label] = (categoryTotals[label] ?? 0) + v
    }

    const chartEntries = Object.entries(categoryTotals)
      .map(([name, value]) => ({ name, value: roundMoney2(value) }))
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value)

    const incomeTotals = incomeRows.reduce((acc, item) => {
      const category = item.categoria ?? item.category ?? "Outros"
      acc[category] = (acc[category] ?? 0) + Number(item.valor ?? item.value ?? 0)
      return acc
    }, {})

    const incomeChartEntries = Object.entries(incomeTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    const dueSoonAccounts = scopedAccounts
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
      despesasPagas,
      despesasPendentesMes,
      contasPendentes,
      saldoPrevisto,
      chartEntries,
      incomeChartEntries,
      dueSoonAccounts,
      decisionSummary,
    }
  }, [transactions, accounts, planningItemsForReport, periodType, selectedYear, selectedMonth])

  const currentMonthLabel = useMemo(() => {
    if (periodType === "anual") {
      return `Ano de ${selectedYear}`
    }
    return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
      new Date(selectedYear, selectedMonth, 1),
    )
  }, [periodType, selectedYear, selectedMonth])

  const availableYears = useMemo(() => {
    const years = new Set()
    for (const item of transactions) {
      const date = parseDateOnly(item.data ?? item.date)
      if (date) years.add(date.getFullYear())
    }
    for (const item of accounts) {
      const date = parseDateOnly(item.vencimento ?? item.dueDate)
      if (date) years.add(date.getFullYear())
    }
    years.add(new Date().getFullYear())
    return Array.from(years).sort((a, b) => b - a)
  }, [transactions, accounts])

  useEffect(() => {
    const context = {
      periodo: {
        tipo: periodType,
        ano: selectedYear,
        mes: periodType === "mensal" ? selectedMonth + 1 : null,
        rotulo: currentMonthLabel,
      },
      resumo: {
        receitas: summary.receitas,
        despesasPagas: summary.despesasPagas,
        despesasPendentes: summary.despesasPendentesMes,
        contasPendentes: summary.contasPendentes,
        saldoPrevisto: summary.saldoPrevisto,
      },
      categorias: {
        despesas: summary.chartEntries,
        receitas: summary.incomeChartEntries,
      },
      updatedAt: new Date().toISOString(),
    }
    sessionStorage.setItem(REPORT_CONTEXT_STORAGE_KEY, JSON.stringify(context))
  }, [periodType, selectedYear, selectedMonth, currentMonthLabel, summary])

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#d8c08a]/45 bg-[#f8f2e3]/80 px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a5b16]">Mês de referência</p>
            <p className="mt-1 text-lg font-semibold capitalize text-[#3f3011]">{currentMonthLabel}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a5b16]">Período</span>
              <select
                value={periodType}
                onChange={(event) => setPeriodType(event.target.value)}
                className="rounded-xl border border-[#d8c08a]/55 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#d8c08a]/50"
              >
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a5b16]">Ano</span>
              <select
                value={selectedYear}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
                className="rounded-xl border border-[#d8c08a]/55 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#d8c08a]/50"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            {periodType === "mensal" ? (
              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a5b16]">Mês</span>
                <select
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(Number(event.target.value))}
                  className="rounded-xl border border-[#d8c08a]/55 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#d8c08a]/50"
                >
                  {Array.from({ length: 12 }).map((_, monthIdx) => (
                    <option key={monthIdx} value={monthIdx}>
                      {new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2026, monthIdx, 1))}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>
      </section>

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

      <section className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#6b5217]">Despesas</h2>
          <section className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Despesas realizadas</p>
              <p className="mt-2 text-xl font-semibold text-rose-700">{formatCurrency(summary.despesasPagas)}</p>
              <p className="mt-1 text-xs text-slate-500">Somente marcadas como pagas no mês.</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Despesas pendentes</p>
              <p className="mt-2 text-xl font-semibold text-amber-700">{formatCurrency(summary.despesasPendentesMes)}</p>
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

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Gasto por categoria (pizza)</h3>
            <p className="mt-1 text-xs text-slate-500">
              Lançamentos do período + provisões variáveis pendentes (conta no total). Clique na fatia ou na legenda para ir
              aos lançamentos.
            </p>
            <div className="mt-6 flex justify-center">
              {summary.chartEntries.length === 0 ? (
                <EmptyState title="Sem despesas no mês" description="Registre despesas para montar o gráfico." />
              ) : (
                <CategoryPieChart entries={summary.chartEntries} onSliceClick={(cat) => drillDownToCategory(cat)} />
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Despesas por categoria (lista)</h3>
            <p className="mt-1 text-xs text-slate-500">Detalhamento complementar ao gráfico de pizza.</p>
            <div className="mt-4 space-y-2">
              {summary.chartEntries.length === 0 ? (
                <EmptyState title="Sem categorias no período" description="Adicione despesas para listar as categorias." />
              ) : (
                summary.chartEntries.map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    onClick={() => drillDownToCategory(entry.name)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:bg-slate-50"
                  >
                    <span className="text-sm font-medium text-slate-800">{entry.name}</span>
                    <span className="valora-num text-sm font-semibold text-slate-900">{formatCurrency(entry.value)}</span>
                  </button>
                ))
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Contas próximas do vencimento</h3>
            <div className="mt-4 space-y-2">
              {summary.dueSoonAccounts.length === 0 ? (
                <EmptyState title="Sem contas próximas" description="Não há contas pendentes com vencimento próximo." />
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

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#6b5217]">Receitas</h2>
          <section className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Receitas do mês</p>
              <p className="mt-2 text-xl font-semibold text-emerald-700">{formatCurrency(summary.receitas)}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">Saldo previsto</p>
              <p className={`mt-2 text-xl font-semibold ${summary.saldoPrevisto >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {formatCurrency(summary.saldoPrevisto)}
              </p>
            </article>
          </section>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Receita por categoria (barras)</h3>
            <p className="mt-1 text-xs text-slate-500">Comparativo das receitas por categoria.</p>
            <div className="mt-4">
              {summary.incomeChartEntries.length === 0 ? (
                <EmptyState title="Sem receitas no mês" description="Cadastre receitas no mês." />
              ) : (
                <CategoryBarChart entries={summary.incomeChartEntries} onBarClick={() => {}} />
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900">Resumo geral</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Receitas e despesas agora aparecem juntas nesta tela, separadas por coluna para leitura rápida.
            </p>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p>
                Receitas: <strong className="text-emerald-700">{formatCurrency(summary.receitas)}</strong>
              </p>
              <p className="mt-1">
                Despesas pagas: <strong className="text-rose-700">{formatCurrency(summary.despesasPagas)}</strong>
              </p>
              <p className="mt-1">
                Saldo previsto: <strong className={summary.saldoPrevisto >= 0 ? "text-emerald-700" : "text-rose-700"}>{formatCurrency(summary.saldoPrevisto)}</strong>
              </p>
            </div>
          </article>
        </section>
      </section>
    </div>
  )
}

export default Relatorios
