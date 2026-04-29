import { useEffect, useMemo, useRef, useState } from "react"
import AnnualSummaryModal from "../components/AnnualSummaryModal"
import EmptyState from "../components/EmptyState"
import {
  atualizarLancamento,
  criarLancamento,
  listarLancamentos,
  removerLancamento,
} from "../services/lancamentosService"
import { listarCartoes } from "../services/cartoesService"
import { CATEGORY_DRILLDOWN_KEY } from "../constants/navigationEvents"
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

const filters = ["Todos", "Pagos", "Pendentes", "Compartilhados", "Privados"]
const customCategoryOption = "__CUSTOM__"
const CREDIT_PAYMENT_LABEL = "Cartão de Crédito"

const PAYMENT_METHOD_OPTIONS = [
  "PIX",
  "Dinheiro",
  "Débito",
  CREDIT_PAYMENT_LABEL,
  "Boleto",
  "Transferência",
  "Outro",
]

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
  paymentMethod: "PIX",
  cartaoId: "",
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

function parseMoneyInput(value) {
  const raw = String(value ?? "").trim()
  if (!raw) return 0
  const normalized = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".")
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeMoneyDraft(value) {
  return String(value ?? "")
    .replace(/[^\d,.\s]/g, "")
    .replace(/\s/g, "")
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
    cartaoId: record.cartao_id ?? "",
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

function resolvePaymentSignal(transaction) {
  const isPaid = transaction.paymentStatus === "Pago"
  if (isPaid) {
    return { label: "Pago", tone: "paid", isRight: true }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDate = parseUiDate(transaction.date)
  if (dueDate && dueDate < today) {
    return { label: "Pendente", tone: "pending", isRight: false }
  }

  return { label: "Previsto", tone: "planned", isRight: false }
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
  const [formExpanded, setFormExpanded] = useState(false)
  const [creditCards, setCreditCards] = useState([])
  const [categoryDrilldown, setCategoryDrilldown] = useState("")
  const [listOptionsOpen, setListOptionsOpen] = useState(false)
  const valueInputRef = useRef(null)

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
    const stored = sessionStorage.getItem(CATEGORY_DRILLDOWN_KEY)
    if (stored) {
      setCategoryDrilldown(stored)
      sessionStorage.removeItem(CATEGORY_DRILLDOWN_KEY)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      async function loadCards() {
        try {
          const data = await listarCartoes()
          setCreditCards(data ?? [])
        } catch {
          setCreditCards([])
        }
      }
      void loadCards()
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

          const sortedOptions = [...uniqueOptions].sort((a, b) => {
            if (a.role === "self" && b.role !== "self") return -1
            if (a.role !== "self" && b.role === "self") return 1
            return 0
          })
          const defaultPayer =
            sortedOptions.find((o) => o.role === "self")?.value ??
            sortedOptions.find((o) => o.value === user.id)?.value ??
            sortedOptions[0]?.value ??
            ""

          setPayerOptions(sortedOptions)
          setFormData((prev) => ({
            ...prev,
            payer: prev.payer || defaultPayer,
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
      if (name === "paymentMethod" && value !== CREDIT_PAYMENT_LABEL) {
        return { ...prev, paymentMethod: value, cartaoId: "" }
      }
      if (name === "value") {
        return { ...prev, value: normalizeMoneyDraft(value) }
      }
      return { ...prev, [name]: value }
    })
  }

  function handleMoneyStepKeyDown(event, setValue) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
    event.preventDefault()
    const current = parseMoneyInput(event.currentTarget.value || 0)
    const delta = event.shiftKey ? (event.key === "ArrowUp" ? 10 : -10) : event.key === "ArrowUp" ? 1 : -1
    const next = Math.max(0, current + delta)
    setValue(String(next).replace(".", ","))
  }

  function resolveCategoryValue() {
    if (formData.category === customCategoryOption) {
      return customCategory.trim()
    }
    return formData.category.trim()
  }

  function resetForm() {
    const selfPayer =
      payerOptions.find((o) => o.role === "self")?.value ??
      payerOptions.find((o) => o.value === currentUserId)?.value ??
      payerOptions[0]?.value ??
      ""
    setFormData({ ...initialFormData, payer: selfPayer })
    setCustomCategory("")
    setEditingId(null)
  }

  function handleEdit(transaction) {
    if (transaction.isProjected) {
      setMessageType("error")
      setMessage("Itens previstos não podem ser editados. Cadastre o lançamento real no mês ou ajuste o modelo em um mês anterior.")
      return
    }
    setFormExpanded(true)
    const isDefaultCategory = categoryOptions.includes(transaction.category)
    setEditingId(transaction.id)
    setFormData({
      type: transaction.type,
      recurrenceType: transaction.recurrenceType ?? "Única",
      paymentStatus: transaction.paymentStatus ?? "Pendente",
      payer:
        transaction.payer ||
        payerOptions.find((o) => o.role === "self")?.value ||
        currentUserId ||
        payerOptions[0]?.value ||
        "",
      isInformative: Boolean(transaction.isInformative),
      installments: "1",
      description: transaction.description,
      category: isDefaultCategory ? transaction.category : customCategoryOption,
      value: String(transaction.value),
      date: transaction.date,
      dueDay: transaction.dueDay ?? "",
      paymentMethod: transaction.paymentMethod,
      cartaoId: transaction.cartaoId ?? "",
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

  async function handleTogglePaymentStatus(transaction) {
    if (transaction.isProjected) return

    const nextStatus = transaction.paymentStatus === "Pago" ? "pendente" : "pago"
    try {
      await atualizarLancamento(transaction.id, { status: nextStatus })
      window.dispatchEvent(new Event("lancamentos:updated"))
      setRawTransactions((prev) =>
        prev.map((item) =>
          String(item.id) === String(transaction.id)
            ? {
                ...item,
                status: nextStatus,
              }
            : item,
        ),
      )
    } catch {
      setMessageType("error")
      setMessage("Não foi possível atualizar o status do pagamento.")
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const normalizedValue = parseMoneyInput(formData.value)
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
    if (
      formData.paymentMethod.trim() === CREDIT_PAYMENT_LABEL &&
      creditCards.length > 0 &&
      !formData.cartaoId
    ) {
      setMessageType("error")
      setMessage("Selecione o cartão usado nesta compra ou cadastre um em Cartões.")
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
        cartao_id:
          formData.paymentMethod.trim() === CREDIT_PAYMENT_LABEL && formData.cartaoId
            ? formData.cartaoId
            : null,
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
      setFormExpanded(false)
      resetForm()
    } catch (error) {
      setMessageType("error")
      setMessage(error?.message || "Erro ao salvar lançamento.")
    } finally {
      setIsSaving(false)
    }
  }

  const filteredTransactions = monthScopedRows.filter((item) => {
    if (item.type !== "Despesa") return false
    if (categoryDrilldown && String(item.category) !== categoryDrilldown) {
      return false
    }
    if (filter === "Todos") return true
    if (filter === "Pagos") return item.paymentStatus === "Pago"
    if (filter === "Pendentes") return item.paymentStatus === "Pendente"
    if (filter === "Compartilhados") return item.visibility === "Compartilhar no relatório do grupo"
    if (filter === "Privados") return item.visibility === "Privado"
    return true
  })

  const footerTotals = useMemo(() => {
    let receitasTotais = 0
    let gastosGeral = 0
    let despesasPagas = 0
    let despesasPendentes = 0
    for (const t of filteredTransactions) {
      const v = Math.abs(Number(t.value ?? 0))
      if (t.type === "Receita") {
        receitasTotais += v
        continue
      }
      gastosGeral += v
      if (t.paymentStatus === "Pago") despesasPagas += v
      if (t.paymentStatus === "Pendente") despesasPendentes += v
    }
    const saldoRestanteMes = receitasTotais - gastosGeral
    return {
      receitasTotais,
      gastosGeral,
      despesasPagas,
      despesasPendentes,
      saldoRestanteMes,
    }
  }, [filteredTransactions])

  const paidPendingSplit = useMemo(() => {
    const pago = footerTotals.despesasPagas
    const pend = footerTotals.despesasPendentes
    const sum = pago + pend
    if (sum <= 0) return { paidPct: 0, pendPct: 0 }
    return {
      paidPct: (pago / sum) * 100,
      pendPct: (pend / sum) * 100,
    }
  }, [footerTotals])

  useEffect(() => {
    if (!listOptionsOpen) return
    function onKey(ev) {
      if (ev.key === "Escape") setListOptionsOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [listOptionsOpen])

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
  const showFormSection = editingId !== null || formExpanded

  useEffect(() => {
    if (!showFormSection) return
    const timer = setTimeout(() => valueInputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [showFormSection, editingId])

  return (
    <div className="space-y-4 md:space-y-6">
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

      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {editingId ? "Editar lançamento de despesas" : "Novo lançamento de despesas"}
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500 md:text-xs">
              {editingId
                ? "Ajuste os campos e salve. Ou cancele para voltar à lista."
                : "Formulário opcional — a lista abaixo é o foco principal desta tela."}
            </p>
          </div>
          {!editingId ? (
            <button
              type="button"
              onClick={() => setFormExpanded((open) => !open)}
              className="valora-gold-button min-h-11 w-full rounded-xl px-4 py-2.5 text-sm font-semibold sm:w-auto sm:shrink-0"
            >
              {formExpanded ? "Recolher formulário" : "Abrir formulário"}
            </button>
          ) : null}
        </div>

        {!showFormSection && !editingId ? (
          <p className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600 md:mt-4 md:px-4 md:py-3 md:text-sm">
            Toque em <strong>Abrir formulário</strong> quando quiser registrar ou planejar um lançamento.
          </p>
        ) : null}

        {(showFormSection || editingId) && (
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
              type="text"
              inputMode="decimal"
              value={formData.value}
              onChange={handleChange}
              onKeyDown={(e) => handleMoneyStepKeyDown(e, (next) => setFormData((prev) => ({ ...prev, value: next })))}
              ref={valueInputRef}
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
            <select
              name="paymentMethod"
              value={formData.paymentMethod}
              onChange={handleChange}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
            >
              {!PAYMENT_METHOD_OPTIONS.includes(formData.paymentMethod) && formData.paymentMethod ? (
                <option value={formData.paymentMethod}>{formData.paymentMethod}</option>
              ) : null}
              {PAYMENT_METHOD_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>

          {formData.paymentMethod === CREDIT_PAYMENT_LABEL && creditCards.length > 0 ? (
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Cartão utilizado</span>
              <select
                name="cartaoId"
                value={formData.cartaoId}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="">Selecione o cartão...</option>
                {creditCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.nome ?? card.name ?? "Cartão"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

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

          <label className="mt-1 flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
            <input
              name="isInformative"
              type="checkbox"
              checked={formData.isInformative}
              onChange={handleChange}
              className="sr-only"
            />
            <span
              className={`relative h-5 w-9 shrink-0 rounded-md border border-slate-500/70 bg-gradient-to-b from-slate-500 to-slate-700 shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)] transition-colors duration-300 ${
                formData.isInformative ? "ring-1 ring-emerald-300/40" : ""
              }`}
            >
              <span
                className={`absolute inset-[2px] rounded-[4px] transition-colors duration-300 ${
                  formData.isInformative
                    ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.75)]"
                    : "bg-slate-700"
                }`}
              />
              <span
                className={`absolute left-[2px] top-[2px] h-4 w-4 rounded-[4px] border border-slate-300/80 bg-gradient-to-b from-slate-100 via-slate-300 to-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(15,23,42,0.45)] transition-transform duration-300 ease-in-out ${
                  formData.isInformative ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </span>
            <span>Apenas informativo para o parceiro(a)</span>
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
              className="valora-gold-button w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar lançamento"}
            </button>
          </div>
        </form>
        )}
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-[#d8c08a]/45 bg-[#f8f2e3]/80 shadow-sm">
        <div className="border-b border-[#d8c08a]/35 bg-[#fbf6ea]/85 px-3 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">Lançamentos</h2>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">Visão mensal · toque na linha para contexto</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span
                className={`mr-0.5 h-2 w-2 rounded-full ${
                  filter !== "Todos" || categoryDrilldown
                    ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]"
                    : "bg-slate-300/80"
                }`}
                title={filter !== "Todos" || categoryDrilldown ? "Filtros ativos" : "Sem filtros extras"}
              />
              <button
                type="button"
                aria-label="Abrir filtros da lista"
                onClick={() => setListOptionsOpen(true)}
                className="flex min-h-10 min-w-10 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-[0.96]"
              >
                <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 5h18l-6.5 7.3v5.2L10 21v-8.7L3 5Z"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2.5 md:grid-cols-3">
            <div className="valora-metal-card w-full rounded-2xl px-2.5 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a5b16]">Total gastos</p>
              <p className="valora-num mt-1 text-xl font-semibold text-[#2e220b] md:text-2xl">{formatCurrency(footerTotals.gastosGeral)}</p>
            </div>

            <div className="valora-metal-card w-full rounded-2xl px-2.5 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a5b16]">Pagas</p>
              <p className="valora-num mt-1 text-xl font-semibold text-emerald-700 md:text-2xl">{formatCurrency(footerTotals.despesasPagas)}</p>
            </div>

            <div className="valora-metal-card w-full rounded-2xl px-2.5 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a5b16]">Pendentes</p>
              <p className="valora-num mt-1 text-xl font-semibold text-amber-800 md:text-2xl">{formatCurrency(footerTotals.despesasPendentes)}</p>
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              <span>Pago vs pendente</span>
              <span className="normal-case text-slate-400">
                {footerTotals.despesasPagas + footerTotals.despesasPendentes > 0
                  ? `${paidPendingSplit.paidPct.toFixed(0)}% quitado`
                  : "—"}
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

        </div>

        <div className="flex justify-center px-2 pb-3 pt-4 sm:px-4">
          <div className="inline-flex items-center gap-1 rounded-full border border-[#d8c08a]/45 bg-white/90 p-1 shadow-sm">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => shiftViewMonth(-1)}
              className="valora-gold-menu flex min-h-9 min-w-9 items-center justify-center rounded-full text-slate-700 transition active:scale-[0.96] sm:min-h-11 sm:min-w-11"
            >
              <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M12.79 5.23a.75.75 0 0 1 .02 1.06L8.832 10l3.938 3.71a.75.75 0 1 1-1.04 1.08l-4.5-4.25a.75.75 0 0 1 0-1.08l4.5-4.25a.75.75 0 0 1 1.06.02Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <span className="min-w-[9.5rem] select-none px-2 text-center text-sm font-bold capitalize tracking-tight text-slate-900 sm:min-w-[13rem] sm:px-3 sm:text-base">
              {monthTitle}
            </span>
            <button
              type="button"
              aria-label="Próximo mês"
              onClick={() => shiftViewMonth(1)}
              className="valora-gold-menu flex min-h-9 min-w-9 items-center justify-center rounded-full text-slate-700 transition active:scale-[0.96] sm:min-h-11 sm:min-w-11"
            >
              <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 0 1-.02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06.02Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        {categoryDrilldown ? (
          <div className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-300/40 bg-indigo-50/90 px-3 py-2 text-xs text-indigo-950 shadow-sm ring-1 ring-indigo-400/15">
            <span className="font-medium">
              Categoria: <strong className="font-semibold">{categoryDrilldown}</strong>
            </span>
            <button
              type="button"
              onClick={() => setCategoryDrilldown("")}
              className="rounded-lg border border-indigo-300/60 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-900 hover:bg-indigo-50"
            >
              Limpar
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <div className="px-4 pb-6">
            <EmptyState title="Carregando lançamentos" description="Buscando movimentações mais recentes..." />
          </div>
        ) : (
          <div className="px-2 pb-5 sm:px-4">
            <div className="space-y-2.5 md:hidden">
              {filteredTransactions.map((transaction) => {
                const signal = resolvePaymentSignal(transaction)
                const statusClasses =
                  signal.tone === "paid"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : signal.tone === "pending"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-sky-200 bg-sky-50 text-sky-700"
                return (
                  <article
                    key={transaction.id}
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-transform duration-100 active:scale-[0.95]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold text-slate-900">{transaction.description}</p>
                      <p className="valora-num shrink-0 text-sm font-bold text-slate-950">{formatCurrency(transaction.value)}</p>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-600">
                      <p><span className="font-semibold text-slate-700">Data:</span> {transaction.date}</p>
                      <p><span className="font-semibold text-slate-700">Categoria:</span> {transaction.category}</p>
                      <p><span className="font-semibold text-slate-700">Recorrência:</span> {transaction.recurrenceType}</p>
                      <p>
                        <span className="font-semibold text-slate-700">Status:</span>{" "}
                        <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${statusClasses}`}>
                          {signal.label}
                        </span>
                      </p>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {!transaction.isProjected ? (
                        <button
                          type="button"
                          onClick={() => void handleTogglePaymentStatus(transaction)}
                          className="valora-gold-menu rounded-lg px-2 py-1 text-[10px] font-semibold"
                        >
                          Alternar status
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400">Somente leitura</span>
                      )}
                      {!transaction.isProjected ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEdit(transaction)}
                            className="rounded-md border border-blue-200/90 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRemove(transaction.id)}
                            className="rounded-md border border-rose-200/90 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700"
                          >
                            Remover
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>

            <table className="hidden w-full border-collapse text-sm md:table">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  <th className="rounded-tl-xl bg-slate-100/95 px-3 py-2.5 font-semibold">Data</th>
                  <th className="bg-slate-100/95 px-3 py-2.5 font-semibold">Descrição</th>
                  <th className="hidden bg-slate-100/95 px-3 py-2.5 font-semibold md:table-cell">Recorrência</th>
                  <th className="hidden bg-slate-100/95 px-3 py-2.5 font-semibold md:table-cell">Pagamento</th>
                  <th className="hidden bg-slate-100/95 px-3 py-2.5 font-semibold lg:table-cell">Categoria</th>
                  <th className="hidden bg-slate-100/95 px-3 py-2.5 font-semibold lg:table-cell">Ações</th>
                  <th className="rounded-tr-xl bg-slate-100/95 px-3 py-2.5 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((transaction, rowIdx) => {
                  const responsibleIndicator = resolveResponsibleIndicator(transaction)
                  const zebra = rowIdx % 2 === 0 ? "bg-white/[0.97]" : "bg-slate-50/[0.85]"
                  return (
                    <tr
                      key={transaction.id}
                      className={`group transition-colors duration-150 ease-out ${zebra} hover:bg-emerald-400/[0.07] hover:shadow-[inset_0_0_0_9999px_rgba(52,211,153,0.06)]`}
                    >
                      <td className="px-3 py-2.5 text-xs text-slate-600 md:text-sm">{transaction.date}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            title={responsibleIndicator.title}
                            className={`inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${responsibleIndicator.colorClass}`}
                          />
                          <p className="truncate text-sm font-medium text-slate-900">{transaction.description}</p>
                        </div>
                      </td>
                      <td className="hidden px-3 py-2.5 text-slate-700 md:table-cell">{transaction.recurrenceType}</td>
                      <td className="hidden px-3 py-2.5 md:table-cell">
                        {(() => {
                          const signal = resolvePaymentSignal(transaction)
                          return (
                            <button
                              type="button"
                              onClick={() => void handleTogglePaymentStatus(transaction)}
                              disabled={transaction.isProjected}
                              className={`valora-metal-switch valora-metal-switch--${signal.tone} ${
                                transaction.isProjected ? "cursor-not-allowed opacity-65" : "cursor-pointer"
                              }`}
                              aria-label={`Alterar status de pagamento para ${transaction.paymentStatus === "Pago" ? "Pendente" : "Pago"}`}
                              title={transaction.isProjected ? "Item previsto não pode ser alterado" : "Clique para alternar status"}
                            >
                              <span className={`valora-metal-switch-knob ${signal.isRight ? "ml-auto" : ""}`} />
                              <span className="valora-metal-switch-label">{signal.label}</span>
                            </button>
                          )
                        })()}
                      </td>
                      <td className="hidden px-3 py-2.5 text-slate-700 lg:table-cell">{transaction.category}</td>
                      <td className="hidden px-3 py-2.5 lg:table-cell">
                        {transaction.isProjected ? (
                          <span className="text-xs text-slate-400">Somente leitura</span>
                        ) : (
                          <div className="flex items-center gap-2 opacity-90 transition group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => handleEdit(transaction)}
                              className="rounded-lg border border-blue-200/90 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition-all hover:border-blue-300 hover:bg-blue-100 active:scale-[0.98]"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRemove(transaction.id)}
                              className="rounded-lg border border-rose-200/90 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition-all hover:border-rose-300 hover:bg-rose-100 active:scale-[0.98]"
                            >
                              Remover
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="valora-num px-3 py-2.5 text-right text-sm font-semibold text-slate-950 md:text-[15px]">
                        {formatCurrency(transaction.value)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {listOptionsOpen ? (
          <>
            <button
              type="button"
              aria-label="Fechar opções"
              className="fixed inset-0 z-[60] cursor-default border-0 bg-slate-950/50 backdrop-blur-[2px] transition-opacity"
              onClick={() => setListOptionsOpen(false)}
            />
            <aside
              className="fixed right-0 top-0 z-[70] flex h-full w-full max-w-sm flex-col border-l border-slate-200/80 bg-white shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-label="Filtros e opções"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h3 className="text-sm font-bold text-slate-900">Opções da lista</h3>
                <button
                  type="button"
                  onClick={() => setListOptionsOpen(false)}
                  className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Fechar"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Filtrar por</p>
                  <div className="flex flex-wrap gap-2">
                    {filters.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setFilter(item)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all active:scale-[0.98] ${
                          filter === item
                            ? "border-slate-900 bg-slate-900 text-white shadow-md"
                            : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                {categoryDrilldown ? (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-3 text-xs text-indigo-950">
                    <p className="font-medium">Categoria ativa: {categoryDrilldown}</p>
                    <button
                      type="button"
                      onClick={() => setCategoryDrilldown("")}
                      className="mt-2 w-full rounded-lg border border-indigo-300 bg-white py-2 text-xs font-semibold text-indigo-900"
                    >
                      Limpar categoria
                    </button>
                  </div>
                ) : null}

                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Ir para o mês</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="month"
                      value={`${viewYM.y}-${String(viewYM.m + 1).padStart(2, "0")}`}
                      onChange={(e) => {
                        const v = e.target.value
                        if (!v) return
                        const [ys, ms] = v.split("-").map(Number)
                        if (ys && ms >= 1 && ms <= 12) setViewYM({ y: ys, m: ms - 1 })
                      }}
                      className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date()
                        setViewYM({ y: d.getFullYear(), m: d.getMonth() })
                      }}
                      className="min-h-11 shrink-0 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      Mês atual
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-[11px] leading-relaxed text-slate-600">
                  Em meses atuais ou futuros, despesas <strong className="text-slate-800">Recorrente Fixa</strong> sem
                  lançamento real aparecem como <strong className="text-slate-800">Previsto</strong>. Parcelas aparecem na
                  data de cada parcela.
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setListOptionsOpen(false)
                    setAnnualOpen(true)
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  Ver resumo anual
                </button>
              </div>
            </aside>
          </>
        ) : null}
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

