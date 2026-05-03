import { getWeekendsInMonth, valorPorSexta } from "./weekendMonthUtils"

export const VARIABLE_PLANNING_UPDATED_EVENT = "variablePlanning:updated"

/** @typedef {'pendente' | 'precisou' | 'nao_precisou'} VariablePlanStatus */

/**
 * Linha vinda do Supabase (gastos_esporadicos).
 * @typedef {{
 *   id: string
 *   client_uid?: string
 *   mes_referencia: string
 *   competencia?: string
 *   codigo: string | null
 *   descricao: string
 *   valor_planejado: number
 *   status: string
 *   lancamento_id?: string | null
 *   carteira_id?: number | null
 *   slots_sexta_no_mes?: number | null
 *   valor_por_slot?: number | null
 *   data_alvo?: string | null
 *   conta_no_total?: boolean
 *   datas_uso_planejadas?: unknown
 * }} GastoEsporadicoRow
 */

/**
 * Item unificado na UI (Lançamentos).
 * @typedef {{
 *   id: string | null
 *   clientUid: string | null
 *   codigo: string | null
 *   descricao: string
 *   displayLabel: string
 *   plannedValue: number
 *   status: VariablePlanStatus
 *   lancamentoId: string | null
 *   slotsSextaNoMes: number | null
 *   valorPorSlot: number | null
 *   isCustom: boolean
 *   contabilizaNoTotal?: boolean
 *   dataAlvo?: string
 *   datasUsoPlanejadas?: Array<{ data: string, valor: number, sid: string }>
 * }} PlanningItem
 */

/**
 * @param {unknown} raw
 * @returns {Array<{ data: string, valor: number, sid: string }>}
 */
export function parseDatasUsoPlanejadas(raw) {
  if (raw == null || raw === "") return []
  let arr = raw
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  return arr
    .map((row, index) => {
      const d = String(row?.data ?? "")
        .trim()
        .slice(0, 10)
      const valor = Math.max(0, Number(row?.valor ?? 0)) || 0
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || valor <= 0) return null
      const sid =
        typeof row?.sid === "string" && row.sid.length > 0
          ? row.sid
          : `ag:${index}:${d}:${valor}`
      return { data: d, valor, sid }
    })
    .filter(Boolean)
}

export const NATIVE_PROVISION_CODES = [
  { codigo: "remedio", defaultDescricao: "Medicamento" },
  { codigo: "lazer", defaultDescricao: "Lazer" },
  { codigo: "cinema", defaultDescricao: "Cinema" },
  { codigo: "botafogo", defaultDescricao: "Estádio" },
  { codigo: "gasolina", defaultDescricao: "Gasolina" },
  { codigo: "viagem", defaultDescricao: "Viagem" },
  { codigo: "final_de_semana", defaultDescricao: "Final de Semana" },
]

export function getYearMonthKeyFromParts(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`
}

/**
 * @param {string} statusRaw
 * @returns {VariablePlanStatus}
 */
function normalizeStatus(statusRaw) {
  const s = String(statusRaw ?? "").toLowerCase()
  if (s === "precisou" || s === "nao_precisou" || s === "pendente") return s
  return "pendente"
}

/**
 * @param {GastoEsporadicoRow | null | undefined} row
 * @param {{ codigo: string, defaultDescricao: string }} def
 * @param {number} year
 * @param {number} monthIndex
 * @returns {PlanningItem}
 */
function nativeItemFromRow(row, def, year, monthIndex) {
  const { weekendLabelCount } = getWeekendsInMonth(year, monthIndex)
  const slots = def.codigo === "final_de_semana" ? weekendLabelCount : null
  const valor = Number(row?.valor_planejado ?? 0) || 0
  const valorPorSlot =
    def.codigo === "final_de_semana" ? valorPorSexta(valor, weekendLabelCount) : row?.valor_por_slot ?? null

  let displayLabel = def.defaultDescricao
  if (def.codigo === "final_de_semana") {
    displayLabel = `Final de Semana (${weekendLabelCount} neste mês)`
  }

  return {
    id: row?.id ?? null,
    clientUid: null,
    codigo: def.codigo,
    descricao: row?.descricao?.trim() ? String(row.descricao) : def.defaultDescricao,
    displayLabel,
    plannedValue: valor,
    status: normalizeStatus(row?.status),
    lancamentoId: row?.lancamento_id ?? null,
    slotsSextaNoMes: slots,
    valorPorSlot: valorPorSlot ?? null,
    isCustom: false,
    contabilizaNoTotal: row?.conta_no_total !== false,
    dataAlvo: row?.data_alvo ? String(row.data_alvo).slice(0, 10) : "",
    datasUsoPlanejadas: parseDatasUsoPlanejadas(row?.datas_uso_planejadas),
  }
}

/**
 * @param {GastoEsporadicoRow} row
 * @returns {PlanningItem}
 */
function customItemFromRow(row) {
  return {
    id: row.id,
    clientUid: null,
    codigo: null,
    descricao: String(row.descricao ?? "").trim() || "Provisão",
    displayLabel: String(row.descricao ?? "").trim() || "Provisão",
    plannedValue: Number(row.valor_planejado ?? 0) || 0,
    status: normalizeStatus(row.status),
    lancamentoId: row.lancamento_id ?? null,
    slotsSextaNoMes: null,
    valorPorSlot: null,
    isCustom: true,
    contabilizaNoTotal: row?.conta_no_total !== false,
    dataAlvo: row?.data_alvo ? String(row.data_alvo).slice(0, 10) : "",
    datasUsoPlanejadas: parseDatasUsoPlanejadas(row?.datas_uso_planejadas),
  }
}

/**
 * @param {GastoEsporadicoRow[]} dbRows
 * @param {number} year
 * @param {number} monthIndex
 * @returns {PlanningItem[]}
 */
export function mergeGastosEsporadicosToPlanningItems(dbRows, year, monthIndex) {
  const byCodigo = new Map()
  for (const r of dbRows ?? []) {
    if (r.codigo) byCodigo.set(String(r.codigo), r)
  }
  const natives = NATIVE_PROVISION_CODES.map((def) => nativeItemFromRow(byCodigo.get(def.codigo), def, year, monthIndex))
  const customs = (dbRows ?? []).filter((r) => !r.codigo).map(customItemFromRow)
  return [...natives, ...customs]
}

/**
 * @param {PlanningItem[]} items
 */
export function sumPendingProvision(items) {
  return items.reduce((sum, item) => {
    if (item.contabilizaNoTotal === false) return sum
    if (item.status !== "pendente") return sum
    const v = Number(item.plannedValue ?? 0)
    if (!Number.isFinite(v) || v <= 0) return sum
    return sum + v
  }, 0)
}

/**
 * @param {PlanningItem} item
 */
export function planningRowKey(item) {
  if (item.id != null && item.id !== "") return `id:${String(item.id)}`
  if (item.clientUid) return `cid:${item.clientUid}`
  if (item.codigo) return `codigo:${item.codigo}`
  return `row:unknown`
}
