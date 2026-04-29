import { useCallback, useEffect, useRef, useState } from "react"
import EmptyState from "../components/EmptyState"
import { criarLancamento } from "../services/lancamentosService"
import { supabase } from "../services/supabaseClient"
import {
  atualizarDivida,
  criarDivida,
  dividaStatusOptions,
  listarDividas,
  registrarPagamentoDivida,
} from "../services/dividasService"

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function parseMoneyInput(value) {
  const normalized = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
  const num = Number(normalized)
  return Number.isFinite(num) ? num : 0
}

const initialForm = {
  credor: "",
  valor_total: "",
  valor_restante: "",
  status: "Em aberto",
  valor_mes: "",
  data_mes: "",
}

function DividasMacro() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(initialForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState("neutral")
  const [payModal, setPayModal] = useState(null)
  const [payValue, setPayValue] = useState("")
  const [payLoading, setPayLoading] = useState(false)
  const payValueInputRef = useRef(null)
  const [editingId, setEditingId] = useState(null)
  const [formExpanded, setFormExpanded] = useState(false)
  const credorInputRef = useRef(null)

  const load = useCallback(async () => {
    try {
      setIsLoading(true)
      setMessage("")
      const data = await listarDividas()
      setRows(data ?? [])
    } catch (error) {
      setMessageType("error")
      setMessage(error?.message || "Não foi possível carregar as dívidas.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!payModal) return
    const timer = setTimeout(() => payValueInputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [payModal])

  function handleMoneyStepKeyDown(event, setValue) {
    if (!event.shiftKey) return
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
    event.preventDefault()
    const current = Number(event.currentTarget.value || 0)
    const delta = event.key === "ArrowUp" ? 10 : -10
    const next = Math.max(0, current + delta)
    setValue(String(next))
  }

  async function handleCreate(event) {
    event.preventDefault()
    if (!form.credor.trim() || !form.valor_total) return
    try {
      setIsSaving(true)
      setMessage("")
      const payload = {
        credor: form.credor.trim(),
        valor_total: form.valor_total,
        valor_restante: form.valor_restante || form.valor_total,
        status: form.status,
      }
      if (editingId) {
        await atualizarDivida(editingId, {
          credor: payload.credor,
          valor_total: Number(payload.valor_total),
          valor_restante: Number(payload.valor_restante),
          status: payload.status,
        })
        setMessageType("success")
        setMessage("Dívida atualizada.")
        const valorMes = parseMoneyInput(form.valor_mes)
        if (valorMes > 0 && form.data_mes) {
          const {
            data: { user },
          } = await supabase.auth.getUser()
          if (!user?.id) throw new Error("Sessão inválida.")
          await criarLancamento({
            user_id: user.id,
            tipo: "despesa",
            descricao: `Parcela planejada da dívida — ${payload.credor}`,
            categoria: "⚖️ Jurídico",
            valor: valorMes,
            data: form.data_mes,
            forma_pagamento: "Dívida macro",
            recorrencia: "unica",
            dia_vencimento: null,
            status: "pendente",
            visibilidade: "privado",
            metodo_divisao: null,
            cartao_id: null,
          })
          setMessage("Dívida atualizada e valor do mês lançado em Lançamentos.")
        }
      } else {
        await criarDivida(payload)
        setMessageType("success")
        setMessage("Dívida cadastrada.")

        const valorMes = parseMoneyInput(form.valor_mes)
        if (valorMes > 0 && form.data_mes) {
          const {
            data: { user },
          } = await supabase.auth.getUser()
          if (!user?.id) throw new Error("Sessão inválida.")

          await criarLancamento({
            user_id: user.id,
            tipo: "despesa",
            descricao: `Parcela planejada da dívida — ${payload.credor}`,
            categoria: "⚖️ Jurídico",
            valor: valorMes,
            data: form.data_mes,
            forma_pagamento: "Dívida macro",
            recorrencia: "unica",
            dia_vencimento: null,
            status: "pendente",
            visibilidade: "privado",
            metodo_divisao: null,
            cartao_id: null,
          })
          setMessage("Dívida cadastrada e valor do mês lançado em Lançamentos.")
        }
      }
      setForm(initialForm)
      setEditingId(null)
      await load()
    } catch (error) {
      setMessageType("error")
      setMessage(String(error?.message ?? "") || "Erro ao cadastrar dívida.")
    } finally {
      setIsSaving(false)
    }
  }

  function startEdit(row) {
    setEditingId(row.id)
    setForm({
      credor: row.credor ?? "",
      valor_total: String(row.valor_total ?? ""),
      valor_restante: String(row.valor_total ?? ""),
      status: row.status ?? "Em aberto",
        valor_mes: "",
        data_mes: "",
    })
    setMessage("")
    setTimeout(() => {
      credorInputRef.current?.focus()
      credorInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 0)
  }

  async function confirmPayment() {
    if (!payModal) return
    try {
      setPayLoading(true)
      await registrarPagamentoDivida(payModal.id, payValue, payModal.credor)
      setPayModal(null)
      setPayValue("")
      setMessageType("success")
      setMessage("Pagamento registrado e lançamento criado no mês atual.")
      await load()
    } catch (error) {
      setMessageType("error")
      setMessage(error?.message || "Erro ao registrar pagamento.")
    } finally {
      setPayLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            messageType === "error"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {message}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Nova dívida</h2>
            <p className="mt-1 text-xs text-slate-500">Formulário opcional — sua lista de dívidas fica logo abaixo.</p>
          </div>
          {!editingId ? (
            <button
              type="button"
              onClick={() => setFormExpanded((open) => !open)}
              className="valora-gold-button min-h-11 shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              {formExpanded ? "Recolher formulário" : "Abrir formulário"}
            </button>
          ) : null}
        </div>

        {!formExpanded && !editingId ? (
          <p className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Toque em <strong>Abrir formulário</strong> para cadastrar ou planejar uma dívida.
          </p>
        ) : null}

        {(formExpanded || editingId) ? (
        <form className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={handleCreate}>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">Credor</span>
            <input
              ref={credorInputRef}
              value={form.credor}
              onChange={(e) => setForm((f) => ({ ...f, credor: e.target.value }))}
              placeholder="Ex: Banco X, familiar..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
              required
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Valor total original</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.valor_total}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  valor_total: e.target.value,
                  valor_restante: e.target.value,
                }))
              }
              onKeyDown={(e) =>
                handleMoneyStepKeyDown(e, (next) =>
                  setForm((f) => ({ ...f, valor_total: next, valor_restante: next })),
                )
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
              required
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Valor restante</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.valor_restante}
              readOnly
              placeholder="Calculado automaticamente"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Status</span>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            >
              {dividaStatusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Valor para pagar no mês (opcional)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.valor_mes}
              onChange={(e) => setForm((f) => ({ ...f, valor_mes: e.target.value }))}
              onKeyDown={(e) => handleMoneyStepKeyDown(e, (next) => setForm((f) => ({ ...f, valor_mes: next })))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
              placeholder="Ex: 450,00"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Data do pagamento (mês)</span>
            <input
              type="date"
              value={form.data_mes}
              onChange={(e) => setForm((f) => ({ ...f, data_mes: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isSaving}
              className="valora-gold-button w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            >
              {isSaving ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar"}
            </button>
          </div>
          {editingId ? (
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setEditingId(null)
                  setForm(initialForm)
                  setFormExpanded(false)
                }}
                className="valora-gold-menu w-full rounded-xl px-4 py-2.5 text-sm font-semibold"
              >
                Cancelar edição
              </button>
            </div>
          ) : null}
        </form>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Suas dívidas</h2>
        {isLoading ? (
          <p className="mt-4 text-sm text-slate-500">Carregando...</p>
        ) : rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Nenhuma dívida cadastrada" description="Use o formulário acima para começar o mapa do passado." />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {rows.map((row) => (
              (() => {
                const total = Number(row.valor_total ?? 0)
                const restante = Number(row.valor_restante ?? 0)
                const pago = Math.max(0, total - restante)
                const pctPago = total > 0 ? Math.min(100, (pago / total) * 100) : 0
                const pctRestante = Math.max(0, 100 - pctPago)
                return (
                  <li
                    key={row.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{row.credor}</p>
                        <p className="text-xs text-slate-500">
                          Original {formatCurrency(total)} · Restante{" "}
                          <span className="font-medium text-slate-800">{formatCurrency(restante)}</span>
                        </p>
                        <span className="mt-1 inline-block rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {row.status}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="valora-gold-menu inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                            <path d="M15.232 5.232a2.5 2.5 0 1 0-3.536-3.536L4.5 8.893V13.5h4.607l7.125-7.125Z" />
                            <path d="M3.5 15.5h13v1.5h-13z" />
                          </svg>
                          Editar
                        </button>
                        <button
                          type="button"
                          disabled={restante <= 0}
                          onClick={() => {
                            setPayModal({ id: row.id, credor: row.credor })
                            setPayValue(String(restante || ""))
                          }}
                          className="valora-gold-button rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Registrar pagamento
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-emerald-700">
                          Pago <strong>{formatCurrency(pago)}</strong>
                        </span>
                        <span className="text-rose-700">
                          Restante <strong>{formatCurrency(restante)}</strong>
                        </span>
                      </div>
                      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full bg-emerald-500/90" style={{ width: `${pctPago}%` }} />
                        <div className="h-full bg-rose-400/90" style={{ width: `${pctRestante}%` }} />
                      </div>
                    </div>
                  </li>
                )
              })()
            ))}
          </ul>
        )}
      </section>

      {payModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Valor do pagamento</h3>
            <p className="mt-1 text-sm text-slate-600">{payModal.credor}</p>
            <input
              type="number"
              min="0"
              step="0.01"
              value={payValue}
              onChange={(e) => setPayValue(e.target.value)}
              onKeyDown={(e) => handleMoneyStepKeyDown(e, setPayValue)}
              ref={payValueInputRef}
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPayModal(null)
                  setPayValue("")
                }}
                className="valora-gold-menu flex-1 rounded-xl py-2.5 text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={payLoading}
                onClick={() => void confirmPayment()}
                className="valora-gold-button flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {payLoading ? "..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default DividasMacro
