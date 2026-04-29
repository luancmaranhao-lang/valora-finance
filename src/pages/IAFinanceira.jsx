import { useEffect, useMemo, useState } from "react"
import EmptyState from "../components/EmptyState"
import FinanceMentorChat from "../components/FinanceMentorChat"
import PageHeader from "../components/PageHeader"
import { listarLancamentos } from "../services/lancamentosService"
import { getWalletsSummary, WALLETS_UPDATED_EVENT } from "../services/walletsService"

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

function IAFinanceira() {
  const [transactions, setTransactions] = useState([])
  const [walletSummary, setWalletSummary] = useState(() => getWalletsSummary())
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true)
        setErrorMessage("")
        const data = await listarLancamentos()
        setTransactions(data ?? [])
      } catch {
        setErrorMessage("Nao foi possivel carregar os lancamentos para a IA.")
      } finally {
        setIsLoading(false)
      }
    }

    const timer = setTimeout(() => {
      void loadData()
    }, 0)

    function onLancamentosUpdated() {
      void loadData()
    }
    window.addEventListener("lancamentos:updated", onLancamentosUpdated)

    return () => {
      clearTimeout(timer)
      window.removeEventListener("lancamentos:updated", onLancamentosUpdated)
    }
  }, [])

  useEffect(() => {
    function syncWallets() {
      setWalletSummary(getWalletsSummary())
    }
    window.addEventListener(WALLETS_UPDATED_EVENT, syncWallets)
    window.addEventListener("storage", syncWallets)
    return () => {
      window.removeEventListener(WALLETS_UPDATED_EVENT, syncWallets)
      window.removeEventListener("storage", syncWallets)
    }
  }, [])

  const summary = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const pending = new Set(["pendente", "agendada", "atrasada"])
    const inMonth = (item) => {
      const raw = item.data ?? item.date
      if (!raw) return false
      const d = parseDateOnly(raw)
      if (!d) return false
      return d.getFullYear() === y && d.getMonth() === m
    }
    const mes = transactions.filter(inMonth)
    const receitas = mes
      .filter((i) => (i.tipo ?? i.type ?? "").toString().toLowerCase() === "receita")
      .reduce((s, i) => s + Number(i.valor ?? i.value ?? 0), 0)
    const despesasPagas = mes
      .filter(
        (i) =>
          (i.tipo ?? i.type ?? "").toString().toLowerCase() === "despesa" &&
          (i.status ?? "").toString().toLowerCase() === "pago",
      )
      .reduce((s, i) => s + Number(i.valor ?? i.value ?? 0), 0)
    const despesasPend = mes
      .filter(
        (i) =>
          (i.tipo ?? i.type ?? "").toString().toLowerCase() === "despesa" &&
          pending.has((i.status ?? "").toString().toLowerCase()),
      )
      .reduce((s, i) => s + Number(i.valor ?? i.value ?? 0), 0)
    const despesasTotais = mes
      .filter((i) => (i.tipo ?? i.type ?? "").toString().toLowerCase() === "despesa")
      .reduce((s, i) => s + Number(i.valor ?? i.value ?? 0), 0)
    return { receitas, despesasTotais, despesasPagas, despesasPend, saldoPrevisto: receitas - despesasPagas - despesasPend }
  }, [transactions])

  const analysisScope = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()

    const rows = transactions
      .map((item) => {
        const dt = parseDateOnly(item.data ?? item.date)
        if (!dt) return null
        return {
          y: dt.getFullYear(),
          m: dt.getMonth(),
          tipo: (item.tipo ?? item.type ?? "").toString().toLowerCase(),
          status: (item.status ?? "").toString().toLowerCase(),
          categoria: item.categoria ?? item.category ?? "Outros",
          descricao: item.descricao ?? item.description ?? "",
          valor: Number(item.valor ?? item.value ?? 0),
          data: String(item.data ?? item.date ?? "").slice(0, 10),
        }
      })
      .filter(Boolean)
      .filter((row) => row.y > currentYear || (row.y === currentYear && row.m >= currentMonth))

    const monthMap = new Map()
    rows.forEach((row) => {
      const key = `${row.y}-${String(row.m + 1).padStart(2, "0")}`
      if (!monthMap.has(key)) {
        monthMap.set(key, { receitas: 0, despesas: 0, pendentes: 0 })
      }
      const acc = monthMap.get(key)
      if (row.tipo === "receita") acc.receitas += row.valor
      if (row.tipo === "despesa") {
        acc.despesas += row.valor
        if (["pendente", "agendada", "atrasada"].includes(row.status)) acc.pendentes += row.valor
      }
    })

    const futureByMonth = Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, totals]) => ({ month, ...totals }))

    return {
      monthReference: `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`,
      currentSummary: summary,
      futureByMonth,
      rows: rows.slice(0, 120),
    }
  }, [transactions, summary])

  const mentorContext = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const today = new Date(y, m, now.getDate())
    const pendingStatuses = new Set(["pendente", "agendada", "atrasada"])
    const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(y, m, 1))

    const monthRows = transactions
      .map((item) => {
        const dt = parseDateOnly(item.data ?? item.date)
        if (!dt) return null
        return {
          tipo: (item.tipo ?? item.type ?? "").toString().toLowerCase(),
          status: (item.status ?? "").toString().toLowerCase(),
          descricao: item.descricao ?? item.description ?? "Lançamento",
          categoria: item.categoria ?? item.category ?? "Outros",
          valor: Number(item.valor ?? item.value ?? 0),
          data: String(item.data ?? item.date ?? "").slice(0, 10),
          d: dt,
        }
      })
      .filter(Boolean)
      .filter((row) => row.d.getFullYear() === y && row.d.getMonth() === m)

    const allExpensesMonth = monthRows
      .filter((row) => row.tipo === "despesa")
      .map((row) => ({
        descricao: row.descricao,
        categoria: row.categoria,
        valor: row.valor,
        status: row.status,
        dataVencimento: row.data,
      }))

    const overduePending = allExpensesMonth.filter((row) => {
      if (!pendingStatuses.has(row.status)) return false
      const due = parseDateOnly(row.dataVencimento)
      if (!due) return true
      return due < today
    })

    return {
      monthName,
      allExpensesMonth,
      overduePending,
      wallets: walletSummary.wallets.map((wallet) => ({
        nome: wallet.nome,
        saldo: Number(wallet.saldo ?? 0),
      })),
      totalWalletBalance: Number(walletSummary.totalSaldo ?? 0),
      expensesPaidMonth: summary.despesasPagas,
      expensesPendingMonth: summary.despesasPend,
      receitasMes: summary.receitas,
      saldoPrevistoMes: summary.saldoPrevisto,
      allMonthTransactions: monthRows.map((row) => ({
        descricao: row.descricao,
        categoria: row.categoria,
        tipo: row.tipo,
        status: row.status,
        valor: row.valor,
        data: row.data,
      })),
    }
  }, [transactions, summary, walletSummary])

  return (
    <div className="space-y-6">
      <PageHeader
        title="IA Financeira"
        subtitle="Mentor com contexto do casal (quando o grupo permite) — relatorio, dividas macro e metas."
      />

      {isLoading ? (
        <EmptyState title="Carregando dados" description="Buscando lancamentos..." />
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Receita total do mes</p>
          <p className="mt-2 text-lg font-semibold text-emerald-700">{formatCurrency(summary.receitas)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Despesas totais do mes</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(summary.despesasTotais)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Despesas pagas</p>
          <p className="mt-2 text-lg font-semibold text-rose-700">{formatCurrency(summary.despesasPagas)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Despesas pendentes</p>
          <p className="mt-2 text-lg font-semibold text-amber-700">{formatCurrency(summary.despesasPend)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Saldo previsto (mes)</p>
          <p className={`mt-2 text-lg font-semibold ${summary.saldoPrevisto >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {formatCurrency(summary.saldoPrevisto)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Receitas − realizadas − pendentes no mes.</p>
        </article>
      </section>

      <FinanceMentorChat monthlySnapshot={summary} analysisScope={analysisScope} mentorContext={mentorContext} />
    </div>
  )
}

export default IAFinanceira
