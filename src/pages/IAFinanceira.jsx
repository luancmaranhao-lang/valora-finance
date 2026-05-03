import { useCallback, useEffect, useMemo, useState } from "react"
import EmptyState from "../components/EmptyState"
import FinanceMentorChat from "../components/FinanceMentorChat"
import PageHeader from "../components/PageHeader"
import useSubscription from "../hooks/useSubscription"
import { listarGastosEsporadicosPorCompetencia } from "../services/gastosEsporadicosService"
import { listarLancamentos } from "../services/lancamentosService"
import { metasService } from "../services/metasService"
import { supabase } from "../services/supabaseClient"
import { getWalletsSummary, WALLETS_UPDATED_EVENT } from "../services/walletsService"
import {
  mergeGastosEsporadicosToPlanningItems,
  sumPendingProvision,
  VARIABLE_PLANNING_UPDATED_EVENT,
} from "../utils/variablePlanningStore"
import { getWeekendsInMonth, valorPorSexta } from "../utils/weekendMonthUtils"

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

function roundMoney2(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.round(x * 100) / 100
}

function normalizeMentorText(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
}

/** Despesa de supermercado / alimentação (categoria do app). */
function isMercadoAlimentacaoCategory(cat) {
  const s = normalizeMentorText(cat)
  return s.includes("mercado") || s.includes("alimentacao")
}

/** Receita típica de vale, ticket ou benefício de alimentação (heurística por texto). */
function isBeneficioAlimentacaoReceita(row) {
  if (row.tipo !== "receita") return false
  const blob = `${normalizeMentorText(row.descricao)} ${normalizeMentorText(row.categoria)}`
  if (blob.includes("vale") && (blob.includes("aliment") || blob.includes("refeic"))) return true
  if (blob.includes("ticket") && blob.includes("aliment")) return true
  if (blob.includes("vale refei")) return true
  if (/\bvr\b/.test(blob) || /\bva\b/.test(blob)) return true
  if (blob.includes("cesta") && blob.includes("basica")) return true
  return false
}

function IAFinanceira() {
  const [transactions, setTransactions] = useState([])
  const [walletSummary, setWalletSummary] = useState(() => getWalletsSummary())
  const [userId, setUserId] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [mentorExtras, setMentorExtras] = useState({ gastos: [], metas: [] })
  const { isPremium, isSubscriptionLoading } = useSubscription()

  const chatPeriod = useMemo(() => {
    const d = new Date()
    return { chatYear: d.getFullYear(), chatMonth: d.getMonth() + 1 }
  }, [])

  useEffect(() => {
    async function loadUserId() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        setUserId(user?.id ?? null)
      } catch {
        setUserId(null)
      } finally {
        setAuthReady(true)
      }
    }
    void loadUserId()
  }, [])

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

  const loadMentorExtras = useCallback(async () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const competencia = `${y}-${String(m + 1).padStart(2, "0")}`
    try {
      const [gastos, metas] = await Promise.all([
        listarGastosEsporadicosPorCompetencia(competencia).catch(() => []),
        metasService.listarMetas().catch(() => []),
      ])
      setMentorExtras({ gastos: gastos ?? [], metas: metas ?? [] })
    } catch {
      setMentorExtras({ gastos: [], metas: [] })
    }
  }, [])

  useEffect(() => {
    if (!authReady) return
    void loadMentorExtras()
    function refresh() {
      void loadMentorExtras()
    }
    window.addEventListener("lancamentos:updated", refresh)
    window.addEventListener(VARIABLE_PLANNING_UPDATED_EVENT, refresh)
    return () => {
      window.removeEventListener("lancamentos:updated", refresh)
      window.removeEventListener(VARIABLE_PLANNING_UPDATED_EVENT, refresh)
    }
  }, [authReady, loadMentorExtras])

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

  const monthLaunchCount = useMemo(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    return transactions.filter((item) => {
      const d = parseDateOnly(item.data ?? item.date)
      return d && d.getFullYear() === y && d.getMonth() === m
    }).length
  }, [transactions])

  const variablePlanningReady = (mentorExtras.gastos ?? []).length > 0

  const mentorCompetencia = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  }, [])

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

    const { fridays, saturdays, weekendLabelCount } = getWeekendsInMonth(y, m)
    const planningItems = mergeGastosEsporadicosToPlanningItems(mentorExtras.gastos, y, m)
    const totalVariaveisPendentes = roundMoney2(sumPendingProvision(planningItems))
    const totalWalletBalance = roundMoney2(Number(walletSummary.totalSaldo ?? 0))
    const despesasPendentesMes = roundMoney2(summary.despesasPend)
    const saldoRealDisponivel = roundMoney2(totalWalletBalance - despesasPendentesMes - totalVariaveisPendentes)

    const provisoesLinhas = []
    for (const item of planningItems) {
      if (item.status !== "pendente" || item.contabilizaNoTotal === false) continue
      const v = Number(item.plannedValue ?? 0)
      if (!Number.isFinite(v) || v <= 0) continue
      let extra = ""
      if (item.codigo === "final_de_semana" && weekendLabelCount > 0) {
        const ps = valorPorSexta(v, weekendLabelCount)
        if (ps != null) extra = ` · referência por sexta ≈ R$ ${ps.toFixed(2)} (${weekendLabelCount} sextas no mês)`
      } else if (item.codigo === "lazer" && weekendLabelCount > 0) {
        const ps = valorPorSexta(v, weekendLabelCount)
        if (ps != null) extra = ` · divisão orientadora (Lazer ÷ sextas) ≈ R$ ${ps.toFixed(2)} em ${weekendLabelCount} sextas`
      }
      provisoesLinhas.push(`${item.displayLabel}: R$ ${v.toFixed(2)}${extra}`)
    }

    const metasLinhas = (mentorExtras.metas ?? []).map((meta) => {
      const nome = String(meta.nome ?? meta.name ?? "Meta").trim() || "Meta"
      const alvo = roundMoney2(Number(meta.valor_alvo ?? meta.target ?? 0))
      const atual = roundMoney2(Number(meta.valor_atual ?? meta.current ?? 0))
      const falta = roundMoney2(Math.max(0, alvo - atual))
      const prazo = meta.prazo ?? meta.deadline ?? "—"
      return `${nome}: guardado R$ ${atual.toFixed(2)} / objetivo R$ ${alvo.toFixed(2)} (faltam R$ ${falta.toFixed(2)}) · prazo ${prazo}`
    })

    const receitasBeneficioAlim = monthRows.filter((row) => isBeneficioAlimentacaoReceita(row))
    const despesasMercadoAlim = monthRows.filter(
      (row) => row.tipo === "despesa" && isMercadoAlimentacaoCategory(row.categoria),
    )
    const totalRecBen = roundMoney2(receitasBeneficioAlim.reduce((s, r) => s + r.valor, 0))
    const totalDepMac = roundMoney2(despesasMercadoAlim.reduce((s, r) => s + r.valor, 0))
    let beneficioVsMercadoResumo = ""
    if (receitasBeneficioAlim.length === 0 && despesasMercadoAlim.length === 0) {
      beneficioVsMercadoResumo =
        "Nenhuma receita detetada como vale/ticket de alimentação nem despesa só em Mercado/Alimentação pelas heurísticas do app. Ainda assim aplique a regra de pareamento ao ler a lista completa."
    } else {
      const rList = receitasBeneficioAlim
        .map((r) => `${r.descricao} R$ ${r.valor.toFixed(2)} [${r.status}]`)
        .join(" | ")
      const dList = despesasMercadoAlim
        .map((r) => `${r.descricao} (${r.categoria}) R$ ${r.valor.toFixed(2)} [${r.status}]`)
        .join(" | ")
      beneficioVsMercadoResumo = `Receitas-benefício (heurística): ${receitasBeneficioAlim.length} lanç., total R$ ${totalRecBen.toFixed(2)} — ${rList || "—"}. Despesas Mercado/Alimentação: ${despesasMercadoAlim.length} lanç., total R$ ${totalDepMac.toFixed(2)} — ${dList || "—"}.`
    }

    return {
      monthName,
      allExpensesMonth,
      overduePending,
      wallets: walletSummary.wallets.map((wallet) => ({
        nome: wallet.nome,
        saldo: Number(wallet.saldo ?? 0),
      })),
      totalWalletBalance,
      expensesPaidMonth: summary.despesasPagas,
      expensesPendingMonth: despesasPendentesMes,
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
      /** Sextas/sábados do mês civil (mesma lógica que Lançamentos / getWeekendsInMonth). */
      weekendStats: { fridays, saturdays, weekendLabelCount },
      totalVariaveisPendentes,
      saldoRealDisponivel,
      saldoRealDisponivelFormula: `Carteiras R$ ${totalWalletBalance.toFixed(2)} − despesas pendentes (lançamentos do mês) R$ ${despesasPendentesMes.toFixed(2)} − provisões variáveis pendentes (gastos_esporadicos) R$ ${totalVariaveisPendentes.toFixed(2)} = R$ ${saldoRealDisponivel.toFixed(2)}`,
      provisoesResumo: provisoesLinhas.join(" | ") || "Nenhuma provisão pendente com valor > 0.",
      metasResumo: metasLinhas.join(" | ") || "Nenhuma meta cadastrada.",
      beneficioVsMercadoResumo,
    }
  }, [transactions, summary, walletSummary, mentorExtras])

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

      <FinanceMentorChat
        monthlySnapshot={summary}
        analysisScope={analysisScope}
        mentorContext={mentorContext}
        userId={userId}
        authReady={authReady}
        chatYear={chatPeriod.chatYear}
        chatMonth={chatPeriod.chatMonth}
        monthLaunchCount={monthLaunchCount}
        variablePlanningReady={variablePlanningReady}
        isPremium={isPremium}
        isSubscriptionLoading={isSubscriptionLoading}
        competencia={mentorCompetencia}
      />
    </div>
  )
}

export default IAFinanceira
