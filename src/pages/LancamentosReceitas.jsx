import { useEffect, useMemo, useRef, useState } from "react"
import EmptyState from "../components/EmptyState"
import { atualizarLancamento, criarLancamento, listarLancamentos, removerLancamento } from "../services/lancamentosService"
import { supabase } from "../services/supabaseClient"

const REPORT_CONTEXT_STORAGE_KEY = "valora:reportContext"

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0))
}

function normalizeDateOnly(value) {
  if (!value) return ""
  return String(value).slice(0, 10)
}

function parseDate(value) {
  const raw = normalizeDateOnly(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const [year, month, day] = raw.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

function getReceitaStatus(item) {
  const statusRaw = String(item.status ?? "").toLowerCase()
  const isPaidByStatus = statusRaw === "pago"
  const hasPaymentDate = Boolean(item.data_pagamento || item.data_recebimento || item.recebido_em)
  const isPaid = isPaidByStatus || hasPaymentDate
  if (isPaid) return { label: "Pago", tone: "paid", isRight: true }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const receitaDate = parseDate(item.data)
  if (receitaDate && receitaDate < today) return { label: "Pendente", tone: "pending", isRight: false }
  return { label: "Previsto", tone: "planned", isRight: false }
}

function LancamentosReceitas() {
  const [rawLancamentos, setRawLancamentos] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [formExpanded, setFormExpanded] = useState(false)
  const [message, setMessage] = useState("")
  const [formData, setFormData] = useState({
    description: "",
    category: "💼 Trabalho",
    value: "",
    date: "",
    paymentStatus: "Pendente",
    paymentMethod: "PIX",
    recurrenceType: "Única",
    dueDay: "",
  })
  const [viewYM, setViewYM] = useState(() => {
    try {
      const raw = sessionStorage.getItem(REPORT_CONTEXT_STORAGE_KEY)
      if (raw) {
        const ctx = JSON.parse(raw)
        const periodo = ctx?.periodo
        if (periodo?.tipo === "mensal" && Number.isFinite(periodo?.ano) && Number.isFinite(periodo?.mes)) {
          return { y: Number(periodo.ano), m: Number(periodo.mes) - 1 }
        }
      }
    } catch {
      // fallback para mês atual
    }
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth() }
  })

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        setIsLoading(true)
        const data = await listarLancamentos()
        setRawLancamentos(data ?? [])
      } catch (error) {
        setErrorMessage(error?.message || "Não foi possível carregar as receitas.")
      } finally {
        setIsLoading(false)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  const valueInputRef = useRef(null)

  useEffect(() => {
    if (!formExpanded) return
    const timer = setTimeout(() => valueInputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [formExpanded])

  async function reloadData() {
    const data = await listarLancamentos()
    setRawLancamentos(data ?? [])
  }

  function handleFormChange(event) {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!formData.description || !formData.value || !formData.date || !formData.paymentMethod) return

    try {
      setIsSaving(true)
      setMessage("")
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.id) throw new Error("Sessão inválida.")

      const payload = {
        user_id: user.id,
        tipo: "receita",
        descricao: formData.description.trim(),
        categoria: formData.category.trim(),
        valor: Number(formData.value),
        data: formData.date,
        forma_pagamento: formData.paymentMethod.trim(),
        recorrencia: formData.recurrenceType === "Salário recorrente" ? "recorrente_fixa" : "unica",
        dia_vencimento:
          formData.recurrenceType === "Salário recorrente" && formData.dueDay ? Number(formData.dueDay) : null,
        status: formData.paymentStatus === "Pago" ? "pago" : "pendente",
        visibilidade: "privado",
        metodo_divisao: null,
        cartao_id: null,
      }

      if (editingId) {
        await atualizarLancamento(editingId, payload)
      } else {
        await criarLancamento(payload)
      }
      await reloadData()
      setMessage(editingId ? "Receita atualizada com sucesso." : "Receita adicionada com sucesso.")
      setFormData({
        description: "",
        category: "💼 Trabalho",
        value: "",
        date: "",
        paymentStatus: "Pendente",
        paymentMethod: "PIX",
        recurrenceType: "Única",
        dueDay: "",
      })
      setEditingId(null)
      setFormExpanded(false)
    } catch (error) {
      setMessage(error?.message || "Não foi possível salvar a receita.")
    } finally {
      setIsSaving(false)
    }
  }

  function handleEdit(item) {
    setEditingId(item.id)
    setFormExpanded(true)
    setFormData({
      description: item.descricao ?? "",
      category: item.categoria ?? "💼 Trabalho",
      value: String(Number(item.valor ?? 0)),
      date: normalizeDateOnly(item.data),
      paymentStatus: String(item.status ?? "").toLowerCase() === "pago" ? "Pago" : "Pendente",
      paymentMethod: item.forma_pagamento ?? "PIX",
      recurrenceType: String(item.recorrencia ?? "unica") === "recorrente_fixa" ? "Salário recorrente" : "Única",
      dueDay: item.dia_vencimento ? String(item.dia_vencimento) : "",
    })
  }

  async function handleRemove(id) {
    try {
      await removerLancamento(id)
      if (editingId === id) {
        setEditingId(null)
        setFormData({
          description: "",
          category: "💼 Trabalho",
          value: "",
          date: "",
          paymentStatus: "Pendente",
          paymentMethod: "PIX",
          recurrenceType: "Única",
          dueDay: "",
        })
      }
      await reloadData()
    } catch (error) {
      setMessage(error?.message || "Não foi possível excluir a receita.")
    }
  }

  function shiftViewMonth(delta) {
    setViewYM(({ y, m }) => {
      let nextMonth = m + delta
      let nextYear = y
      while (nextMonth < 0) {
        nextMonth += 12
        nextYear -= 1
      }
      while (nextMonth > 11) {
        nextMonth -= 12
        nextYear += 1
      }
      return { y: nextYear, m: nextMonth }
    })
  }

  const monthTitle = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(viewYM.y, viewYM.m, 1),
  )

  const receitasDoMes = useMemo(() => {
    return rawLancamentos
      .filter((item) => String(item.tipo ?? "").toLowerCase() === "receita")
      .filter((item) => {
        const date = parseDate(item.data)
        return date && date.getFullYear() === viewYM.y && date.getMonth() === viewYM.m
      })
      .map((item) => ({ ...item, valor: Number(item.valor ?? 0), _status: getReceitaStatus(item) }))
      .sort((a, b) => {
        const da = parseDate(a.data)?.getTime() ?? 0
        const db = parseDate(b.data)?.getTime() ?? 0
        return da - db
      })
  }, [rawLancamentos, viewYM])

  const totais = useMemo(() => {
    const previsao = receitasDoMes.reduce((acc, item) => acc + Math.abs(Number(item.valor || 0)), 0)
    const recebidas = receitasDoMes
      .filter((item) => item._status.label === "Pago")
      .reduce((acc, item) => acc + Math.abs(Number(item.valor || 0)), 0)
    return {
      previsao,
      recebidas,
      aReceber: Math.max(0, previsao - recebidas),
    }
  }, [receitasDoMes])

  const paidPendingSplit = useMemo(() => {
    const pago = totais.recebidas
    const pend = totais.aReceber
    const sum = pago + pend
    if (sum <= 0) return { paidPct: 0, pendPct: 0 }
    return {
      paidPct: (pago / sum) * 100,
      pendPct: (pend / sum) * 100,
    }
  }, [totais])

  return (
    <div className="space-y-6">
      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">{errorMessage}</div>
      ) : null}
      {message ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">{message}</div>
      ) : null}

      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Novo lançamento de receitas</h2>
            <p className="mt-1 text-xs text-slate-500">Use o formulário apenas quando quiser registrar uma nova entrada.</p>
          </div>
          <button
            type="button"
            onClick={() => setFormExpanded((open) => !open)}
            className="valora-gold-button min-h-11 shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            {formExpanded ? "Recolher formulário" : "Abrir formulário"}
          </button>
        </div>

        {formExpanded ? (
          <form className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleSubmit}>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Descrição</span>
              <input
                name="description"
                value={formData.description}
                onChange={handleFormChange}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Categoria</span>
              <input
                name="category"
                value={formData.category}
                onChange={handleFormChange}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Valor</span>
              <input
                ref={valueInputRef}
                name="value"
                type="number"
                min="0"
                step="1"
                value={formData.value}
                onChange={handleFormChange}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Data</span>
              <input
                name="date"
                type="date"
                value={formData.date}
                onChange={handleFormChange}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Status</span>
              <select
                name="paymentStatus"
                value={formData.paymentStatus}
                onChange={handleFormChange}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option>Pendente</option>
                <option>Pago</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Recorrência</span>
              <select
                name="recurrenceType"
                value={formData.recurrenceType}
                onChange={handleFormChange}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option>Única</option>
                <option>Salário recorrente</option>
              </select>
            </label>
            {formData.recurrenceType === "Salário recorrente" ? (
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Dia de recebimento mensal</span>
                <input
                  name="dueDay"
                  type="number"
                  min="1"
                  max="31"
                  value={formData.dueDay}
                  onChange={handleFormChange}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
                />
              </label>
            ) : null}
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Forma de pagamento</span>
              <input
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleFormChange}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
              />
            </label>
            <div className="md:col-span-2 xl:col-span-3">
              <button
                type="submit"
                disabled={isSaving}
                className="valora-gold-button w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed"
              >
                {isSaving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar lançamento de receita"}
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Toque em <strong>Abrir formulário</strong> para cadastrar uma nova receita.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[#d8c08a]/45 bg-[#f8f2e3]/80 p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => shiftViewMonth(-1)}
            className="valora-gold-menu rounded-full px-3 py-1.5 text-sm font-semibold"
          >
            {"<"}
          </button>
          <span className="min-w-[12rem] text-center text-sm font-semibold capitalize text-[#5e4715]">{monthTitle}</span>
          <button
            type="button"
            onClick={() => shiftViewMonth(1)}
            className="valora-gold-menu rounded-full px-3 py-1.5 text-sm font-semibold"
          >
            {">"}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <article className="valora-metal-card rounded-2xl px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a5b16]">Previsão</p>
            <p className="valora-num mt-1 text-2xl font-semibold text-[#2e220b]">{formatCurrency(totais.previsao)}</p>
          </article>
          <article className="valora-metal-card rounded-2xl px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a5b16]">Recebidas</p>
            <p className="valora-num mt-1 text-2xl font-semibold text-emerald-700">{formatCurrency(totais.recebidas)}</p>
          </article>
          <article className="valora-metal-card rounded-2xl px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a5b16]">À Receber</p>
            <p className="valora-num mt-1 text-2xl font-semibold text-amber-800">{formatCurrency(totais.aReceber)}</p>
          </article>
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              <span>Recebidas vs à receber</span>
            <span className="normal-case text-slate-400">
              {totais.recebidas + totais.aReceber > 0 ? `${paidPendingSplit.paidPct.toFixed(0)}% recebido` : "—"}
            </span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-900/10 shadow-inner ring-1 ring-white/40">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 shadow-[0_0_14px_rgba(52,211,153,0.65)] transition-[width] duration-300 ease-out"
              style={{ width: `${paidPendingSplit.paidPct}%` }}
            />
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-orange-400 shadow-[0_0_14px_rgba(251,191,36,0.55)] transition-[width] duration-300 ease-out"
              style={{ width: `${paidPendingSplit.pendPct}%` }}
            />
          </div>
        </div>
      </section>

      {isLoading ? (
        <EmptyState title="Carregando receitas" description="Aguarde enquanto buscamos os lançamentos do mês." />
      ) : receitasDoMes.length === 0 ? (
        <EmptyState title="Nenhuma receita encontrada" description="Cadastre receitas em Lançamentos para preencher este resumo." />
      ) : (
        <section className="relative overflow-hidden rounded-3xl border border-slate-800/15 bg-gradient-to-b from-slate-50/80 to-white shadow-[0_20px_50px_-24px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/[0.04]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                <th className="rounded-tl-xl bg-slate-100/95 px-3 py-2.5 font-semibold">Data</th>
                <th className="bg-slate-100/95 px-3 py-2.5 font-semibold">Descrição</th>
                <th className="bg-slate-100/95 px-3 py-2.5 font-semibold">Status</th>
                <th className="bg-slate-100/95 px-3 py-2.5 font-semibold">Ações</th>
                <th className="rounded-tr-xl bg-slate-100/95 px-3 py-2.5 text-right font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody>
              {receitasDoMes.map((item, rowIdx) => (
                <tr
                  key={item.id}
                  className={`group transition-colors duration-150 ease-out ${
                    rowIdx % 2 === 0 ? "bg-white/[0.97]" : "bg-slate-50/[0.85]"
                  } hover:bg-emerald-400/[0.07] hover:shadow-[inset_0_0_0_9999px_rgba(52,211,153,0.06)]`}
                >
                  <td className="px-3 py-2.5 text-xs text-slate-600 md:text-sm">{normalizeDateOnly(item.data)}</td>
                  <td className="px-3 py-2.5 text-slate-900">{item.descricao || "Receita"}</td>
                  <td className="px-3 py-2.5">
                    <span className={`valora-metal-switch valora-metal-switch--${item._status.tone}`}>
                      <span className={`valora-metal-switch-knob ${item._status.isRight ? "ml-auto" : ""}`} />
                      <span className="valora-metal-switch-label">{item._status.label}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(item)}
                        className="rounded-lg border border-blue-200/90 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition-all hover:border-blue-300 hover:bg-blue-100"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemove(item.id)}
                        className="rounded-lg border border-rose-200/90 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition-all hover:border-rose-300 hover:bg-rose-100"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                  <td className="valora-num px-3 py-2.5 text-right font-semibold text-slate-900">{formatCurrency(item.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

export default LancamentosReceitas
