import { useEffect, useState } from "react"
import EmptyState from "../components/EmptyState"
import PageHeader from "../components/PageHeader"
import StatusBadge from "../components/StatusBadge"
import {
  atualizarLancamento,
  criarLancamento,
  listarLancamentos,
  removerLancamento,
} from "../services/lancamentosService"
import { supabase } from "../services/supabaseClient"

const filters = ["Todos", "Pagos", "Pendentes", "Receitas", "Despesas", "Compartilhados", "Privados"]
const customCategoryOption = "__CUSTOM__"
const categoryOptions = [
  "💼 Trabalho",
  "⚖️ Jurídico",
  "🏠 Casa",
  "🔄 Assinaturas",
  "🛒 Mercado",
  "🚗 Transporte",
  "🍔 Alimentação",
  "🏥 Saúde",
  "🍿 Lazer",
  "👨‍👩‍👧‍👦 Família",
  "⚽ Hobby",
  "🎓 Educação",
]

const initialFormData = {
  type: "Despesa",
  recurrenceType: "Única",
  paymentStatus: "Pendente",
  installments: "1",
  description: "",
  category: "💼 Trabalho",
  value: "",
  date: "",
  dueDay: "",
  paymentMethod: "",
  visibility: "Privado",
  splitMethod: "Igual",
}

const visibilityMap = {
  Privado: "privado",
  "Compartilhar no relatório do grupo": "compartilhado",
  privado: "privado",
  compartilhado: "compartilhado",
}

const divisionMethodMap = {
  Igual: "igual",
  Percentual: "percentual",
  "Valor fixo": "valor_fixo",
  igual: "igual",
  percentual: "percentual",
  valor_fixo: "valor_fixo",
}

const tipoMap = {
  Receita: "receita",
  Despesa: "despesa",
  receita: "receita",
  despesa: "despesa",
}

const recurrenceMap = {
  "Única": "unica",
  "Recorrente Fixa": "recorrente_fixa",
  "Recorrente Variável": "recorrente_variavel",
  Parcelado: "parcelado",
  unica: "unica",
  recorrente_fixa: "recorrente_fixa",
  recorrente_variavel: "recorrente_variavel",
  parcelado: "parcelado",
}

const paymentStatusMap = {
  Pago: "pago",
  Pendente: "pendente",
  pago: "pago",
  pendente: "pendente",
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

function normalizeUiDate(value) {
  const raw = String(value ?? "")
  if (!raw) return ""
  return raw.slice(0, 10)
}

function mapDbToUi(record) {
  const visibilityRaw = record.visibilidade ?? record.visibility ?? "privado"
  const splitMethodRaw = record.metodo_divisao ?? record.split_method ?? record.splitMethod ?? null
  const typeRaw = record.tipo ?? record.type ?? "despesa"
  const recurrenceRaw = record.recorrencia ?? "unica"
  const statusRaw = (record.status ?? "").toString().toLowerCase()
  const rawDescription = record.descricao ?? record.description ?? ""

  return {
    id: record.id,
    type: typeRaw === "receita" ? "Receita" : "Despesa",
    recurrenceType:
      recurrenceRaw === "recorrente_fixa"
        ? "Recorrente Fixa"
        : recurrenceRaw === "recorrente_variavel"
          ? "Recorrente Variável"
          : recurrenceRaw === "parcelado"
            ? "Parcelado"
          : "Única",
    description: String(rawDescription).trim(),
    category: record.categoria ?? record.category ?? "",
    value: Number(record.valor ?? record.value ?? 0),
    date: normalizeUiDate(record.data ?? record.date),
    dueDay: String(record.dia_vencimento ?? ""),
    paymentStatus: statusRaw === "pago" ? "Pago" : "Pendente",
    paymentMethod: record.forma_pagamento ?? record.payment_method ?? record.paymentMethod ?? "",
    visibility:
      visibilityRaw === "compartilhado" ? "Compartilhar no relatório do grupo" : "Privado",
    splitMethod:
      splitMethodRaw === "igual"
        ? "Igual"
        : splitMethodRaw === "percentual"
          ? "Percentual"
          : splitMethodRaw === "valor_fixo"
            ? "Valor fixo"
            : "-",
  }
}

function Lancamentos() {
  const [filter, setFilter] = useState("Todos")
  const [transactions, setTransactions] = useState([])
  const [formData, setFormData] = useState(initialFormData)
  const [customCategory, setCustomCategory] = useState("")
  const [editingId, setEditingId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState("neutral")

  const isShared = formData.visibility === "Compartilhar no relatório do grupo"
  const isRecurring = formData.recurrenceType === "Recorrente Fixa" || formData.recurrenceType === "Recorrente Variável"
  const isInstallment = formData.recurrenceType === "Parcelado"

  async function loadLancamentos() {
    try {
      setIsLoading(true)
      const data = await listarLancamentos()
      setTransactions((data ?? []).map(mapDbToUi))
    } catch (error) {
      setMessageType("error")
      setMessage(error?.message || "Não foi possível carregar os lançamentos agora.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadLancamentos()
    }, 0)

    return () => clearTimeout(timer)
  }, [])

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((prev) => {
      if (name === "recurrenceType") {
        if (value === "Parcelado") {
          const nextInstallments =
            !prev.installments || Number(prev.installments) < 2 ? "2" : String(Math.trunc(Number(prev.installments)))
          return { ...prev, recurrenceType: value, installments: nextInstallments, dueDay: "" }
        }
        return { ...prev, recurrenceType: value, installments: "1" }
      }
      return { ...prev, [name]: value }
    })
  }

  function resolveCategoryValue() {
    if (formData.category === customCategoryOption) {
      return customCategory.trim()
    }
    return formData.category.trim()
  }

  function resetForm() {
    setFormData(initialFormData)
    setCustomCategory("")
    setEditingId(null)
  }

  function handleEdit(transaction) {
    const isDefaultCategory = categoryOptions.includes(transaction.category)
    setEditingId(transaction.id)
    setFormData({
      type: transaction.type,
      recurrenceType: transaction.recurrenceType ?? "Única",
      paymentStatus: transaction.paymentStatus ?? "Pendente",
      installments: "1",
      description: transaction.description,
      category: isDefaultCategory ? transaction.category : customCategoryOption,
      value: String(transaction.value),
      date: transaction.date,
      dueDay: transaction.dueDay ?? "",
      paymentMethod: transaction.paymentMethod,
      visibility: transaction.visibility,
      splitMethod: transaction.splitMethod === "-" ? "Igual" : transaction.splitMethod,
    })
    setCustomCategory(isDefaultCategory ? "" : transaction.category)
  }

  async function handleRemove(id) {
    try {
      setMessage("")
      await removerLancamento(id)
      await loadLancamentos()

      if (editingId === id) {
        resetForm()
      }
    } catch {
      setMessageType("error")
      setMessage("Não foi possível remover o lançamento. Tente novamente.")
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const normalizedValue = Number(formData.value)
    const normalizedDueDay = Number(formData.dueDay || 0)
    const normalizedInstallments = Number(formData.installments || 1)
    const normalizedCategory = resolveCategoryValue()
    if (!formData.description || !normalizedCategory || !formData.date || !formData.paymentMethod || !normalizedValue) {
      return
    }
    if (isInstallment && (!Number.isInteger(normalizedInstallments) || normalizedInstallments < 2)) {
      setMessageType("error")
      setMessage("Informe um número de parcelas válido (mínimo 2) para lançamento parcelado.")
      return
    }
    if (isRecurring && (!normalizedDueDay || normalizedDueDay < 1 || normalizedDueDay > 31)) {
      setMessageType("error")
      setMessage("Informe um dia de vencimento válido entre 1 e 31 para recorrências.")
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
        throw new Error("Sessão inválida.")
      }

      // Mantem a data local do input (YYYY-MM-DD), sem converter para Date/UTC.
      const formattedDate = formData.date

      const dbPayload = {
        user_id: user.id,
        tipo: tipoMap[formData.type] ?? "despesa",
        descricao: formData.description.trim(),
        categoria: normalizedCategory,
        valor: normalizedValue,
        data: formattedDate,
        forma_pagamento: formData.paymentMethod.trim(),
        numero_parcelas: formData.type === "Despesa" && isInstallment ? normalizedInstallments : 1,
        recorrencia: recurrenceMap[formData.recurrenceType] ?? "unica",
        dia_vencimento: isRecurring ? normalizedDueDay : null,
        status: paymentStatusMap[formData.paymentStatus] ?? "pendente",
        visibilidade: visibilityMap[formData.visibility] ?? "privado",
        metodo_divisao: isShared ? (divisionMethodMap[formData.splitMethod] ?? null) : null,
      }

      if (editingId) {
        await atualizarLancamento(editingId, dbPayload)
        await loadLancamentos()
      } else {
        await criarLancamento(dbPayload)
        await loadLancamentos()
      }

      setMessageType("success")
      setMessage(editingId ? "Lançamento atualizado com sucesso." : "Lançamento adicionado com sucesso.")
      resetForm()
    } catch (error) {
      setMessageType("error")
      setMessage(error?.message || "Erro ao salvar lançamento.")
    } finally {
      setIsSaving(false)
    }
  }

  const filteredTransactions = transactions.filter((item) => {
    if (filter === "Todos") return true
    if (filter === "Pagos") return item.paymentStatus === "Pago"
    if (filter === "Pendentes") return item.paymentStatus === "Pendente"
    if (filter === "Receitas") return item.type === "Receita"
    if (filter === "Despesas") return item.type === "Despesa"
    if (filter === "Compartilhados") return item.visibility === "Compartilhar no relatório do grupo"
    if (filter === "Privados") return item.visibility === "Privado"
    return true
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lançamentos"
        subtitle="Registre receitas, despesas e defina o que será privado ou compartilhado."
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
        <h2 className="text-lg font-semibold text-slate-900">
          {editingId ? "Editar lançamento" : "Novo lançamento"}
        </h2>
        <form className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleSubmit}>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Tipo</span>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option>Receita</option>
              <option>Despesa</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Recorrência</span>
            <select
              name="recurrenceType"
              value={formData.recurrenceType}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option>Única</option>
              <option>Recorrente Fixa</option>
              <option>Recorrente Variável</option>
              <option>Parcelado</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Status</span>
            <select
              name="paymentStatus"
              value={formData.paymentStatus}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option>Pendente</option>
              <option>Pago</option>
            </select>
          </label>

          {formData.type === "Despesa" && isInstallment ? (
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Número de parcelas</span>
              <input
                name="installments"
                type="number"
                min="1"
                step="1"
                value={formData.installments}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
              />
            </label>
          ) : null}

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Descrição</span>
            <input
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Ex: Mercado mensal"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Categoria</span>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
            >
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
              <option value={customCategoryOption}>✍️ Outra (digitar manualmente)</option>
            </select>
          </label>

          {formData.category === customCategoryOption ? (
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Categoria personalizada</span>
              <input
                value={customCategory}
                onChange={(event) => setCustomCategory(event.target.value)}
                placeholder="Ex: 🧾 Outros ou categoria sem emoji"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
              />
            </label>
          ) : null}

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
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Data</span>
            <input
              name="date"
              type="date"
              value={formData.date}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          {isRecurring ? (
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Dia de vencimento</span>
              <input
                name="dueDay"
                type="number"
                min="1"
                max="31"
                value={formData.dueDay}
                onChange={handleChange}
                placeholder="Ex: 10"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
              />
            </label>
          ) : null}

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Forma de pagamento</span>
            <input
              name="paymentMethod"
              value={formData.paymentMethod}
              onChange={handleChange}
              placeholder="Ex: PIX, cartão, débito"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Visibilidade</span>
            <select
              name="visibility"
              value={formData.visibility}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option>Privado</option>
              <option>Compartilhar no relatório do grupo</option>
            </select>
          </label>

          {isShared ? (
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Método de divisão</span>
              <select
                name="splitMethod"
                value={formData.splitMethod}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option>Igual</option>
                <option>Percentual</option>
                <option>Valor fixo</option>
              </select>
            </label>
          ) : null}

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
              {isSaving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar lançamento"}
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
          <EmptyState title="Carregando lancamentos" description="Buscando movimentacoes mais recentes..." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Recorrência</th>
                  <th className="px-3 py-2">Pagamento</th>
                  <th className="px-3 py-2">Forma de pagamento</th>
                  <th className="px-3 py-2">Visibilidade</th>
                  <th className="px-3 py-2">Divisão</th>
                  <th className="px-3 py-2">Ações</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((transaction) => {
                  return (
                    <tr key={transaction.id} className="rounded-xl border border-slate-200 bg-slate-50/40">
                    <td className="rounded-l-xl px-3 py-3 text-slate-700">{transaction.date}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">{transaction.description}</td>
                    <td className="px-3 py-3 text-slate-700">{transaction.category}</td>
                    <td className="px-3 py-3">
                      <StatusBadge label={transaction.type} tone={transaction.type === "Receita" ? "success" : "danger"} />
                    </td>
                    <td className="px-3 py-3 text-slate-700">{transaction.recurrenceType}</td>
                    <td className="px-3 py-3">
                      <StatusBadge
                        label={transaction.paymentStatus}
                        tone={transaction.paymentStatus === "Pago" ? "success" : "warning"}
                      />
                    </td>
                    <td className="px-3 py-3 text-slate-700">{transaction.paymentMethod}</td>
                    <td className="px-3 py-3">
                      <StatusBadge
                        label={transaction.visibility === "Privado" ? "Privado" : "Compartilhado"}
                        tone={transaction.visibility === "Privado" ? "neutral" : "info"}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge label={transaction.splitMethod} tone="neutral" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(transaction)}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition-all hover:bg-blue-100"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemove(transaction.id)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition-all hover:bg-rose-100"
                        >
                          Remover
                        </button>
                      </div>
                    </td>
                    <td className="rounded-r-xl px-3 py-3 text-right font-semibold text-slate-900">
                      {formatCurrency(transaction.value)}
                    </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default Lancamentos

