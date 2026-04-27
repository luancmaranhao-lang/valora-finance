import { useEffect, useMemo, useState } from "react"
import AnnualSummaryModal from "../components/AnnualSummaryModal"
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
import {
  dividedPayerValue,
  extractTagValue,
  getFirstName,
  infoTag,
  jointPayerValue,
  payerTagPrefix,
  removeLancamentoMetaTags,
  resolvePayerShortLabel,
  splitTagPrefix,
} from "../utils/lancamentoDisplay"

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
  payer: "",
  isInformative: false,
  installments: "1",
  description: "",
  category: "💼 Trabalho",
  value: "",
  date: "",
  dueDay: "",
  paymentMethod: "",
  visibility: "Privado",
  splitMethod: "50/50",
}

const visibilityMap = {
  Privado: "privado",
  "Compartilhar no relatório do grupo": "compartilhado",
  privado: "privado",
  compartilhado: "compartilhado",
}

const divisionMethodMap = {
  "50/50": "igual",
  "60/40": "percentual",
  "70/30": "percentual",
  "30/70": "percentual",
  igual: "igual",
  percentual: "percentual",
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

function buildDescriptionWithMeta(baseDescription, { payer, splitMethod, isDivided, isInformative }) {
  const clean = removeLancamentoMetaTags(baseDescription)
  const parts = [clean]

  if (payer) {
    parts.push(`${payerTagPrefix}${payer}]`)
  }
  if (isDivided && splitMethod) {
    parts.push(`${splitTagPrefix}${splitMethod}]`)
  }
  if (isInformative) {
    parts.push(infoTag)
  }

  return parts.join(" ").trim()
}

function mapDbToUi(record) {
  const visibilityRaw = record.visibilidade ?? record.visibility ?? "privado"
  const splitMethodRaw = record.metodo_divisao ?? record.split_method ?? record.splitMethod ?? null
  const typeRaw = record.tipo ?? record.type ?? "despesa"
  const recurrenceRaw = record.recorrencia ?? "unica"
  const statusRaw = (record.status ?? "").toString().toLowerCase()
  const rawDescription = record.descricao ?? record.description ?? ""
  const payerFromTag = extractTagValue(rawDescription, payerTagPrefix)
  const splitFromTag = extractTagValue(rawDescription, splitTagPrefix)
  const isInformative = String(rawDescription).includes(infoTag)
  const isProjected = Boolean(record._projected)

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
    description: removeLancamentoMetaTags(rawDescription),
    category: record.categoria ?? record.category ?? "",
    value: Number(record.valor ?? record.value ?? 0),
    date: normalizeUiDate(record.data ?? record.date),
    dueDay: String(record.dia_vencimento ?? ""),
    paymentStatus: statusRaw === "pago" ? "Pago" : "Pendente",
    payer: payerFromTag || "",
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
    splitRule: splitFromTag || "50/50",
    isInformative,
    isProjected,
  }
}

function parseUiDate(value) {
  const raw = String(value ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const [y, m, d] = raw.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? null : date
}

function isPastCalendarMonth(year, monthIndex, ref = new Date()) {
  if (year < ref.getFullYear()) return true
  if (year > ref.getFullYear()) return false
  return monthIndex < ref.getMonth()
}

function isDateInMonth(isoDate, year, monthIndex) {
  const date = parseUiDate(isoDate)
  if (!date) return false
  return date.getFullYear() === year && date.getMonth() === monthIndex
}

function buildRecurringKeyRaw(item) {
  const desc = removeLancamentoMetaTags(item.descricao ?? item.description ?? "")
    .trim()
    .toLowerCase()
  return [
    desc,
    (item.categoria ?? item.category ?? "").toString().trim().toLowerCase(),
    (item.forma_pagamento ?? item.payment_method ?? item.paymentMethod ?? "").toString().trim().toLowerCase(),
    "recorrente_fixa",
  ].join("|")
}

function isDespesaRecorrenteFixa(item) {
  const tipo = (item.tipo ?? item.type ?? "").toString().toLowerCase()
  const rec = (item.recorrencia ?? "unica").toString().toLowerCase()
  return tipo === "despesa" && rec === "recorrente_fixa"
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function simpleKeyHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i += 1) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

function buildProjectedRawRows(allRaw, year, monthIndex, now = new Date()) {
  if (isPastCalendarMonth(year, monthIndex, now)) return []

  const recurring = allRaw.filter(isDespesaRecorrenteFixa)
  if (recurring.length === 0) return []

  const sortedByDateDesc = [...recurring].sort(
    (a, b) => new Date(b.data ?? b.date ?? 0) - new Date(a.data ?? a.date ?? 0),
  )
  const latestTemplateByKey = new Map()
  sortedByDateDesc.forEach((item) => {
    const key = buildRecurringKeyRaw(item)
    if (!latestTemplateByKey.has(key)) latestTemplateByKey.set(key, item)
  })

  const existingKeys = new Set()
  for (const item of allRaw) {
    const iso = normalizeUiDate(item.data ?? item.date)
    if (!isDateInMonth(iso, year, monthIndex)) continue
    if (isDespesaRecorrenteFixa(item)) {
      existingKeys.add(buildRecurringKeyRaw(item))
    }
  }

  const projected = []
  const dueDayFallback = 1
  latestTemplateByKey.forEach((template, key) => {
    if (existingKeys.has(key)) return
    const due = Number(template.dia_vencimento ?? dueDayFallback) || dueDayFallback
    const safeDay = Math.min(Math.max(1, due), lastDayOfMonth(year, monthIndex))
    const dataIso = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`
    const safeId = `proj-${simpleKeyHash(key)}-${year}-${monthIndex + 1}`

    projected.push({
      ...template,
      id: safeId,
      data: dataIso,
      status: "pendente",
      recorrencia: "recorrente_fixa",
      _projected: true,
    })
  })

  return projected
}

function Lancamentos() {
  const [filter, setFilter] = useState("Todos")
  const [rawTransactions, setRawTransactions] = useState([])
  const [payerOptions, setPayerOptions] = useState([])
  const [currentUserId, setCurrentUserId] = useState("")
  const [formData, setFormData] = useState(initialFormData)
  const [customCategory, setCustomCategory] = useState("")
  const [editingId, setEditingId] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState("neutral")
  const [viewYM, setViewYM] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [annualOpen, setAnnualOpen] = useState(false)

  const transactions = useMemo(() => rawTransactions.map(mapDbToUi), [rawTransactions])

  const nameByUserId = useMemo(() => {
    const map = {}
    for (const option of payerOptions) {
      if (!option?.value) continue
      if (option.value === dividedPayerValue || option.value === jointPayerValue) continue
      map[option.value] = option.label
    }
    return map
  }, [payerOptions])

  const monthScopedRows = useMemo(() => {
    const { y, m } = viewYM
    const inMonthReal = transactions.filter((row) => isDateInMonth(row.date, y, m))
    const projectedRaw = buildProjectedRawRows(rawTransactions, y, m)
    const projectedUi = projectedRaw.map(mapDbToUi)
    const merged = [...projectedUi, ...inMonthReal].sort((a, b) => {
      const da = parseUiDate(a.date)?.getTime() ?? 0
      const db = parseUiDate(b.date)?.getTime() ?? 0
      return da - db
    })
    return merged
  }, [transactions, rawTransactions, viewYM])

  const isDivided = formData.payer === dividedPayerValue
  const isRecurring = formData.recurrenceType === "Recorrente Fixa" || formData.recurrenceType === "Recorrente Variável"
  const isInstallment = formData.recurrenceType === "Parcelado"

  async function loadLancamentos() {
    try {
      setIsLoading(true)
      const data = await listarLancamentos()
      setRawTransactions(data ?? [])
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

  useEffect(() => {
    const timer = setTimeout(() => {
      async function loadPayerOptions() {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser()

          if (!user?.id) {
            setPayerOptions([])
            setCurrentUserId("")
            return
          }
          setCurrentUserId(user.id)

          const { data: memberEntry } = await supabase
            .from("membros_grupo")
            .select("grupo_id")
            .eq("user_id", user.id)
            .maybeSingle()

          let options = []

          if (memberEntry?.grupo_id) {
            const { data: membersRows } = await supabase
              .from("membros_grupo")
              .select("user_id")
              .eq("grupo_id", memberEntry.grupo_id)

            const userIds = (membersRows ?? []).map((m) => m.user_id).filter(Boolean)
            const { data: profiles } = userIds.length
              ? await supabase.from("profiles").select("id, nome_exibicao, email").in("id", userIds)
              : { data: [] }

            options = (profiles ?? []).map((profile) => {
              const displayName = profile?.nome_exibicao || profile?.email || "Parceiro(a)"
              const isCurrent = profile?.id === user.id
              return {
                value: profile?.id ?? displayName,
                label: isCurrent ? "Você" : getFirstName(displayName),
                role: isCurrent ? "self" : "partner",
              }
            })
          } else {
            const { data: profile } = await supabase
              .from("profiles")
              .select("nome_exibicao, email")
              .eq("id", user.id)
              .maybeSingle()
            options = [
              {
                value: user.id,
                label: "Você",
                role: "self",
              },
            ]
          }

          const uniqueOptions = options
            .filter((option) => option?.value)
            .reduce((acc, option) => {
              if (!acc.some((existing) => existing.value === option.value)) {
                acc.push(option)
              }
              return acc
            }, [])

          setPayerOptions(uniqueOptions)
          setFormData((prev) => ({
            ...prev,
            payer: prev.payer || uniqueOptions[0]?.value || "",
          }))
        } catch {
          setPayerOptions([])
          setCurrentUserId("")
        }
      }

      void loadPayerOptions()
    }, 0)

    return () => clearTimeout(timer)
  }, [])

  function handleChange(event) {
    const { name, value, type, checked } = event.target
    setFormData((prev) => {
      if (type === "checkbox") {
        return { ...prev, [name]: checked }
      }
      if (name === "recurrenceType") {
        if (value === "Parcelado") {
          const nextInstallments =
            !prev.installments || Number(prev.installments) < 2 ? "2" : String(Math.trunc(Number(prev.installments)))
          return { ...prev, recurrenceType: value, installments: nextInstallments, dueDay: "" }
        }
        return { ...prev, recurrenceType: value, installments: "1" }
      }
      if (name === "payer") {
        return {
          ...prev,
          payer: value,
          splitMethod: value === dividedPayerValue ? prev.splitMethod || "50/50" : "50/50",
        }
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
    if (transaction.isProjected) {
      setMessageType("error")
      setMessage("Itens previstos não podem ser editados. Cadastre o lançamento real no mês ou ajuste o modelo em um mês anterior.")
      return
    }
    const isDefaultCategory = categoryOptions.includes(transaction.category)
    setEditingId(transaction.id)
    setFormData({
      type: transaction.type,
      recurrenceType: transaction.recurrenceType ?? "Única",
      paymentStatus: transaction.paymentStatus ?? "Pendente",
      payer: transaction.payer || payerOptions[0]?.value || "",
      isInformative: Boolean(transaction.isInformative),
      installments: "1",
      description: transaction.description,
      category: isDefaultCategory ? transaction.category : customCategoryOption,
      value: String(transaction.value),
      date: transaction.date,
      dueDay: transaction.dueDay ?? "",
      paymentMethod: transaction.paymentMethod,
      visibility: transaction.visibility,
      splitMethod: transaction.splitRule || "50/50",
    })
    setCustomCategory(isDefaultCategory ? "" : transaction.category)
  }

  async function handleRemove(id) {
    if (String(id).startsWith("proj-")) {
      setMessageType("error")
      setMessage("Itens previstos não podem ser removidos.")
      return
    }
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
        descricao: buildDescriptionWithMeta(formData.description.trim(), {
          payer: formData.payer,
          splitMethod: formData.splitMethod,
          isDivided,
          isInformative: formData.isInformative,
        }),
        categoria: normalizedCategory,
        valor: normalizedValue,
        data: formattedDate,
        forma_pagamento: formData.paymentMethod.trim(),
        numero_parcelas: formData.type === "Despesa" && isInstallment ? normalizedInstallments : 1,
        recorrencia: recurrenceMap[formData.recurrenceType] ?? "unica",
        dia_vencimento: isRecurring ? normalizedDueDay : null,
        status: paymentStatusMap[formData.paymentStatus] ?? "pendente",
        visibilidade: visibilityMap[formData.visibility] ?? "privado",
        metodo_divisao: isDivided ? (divisionMethodMap[formData.splitMethod] ?? null) : null,
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

  const filteredTransactions = monthScopedRows.filter((item) => {
    if (filter === "Todos") return true
    if (filter === "Pagos") return item.paymentStatus === "Pago"
    if (filter === "Pendentes") return item.paymentStatus === "Pendente"
    if (filter === "Receitas") return item.type === "Receita"
    if (filter === "Despesas") return item.type === "Despesa"
    if (filter === "Compartilhados") return item.visibility === "Compartilhar no relatório do grupo"
    if (filter === "Privados") return item.visibility === "Privado"
    return true
  })

  function resolveResponsibleIndicator(transaction) {
    const resolved = resolvePayerShortLabel(transaction.payer, { currentUserId, nameByUserId })
    if (resolved.tone === "split") {
      return { label: "🤝", colorClass: "bg-emerald-500", title: resolved.label }
    }
    if (resolved.tone === "joint") {
      return { label: "CJ", colorClass: "bg-slate-500", title: resolved.label }
    }
    if (resolved.tone === "self") {
      return { label: resolved.initial, colorClass: "bg-blue-500", title: resolved.label }
    }
    return {
      label: resolved.initial,
      colorClass: "bg-violet-500",
      title: resolved.label,
    }
  }

  function shiftViewMonth(delta) {
    setViewYM(({ y, m }) => {
      let nm = m + delta
      let ny = y
      while (nm < 0) {
        nm += 12
        ny -= 1
      }
      while (nm > 11) {
        nm -= 12
        ny += 1
      }
      return { y: ny, m: nm }
    })
  }

  const monthTitle = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(viewYM.y, viewYM.m, 1),
  )
  const summaryYear = new Date().getFullYear()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lançamentos"
        subtitle="Registre receitas, despesas e defina o que será privado ou compartilhado."
      />

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-center gap-1 sm:justify-start">
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => shiftViewMonth(-1)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 text-lg font-semibold text-slate-800 transition hover:bg-slate-100"
          >
            ‹
          </button>
          <span className="min-w-[12rem] select-none px-2 text-center text-sm font-semibold capitalize text-slate-900 sm:text-base">
            {monthTitle}
          </span>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => shiftViewMonth(1)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 text-lg font-semibold text-slate-800 transition hover:bg-slate-100"
          >
            ›
          </button>
        </div>
        <button
          type="button"
          onClick={() => setAnnualOpen(true)}
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
        >
          Ver resumo anual
        </button>
      </div>

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

          {payerOptions.length > 1 ? (
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Responsável pelo Pagamento</span>
              <select
                name="payer"
                value={formData.payer}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
              >
                {payerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                {!payerOptions.some((option) => option.value === formData.payer) && formData.payer ? (
                  <option value={formData.payer}>{getFirstName(formData.payer)}</option>
                ) : null}
                <option value={jointPayerValue}>Conta Conjunta</option>
                <option value={dividedPayerValue}>Dividido</option>
              </select>
            </label>
          ) : null}

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

          {isDivided ? (
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Rateio</span>
              <select
                name="splitMethod"
                value={formData.splitMethod}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option>50/50</option>
                <option>60/40</option>
                <option>70/30</option>
                <option>30/70</option>
              </select>
            </label>
          ) : null}

          <label className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
            <input
              name="isInformative"
              type="checkbox"
              checked={formData.isInformative}
              onChange={handleChange}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
            />
            Apenas informativo para o parceiro(a)
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
              {isSaving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar lançamento"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-3 text-xs text-slate-500">
          Exibindo o mês selecionado. Em meses atuais ou futuros, despesas <strong>Recorrente Fixa</strong> sem lançamento
          real aparecem como <strong>Previsto</strong>. Parcelas de compras parceladas aparecem na data de cada parcela.
        </p>
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
          <div>
            <table className="w-full border-separate border-spacing-y-1 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Data</th>
                  <th className="px-2 py-2">Descrição</th>
                  <th className="hidden px-2 py-2 md:table-cell">Recorrência</th>
                  <th className="hidden px-2 py-2 md:table-cell">Pagamento</th>
                  <th className="hidden px-2 py-2 lg:table-cell">Categoria</th>
                  <th className="hidden px-2 py-2 lg:table-cell">Ações</th>
                  <th className="px-2 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((transaction) => {
                  const responsibleIndicator = resolveResponsibleIndicator(transaction)
                  return (
                    <tr key={transaction.id} className="rounded-xl border border-slate-200 bg-slate-50/40">
                    <td className="rounded-l-xl px-2 py-2 text-xs text-slate-600 md:text-sm">{transaction.date}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <span
                          title={responsibleIndicator.title}
                          className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${responsibleIndicator.colorClass}`}
                        />
                        <p className="truncate text-sm font-medium text-slate-900">{transaction.description}</p>
                      </div>
                    </td>
                    <td className="hidden px-2 py-2 text-slate-700 md:table-cell">{transaction.recurrenceType}</td>
                    <td className="hidden px-2 py-2 md:table-cell">
                      <div className="flex flex-wrap items-center gap-1">
                        {transaction.isProjected ? <StatusBadge label="Previsto" tone="info" /> : null}
                        <StatusBadge
                          label={transaction.paymentStatus}
                          tone={transaction.paymentStatus === "Pago" ? "success" : "warning"}
                        />
                      </div>
                    </td>
                    <td className="hidden px-2 py-2 text-slate-700 lg:table-cell">{transaction.category}</td>
                    <td className="hidden px-2 py-2 lg:table-cell">
                      {transaction.isProjected ? (
                        <span className="text-xs text-slate-400">Somente leitura</span>
                      ) : (
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
                      )}
                    </td>
                    <td className="rounded-r-xl px-2 py-2 text-right text-sm font-bold text-slate-900 md:text-base">
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

      <AnnualSummaryModal
        open={annualOpen}
        onClose={() => setAnnualOpen(false)}
        year={summaryYear}
        transactions={rawTransactions}
      />
    </div>
  )
}

export default Lancamentos

