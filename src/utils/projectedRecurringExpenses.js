import { removeLancamentoMetaTags } from "./lancamentoDisplay"

function normalizeUiDate(value) {
  const raw = String(value ?? "")
  if (!raw) return ""
  return raw.slice(0, 10)
}

function parseUiDate(value) {
  const raw = String(value ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const [y, m, d] = raw.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? null : date
}

export function isPastCalendarMonth(year, monthIndex, ref = new Date()) {
  if (year < ref.getFullYear()) return true
  if (year > ref.getFullYear()) return false
  return monthIndex < ref.getMonth()
}

export function isDateInMonth(isoDate, year, monthIndex) {
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

/**
 * Gera linhas sintéticas de despesas recorrentes fixas para um mês futuro ou atual
 * em que ainda não existe lançamento real (mesma regra da lista em Lançamentos).
 *
 * @param {object[]} allRaw retorno bruto de listarLancamentos()
 * @param {number} year
 * @param {number} monthIndex 0–11
 * @param {Date} [now]
 * @returns {object[]}
 */
export function buildProjectedRawRows(allRaw, year, monthIndex, now = new Date()) {
  if (isPastCalendarMonth(year, monthIndex, now)) return []

  const recurring = (allRaw ?? []).filter(isDespesaRecorrenteFixa)
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
  for (const item of allRaw ?? []) {
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
      _projectedTemplateId: template.id,
      id: safeId,
      data: dataIso,
      status: "pendente",
      recorrencia: "recorrente_fixa",
      _projected: true,
    })
  })

  return projected
}

/**
 * Todas as linhas projetadas do ano (para relatório anual).
 * @param {object[]} allRaw
 * @param {number} year
 * @param {Date} [now]
 */
export function buildProjectedRawRowsForYear(allRaw, year, now = new Date()) {
  const out = []
  for (let m = 0; m < 12; m += 1) {
    out.push(...buildProjectedRawRows(allRaw, year, m, now))
  }
  return out
}
