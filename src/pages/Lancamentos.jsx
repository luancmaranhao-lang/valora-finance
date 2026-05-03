import { useEffect, useMemo, useRef, useState } from "react"
import AnnualSummaryModal from "../components/AnnualSummaryModal"
import CarryOverBanner from "../components/CarryOverBanner"
import EmptyState from "../components/EmptyState"
import {
  atualizarLancamento,
  criarLancamento,
  listarLancamentos,
  removerLancamento,
} from "../services/lancamentosService"
import { listarCartoes } from "../services/cartoesService"
import { CATEGORY_DRILLDOWN_KEY, GOTO_PAGE_EVENT } from "../constants/navigationEvents"
import { supabase } from "../services/supabaseClient"
import { listWallets, WALLETS_UPDATED_EVENT } from "../services/walletsService"
import {
  getYearMonthKeyFromParts,
  mergeGastosEsporadicosToPlanningItems,
  planningRowKey,
  sumPendingProvision,
  VARIABLE_PLANNING_UPDATED_EVENT,
} from "../utils/variablePlanningStore"
import {
  atualizarGastoEsporadico,
  excluirGastoEsporadico,
  inserirGastoEsporadico,
  listarGastosEsporadicosPorCompetencia,
} from "../services/gastosEsporadicosService"
import { metasService } from "../services/metasService"
import { buildProjectedRawRows, isDateInMonth } from "../utils/projectedRecurringExpenses"
import { getWeekendsInMonth, valorPorSexta } from "../utils/weekendMonthUtils"
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

function formatMoneyInput(value) {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return "0,00"
  return amount.toFixed(2).replace(".", ",")
}

/** Parte inteira com pelo menos 2 dígitos (ex.: 00,00) para campos de provisão. */
function formatProvisionMoneyDisplay(value) {
  const s = formatMoneyInput(value)
  const [intRaw, decRaw] = s.split(",")
  const dec = (decRaw ?? "00").slice(0, 2).padEnd(2, "0")
  const intPart = intRaw ?? "0"
  const intNum = intPart.replace(/\D/g, "") === "" ? 0 : parseInt(intPart, 10)
  const intStr = Number.isFinite(intNum) ? String(intNum) : "0"
  const paddedInt = intStr.length < 2 ? intStr.padStart(2, "0") : intStr
  return `${paddedInt},${dec}`
}

function roundMoney2(value) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function provisionValorDigitsFromRaw(raw) {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 12)
}

/** Digitação cent-first: apenas dígitos, interpretados como centavos (ex.: 1→0,01; 1000→10,00). */
function formatProvisionValorDraftFromRaw(raw) {
  const digits = provisionValorDigitsFromRaw(raw)
  if (!digits) return formatProvisionMoneyDisplay(0)
  const cents = parseInt(digits, 10)
  if (!Number.isFinite(cents)) return formatProvisionMoneyDisplay(0)
  return formatProvisionMoneyDisplay(cents / 100)
}

function getYearMonthKey(viewYM) {
  return getYearMonthKeyFromParts(viewYM.y, viewYM.m)
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

/** Remove o sufixo técnico da descrição na lista (mantém só o nome, ex. «Medicamento»). */
function cleanProvisionAgendaDisplay(description) {
  const base = String(description ?? "").trim()
  const marker = " [provisao_agenda:"
  const i = base.indexOf(marker)
  return i >= 0 ? base.slice(0, i).trim() : base
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

  const agendaLink =
    record._provisionPlanningRowKey && record._provisionSlotSid != null && record._provisionSlotSid !== ""
      ? { rowKey: String(record._provisionPlanningRowKey), slotSid: String(record._provisionSlotSid) }
      : null

  return {
    id: record.id,
    projectedTemplateId: record._projectedTemplateId ?? null,
    agendaLink,
    type: typeRaw === "receita" ? "Receita" : "Despesa",
    recurrenceType:
      recurrenceRaw === "recorrente_fixa"
        ? "Recorrente Fixa"
        : recurrenceRaw === "recorrente_variavel"
          ? "Recorrente Variável"
          : recurrenceRaw === "parcelado"
            ? "Parcelado"
          : "Única",
    description: cleanProvisionAgendaDisplay(removeLancamentoMetaTags(rawDescription)),
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

/** Soma dos valores em `datasUsoPlanejadas` com data no mês visível (provisões pendentes). */
function sumProvisionAgendadoNoMes(items, year, monthIndex) {
  let s = 0
  for (const item of items ?? []) {
    if (item.status !== "pendente") continue
    for (const row of item.datasUsoPlanejadas ?? []) {
      const iso = String(row?.data ?? "").slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue
      if (!isDateInMonth(iso, year, monthIndex)) continue
      const v = Number(row?.valor ?? 0)
      if (Number.isFinite(v) && v > 0) s += v
    }
  }
  return roundMoney2(s)
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

/** Linhas reais, recorrência projetada (com modelo) ou agenda de provisão (com vínculo ao planejamento). */
function isLancamentoControleNaLista(transaction) {
  if (!transaction?.isProjected) return true
  if (transaction.agendaLink?.rowKey && transaction.agendaLink?.slotSid) return true
  if (String(transaction.id ?? "").startsWith("prov-ag-")) return false
  return Boolean(transaction.projectedTemplateId)
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

function simpleKeyHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i += 1) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

/** Linhas “fantasma” na lista de despesas a partir de datas/valores agendados na provisão. */
function buildProvisionScheduledRawRows(items, year, monthIndex, competenciaKey) {
  const out = []
  for (const item of items ?? []) {
    if (item.status === "precisou") continue
    const slots = item.datasUsoPlanejadas ?? []
    if (!slots.length) continue
    const label = String(item.displayLabel || item.descricao || "Provisão").trim()
    const idPart = item.id ?? item.codigo ?? "tmp"
    slots.forEach((slot, idx) => {
      const iso = String(slot?.data ?? "").slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !isDateInMonth(iso, year, monthIndex)) return
      const v = Math.abs(Number(slot?.valor ?? 0))
      if (!Number.isFinite(v) || v <= 0) return
      out.push({
        id: `prov-ag-${idPart}-${idx}-${iso}`,
        tipo: "despesa",
        descricao: `${label} [provisao_agenda:${competenciaKey}:${idPart}:${idx}]`,
        categoria: "🍿 Lazer",
        valor: v,
        data: iso,
        status: "pendente",
        forma_pagamento: "PIX",
        recorrencia: "unica",
        visibilidade: "privado",
        _projected: true,
        _provisionPlanningRowKey: planningRowKey(item),
        _provisionSlotSid: slot.sid,
      })
    })
  }
  return out
}

/** Mesma linha de provisão na UI (id, clientUid antes de gravar ou codigo nativo sem id). */
function samePlanningItem(row, ref) {
  if (!row || !ref) return false
  if (ref.id != null && ref.id !== "") return String(row.id ?? "") === String(ref.id)
  if (ref.clientUid) return row.clientUid === ref.clientUid
  if (ref.codigo != null && ref.codigo !== "" && (ref.id == null || ref.id === ""))
    return String(row.codigo ?? "") === String(ref.codigo) && (row.id == null || row.id === "")
  return planningRowKey(row) === planningRowKey(ref)
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
  const [wallets, setWallets] = useState(() => listWallets())
  const [selectedWalletId, setSelectedWalletId] = useState("")
  const [variablePlanningItems, setVariablePlanningItems] = useState([])
  const [variablePlanningAccordionOpen, setVariablePlanningAccordionOpen] = useState(false)
  /** Destaca e faz scroll até a provisão/agenda ao editar a partir da lista. */
  const [planningUiHighlight, setPlanningUiHighlight] = useState(null)
  const [moneyDraftByKey, setMoneyDraftByKey] = useState({})
  /** `rk|idx` → texto cent-first enquanto edita valor de uma linha de agendamento. */
  const [agendaMoneyDraftByCell, setAgendaMoneyDraftByCell] = useState({})
  /** `rk -> true` enquanto o utilizador desbloqueou o valor para editar (linhas já persistidas com `id`). */
  const [provisionValorDesbloqueado, setProvisionValorDesbloqueado] = useState({})
  const [metaSaldoNome, setMetaSaldoNome] = useState("Saldo")
  const [metaSugestaoDispensada, setMetaSugestaoDispensada] = useState(false)
  const variablePlanningItemsRef = useRef([])
  const provisionValorDesbloqueadoRef = useRef({})
  const valueInputRef = useRef(null)

  useEffect(() => {
    variablePlanningItemsRef.current = variablePlanningItems
  }, [variablePlanningItems])

  useEffect(() => {
    if (!variablePlanningAccordionOpen || !planningUiHighlight?.rowKey) return
    const rkSafe = String(planningUiHighlight.rowKey).replace(/[^\w-]/g, "_")
    const slot = planningUiHighlight.slotSid
    const targetId = slot
      ? `vp-agenda-${rkSafe}-${String(slot).replace(/[^\w-]/g, "_")}`
      : `vp-focus-${rkSafe}`
    const rafId = requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" })
    })
    const t = setTimeout(() => setPlanningUiHighlight(null), 2600)
    return () => {
      cancelAnimationFrame(rafId)
      clearTimeout(t)
    }
  }, [planningUiHighlight, variablePlanningAccordionOpen])

  useEffect(() => {
    provisionValorDesbloqueadoRef.current = provisionValorDesbloqueado
  }, [provisionValorDesbloqueado])

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
    const planKey = getYearMonthKeyFromParts(y, m)
    const inMonthReal = transactions.filter((row) => isDateInMonth(row.date, y, m))
    const projectedRaw = buildProjectedRawRows(rawTransactions, y, m)
    const projectedProvisionRaw = buildProvisionScheduledRawRows(variablePlanningItems, y, m, planKey)
    const projectedUi = [...projectedRaw, ...projectedProvisionRaw].map(mapDbToUi)
    const merged = [...projectedUi, ...inMonthReal].sort((a, b) => {
      const da = parseUiDate(a.date)?.getTime() ?? 0
      const db = parseUiDate(b.date)?.getTime() ?? 0
      return da - db
    })
    return merged
  }, [transactions, rawTransactions, viewYM, variablePlanningItems])

  const viewMonthPlanKey = useMemo(() => getYearMonthKey(viewYM), [viewYM])

  const carryMonthKeysLan = useMemo(() => {
    const { y, m } = viewYM
    const prev = new Date(y, m - 1, 1)
    return {
      mesAtual: getYearMonthKeyFromParts(y, m),
      mesAnterior: getYearMonthKeyFromParts(prev.getFullYear(), prev.getMonth()),
    }
  }, [viewYM])

  const [carryRefreshKey, setCarryRefreshKey] = useState(0)

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
    function syncWallets() {
      setWallets(listWallets())
    }
    window.addEventListener(WALLETS_UPDATED_EVENT, syncWallets)
    window.addEventListener("storage", syncWallets)
    return () => {
      window.removeEventListener(WALLETS_UPDATED_EVENT, syncWallets)
      window.removeEventListener("storage", syncWallets)
    }
  }, [])

  useEffect(() => {
    const selfWallets = listWallets()
    setWallets(selfWallets)
    setSelectedWalletId((prev) => {
      if (prev && selfWallets.some((wallet) => String(wallet.id) === String(prev))) return prev
      return selfWallets[0]?.id != null ? String(selfWallets[0].id) : ""
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadProvisoes() {
      try {
        const rows = await listarGastosEsporadicosPorCompetencia(viewMonthPlanKey)
        if (cancelled) return
        setVariablePlanningItems(mergeGastosEsporadicosToPlanningItems(rows, viewYM.y, viewYM.m))
        setMoneyDraftByKey({})
      } catch (err) {
        if (cancelled) return
        console.error("[Lancamentos] loadProvisoes falhou:", err)
        const msg =
          err && typeof err === "object" && "message" in err && err.message
            ? String(err.message)
            : err != null
              ? String(err)
              : "Erro desconhecido"
        setVariablePlanningItems(mergeGastosEsporadicosToPlanningItems([], viewYM.y, viewYM.m))
        setMessageType("error")
        setMessage(
          `Não foi possível carregar provisões: ${msg}. Abra o console (F12) para message/details/code. Confirme a tabela gastos_esporadicos (sql/gastos_esporadicos.sql) e o login.`,
        )
      }
    }
    void loadProvisoes()
    return () => {
      cancelled = true
    }
  }, [viewMonthPlanKey, viewYM.y, viewYM.m])

  useEffect(() => {
    setProvisionValorDesbloqueado({})
    setMetaSugestaoDispensada(false)
  }, [viewMonthPlanKey])

  useEffect(() => {
    let cancel = false
    void metasService
      .listarMetas()
      .then((data) => {
        if (cancel) return
        const list = data ?? []
        const saldoMeta = list.find((m) => /saldo/i.test(String(m.nome ?? m.name ?? "")))
        if (saldoMeta) {
          setMetaSaldoNome(String(saldoMeta.nome ?? saldoMeta.name ?? "Saldo"))
          return
        }
        if (list[0]) {
          setMetaSaldoNome(String(list[0].nome ?? list[0].name ?? "Meta"))
        }
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
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
    if (transaction.agendaLink?.rowKey && transaction.agendaLink?.slotSid) {
      setVariablePlanningAccordionOpen(true)
      setPlanningUiHighlight({
        rowKey: transaction.agendaLink.rowKey,
        slotSid: transaction.agendaLink.slotSid,
      })
      setProvisionValorDesbloqueado((p) => ({ ...p, [transaction.agendaLink.rowKey]: true }))
      setMessage("")
      return
    }
    if (transaction.isProjected) {
      if (!transaction.projectedTemplateId) {
        setMessageType("error")
        setMessage("Item previsto sem modelo vinculado. Recarregue a página ou verifique o lançamento recorrente base.")
        return
      }
    }
    setFormExpanded(true)
    const isDefaultCategory = categoryOptions.includes(transaction.category)
    setEditingId(transaction.isProjected ? null : transaction.id)
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

  async function handleRemove(transactionOrId) {
    const isTx = transactionOrId && typeof transactionOrId === "object" && "id" in transactionOrId
    const transaction = isTx ? transactionOrId : null
    const id = isTx ? transaction.id : transactionOrId

    if (transaction?.agendaLink?.rowKey && transaction?.agendaLink?.slotSid) {
      const item = variablePlanningItemsRef.current.find((i) => planningRowKey(i) === transaction.agendaLink.rowKey)
      if (item) await handleRemoveAgendaRow(item, transaction.agendaLink.slotSid)
      return
    }

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

  async function materializeProjectedRecurringRow(transaction, nextStatusDb) {
    const templateId = transaction.projectedTemplateId
    if (!templateId) throw new Error("Modelo não encontrado.")
    const template = rawTransactions.find((r) => String(r.id) === String(templateId))
    if (!template) throw new Error("Lançamento base não encontrado.")

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user?.id) throw new Error("Sessão inválida.")

    const dataIso = normalizeUiDate(transaction.date)
    const { id: _rid, created_at: _ca, updated_at: _ua, ...templateRest } = template
    await criarLancamento({
      ...templateRest,
      user_id: user.id,
      data: dataIso,
      status: nextStatusDb,
      numero_parcelas: 1,
    })
  }

  async function handleTogglePaymentStatus(event, transaction) {
    event?.stopPropagation?.()
    const nextStatus = transaction.paymentStatus === "Pago" ? "pendente" : "pago"

    if (transaction.isProjected) {
      if (transaction.agendaLink?.rowKey && transaction.agendaLink?.slotSid) {
        setVariablePlanningAccordionOpen(true)
        setPlanningUiHighlight({
          rowKey: transaction.agendaLink.rowKey,
          slotSid: transaction.agendaLink.slotSid,
        })
        setMessageType("neutral")
        setMessage("Ajuste data e valor na agenda do planejamento abaixo; use «Guardar agendamentos» para gravar.")
        return
      }
      if (!transaction.projectedTemplateId) return
      try {
        await materializeProjectedRecurringRow(transaction, nextStatus)
        window.dispatchEvent(new Event("lancamentos:updated"))
        await loadLancamentos()
      } catch {
        setMessageType("error")
        setMessage("Não foi possível gravar o pagamento deste mês. Tente novamente.")
      }
      return
    }

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

  async function refreshPlanningFromDb() {
    const rows = await listarGastosEsporadicosPorCompetencia(viewMonthPlanKey)
    setVariablePlanningItems(mergeGastosEsporadicosToPlanningItems(rows, viewYM.y, viewYM.m))
    window.dispatchEvent(new Event(VARIABLE_PLANNING_UPDATED_EVENT))
  }

  async function handleCarryOverSuccessLancamentos() {
    setMessage("")
    setCarryRefreshKey((k) => k + 1)
    await refreshPlanningFromDb()
    await loadLancamentos()
  }

  function provisionRowDbFields(item) {
    return {
      dataAlvo: item?.dataAlvo ?? "",
      contabilizaNoTotal: true,
    }
  }

  function slotsPayloadForItem(item, valorPlanejado) {
    if (item.codigo !== "final_de_semana") return {}
    const { weekendLabelCount } = getWeekendsInMonth(viewYM.y, viewYM.m)
    return {
      slots_sexta_no_mes: weekendLabelCount,
      valor_por_slot: valorPorSexta(valorPlanejado, weekendLabelCount),
    }
  }

  async function persistValorPlanejado(item, parsedRaw) {
    if (item.status === "precisou") return false
    const v = Math.max(0, Number(parsedRaw) || 0)
    if (!item.id && v === 0) return false
    const slotsPayload = slotsPayloadForItem(item, v)
    try {
      if (item.id) {
        await atualizarGastoEsporadico(item.id, { valor_planejado: v, ...slotsPayload })
      } else {
        await inserirGastoEsporadico({
          competencia: viewMonthPlanKey,
          codigo: item.codigo,
          descricao: item.descricao || item.displayLabel,
          valor_planejado: v,
          status: item.status ?? "pendente",
          lancamento_id: item.lancamentoId,
          carteira_id: selectedWalletId || null,
          datasUsoPlanejadas: item.datasUsoPlanejadas ?? [],
          ...provisionRowDbFields(item),
          ...slotsPayload,
        })
      }
      await refreshPlanningFromDb()
      return true
    } catch (error) {
      setMessageType("error")
      setMessage(error?.message || "Não foi possível salvar o valor da provisão.")
      return false
    }
  }

  async function persistDescricaoCustom(rowKey, nextDesc) {
    const trimmed = String(nextDesc ?? "").trim()
    if (!trimmed) return
    const item = variablePlanningItemsRef.current.find((i) => planningRowKey(i) === rowKey)
    if (!item?.isCustom) return
    try {
      if (item.id) {
        await atualizarGastoEsporadico(item.id, { descricao: trimmed })
      } else {
        await inserirGastoEsporadico({
          competencia: viewMonthPlanKey,
          codigo: null,
          descricao: trimmed,
          valor_planejado: Number(item.plannedValue ?? 0) || 0,
          status: item.status ?? "pendente",
          lancamento_id: item.lancamentoId,
          carteira_id: selectedWalletId || null,
          datasUsoPlanejadas: item.datasUsoPlanejadas ?? [],
          ...provisionRowDbFields(item),
        })
      }
      await refreshPlanningFromDb()
    } catch (error) {
      setMessageType("error")
      setMessage(error?.message || "Não foi possível salvar a descrição.")
    }
  }

  function agendaDraftCellKey(rk, sid) {
    return `${rk}::${sid}`
  }

  function clearAgendaDraftKeysForRow(rk) {
    setAgendaMoneyDraftByCell((prev) => {
      const next = { ...prev }
      const legacy = `${rk}|`
      const modern = `${rk}::`
      for (const key of Object.keys(next)) {
        if (key.startsWith(legacy) || key.startsWith(modern)) delete next[key]
      }
      return next
    })
  }

  async function persistDatasUsoPlanejadas(item) {
    const rk = planningRowKey(item)
    const latest = variablePlanningItemsRef.current.find((i) => samePlanningItem(i, item)) ?? item
    if (!latest.id) {
      setMessageType("error")
      setMessage("Guarde o valor da provisão antes de guardar os agendamentos.")
      return
    }
    const rows = (latest.datasUsoPlanejadas ?? [])
      .map((r) => ({
        data: String(r?.data ?? "").slice(0, 10),
        valor: roundMoney2(Number(r?.valor ?? 0)),
      }))
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.data) && r.valor > 0)
    const planned = roundMoney2(Number(latest.plannedValue ?? 0))
    const sum = roundMoney2(rows.reduce((s, r) => s + r.valor, 0))
    if (sum > planned + 0.001) {
      setMessageType("error")
      setMessage("A soma dos valores agendados não pode exceder o valor provisionado.")
      return
    }
    try {
      await atualizarGastoEsporadico(latest.id, { datasUsoPlanejadas: rows })
      clearAgendaDraftKeysForRow(rk)
      await refreshPlanningFromDb()
      setMessageType("success")
      setMessage("Agendamentos guardados — aparecem como despesas previstas na lista.")
    } catch (error) {
      setMessageType("error")
      setMessage(error?.message || "Não foi possível guardar os agendamentos.")
    }
  }

  function handleAddAgendaRow(item) {
    const { y, m } = viewYM
    const defaultData = `${y}-${String(m + 1).padStart(2, "0")}-01`
    const sid = globalThis.crypto?.randomUUID?.() ?? `ag-tmp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    setVariablePlanningItems((prev) =>
      prev.map((row) => {
        if (!samePlanningItem(row, item)) return row
        const arr = [...(row.datasUsoPlanejadas ?? [])]
        arr.push({ sid, data: defaultData, valor: 0 })
        return { ...row, datasUsoPlanejadas: arr }
      }),
    )
  }

  async function handleRemoveAgendaRow(item, slotSid) {
    const rk = planningRowKey(item)
    const latest = variablePlanningItemsRef.current.find((i) => samePlanningItem(i, item)) ?? item
    const previousSlots = [...(latest.datasUsoPlanejadas ?? [])]
    const newSlots = previousSlots.filter((slot) => slot.sid !== slotSid)

    clearAgendaDraftKeysForRow(rk)
    setAgendaMoneyDraftByCell((prev) => {
      if (slotSid == null || slotSid === "") return prev
      const next = { ...prev }
      delete next[agendaDraftCellKey(rk, slotSid)]
      return next
    })
    setVariablePlanningItems((prev) =>
      prev.map((row) => {
        if (!samePlanningItem(row, item)) return row
        return { ...row, datasUsoPlanejadas: newSlots }
      }),
    )

    if (!latest.id) return

    const rows = newSlots
      .map((r) => ({
        data: String(r?.data ?? "").slice(0, 10),
        valor: roundMoney2(Number(r?.valor ?? 0)),
      }))
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.data) && r.valor > 0)

    try {
      await atualizarGastoEsporadico(latest.id, { datasUsoPlanejadas: rows })
    } catch (error) {
      setVariablePlanningItems((prev) =>
        prev.map((row) =>
          samePlanningItem(row, item) ? { ...row, datasUsoPlanejadas: previousSlots } : row,
        ),
      )
      setMessageType("error")
      setMessage(error?.message || "Não foi possível remover a linha de agendamento.")
    }
  }

  function handleAgendaRowDataChange(item, sid, isoDate) {
    setVariablePlanningItems((prev) =>
      prev.map((row) => {
        if (!samePlanningItem(row, item)) return row
        const arr = (row.datasUsoPlanejadas ?? []).map((slot) =>
          slot.sid === sid ? { ...slot, data: String(isoDate ?? "").slice(0, 10) } : slot,
        )
        return { ...row, datasUsoPlanejadas: arr }
      }),
    )
  }

  function handleAgendaValorChange(item, sid, raw) {
    const rk = planningRowKey(item)
    const ck = agendaDraftCellKey(rk, sid)
    const draft = formatProvisionValorDraftFromRaw(raw)
    const parsed = parseMoneyInput(draft)
    setAgendaMoneyDraftByCell((prev) => ({ ...prev, [ck]: draft }))
    setVariablePlanningItems((prev) =>
      prev.map((row) => {
        if (!samePlanningItem(row, item)) return row
        const arr = (row.datasUsoPlanejadas ?? []).map((slot) =>
          slot.sid === sid ? { ...slot, valor: parsed } : slot,
        )
        return { ...row, datasUsoPlanejadas: arr }
      }),
    )
  }

  function handleMoneyDraftChange(item, raw) {
    if (item.status === "precisou") return
    const k = planningRowKey(item)
    const travado =
      Boolean(item.id && item.status !== "precisou" && provisionValorDesbloqueado[k] !== true)
    if (travado) return
    const draft = formatProvisionValorDraftFromRaw(raw)
    const parsed = parseMoneyInput(draft)
    setMoneyDraftByKey((prev) => ({ ...prev, [k]: draft }))
    setVariablePlanningItems((prev) =>
      prev.map((row) => (planningRowKey(row) === k ? { ...row, plannedValue: parsed } : row)),
    )
  }

  async function handleMoneyDraftBlur(item, currentValue) {
    const k = planningRowKey(item)
    const latest = variablePlanningItemsRef.current.find((i) => planningRowKey(i) === k) ?? item
    if (latest.status === "precisou") return false
    const parsed = parseMoneyInput(currentValue)
    const salvarAposEditar = provisionValorDesbloqueadoRef.current[k] === true
    setMoneyDraftByKey((prev) => {
      const next = { ...prev }
      delete next[k]
      return next
    })
    // Sem `salvarAposEditar`: se o estado local já batia com o rascunho mas o Supabase estava desatualizado,
    // saltávamos o PATCH e o valor nunca gravava (ex.: Editar → 100,00 → Salvar com linha já com id).
    if (
      roundMoney2(latest.plannedValue) === roundMoney2(parsed) &&
      latest.id &&
      !salvarAposEditar
    ) {
      const slotsOnly = slotsPayloadForItem(latest, parsed)
      if (latest.codigo === "final_de_semana" && latest.id) {
        try {
          await atualizarGastoEsporadico(latest.id, slotsOnly)
          await refreshPlanningFromDb()
        } catch {
          /* noop */
        }
      }
      setProvisionValorDesbloqueado((prev) => {
        const next = { ...prev }
        delete next[k]
        return next
      })
      return true
    }
    const ok = await persistValorPlanejado(latest, parsed)
    if (ok) {
      setProvisionValorDesbloqueado((prev) => {
        const next = { ...prev }
        delete next[k]
        return next
      })
    }
    return ok
  }

  function handleAdicionarProvisao() {
    const clientUid = globalThis.crypto?.randomUUID?.() ?? `tmp-${Date.now()}`
    setVariablePlanningItems((prev) => [
      ...prev,
      {
        id: null,
        clientUid,
        codigo: null,
        descricao: "",
        displayLabel: "",
        plannedValue: 0,
        status: "pendente",
        lancamentoId: null,
        slotsSextaNoMes: null,
        valorPorSlot: null,
        isCustom: true,
        contabilizaNoTotal: true,
        dataAlvo: "",
        datasUsoPlanejadas: [],
      },
    ])
  }

  async function handleExcluirProvisao(item) {
    const rk = planningRowKey(item)
    if (item.status === "precisou") {
      window.alert("Não é possível excluir uma provisão já lançada.")
      return
    }
    if (!item.id && item.isCustom) {
      setVariablePlanningItems((prev) => prev.filter((row) => planningRowKey(row) !== rk))
      setMoneyDraftByKey((prev) => {
        const next = { ...prev }
        delete next[rk]
        return next
      })
      setProvisionValorDesbloqueado((prev) => {
        const next = { ...prev }
        delete next[rk]
        return next
      })
      clearAgendaDraftKeysForRow(rk)
      return
    }
    if (!item.id) return

    const prevList = variablePlanningItemsRef.current.slice()
    setVariablePlanningItems((prev) => prev.filter((row) => planningRowKey(row) !== rk))
    setMoneyDraftByKey((prev) => {
      const next = { ...prev }
      delete next[rk]
      return next
    })
    setProvisionValorDesbloqueado((prev) => {
      const next = { ...prev }
      delete next[rk]
      return next
    })
    clearAgendaDraftKeysForRow(rk)

    try {
      await excluirGastoEsporadico(item.id)
      await refreshPlanningFromDb()
    } catch (error) {
      setVariablePlanningItems(prevList)
      window.alert(error?.message || "Não foi possível excluir a provisão.")
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

  const variablePlanningTotals = useMemo(() => {
    const comprometidoPendente = sumPendingProvision(variablePlanningItems)
    const liberado = variablePlanningItems
      .filter((item) => item.status === "nao_precisou")
      .reduce((sum, item) => sum + Number(item.plannedValue ?? 0), 0)
    return {
      comprometidoPendente,
      liberado,
    }
  }, [variablePlanningItems])

  const sugestaoMetaValor = useMemo(() => {
    let total = 0
    for (const item of variablePlanningItems) {
      if (item.status === "nao_precisou") {
        total += Number(item.plannedValue ?? 0) || 0
      } else if (item.status === "precisou" && item.lancamentoId) {
        const t = transactions.find((tr) => String(tr.id) === String(item.lancamentoId))
        if (t) {
          const gasto = Math.abs(Number(t.value ?? 0))
          const planej = Number(item.plannedValue ?? 0)
          total += Math.max(0, planej - gasto)
        }
      }
    }
    return total
  }, [variablePlanningItems, transactions])

  const variablePlanningBarsCollapsed = useMemo(() => {
    return variablePlanningItems
      .filter(
        (i) =>
          i.status === "pendente" &&
          i.contabilizaNoTotal !== false &&
          roundMoney2(Number(i.plannedValue ?? 0)) > 0,
      )
      .map((i) => ({
        key: planningRowKey(i),
        label: String(i.displayLabel || i.descricao || "—").trim(),
        value: roundMoney2(Number(i.plannedValue ?? 0)),
      }))
  }, [variablePlanningItems])

  const provisionAgendadoNoMesTotal = useMemo(
    () => sumProvisionAgendadoNoMes(variablePlanningItems, viewYM.y, viewYM.m),
    [variablePlanningItems, viewYM.y, viewYM.m],
  )

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

      <section className="rounded-2xl border border-[#d8c08a]/45 bg-[#f8f2e3]/80 shadow-sm">
        <div className="border-b border-[#d8c08a]/35 bg-[#fbf6ea]/85 px-3 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                Planejamento de Despesas Variáveis
              </h2>
              {variablePlanningAccordionOpen ? (
                <>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">
                    Reserve antes de executar. Valores <span className="font-semibold text-slate-800">planejados</span>{" "}
                    entram no saldo previsto. O valor da provisão usa digitação a partir de{" "}
                    <strong className="text-slate-800">centavos</strong> (como caixa registradora). Depois de guardar o
                    valor, agende uma ou mais datas até cobrir o montante — use{" "}
                    <strong className="text-slate-800">Guardar agendamentos</strong> para gravar; as linhas aparecem como
                    despesas previstas na lista.
                  </p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-slate-600">
                    <span>
                      Provisões pendentes:{" "}
                      <span className="valora-num font-semibold text-amber-900">
                        {formatCurrency(variablePlanningTotals.comprometidoPendente)}
                      </span>
                    </span>
                    <span>
                      Liberado no mês:{" "}
                      <span className="valora-num font-semibold text-slate-800">
                        {formatCurrency(variablePlanningTotals.liberado)}
                      </span>
                    </span>
                  </div>
                </>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setVariablePlanningAccordionOpen((open) => !open)}
              className="valora-gold-button shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              {variablePlanningAccordionOpen ? "Recolher formulário" : "Abrir formulário"}
            </button>
          </div>

          {!variablePlanningAccordionOpen ? (
            <div className="mt-3 px-1 sm:px-0">
              {variablePlanningTotals.comprometidoPendente <= 0 ? (
                <p className="text-xs text-slate-600">
                  Sem provisões pendentes com valor neste mês. Abra o formulário para planear.
                </p>
              ) : (
                (() => {
                  const provTotal = roundMoney2(variablePlanningTotals.comprometidoPendente)
                  const agendado = roundMoney2(provisionAgendadoNoMesTotal)
                  const flexivel = roundMoney2(Math.max(0, provTotal - agendado))
                  const pctAgendado =
                    provTotal > 0 ? Math.min(100, Math.max(0, (agendado / provTotal) * 100)) : 0
                  const pctFlex = Math.max(0, 100 - pctAgendado)
                  return (
                    <div className="rounded-xl border border-[#d8c08a]/30 bg-white/70 px-3 py-2">
                      <div className="flex flex-wrap items-end justify-between gap-2 text-[10px] text-slate-600">
                        <span>
                          Agendado no mês{" "}
                          <strong className="valora-num text-amber-900">{formatCurrency(agendado)}</strong>
                        </span>
                        <span>
                          A calendarizar{" "}
                          <strong className="valora-num text-slate-700">{formatCurrency(flexivel)}</strong>
                        </span>
                      </div>
                      <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full bg-amber-500/90"
                          style={{ width: `${pctAgendado}%` }}
                          title={`Agendado: ${formatCurrency(agendado)} (${pctAgendado.toFixed(0)}% do provisionado)`}
                        />
                        <div
                          className="h-full bg-slate-300/85"
                          style={{ width: `${pctFlex}%` }}
                          title={`A calendarizar: ${formatCurrency(flexivel)}`}
                        />
                      </div>
                    </div>
                  )
                })()
              )}
            </div>
          ) : null}

          {variablePlanningAccordionOpen ? (
            <>
              {variablePlanningTotals.comprometidoPendente > 0 ? (
                <div className="mt-3 rounded-xl border border-[#d8c08a]/35 bg-white/60 px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200/80 pb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      Saldo provisionado (pendente)
                    </span>
                    <span className="valora-num text-sm font-bold text-amber-950">
                      {formatCurrency(variablePlanningTotals.comprometidoPendente)}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] leading-snug text-slate-600">
                    A barra usa o total acima como <strong className="text-slate-800">100%</strong>. Em âmbar: valor já{" "}
                    <strong className="text-slate-800">agendado com data neste mês</strong>. Em cinza: o restante do
                    saldo ainda por calendarizar.
                  </p>
                  {(() => {
                    const provTotal = roundMoney2(variablePlanningTotals.comprometidoPendente)
                    const agendado = roundMoney2(provisionAgendadoNoMesTotal)
                    const flexivel = roundMoney2(Math.max(0, provTotal - agendado))
                    const pctAgendado =
                      provTotal > 0 ? Math.min(100, Math.max(0, (agendado / provTotal) * 100)) : 0
                    const pctFlex = Math.max(0, 100 - pctAgendado)
                    return (
                      <>
                        <div className="mt-2 flex flex-wrap items-end justify-between gap-2 text-[10px] text-slate-600">
                          <span>
                            Agendado no mês{" "}
                            <strong className="valora-num text-amber-900">{formatCurrency(agendado)}</strong>
                          </span>
                          <span>
                            A calendarizar{" "}
                            <strong className="valora-num text-slate-700">{formatCurrency(flexivel)}</strong>
                          </span>
                        </div>
                        <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full bg-amber-500/90"
                            style={{ width: `${pctAgendado}%` }}
                            title={`Agendado: ${formatCurrency(agendado)} (${pctAgendado.toFixed(0)}% do provisionado)`}
                          />
                          <div
                            className="h-full bg-slate-300/85"
                            style={{ width: `${pctFlex}%` }}
                            title={`A calendarizar: ${formatCurrency(flexivel)}`}
                          />
                        </div>
                        {variablePlanningBarsCollapsed.length > 0 ? (
                          <div className="pt-2">
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                              Por categoria
                            </p>
                            <ul className="mt-1 space-y-0.5 text-[10px] text-slate-700">
                              {variablePlanningBarsCollapsed.map((bar) => (
                                <li key={bar.key} className="flex justify-between gap-2">
                                  <span className="min-w-0 truncate">{bar.label}</span>
                                  <span className="valora-num shrink-0 text-slate-800">{formatCurrency(bar.value)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </>
                    )
                  })()}
                </div>
              ) : null}

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <span className="font-semibold text-slate-800">Carteira</span>
                  <select
                    value={selectedWalletId}
                    onChange={(event) => setSelectedWalletId(event.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-amber-300/80"
                  >
                    {wallets.length === 0 ? <option value="">Sem carteiras</option> : null}
                    {wallets.map((wallet) => (
                      <option key={wallet.id} value={String(wallet.id)}>
                        {wallet.nome}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 space-y-2">
                {variablePlanningItems.map((item) => {
                  const isPendente = item.status === "pendente"
                  const isPrecisou = item.status === "precisou"
                  const isNaoPrecisou = item.status === "nao_precisou"
                  const rk = planningRowKey(item)
                  const valorFieldId = `vp-val-${rk.replace(/[^\w-]/g, "_")}`
                  const moneyDisplay =
                    moneyDraftByKey[rk] !== undefined
                      ? moneyDraftByKey[rk]
                      : formatProvisionMoneyDisplay(item.plannedValue)
                  const isFinalDeSemana = item.codigo === "final_de_semana"
                  const { weekendLabelCount } = getWeekendsInMonth(viewYM.y, viewYM.m)
                  const porSexta =
                    item.valorPorSlot != null && Number.isFinite(item.valorPorSlot)
                      ? item.valorPorSlot
                      : valorPorSexta(item.plannedValue, weekendLabelCount)
                  const valorTravado = Boolean(
                    item.id && item.status !== "precisou" && provisionValorDesbloqueado[rk] !== true,
                  )
                  const plannedRounded = roundMoney2(Number(item.plannedValue ?? 0))
                  const agendaRows = item.datasUsoPlanejadas ?? []
                  const agendaSum = roundMoney2(
                    agendaRows.reduce((s, r) => s + roundMoney2(Number(r?.valor ?? 0)), 0),
                  )
                  const agendaRestante = roundMoney2(Math.max(0, plannedRounded - agendaSum))
                  const showAgendarMulti = !isPrecisou && item.id

                  const rkDom = rk.replace(/[^\w-]/g, "_")
                  const cardHighlighted =
                    planningUiHighlight?.rowKey === rk &&
                    (planningUiHighlight.slotSid == null || planningUiHighlight.slotSid === "")

                  return (
                    <div
                      key={rk}
                      id={`vp-focus-${rkDom}`}
                      className={`grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 sm:grid-cols-[minmax(0,1.35fr)_auto] sm:items-start ${
                        cardHighlighted ? "ring-2 ring-amber-400/90 ring-offset-2 ring-offset-[#fbf6ea]" : ""
                      }`}
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex items-start justify-end gap-2 sm:justify-between">
                          <div className="min-w-0 flex-1">
                            {item.isCustom ? (
                              <input
                                type="text"
                                value={item.descricao ?? item.displayLabel ?? ""}
                                disabled={isPrecisou}
                                placeholder="Ex: Presente, Viagem..."
                                autoFocus={!item.id}
                                onChange={(e) =>
                                  setVariablePlanningItems((prev) =>
                                    prev.map((row) =>
                                      planningRowKey(row) === rk
                                        ? { ...row, descricao: e.target.value, displayLabel: e.target.value }
                                        : row,
                                    ),
                                  )
                                }
                                onBlur={(e) => void persistDescricaoCustom(rk, e.target.value)}
                                className="w-full border-b border-slate-300 bg-transparent px-0.5 py-1 text-sm font-semibold text-slate-800 outline-none placeholder:text-sm placeholder:font-normal placeholder:text-slate-400 focus:border-amber-500 disabled:cursor-not-allowed disabled:bg-slate-100/80 disabled:opacity-70"
                                aria-label="Descrição da provisão"
                              />
                            ) : (
                              <p className="text-sm font-medium text-slate-800">{item.displayLabel}</p>
                            )}
                          </div>
                          {!isPrecisou && (item.id || item.isCustom) ? (
                            <button
                              type="button"
                              title="Excluir provisão"
                              aria-label="Excluir provisão"
                              onClick={() => void handleExcluirProvisao(item)}
                              className="shrink-0 rounded-lg border border-rose-200/90 bg-rose-50/95 p-1.5 text-rose-700 transition hover:bg-rose-100"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                                <path
                                  fillRule="evenodd"
                                  d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.78 41.78 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                          ) : null}
                        </div>
                        {isFinalDeSemana ? (
                          <>
                            <p className="text-[10px] leading-snug text-slate-600">
                              Reserva dividida para as próximas sextas-feiras
                              {porSexta != null && weekendLabelCount > 0 ? (
                                <span className="mt-0.5 block text-slate-500">
                                  Referência: {formatCurrency(porSexta)} por sexta ({weekendLabelCount} no mês).
                                </span>
                              ) : null}
                            </p>
                            {Number(item.plannedValue) > 0 && weekendLabelCount > 0 ? (
                              <div className="mt-1.5 rounded-lg border border-amber-100 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900">
                                <p>
                                  Este mês tem <strong>{weekendLabelCount} sextas-feiras</strong> (referência para a reserva).
                                </p>
                                <p className="mt-0.5">
                                  Sugestão por sexta:{" "}
                                  <strong>{formatCurrency(Number(item.plannedValue ?? 0) / weekendLabelCount)}</strong>.
                                </p>
                              </div>
                            ) : null}
                          </>
                        ) : null}
                        <p className="text-[10px] text-slate-600">
                          {isPendente && "Pendente — gravar o valor confirma o planejamento desta reserva."}
                          {isPrecisou && "Lançamento vinculado na lista de despesas."}
                          {isNaoPrecisou && "Liberto — não usar esta reserva neste mês."}
                        </p>
                        {isPrecisou ? (
                          <span className="mt-0.5 inline-flex w-fit rounded-lg border border-amber-200/90 bg-amber-50/90 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
                            Lançado
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-medium text-slate-600">R$</span>
                          <input
                            id={valorFieldId}
                            type="text"
                            inputMode="decimal"
                            readOnly={valorTravado}
                            value={moneyDisplay}
                            onChange={(event) => handleMoneyDraftChange(item, event.target.value)}
                            onBlur={(event) => void handleMoneyDraftBlur(item, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault()
                                event.currentTarget.blur()
                              }
                            }}
                            disabled={isPrecisou}
                            className={`w-24 min-w-0 rounded-lg border bg-white px-2 py-1 text-right text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-400 disabled:cursor-not-allowed disabled:bg-slate-100 ${
                              valorTravado
                                ? "cursor-default border-slate-300 read-only:bg-slate-50"
                                : "border-slate-200"
                            }`}
                            aria-label={`Valor reservado para ${item.displayLabel}`}
                          />
                          {!isPrecisou ? (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={!valorTravado}
                              title={
                                valorTravado
                                  ? "Desbloquear para alterar o valor"
                                  : "Confirmar valor no Supabase e agendar uso"
                              }
                              aria-label={valorTravado ? "Editar valor da provisão" : "Salvar valor da provisão"}
                              onClick={async () => {
                                if (valorTravado) {
                                  setProvisionValorDesbloqueado((p) => ({ ...p, [rk]: true }))
                                  requestAnimationFrame(() => document.getElementById(valorFieldId)?.focus())
                                  return
                                }
                                const draft = moneyDraftByKey[rk]
                                await handleMoneyDraftBlur(
                                  item,
                                  draft ?? document.getElementById(valorFieldId)?.value ?? "",
                                )
                              }}
                              className={`valora-metal-switch min-w-[124px] shrink-0 ${
                                valorTravado ? "valora-metal-switch--planned" : "valora-metal-switch--paid"
                              }`}
                            >
                              <span className={`valora-metal-switch-knob ${valorTravado ? "" : "ml-auto"}`} />
                              <span className="valora-metal-switch-label">{valorTravado ? "Editar" : "Salvar"}</span>
                            </button>
                          ) : null}
                        </div>
                        {!isPrecisou ? (
                          <span className="text-[10px] text-slate-600">
                            {valorTravado ? (
                              <>
                                Valor <strong className="text-slate-800">confirmado</strong> — use{" "}
                                <strong className="text-slate-800">Editar</strong> para alterar. Enter grava ao editar.
                              </>
                            ) : (
                              <>
                                <strong className="text-slate-800">Salvar</strong> confirma o planejamento; depois
                                pode agendar quando vai usar.
                              </>
                            )}
                          </span>
                        ) : null}
                      </div>
                      {showAgendarMulti ? (
                        <div className="col-span-full mt-0.5 rounded-lg border border-[#d8c08a]/45 bg-[#fbf6ea]/90 px-3 py-2 sm:col-span-2">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                              Agendar usos (data e valor)
                            </span>
                            <span className="text-[10px] text-slate-600">
                              Provisionado: <strong className="text-slate-800">{formatCurrency(plannedRounded)}</strong>
                              {" · "}
                              Agendado: <strong className="text-slate-800">{formatCurrency(agendaSum)}</strong>
                              {" · "}
                              Restante: <strong className="text-amber-900">{formatCurrency(agendaRestante)}</strong>
                            </span>
                          </div>
                          <div className="mt-2 space-y-2">
                            {agendaRows.map((row) => {
                              const slotSid = row.sid
                              const slotDom = String(slotSid).replace(/[^\w-]/g, "_")
                              const rowHighlighted =
                                planningUiHighlight?.rowKey === rk &&
                                String(planningUiHighlight.slotSid ?? "") === String(slotSid ?? "")
                              const ck = agendaDraftCellKey(rk, slotSid)
                              const valorDisplay =
                                agendaMoneyDraftByCell[ck] !== undefined
                                  ? agendaMoneyDraftByCell[ck]
                                  : formatProvisionMoneyDisplay(row?.valor ?? 0)
                              return (
                                <div
                                  key={`${rk}-ag-${slotSid}`}
                                  id={`vp-agenda-${rkDom}-${slotDom}`}
                                  className={`flex flex-wrap items-end gap-2 rounded-lg border border-slate-200/80 bg-white/90 px-2 py-1.5 ${
                                    rowHighlighted ? "ring-2 ring-amber-400/90 ring-offset-1" : ""
                                  }`}
                                >
                                  <label className="flex flex-col gap-0.5 text-[10px] text-slate-600">
                                    Data
                                    <input
                                      type="date"
                                      value={row?.data ?? ""}
                                      onChange={(e) => handleAgendaRowDataChange(item, slotSid, e.target.value)}
                                      className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-amber-400"
                                    />
                                  </label>
                                  <label className="flex flex-col gap-0.5 text-[10px] text-slate-600">
                                    Valor (R$)
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={valorDisplay}
                                      onChange={(e) => handleAgendaValorChange(item, slotSid, e.target.value)}
                                      className="w-24 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs text-slate-800 outline-none focus:border-amber-400"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => void handleRemoveAgendaRow(item, slotSid)}
                                    className="mb-0.5 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-800 hover:bg-rose-100"
                                  >
                                    Remover
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={
                                plannedRounded <= 0 ||
                                (agendaRestante <= 0.001 && agendaRows.some((r) => roundMoney2(Number(r?.valor ?? 0)) > 0))
                              }
                              onClick={() => handleAddAgendaRow(item)}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Adicionar linha
                            </button>
                            <button
                              type="button"
                              onClick={() => void persistDatasUsoPlanejadas(item)}
                              className="valora-gold-button rounded-lg px-3 py-1 text-[11px] font-semibold"
                            >
                              Guardar agendamentos
                            </button>
                          </div>
                          <p className="mt-1.5 text-[10px] leading-snug text-slate-600">
                            A soma dos valores não pode exceder o provisionado. Após guardar, as linhas aparecem na lista
                            como despesas previstas no mês.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
                {!metaSugestaoDispensada && sugestaoMetaValor > 0.009 ? (
                  <div className="rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50 to-white px-3 py-3 text-sm text-slate-800 shadow-sm">
                    <p className="leading-relaxed">
                      Deseja mover o saldo de <strong>{formatCurrency(sugestaoMetaValor)}</strong> para a sua meta{" "}
                      <strong className="text-amber-950">{metaSaldoNome}</strong>?
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          window.dispatchEvent(new CustomEvent(GOTO_PAGE_EVENT, { detail: { page: "Metas" } }))
                        }
                        className="valora-gold-button rounded-xl px-4 py-2 text-xs font-semibold"
                      >
                        Abrir Metas
                      </button>
                      <button
                        type="button"
                        onClick={() => setMetaSugestaoDispensada(true)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Agora não
                      </button>
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={handleAdicionarProvisao}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 transition hover:border-amber-400 hover:text-amber-800"
                >
                  <span aria-hidden>+</span>
                  Adicionar provisão
                </button>
              </div>
            </>
          ) : null}
        </div>
      </section>

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
            <div className="valora-metal-card w-full rounded-2xl px-2.5 py-2 md:col-span-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a5b16]">
                Provisões comprometidas (pendentes)
              </p>
              <p className="valora-num mt-1 text-xl font-semibold text-amber-900 md:text-2xl">
                {formatCurrency(variablePlanningTotals.comprometidoPendente)}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Reserva ainda não decidida (Precisou/Não precisou). Liberado no mês:{" "}
                {formatCurrency(variablePlanningTotals.liberado)}
              </p>
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

        <div className="px-2 pb-3 pt-1 sm:px-4">
          <CarryOverBanner
            mesAtual={carryMonthKeysLan.mesAtual}
            mesAnterior={carryMonthKeysLan.mesAnterior}
            refreshSignal={carryRefreshKey}
            onCarryOverSuccess={handleCarryOverSuccessLancamentos}
            onCarryOverError={(msg) => {
              setMessageType("error")
              setMessage(msg)
            }}
          />
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
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      {isLancamentoControleNaLista(transaction) ? (
                        <button
                          type="button"
                          onClick={(e) => void handleTogglePaymentStatus(e, transaction)}
                          className={`valora-metal-switch valora-metal-switch--${signal.tone} max-w-full scale-90`}
                          aria-label={`Alterar pagamento: ${signal.label}`}
                        >
                          <span className={`valora-metal-switch-knob ${signal.isRight ? "ml-auto" : ""}`} />
                          <span className="valora-metal-switch-label">{signal.label}</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-500">Somente leitura</span>
                      )}
                      {isLancamentoControleNaLista(transaction) ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEdit(transaction)}
                            className="rounded-md border border-blue-200/90 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700"
                          >
                            Editar
                          </button>
                          {!transaction.isProjected || transaction.agendaLink ? (
                            <button
                              type="button"
                              onClick={() => void handleRemove(transaction)}
                              className="rounded-md border border-rose-200/90 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700"
                            >
                              Remover
                            </button>
                          ) : null}
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
                          const podeAlternar = isLancamentoControleNaLista(transaction)
                          return (
                            <button
                              type="button"
                              onClick={(e) => void handleTogglePaymentStatus(e, transaction)}
                              disabled={!podeAlternar}
                              className={`valora-metal-switch valora-metal-switch--${signal.tone} ${
                                podeAlternar ? "cursor-pointer" : "cursor-not-allowed opacity-65"
                              }`}
                              aria-label={`Alterar status de pagamento para ${transaction.paymentStatus === "Pago" ? "Pendente" : "Pago"}`}
                              title={
                                podeAlternar
                                  ? "Clique para alternar status"
                                  : "Item previsto da provisão não pode ser alterado aqui"
                              }
                            >
                              <span className={`valora-metal-switch-knob ${signal.isRight ? "ml-auto" : ""}`} />
                              <span className="valora-metal-switch-label">{signal.label}</span>
                            </button>
                          )
                        })()}
                      </td>
                      <td className="hidden px-3 py-2.5 text-slate-700 lg:table-cell">{transaction.category}</td>
                      <td className="hidden px-3 py-2.5 lg:table-cell">
                        {!isLancamentoControleNaLista(transaction) ? (
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
                            {!transaction.isProjected || transaction.agendaLink ? (
                              <button
                                type="button"
                                onClick={() => void handleRemove(transaction)}
                                className="rounded-lg border border-rose-200/90 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition-all hover:border-rose-300 hover:bg-rose-100 active:scale-[0.98]"
                              >
                                Remover
                              </button>
                            ) : null}
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

