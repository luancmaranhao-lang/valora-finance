import { useCallback, useEffect, useState } from "react"
import EmptyState from "../components/EmptyState"
import PageHeader from "../components/PageHeader"
import {
  criarDivida,
  dividaStatusOptions,
  listarDividas,
  registrarPagamentoDivida,
} from "../services/dividasService"

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

const initialForm = { credor: "", valorTotal: "", valorRestante: "", status: "Em aberto" }

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

  const load = useCallback(async () => {
    try {
      setIsLoading(true)
      const data = await listarDividas()
      setRows(data ?? [])
    } catch (error) {
      setMessageType("error")
      setMessage(
        error?.message?.includes("dividas_macro") || error?.code === "42P01"
          ? "Crie a tabela dividas_macro no Supabase (veja sql/dividas_macro.sql)."
          : error?.message || "Não foi possível carregar as dívidas.",
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate(event) {
    event.preventDefault()
    if (!form.credor.trim() || !form.valorTotal) return
    try {
      setIsSaving(true)
      setMessage("")
      await criarDivida({
        credor: form.credor.trim(),
        valorTotal: form.valorTotal,
        valorRestante: form.valorRestante || form.valorTotal,
        status: form.status,
      })
      setForm(initialForm)
      setMessageType("success")
      setMessage("Dívida cadastrada.")
      await load()
    } catch (error) {
      setMessageType("error")
      setMessage(error?.message || "Erro ao salvar.")
    } finally {
      setIsSaving(false)
    }
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
      <PageHeader
        title="Dívidas macro"
        subtitle="Empréstimos e dívidas fora do fluxo do mês. Pagamentos geram despesa no mês atual e abatem o saldo."
      />

      {message ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${
            messageType === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {message}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Nova dívida</h2>
        <form className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={handleCreate}>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">Credor</span>
            <input
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
              value={form.valorTotal}
              onChange={(e) => setForm((f) => ({ ...f, valorTotal: e.target.value }))}
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
              value={form.valorRestante}
              onChange={(e) => setForm((f) => ({ ...f, valorRestante: e.target.value }))}
              placeholder="Igual ao total se vazio"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
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
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isSaving ? "Salvando..." : "Cadastrar"}
            </button>
          </div>
        </form>
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
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-slate-900">{row.credor}</p>
                  <p className="text-xs text-slate-500">
                    Original {formatCurrency(Number(row.valor_total_original ?? 0))} · Restante{" "}
                    <span className="font-medium text-slate-800">
                      {formatCurrency(Number(row.valor_restante ?? 0))}
                    </span>
                  </p>
                  <span className="mt-1 inline-block rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {row.status}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={Number(row.valor_restante ?? 0) <= 0}
                  onClick={() => {
                    setPayModal({ id: row.id, credor: row.credor })
                    setPayValue(String(Number(row.valor_restante ?? 0) || ""))
                  }}
                  className="shrink-0 rounded-xl border border-slate-900 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Registrar pagamento
                </button>
              </li>
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
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPayModal(null)
                  setPayValue("")
                }}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={payLoading}
                onClick={() => void confirmPayment()}
                className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
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
