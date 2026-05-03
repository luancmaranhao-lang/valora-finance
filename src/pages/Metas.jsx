import { useEffect, useMemo, useState } from "react"
import EmptyState from "../components/EmptyState"
import ProgressBar from "../components/ProgressBar"
import StatusBadge from "../components/StatusBadge"
import { criarLancamento, listarLancamentos } from "../services/lancamentosService"
import { metasService } from "../services/metasService"
import { supabase } from "../services/supabaseClient"

const initialForm = {
  name: "",
  target: "",
  current: "",
  deadline: "",
}
const emergencyMetaName = "Reserva de Emergência"

/** Casa e Alimentação (com ou sem emoji; ignora acentos em "Alimentação"). */
function isEmergencySuggestionCategory(rawCategory) {
  const s = String(rawCategory ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
  return s.includes("casa") || s.includes("alimentacao")
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function parseMoneyInput(value) {
  const raw = String(value ?? "").trim()
  if (!raw) return 0
  const normalized = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseLancamentoAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  return parseMoneyInput(value)
}

function Metas() {
  const [goals, setGoals] = useState([])
  const [form, setForm] = useState(initialForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingEmergencyMeta, setIsSavingEmergencyMeta] = useState(false)
  const [isCreatingEmergencyExpense, setIsCreatingEmergencyExpense] = useState(false)
  const [houseMonthlyAverage, setHouseMonthlyAverage] = useState(0)
  const [houseMonthsCount, setHouseMonthsCount] = useState(0)
  const [emergencySavedTotal, setEmergencySavedTotal] = useState(0)
  const [emergencyMonthlyInput, setEmergencyMonthlyInput] = useState("")
  const [message, setMessage] = useState("")
  const [formExpanded, setFormExpanded] = useState(false)

  async function loadMetas() {
    try {
      setIsLoading(true)
      const data = await metasService.listarMetas()
      setGoals(data ?? [])
    } catch (error) {
      setMessage(error?.message || "Nao foi possivel carregar as metas.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadMetas()
    }, 0)

    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    async function refreshEmergencyMetrics() {
      try {
        const allLancamentos = await listarLancamentos()
        const emergencyPaidTotal = (allLancamentos ?? [])
          .filter((item) => String(item.tipo ?? item.type ?? "").toLowerCase() === "despesa")
          .filter((item) => String(item.categoria ?? item.category ?? "").toLowerCase().includes("reserva de emergência"))
          .filter((item) => String(item.status ?? "").toLowerCase() === "pago")
          .reduce((sum, item) => sum + Math.abs(parseLancamentoAmount(item.valor ?? item.value ?? 0)), 0)
        setEmergencySavedTotal(emergencyPaidTotal)

        const now = new Date()
        const startCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const startLookback = new Date(now.getFullYear(), now.getMonth() - 6, 1)
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

        const monthlyTotals = new Map()
        ;(allLancamentos ?? [])
          .filter((item) => String(item.tipo ?? item.type ?? "").toLowerCase() === "despesa")
          .filter((item) => isEmergencySuggestionCategory(item.categoria ?? item.category))
          .forEach((item) => {
            const rawDate = String(item.data ?? item.date ?? "").slice(0, 10)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return
            const [yy, mm] = rawDate.split("-").map(Number)
            const dt = new Date(yy, mm - 1, 1)
            if (Number.isNaN(dt.getTime())) return
            if (dt < startLookback || dt >= startCurrentMonth) return
            const monthKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`
            const amount = Math.abs(parseLancamentoAmount(item.valor ?? item.value ?? 0))
            monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) ?? 0) + amount)
          })

        const monthCount = monthlyTotals.size
        const totalCasa6m = Array.from(monthlyTotals.values()).reduce((sum, value) => sum + value, 0)
        let avgCasa = monthCount > 0 ? totalCasa6m / monthCount : 0
        let effectiveMonthCount = monthCount

        // Regra de início: sem histórico passado, usa o mês atual como base inicial.
        if (effectiveMonthCount === 0) {
          const currentMonthTotal = (allLancamentos ?? [])
            .filter((item) => String(item.tipo ?? item.type ?? "").toLowerCase() === "despesa")
            .filter((item) => isEmergencySuggestionCategory(item.categoria ?? item.category))
            .reduce((sum, item) => {
              const rawDate = String(item.data ?? item.date ?? "").slice(0, 10)
              if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return sum
              const [yy, mm] = rawDate.split("-").map(Number)
              const key = `${yy}-${String(mm).padStart(2, "0")}`
              if (key !== currentMonthKey) return sum
              return sum + Math.abs(parseLancamentoAmount(item.valor ?? item.value ?? 0))
            }, 0)
          if (currentMonthTotal > 0) {
            avgCasa = currentMonthTotal
            effectiveMonthCount = 1
          }
        }

        setHouseMonthsCount(effectiveMonthCount)
        setHouseMonthlyAverage(avgCasa)
        if (!emergencyMonthlyInput) {
          setEmergencyMonthlyInput(avgCasa > 0 ? avgCasa.toFixed(2).replace(".", ",") : "")
        }
      } catch {
        setHouseMonthlyAverage(0)
        setHouseMonthsCount(0)
        setEmergencySavedTotal(0)
      }
    }

    const timer = setTimeout(() => {
      void refreshEmergencyMetrics()
    }, 0)

    function onLancamentosUpdated() {
      void refreshEmergencyMetrics()
    }
    window.addEventListener("lancamentos:updated", onLancamentosUpdated)

    return () => {
      clearTimeout(timer)
      window.removeEventListener("lancamentos:updated", onLancamentosUpdated)
    }
  }, [])

  function handleChange(event) {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const target = Number(form.target)
    const current = Number(form.current)
    if (!form.name || !target || !form.deadline) return

    try {
      setIsSaving(true)
      setMessage("")

      await metasService.salvarMeta({
        nome: form.name.trim(),
        valor_alvo: target,
        valor_atual: Number.isFinite(current) ? current : 0,
        prazo: form.deadline,
      })

      setForm(initialForm)
      setMessage("Meta salva com sucesso!")
      await loadMetas()
      window.dispatchEvent(new Event("metas:updated"))
    } catch (error) {
      setMessage(error?.message || "Nao foi possivel salvar a meta.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemove(goalId) {
    try {
      setMessage("")
      await metasService.removerMeta(goalId)
      setMessage("Meta removida com sucesso!")
      await loadMetas()
      window.dispatchEvent(new Event("metas:updated"))
    } catch (error) {
      setMessage(error?.message || "Nao foi possivel remover a meta.")
    }
  }

  async function handleCreateEmergencyMeta() {
    const target = houseMonthlyAverage * 6
    if (!target) {
      setMessage(
        "Cadastre despesas nas categorias Casa e/ou Alimentação nos últimos meses para sugerir a reserva automática.",
      )
      return
    }
    try {
      setIsSavingEmergencyMeta(true)
      setMessage("")
      const now = new Date()
      const deadline = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate())
      const isoDeadline = [
        deadline.getFullYear(),
        String(deadline.getMonth() + 1).padStart(2, "0"),
        String(deadline.getDate()).padStart(2, "0"),
      ].join("-")
      await metasService.salvarMeta({
        nome: emergencyMetaName,
        valor_alvo: target,
        valor_atual: 0,
        prazo: isoDeadline,
      })
      setMessage("Meta pré-cadastrada com sucesso: Reserva de Emergência.")
      await loadMetas()
      window.dispatchEvent(new Event("metas:updated"))
    } catch (error) {
      setMessage(error?.message || "Não foi possível pré-cadastrar a meta de reserva.")
    } finally {
      setIsSavingEmergencyMeta(false)
    }
  }

  async function handleCreateEmergencyExpense() {
    const amount = parseMoneyInput(emergencyMonthlyInput)
    if (!amount) {
      setMessage("Informe o valor que será separado no mês para lançar em Despesas.")
      return
    }
    try {
      setIsCreatingEmergencyExpense(true)
      setMessage("")
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.id) throw new Error("Sessão inválida.")
      const today = new Date()
      const isoToday = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0"),
      ].join("-")
      await criarLancamento({
        user_id: user.id,
        tipo: "despesa",
        descricao: "Aporte para Reserva de Emergência",
        categoria: "💰 Reserva de Emergência",
        valor: amount,
        data: isoToday,
        forma_pagamento: "PIX",
        recorrencia: "unica",
        status: "pendente",
        visibilidade: "privado",
        metodo_divisao: null,
      })
      setMessage("Aporte lançado em Lançamentos de Despesas com sucesso.")
      window.dispatchEvent(new Event("lancamentos:updated"))
    } catch (error) {
      setMessage(error?.message || "Não foi possível lançar o aporte em Despesas.")
    } finally {
      setIsCreatingEmergencyExpense(false)
    }
  }

  const enrichedGoals = useMemo(() => {
    const today = new Date()
    return goals.map((goal) => {
      const current = Number(goal.current ?? goal.valor_atual ?? goal.currentValue ?? 0)
      const target = Number(goal.target ?? goal.valor_alvo ?? goal.targetValue ?? 0)
      const deadline = goal.deadline ?? goal.prazo ?? ""
      const progress = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0
      const isConcluded = progress >= 100
      const isLate = !isConcluded && deadline ? new Date(deadline) < today : false
      const status = isConcluded ? "Concluida" : isLate ? "Atrasada" : "Em andamento"
      return {
        ...goal,
        name: goal.name ?? goal.nome ?? "Meta",
        current,
        target,
        deadline,
        progress,
        status,
      }
    })
  }, [goals])

  const emergencyTarget = houseMonthlyAverage * 6
  const hasEmergencyMeta = enrichedGoals.some((goal) => String(goal.name ?? "").trim() === emergencyMetaName)
  const emergencyGoal = enrichedGoals.find((goal) => String(goal.name ?? "").trim() === emergencyMetaName)
  const emergencyCurrent = emergencySavedTotal || Number(emergencyGoal?.current ?? 0)
  const emergencyMissing = Math.max(0, emergencyTarget - emergencyCurrent)

  return (
    <div className="space-y-6">
      {message ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">{message}</div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Nova meta</h2>
          <button
            type="button"
            onClick={() => setFormExpanded((prev) => !prev)}
            className="valora-gold-button rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            {formExpanded ? "Recolher formulário" : "Abrir formulário"}
          </button>
        </div>
        {formExpanded ? (
          <form className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleSubmit}>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Nome da meta"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
            <input
              name="target"
              type="number"
              min="0"
              value={form.target}
              onChange={handleChange}
              placeholder="Valor alvo"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
            <input
              name="current"
              type="number"
              min="0"
              value={form.current}
              onChange={handleChange}
              placeholder="Valor atual"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
            <input
              name="deadline"
              type="date"
              value={form.deadline}
              onChange={handleChange}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
            <button
              type="submit"
              disabled={isSaving}
              className="valora-gold-button rounded-xl px-4 py-2.5 text-sm font-semibold md:col-span-2 xl:col-span-4"
            >
              {isSaving ? "Salvando..." : "Adicionar meta"}
            </button>
          </form>
        ) : (
          <p className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Toque em <strong>Abrir formulário</strong> quando quiser cadastrar uma meta manual.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[#d8c08a]/45 bg-[#f8f2e3]/80 p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#3f3011]">Meta sugerida: {emergencyMetaName}</h2>
            <p className="text-xs text-[#6e5720]">
              Base automática: média dos últimos 6 meses passados das despesas em <strong className="font-semibold">Casa</strong> e{" "}
              <strong className="font-semibold">Alimentação</strong> (somadas por mês), vezes 6 — dividindo pelos meses com dados.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCreateEmergencyMeta()}
            disabled={isSavingEmergencyMeta || hasEmergencyMeta}
            className="valora-gold-button rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70"
          >
            {hasEmergencyMeta ? "Meta já cadastrada" : isSavingEmergencyMeta ? "Pré-cadastrando..." : "Pré-cadastrar meta"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <article className="rounded-xl border border-[#d8c08a]/40 bg-white/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a5b16]">Média mensal Casa + Alimentação (6m)</p>
            <p className="valora-num mt-1 text-xl font-semibold text-slate-900">{formatCurrency(houseMonthlyAverage)}</p>
            <p className="mt-1 text-[11px] text-slate-500">Meses com dados: {houseMonthsCount}</p>
          </article>
          <article className="rounded-xl border border-[#d8c08a]/40 bg-white/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a5b16]">Alvo 6 meses</p>
            <p className="valora-num mt-1 text-xl font-semibold text-slate-900">{formatCurrency(emergencyTarget)}</p>
          </article>
          <article className="rounded-xl border border-[#d8c08a]/40 bg-white/80 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a5b16]">Separar neste mês</p>
            <div className="mt-2 flex gap-2">
              <input
                value={emergencyMonthlyInput}
                onChange={(event) => setEmergencyMonthlyInput(event.target.value.replace(/[^\d,.\s]/g, "").replace(/\s/g, ""))}
                placeholder="Ex: 500,00"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
              />
              <button
                type="button"
                onClick={() => void handleCreateEmergencyExpense()}
                disabled={isCreatingEmergencyExpense}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-70"
              >
                {isCreatingEmergencyExpense ? "Lançando..." : "Lançar em Despesas"}
              </button>
            </div>
          </article>
        </div>
        <div className="mt-3 rounded-xl border border-[#d8c08a]/40 bg-white/80 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-slate-700">Total já separado</span>
            <span className="valora-num font-semibold text-emerald-700">{formatCurrency(emergencyCurrent)}</span>
          </div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-slate-700">Quanto falta</span>
            <span className="valora-num font-semibold text-amber-700">{formatCurrency(emergencyMissing)}</span>
          </div>
          <ProgressBar
            value={emergencyCurrent}
            max={Math.max(emergencyTarget, 1)}
            label="Progresso da reserva"
            tone="bg-emerald-500"
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            Carregando metas...
          </div>
        ) : null}
        {!isLoading && enrichedGoals.length === 0 ? (
          <EmptyState
            title="Nenhuma meta cadastrada"
            description="Adicione uma meta para acompanhar seu progresso financeiro."
          />
        ) : !isLoading ? (
          enrichedGoals.map((goal) => (
          <article key={goal.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{goal.name}</h3>
                <p className="text-xs text-slate-500">Prazo: {goal.deadline}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge
                  label={goal.status}
                  tone={goal.status === "Concluida" ? "success" : goal.status === "Atrasada" ? "danger" : "info"}
                />
                <button
                  type="button"
                  onClick={() => void handleRemove(goal.id)}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition-all hover:bg-rose-100"
                >
                  Excluir
                </button>
              </div>
            </div>

            <div className="space-y-1 text-sm text-slate-600">
              <p className="flex items-center justify-between">
                <span>Atual</span>
                <span className="font-semibold text-slate-900">{formatCurrency(goal.current)}</span>
              </p>
              <p className="flex items-center justify-between">
                <span>Alvo</span>
                <span className="font-semibold text-slate-900">{formatCurrency(goal.target)}</span>
              </p>
            </div>

            <div className="mt-3">
              <ProgressBar value={goal.current} max={goal.target} label="Progresso" tone="bg-emerald-500" />
            </div>
          </article>
          ))
        ) : null}
      </section>
    </div>
  )
}

export default Metas

