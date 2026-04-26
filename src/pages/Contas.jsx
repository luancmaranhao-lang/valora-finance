import { useEffect, useState } from "react"
import EmptyState from "../components/EmptyState"
import PageHeader from "../components/PageHeader"
import StatusBadge from "../components/StatusBadge"
import { atualizarConta, criarConta, listarContas, removerConta } from "../services/contasService"
import { supabase } from "../services/supabaseClient"

const filters = ["Todas", "Pendentes", "Agendadas", "Pagas", "Atrasadas", "Compartilhadas", "Privadas"]

const initialFormData = {
  name: "",
  category: "",
  value: "",
  dueDate: "",
  status: "pendente",
  visibility: "privado",
  notes: "",
}

const statusMap = {
  Pendente: "pendente",
  Agendada: "agendada",
  Paga: "paga",
  Atrasada: "atrasada",
  pendente: "pendente",
  agendada: "agendada",
  paga: "paga",
  atrasada: "atrasada",
}

const visibilityMap = {
  Privado: "privado",
  Compartilhado: "compartilhado",
  privado: "privado",
  compartilhado: "compartilhado",
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function mapDbToUi(record) {
  const statusRaw = (record.status ?? "pendente").toString().toLowerCase()
  const visibilityRaw = (record.visibilidade ?? record.visibility ?? "privado").toString().toLowerCase()

  return {
    id: record.id,
    dueDate: String(record.vencimento ?? record.dueDate ?? "").slice(0, 10),
    name: record.nome ?? record.name ?? "",
    category: record.categoria ?? record.category ?? "",
    status:
      statusRaw === "agendada"
        ? "Agendada"
        : statusRaw === "paga"
          ? "Paga"
          : statusRaw === "atrasada"
            ? "Atrasada"
            : "Pendente",
    visibility: visibilityRaw === "compartilhado" ? "Compartilhado" : "Privado",
    value: Number(record.valor ?? record.value ?? 0),
    notes: record.observacao ?? record.notes ?? "",
  }
}

function Contas() {
  const [filter, setFilter] = useState("Todas")
  const [accounts, setAccounts] = useState([])
  const [formData, setFormData] = useState(initialFormData)
  const [editingId, setEditingId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState("neutral")

  async function loadContas() {
    try {
      setIsLoading(true)
      setMessage("")
      const data = await listarContas()
      setAccounts((data ?? []).map(mapDbToUi))
    } catch (error) {
      setMessageType("error")
      setMessage(error?.message || "Nao foi possivel carregar as contas agora.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadContas()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  function resetForm() {
    setFormData(initialFormData)
    setEditingId(null)
  }

  function handleEdit(account) {
    setEditingId(account.id)
    setFormData({
      name: account.name,
      category: account.category,
      value: String(account.value),
      dueDate: account.dueDate,
      status: statusMap[account.status] ?? "pendente",
      visibility: visibilityMap[account.visibility] ?? "privado",
      notes: account.notes ?? "",
    })
  }

  async function handleRemove(id) {
    try {
      setMessage("")
      await removerConta(id)
      await loadContas()
      if (editingId === id) {
        resetForm()
      }
      setMessageType("success")
      setMessage("Conta removida com sucesso.")
    } catch (error) {
      setMessageType("error")
      setMessage(error?.message || "Nao foi possivel remover a conta.")
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const normalizedValue = Number(formData.value)
    if (!formData.name || !formData.category || !formData.dueDate || !normalizedValue) {
      return
    }

    try {
      setIsSaving(true)
      setMessage("")

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user?.id) {
        throw new Error("Sessao invalida.")
      }

      const dateObj = new Date(formData.dueDate)
      const formattedDueDate = [
        dateObj.getFullYear(),
        String(dateObj.getMonth() + 1).padStart(2, "0"),
        String(dateObj.getDate()).padStart(2, "0"),
      ].join("-")

      const payload = {
        user_id: user.id,
        nome: formData.name.trim(),
        categoria: formData.category.trim(),
        valor: normalizedValue,
        vencimento: formattedDueDate,
        status: statusMap[formData.status] ?? "pendente",
        visibilidade: visibilityMap[formData.visibility] ?? "privado",
        observacao: formData.notes.trim() || null,
      }

      if (editingId) {
        await atualizarConta(editingId, payload)
      } else {
        await criarConta(payload)
      }

      await loadContas()
      setMessageType("success")
      setMessage(editingId ? "Conta atualizada com sucesso." : "Conta criada com sucesso.")
      resetForm()
    } catch (error) {
      setMessageType("error")
      setMessage(error?.message || "Erro ao salvar conta.")
    } finally {
      setIsSaving(false)
    }
  }

  const filteredAccounts = accounts.filter((account) => {
    if (filter === "Todas") return true
    if (filter === "Pendentes") return account.status === "Pendente"
    if (filter === "Agendadas") return account.status === "Agendada"
    if (filter === "Pagas") return account.status === "Paga"
    if (filter === "Atrasadas") return account.status === "Atrasada"
    if (filter === "Compartilhadas") return account.visibility === "Compartilhado"
    if (filter === "Privadas") return account.visibility === "Privado"
    return true
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas a pagar"
        subtitle="Organize compromissos financeiros, vencimentos e status."
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
        <h2 className="text-lg font-semibold text-slate-900">{editingId ? "Editar conta" : "Nova conta"}</h2>
        <form className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleSubmit}>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Nome</span>
            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Ex: Aluguel"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Categoria</span>
            <input
              name="category"
              value={formData.category}
              onChange={handleChange}
              placeholder="Ex: Moradia"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Valor</span>
            <input
              name="value"
              type="number"
              min="0"
              step="0.01"
              value={formData.value}
              onChange={handleChange}
              placeholder="0,00"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Vencimento</span>
            <input
              name="dueDate"
              type="date"
              value={formData.dueDate}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Status</span>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="pendente">Pendente</option>
              <option value="agendada">Agendada</option>
              <option value="paga">Paga</option>
              <option value="atrasada">Atrasada</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Visibilidade</span>
            <select
              name="visibility"
              value={formData.visibility}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="privado">Privado</option>
              <option value="compartilhado">Compartilhado</option>
            </select>
          </label>

          <label className="space-y-1.5 md:col-span-2 xl:col-span-2">
            <span className="text-sm font-medium text-slate-700">Observacao</span>
            <input
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Opcional"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <div className="flex items-end gap-2">
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-100"
              >
                Cancelar
              </button>
            ) : null}
            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? "Salvando..." : editingId ? "Salvar alteracoes" : "Adicionar conta"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                filter === item
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {isLoading ? (
          <EmptyState title="Carregando contas" description="Buscando dados mais recentes no Supabase..." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Vencimento</th>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Visibilidade</th>
                  <th className="px-3 py-2">Valor</th>
                  <th className="px-3 py-2">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((account) => (
                  <tr key={account.id} className="rounded-xl border border-slate-200 bg-slate-50/40">
                    <td className="rounded-l-xl px-3 py-3 text-slate-700">{account.dueDate}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">{account.name}</td>
                    <td className="px-3 py-3 text-slate-700">{account.category}</td>
                    <td className="px-3 py-3">
                      <StatusBadge
                        label={account.status}
                        tone={
                          account.status === "Paga"
                            ? "success"
                            : account.status === "Atrasada"
                              ? "danger"
                              : account.status === "Agendada"
                                ? "info"
                                : "warning"
                        }
                      />
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge label={account.visibility} tone={account.visibility === "Compartilhado" ? "info" : "neutral"} />
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-900">{formatCurrency(account.value)}</td>
                    <td className="rounded-r-xl px-3 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(account)}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition-all hover:bg-blue-100"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemove(account.id)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition-all hover:bg-rose-100"
                        >
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default Contas

