import { useEffect, useState } from "react"
import CardFormModal from "../components/CardFormModal"
import EmptyState from "../components/EmptyState"
import PageHeader from "../components/PageHeader"
import { criarLancamento } from "../services/lancamentosService"
import { atualizarCartao, criarCartao } from "../services/cartoesService"
import { supabase } from "../services/supabaseClient"

const initialFormData = {
  nome_cartao: "",
  bandeira: "Visa",
  limite_total: "",
  dia_vencimento: "10",
  dia_fechamento: "5",
}
const CARD_INVOICE_OVERRIDE_STORAGE_KEY = "valora_card_invoice_overrides_v1"

function normalizeDateOnly(value) {
  if (!value) return ""
  return String(value).slice(0, 10)
}

function parseDateOnly(value) {
  const raw = normalizeDateOnly(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const [y, m, d] = raw.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function parseMoneyInput(value) {
  const normalized = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
  const num = Number(normalized)
  return Number.isFinite(num) ? num : 0
}

function normalizeMoneyDraft(value) {
  return String(value ?? "")
    .replace(/[^\d,.\s]/g, "")
    .replace(/\s/g, "")
}

function buildCardRecurringKey(item) {
  return [
    String(item.descricao ?? "").trim().toLowerCase(),
    String(item.categoria ?? "").trim().toLowerCase(),
    String(item.forma_pagamento ?? "").trim().toLowerCase(),
    "recorrente_fixa",
  ].join("|")
}

function ymKey(ym) {
  return `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

const CORES_BANCOS = {
  nubank: "#8A05BE",
  itau: "#EC7000",
  inter: "#FF7A00",
  bradesco: "#CC092F",
  santander: "#EC0000",
  "banco do brasil": "#FCF800",
  caixa: "#1A5B96",
  c6: "#212121",
  btg: "#00243D",
  xp: "#FFCB05",
}

const CORES_BANDEIRAS = {
  mastercard: "#EB001B",
  visa: "#1A1F71",
  "american express": "#007BC1",
  elo: "#212121",
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
}

function hexToRgb(hexColor) {
  const hex = String(hexColor ?? "").replace("#", "")
  const normalized = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex
  if (normalized.length !== 6) return { r: 55, g: 65, b: 81 }
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

function resolveCardColor(cardName, brandName) {
  const normalizedName = normalizeText(cardName)
  const normalizedBrand = normalizeText(brandName)

  for (const [key, color] of Object.entries(CORES_BANCOS)) {
    if (normalizedName.includes(key)) return color
  }

  for (const [key, color] of Object.entries(CORES_BANDEIRAS)) {
    if (normalizedBrand.includes(key)) return color
  }

  return "#374151"
}

function resolveAutoBankColor(cardName) {
  const normalizedName = normalizeText(cardName)
  if (!normalizedName) return "#374151"
  if (normalizedName.includes("nubank") || normalizedName.startsWith("nu")) return "#8A05BE"
  if (normalizedName.includes("inter")) return "#FF7A00"
  if (normalizedName.includes("itau")) return "#EC7000"
  return "#374151"
}

function shade(hexColor, factor = 0.2) {
  const { r, g, b } = hexToRgb(hexColor)
  const mix = (channel) => Math.max(0, Math.min(255, Math.round(channel * (1 - factor))))
  return `rgb(${mix(r)} ${mix(g)} ${mix(b)})`
}

function last4FromName(cardName) {
  let hash = 0
  for (const ch of String(cardName ?? "")) {
    hash = (hash * 31 + ch.charCodeAt(0)) % 10000
  }
  return String(hash).padStart(4, "0")
}

function renderBrandMark(brand) {
  const b = normalizeText(brand)
  if (b.includes("visa")) return "VISA"
  if (b.includes("master")) return "MC"
  if (b.includes("elo")) return "ELO"
  if (b.includes("american")) return "AMEX"
  return "CARD"
}

function Cartoes() {
  const [cards, setCards] = useState([])
  const [rawLancamentos, setRawLancamentos] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCardId, setEditingCardId] = useState(null)
  const [selectedCard, setSelectedCard] = useState(null)
  const [invoiceValue, setInvoiceValue] = useState("")
  const [isLaunchingInvoice, setIsLaunchingInvoice] = useState(false)
  const [isSavingInvoiceOverride, setIsSavingInvoiceOverride] = useState(false)
  const [invoiceYM, setInvoiceYM] = useState(() => {
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth() }
  })
  const [invoiceOverrides, setInvoiceOverrides] = useState(() => {
    try {
      const raw = window.localStorage.getItem(CARD_INVOICE_OVERRIDE_STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : {}
      return parsed && typeof parsed === "object" ? parsed : {}
    } catch {
      return {}
    }
  })
  const [message, setMessage] = useState("")
  const [formData, setFormData] = useState(initialFormData)
  const invoiceMonthShortLabel = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" })
    .format(new Date(invoiceYM.y, invoiceYM.m, 1))
    .replace(".", "")

  async function loadCards() {
    try {
      setIsLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.id) {
        setCards([])
        setRawLancamentos([])
        return
      }
      const [{ data: cardsData }, { data: lancamentosData }] = await Promise.all([
        supabase.from("cartoes").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("lancamentos").select("*").eq("user_id", user.id).order("data", { ascending: false }),
      ])
      setCards(cardsData ?? [])
      setRawLancamentos(lancamentosData ?? [])
    } catch {
      setCards([])
      setRawLancamentos([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadCards()
  }, [])

  useEffect(() => {
    function onLancamentosUpdated() {
      void loadCards()
    }
    window.addEventListener("lancamentos:updated", onLancamentosUpdated)
    return () => window.removeEventListener("lancamentos:updated", onLancamentosUpdated)
  }, [])

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  function closeModal() {
    setModalOpen(false)
    setEditingCardId(null)
    setFormData(initialFormData)
  }

  function handleEdit(card) {
    setEditingCardId(card.id)
    setFormData({
      nome_cartao: card.nome_cartao ?? "",
      bandeira: card.bandeira ?? "Visa",
      limite_total: String(card.limite_total ?? ""),
      dia_vencimento: String(card.dia_vencimento ?? "10"),
      dia_fechamento: String(card.dia_fechamento ?? "5"),
    })
    setModalOpen(true)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!formData.nome_cartao || !formData.limite_total) return

    try {
      setIsSaving(true)
      setMessage("")
      const payload = {
        ...formData,
        cor_card: resolveAutoBankColor(formData.nome_cartao),
      }
      const saved = editingCardId ? await atualizarCartao(editingCardId, payload) : await criarCartao(payload)
      setCards((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)])
      closeModal()
      void loadCards()
      setMessage(editingCardId ? "Cartão atualizado com sucesso." : "Cartão cadastrado com sucesso.")
    } catch (error) {
      setMessage(error?.message || "Não foi possível salvar o cartão. Confira vencimento/fechamento e tente novamente.")
    } finally {
      setIsSaving(false)
    }
  }

  function openCardDetails(card) {
    setSelectedCard(card)
    const stats = resolveCardInvoiceStats(card, invoiceYM)
    setInvoiceValue(String(stats.pending || ""))
  }

  function closeCardDetails() {
    setSelectedCard(null)
    setInvoiceValue("")
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(CARD_INVOICE_OVERRIDE_STORAGE_KEY, JSON.stringify(invoiceOverrides))
    } catch {
      // Ignora falha de storage para não quebrar o fluxo.
    }
  }, [invoiceOverrides])

  useEffect(() => {
    if (!selectedCard) return
    const stats = resolveCardInvoiceStats(selectedCard, invoiceYM)
    setInvoiceValue(String(stats.pending || ""))
  }, [selectedCard, invoiceYM, rawLancamentos])

  function shiftInvoiceMonth(delta) {
    setInvoiceYM((prev) => {
      let month = prev.m + delta
      let year = prev.y
      while (month < 0) {
        month += 12
        year -= 1
      }
      while (month > 11) {
        month -= 12
        year += 1
      }
      return { y: year, m: month }
    })
  }

  function resolveCardInvoiceStats(card, ym) {
    const cardId = String(card.id)
    const inMonth = rawLancamentos.filter((item) => {
      if (String(item.cartao_id ?? "") !== cardId) return false
      const dt = parseDateOnly(item.data)
      if (!dt) return false
      return dt.getFullYear() === ym.y && dt.getMonth() === ym.m
    })

    const recurringTemplates = rawLancamentos
      .filter((item) => String(item.cartao_id ?? "") === cardId)
      .filter((item) => String(item.tipo ?? "").toLowerCase() === "despesa")
      .filter((item) => String(item.recorrencia ?? "").toLowerCase() === "recorrente_fixa")
      .sort((a, b) => new Date(b.data ?? 0) - new Date(a.data ?? 0))

    const existingRecurringKeys = new Set(
      inMonth
        .filter((item) => String(item.recorrencia ?? "").toLowerCase() === "recorrente_fixa")
        .map((item) => buildCardRecurringKey(item)),
    )

    const latestTemplateByKey = new Map()
    recurringTemplates.forEach((item) => {
      const key = buildCardRecurringKey(item)
      if (!latestTemplateByKey.has(key)) latestTemplateByKey.set(key, item)
    })

    const projected = []
    latestTemplateByKey.forEach((tpl, key) => {
      if (existingRecurringKeys.has(key)) return
      projected.push(tpl)
    })

    const totalReal = inMonth
      .filter((item) => String(item.tipo ?? "").toLowerCase() === "despesa")
      .reduce((sum, item) => sum + Math.abs(Number(item.valor ?? 0)), 0)
    const totalProjected = projected.reduce((sum, item) => sum + Math.abs(Number(item.valor ?? 0)), 0)
    const total = totalReal + totalProjected
    const paid = inMonth
      .filter((item) => String(item.tipo ?? "").toLowerCase() === "despesa")
      .filter((item) => String(item.status ?? "").toLowerCase() === "pago")
      .reduce((sum, item) => sum + Math.abs(Number(item.valor ?? 0)), 0)
    const pendingAuto = Math.max(0, total - paid)
    const override = Number(invoiceOverrides[`${cardId}:${ymKey(ym)}`])
    const pending = Number.isFinite(override) ? Math.max(0, override) : pendingAuto
    return { total, paid, pending, pendingAuto, hasOverride: Number.isFinite(override) }
  }

  function handleSaveInvoiceOverride() {
    if (!selectedCard) return
    const parsed = Math.max(0, parseMoneyInput(invoiceValue))
    const key = `${selectedCard.id}:${ymKey(invoiceYM)}`
    setIsSavingInvoiceOverride(true)
    setInvoiceOverrides((prev) => ({ ...prev, [key]: parsed }))
    setMessage("Saldo para pagamento ajustado para este cartão e mês.")
    setIsSavingInvoiceOverride(false)
  }

  function handleClearInvoiceOverride() {
    if (!selectedCard) return
    const key = `${selectedCard.id}:${ymKey(invoiceYM)}`
    setInvoiceOverrides((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    const stats = resolveCardInvoiceStats(selectedCard, invoiceYM)
    setInvoiceValue(String(stats.pendingAuto || ""))
    setMessage("Ajuste manual removido. Voltou ao cálculo automático.")
  }

  async function handleLaunchInvoice() {
    if (!selectedCard) return
    const numericInvoice = parseMoneyInput(invoiceValue)
    if (!numericInvoice) return

    try {
      setIsLaunchingInvoice(true)
      setMessage("")
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.id) throw new Error("Sessão inválida.")

      const day = Number(selectedCard.dia_vencimento ?? 1)
      const baseDay = Number.isFinite(day) ? Math.min(Math.max(1, day), 28) : 1
      const invoiceDateIso = `${invoiceYM.y}-${String(invoiceYM.m + 1).padStart(2, "0")}-${String(baseDay).padStart(2, "0")}`

      await criarLancamento({
        user_id: user.id,
        tipo: "despesa",
        descricao: `Fatura ${selectedCard.nome_cartao ?? "Cartão"}`,
        categoria: "Cartão de Crédito",
        valor: numericInvoice,
        data: invoiceDateIso,
        forma_pagamento: "Cartão de Crédito",
        recorrencia: "unica",
        dia_vencimento: null,
        status: "pendente",
        visibilidade: "privado",
        metodo_divisao: null,
        cartao_id: selectedCard.id,
      })

      setMessage("Valor da fatura lançado em Despesas com sucesso.")
      closeCardDetails()
      window.dispatchEvent(new Event("lancamentos:updated"))
    } catch (error) {
      setMessage(error?.message || "Não foi possível lançar a fatura em Despesas.")
    } finally {
      setIsLaunchingInvoice(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cartoes"
        subtitle="Controle de limites, faturas e alertas de uso em um unico painel."
      />
      {message ? <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">{message}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {isLoading ? (
          <EmptyState title="Carregando cartões" description="Buscando cartões cadastrados..." />
        ) : cards.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800"
            >
              Adicionar meu primeiro cartao
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-slate-800"
              >
                Adicionar cartão
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => {
                const cardName = card.nome_cartao ?? "Cartão"
                const totalLimit = Number(card.limite_total ?? 0)
                const stats = resolveCardInvoiceStats(card, invoiceYM)
                const usedLimit = Math.max(0, stats.pending)
                const availableLimit = Math.max(0, totalLimit - usedLimit)
                const usedPct = totalLimit > 0 ? Math.min(100, (usedLimit / totalLimit) * 100) : 0
                const color = String(card.cor_card ?? "").trim() || resolveCardColor(cardName, card.bandeira)
                const colorDark = shade(color, 0.22)
                const fakeLast4 = last4FromName(cardName)

                return (
                  <article
                    key={card.id}
                    className="group relative cursor-pointer overflow-hidden rounded-3xl p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-12px_rgba(0,0,0,0.55)]"
                    style={{
                      background: `linear-gradient(135deg, ${color} 0%, ${colorDark} 100%)`,
                    }}
                    onClick={() => openCardDetails(card)}
                  >
                    <div className="absolute left-3 top-[2.9rem] h-8 w-11 rounded-md border border-amber-200/50 bg-gradient-to-br from-amber-200 to-amber-400/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.55)]" />
                    <div
                      className="pointer-events-none absolute -right-10 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-80"
                      style={{ backgroundColor: color }}
                    />

                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">{cardName}</p>
                        <p className="text-[10px] text-white/80">Crédito</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/90">
                          {invoiceMonthShortLabel}
                        </span>
                        <div className="rounded-lg bg-white/20 px-2 py-0.5 text-xs font-black tracking-wide text-white">
                          {renderBrandMark(card.bandeira)}
                        </div>
                      </div>
                    </div>

                    <p className="mb-3 pl-14 font-mono text-sm tracking-[0.18em] text-white">**** **** **** {fakeLast4}</p>

                    <div className="space-y-1.5">
                      <div className="flex items-end justify-between gap-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-white/80">Limite disponível</p>
                          <p className="valora-num text-lg font-bold text-white">{formatCurrency(availableLimit)}</p>
                        </div>
                        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">
                          Val. {String(card.dia_vencimento ?? "-").padStart(2, "0")}/31
                        </span>
                      </div>

                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/25">
                        <div className="h-full rounded-full bg-white/80 transition-all" style={{ width: `${usedPct}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-white/85">
                        <span>Total: {formatCurrency(totalLimit)}</span>
                        <span>Fech.: dia {card.dia_fechamento ?? "-"}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-white/90">
                        <span>Saldo para Pagamento</span>
                        <span className="valora-num font-semibold">{formatCurrency(usedLimit)}</span>
                      </div>
                      <p className="text-[10px] text-white/75">Clique no cartão para cadastrar a fatura.</p>

                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleEdit(card)
                          }}
                          aria-label={`Editar ${cardName}`}
                          className="inline-flex items-center rounded-md border border-white/35 bg-white/20 p-1.5 text-white transition hover:bg-white/30"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                            <path d="M15.232 5.232a2.5 2.5 0 1 0-3.536-3.536L4.5 8.893V13.5h4.607l7.125-7.125Z" />
                            <path d="M3.5 15.5h13v1.5h-13z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        )}
      </section>

      <CardFormModal
        open={modalOpen}
        formData={formData}
        onChange={handleChange}
        onClose={closeModal}
        onSubmit={handleSubmit}
        isSaving={isSaving}
        isEditing={Boolean(editingCardId)}
      />

      {selectedCard ? (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[1px]" onClick={closeCardDetails} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <section className="w-full max-w-md rounded-2xl border border-[#d8c08a]/50 bg-[#faf4e6] p-5 shadow-2xl">
              <h3 className="text-lg font-semibold text-[#3b2c0d]">Detalhes do cartão</h3>
              <p className="mt-1 text-sm text-[#6a5318]">{selectedCard.nome_cartao ?? "Cartão"}</p>

              <div className="mt-3 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => shiftInvoiceMonth(-1)}
                  className="valora-gold-menu rounded-full px-3 py-1 text-sm font-semibold"
                >
                  {"<"}
                </button>
                <span className="min-w-[10rem] text-center text-sm font-semibold capitalize text-[#5e4715]">
                  {new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
                    new Date(invoiceYM.y, invoiceYM.m, 1),
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => shiftInvoiceMonth(1)}
                  className="valora-gold-menu rounded-full px-3 py-1 text-sm font-semibold"
                >
                  {">"}
                </button>
              </div>

              <div className="mt-4 space-y-2 rounded-xl border border-[#d8c08a]/45 bg-white/70 p-3 text-sm text-slate-700">
                {(() => {
                  const stats = resolveCardInvoiceStats(selectedCard, invoiceYM)
                  return (
                    <>
                      <p>
                        Fatura do mês: <strong>{formatCurrency(stats.total)}</strong>
                      </p>
                      <p>
                        Pago no mês: <strong className="text-emerald-700">{formatCurrency(stats.paid)}</strong>
                      </p>
                      <p>
                        Saldo para Pagamento: <strong className="text-amber-800">{formatCurrency(stats.pending)}</strong>
                      </p>
                      {stats.hasOverride ? (
                        <p className="text-[11px] font-medium text-indigo-700">Ajuste manual ativo para este mês.</p>
                      ) : null}
                    </>
                  )
                })()}
                <p>
                  Limite total: <strong>{formatCurrency(Number(selectedCard.limite_total ?? 0))}</strong>
                </p>
              </div>

              <div className="mt-4 space-y-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Lançar valor total da fatura fechada</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={invoiceValue}
                    onChange={(event) => setInvoiceValue(normalizeMoneyDraft(event.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </label>
              </div>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={closeCardDetails}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-100"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={handleSaveInvoiceOverride}
                  disabled={isSavingInvoiceOverride}
                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-800 transition-all hover:bg-indigo-100 disabled:cursor-not-allowed"
                >
                  {isSavingInvoiceOverride ? "Salvando..." : "Salvar saldo do mês"}
                </button>
                <button
                  type="button"
                  onClick={handleClearInvoiceOverride}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-100"
                >
                  Limpar ajuste
                </button>
                <button
                  type="button"
                  onClick={() => void handleLaunchInvoice()}
                  disabled={isLaunchingInvoice}
                  className="valora-gold-button rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed sm:col-span-2"
                >
                  {isLaunchingInvoice ? "Lançando..." : "Integrar nas Despesas"}
                </button>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  )
}

export default Cartoes
