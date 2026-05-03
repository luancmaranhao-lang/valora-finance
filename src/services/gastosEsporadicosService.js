import { supabase } from "./supabaseClient"
import { getWeekendsInMonth, valorPorSexta } from "../utils/weekendMonthUtils"

/**
 * @param {unknown} value
 * @returns {string | null} YYYY-MM-DD ou null
 */
function normalizeDataAlvoColumn(value) {
  if (value == null || value === "") return null
  const s = String(value).trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

/**
 * @param {unknown} value
 * @returns {Array<{ data: string, valor: number }>}
 */
function normalizeDatasUsoPlanejadasColumn(value) {
  if (value == null || value === "") return []
  let arr = value
  if (typeof value === "string") {
    try {
      arr = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  return arr
    .map((row) => ({
      data: normalizeDataAlvoColumn(row?.data),
      valor: Math.max(0, Number(row?.valor ?? 0)) || 0,
    }))
    .filter((row) => row.data && row.valor > 0)
    .slice(0, 24)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Só envia UUID válido para o PostgREST. IDs numéricos do localStorage (1, 2…) não são UUID —
 * omitir evita `invalid input syntax for type uuid: "1"` quando a coluna na BD é uuid.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeOptionalUuid(value) {
  if (value == null || value === "") return null
  const s = String(value).trim()
  return UUID_RE.test(s) ? s : null
}

/**
 * @param {string} contexto
 * @param {Error & { details?: string; hint?: string; code?: string; status?: number }} | null | undefined} error
 */
export function logSupabaseError(contexto, error) {
  if (!error) return
  const e = error
  console.error(`[Valora][gastos_esporadicos] ${contexto}`)
  console.error("  message:", e.message ?? String(error))
  console.error("  details:", e.details ?? "(n/a)")
  console.error("  hint:", e.hint ?? "(n/a)")
  console.error("  code:", e.code ?? "(n/a)")
  if (e.status != null) console.error("  status:", e.status)
}

/**
 * @param {string} competencia YYYY-MM (nome lógico na app; na BD é mes_referencia)
 * @param {string} [userId] opcional; se omitido, usa o utilizador da sessão Supabase
 */
export async function listarGastosEsporadicosPorCompetencia(competencia, userId) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    logSupabaseError("auth.getUser (listar provisões)", authError)
    throw authError
  }
  const uid = userId ?? user?.id
  if (!uid) return []

  const { data, error, status } = await supabase
    .from("gastos_esporadicos")
    .select("*")
    .eq("client_uid", uid)
    .eq("mes_referencia", competencia)
    .order("created_at", { ascending: true })

  if (error) {
    logSupabaseError(`select gastos_esporadicos mes=${competencia} http=${status ?? "?"}`, error)
    throw error
  }

  const rows = data ?? []
  if (import.meta.env.DEV) {
    console.log(`[Valora][gastos_esporadicos] Sucesso! ${rows.length} linhas para ${competencia}`)
  }

  // Alias só no frontend: competencia === mes_referencia (YYYY-MM)
  return rows.map((r) => ({
    ...r,
    competencia: r.mes_referencia ?? competencia,
  }))
}

/**
 * @param {object & { competencia?: string; mes_referencia?: string }} row
 * @param {string} [userId] opcional; se omitido, usa o utilizador da sessão
 */
export async function inserirGastoEsporadico(row, userId) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    logSupabaseError("auth.getUser (inserir provisão)", authError)
    throw authError
  }
  const uid = userId ?? user?.id
  if (!uid) throw new Error("Sessão inválida.")

  const mesRef = row.competencia || row.mes_referencia
  if (!mesRef) throw new Error("competencia obrigatoria.")

  const dataAlvo = normalizeDataAlvoColumn(row.dataAlvo ?? row.data_alvo)
  const contaNoTotal = row.contabilizaNoTotal !== false && row.conta_no_total !== false
  const datasUso = normalizeDatasUsoPlanejadasColumn(row.datasUsoPlanejadas ?? row.datas_uso_planejadas)

  const payload = {
    client_uid: uid,
    mes_referencia: mesRef,
    codigo: row.codigo ?? null,
    descricao: String(row.descricao ?? "").trim() || "Provisão",
    valor_planejado: Number(row.valor_planejado ?? 0) || 0,
    status: row.status ?? "pendente",
    lancamento_id: normalizeOptionalUuid(row.lancamento_id ?? row.lancamentoId),
    carteira_id: normalizeOptionalUuid(row.carteira_id),
    slots_sexta_no_mes: row.slots_sexta_no_mes ?? null,
    valor_por_slot: row.valor_por_slot ?? null,
    data_alvo: dataAlvo,
    conta_no_total: contaNoTotal,
  }
  // Só envia quando há dados: evita falha de insert em bases antigas sem a coluna `datas_uso_planejadas`.
  if (datasUso.length > 0) {
    payload.datas_uso_planejadas = datasUso
  }

  const { data, error, status } = await supabase.from("gastos_esporadicos").insert(payload).select("*").single()
  if (error) {
    logSupabaseError(`insert gastos_esporadicos http=${status ?? "?"}`, error)
    throw error
  }
  const inserted = data
  return inserted
    ? {
        ...inserted,
        competencia: inserted.mes_referencia ?? mesRef,
      }
    : inserted
}

/**
 * @param {string} id
 * @param {object} patch
 * @param {string} [userId] opcional; se omitido, usa o utilizador da sessão
 */
export async function atualizarGastoEsporadico(id, patch, userId) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    logSupabaseError("auth.getUser (atualizar provisão)", authError)
    throw authError
  }
  const uid = userId ?? user?.id
  if (!uid) throw new Error("Sessão inválida.")

  const dadosParaAtualizar = { ...patch }
  if (dadosParaAtualizar.competencia) {
    dadosParaAtualizar.mes_referencia = dadosParaAtualizar.competencia
    delete dadosParaAtualizar.competencia
  }
  if (dadosParaAtualizar.dataAlvo !== undefined) {
    dadosParaAtualizar.data_alvo = normalizeDataAlvoColumn(dadosParaAtualizar.dataAlvo)
    delete dadosParaAtualizar.dataAlvo
  }
  if (dadosParaAtualizar.contabilizaNoTotal !== undefined) {
    dadosParaAtualizar.conta_no_total = Boolean(dadosParaAtualizar.contabilizaNoTotal)
    delete dadosParaAtualizar.contabilizaNoTotal
  }
  if (dadosParaAtualizar.datasUsoPlanejadas !== undefined) {
    dadosParaAtualizar.datas_uso_planejadas = normalizeDatasUsoPlanejadasColumn(dadosParaAtualizar.datasUsoPlanejadas)
    delete dadosParaAtualizar.datasUsoPlanejadas
  }
  delete dadosParaAtualizar.user_id
  delete dadosParaAtualizar.id

  if ("lancamento_id" in dadosParaAtualizar) {
    dadosParaAtualizar.lancamento_id = normalizeOptionalUuid(dadosParaAtualizar.lancamento_id)
  }
  if ("carteira_id" in dadosParaAtualizar) {
    dadosParaAtualizar.carteira_id = normalizeOptionalUuid(dadosParaAtualizar.carteira_id)
  }

  const allowed = [
    "descricao",
    "valor_planejado",
    "status",
    "lancamento_id",
    "carteira_id",
    "slots_sexta_no_mes",
    "valor_por_slot",
    "mes_referencia",
    "data_alvo",
    "conta_no_total",
    "datas_uso_planejadas",
  ]
  const update = {}
  for (const k of allowed) {
    if (k in dadosParaAtualizar) update[k] = dadosParaAtualizar[k]
  }

  const { data, error, status } = await supabase
    .from("gastos_esporadicos")
    .update(update)
    .eq("id", id)
    .eq("client_uid", uid)
    .select("*")
    .single()

  if (error) {
    logSupabaseError(`update gastos_esporadicos id=${id} http=${status ?? "?"}`, error)
    throw error
  }
  const row = data
  return row
    ? {
        ...row,
        competencia: row.mes_referencia,
      }
    : row
}

/**
 * Remove uma linha de `gastos_esporadicos` pertencente ao utilizador autenticado.
 * @param {string} id
 * @param {string} [userId] opcional; se omitido, usa o utilizador da sessão
 */
export async function excluirGastoEsporadico(id, userId) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    logSupabaseError("auth.getUser (excluir provisão)", authError)
    throw authError
  }
  const uid = userId ?? user?.id
  if (!uid) throw new Error("Sessão inválida.")
  if (id == null || String(id).trim() === "") throw new Error("ID inválido.")

  const { error, status } = await supabase
    .from("gastos_esporadicos")
    .delete()
    .eq("id", id)
    .eq("client_uid", uid)

  if (error) {
    logSupabaseError(`delete gastos_esporadicos id=${id} http=${status ?? "?"}`, error)
    throw error
  }
}

/**
 * Soma valor_planejado das linhas ainda pendentes (comprometido no saldo).
 * @param {import("../utils/variablePlanningStore").GastoEsporadicoRow[]} rows
 */
export function somaPendentePlanejado(rows) {
  return rows.reduce((sum, r) => {
    if (r.conta_no_total === false) return sum
    const st = String(r.status ?? "").toLowerCase()
    if (st !== "pendente") return sum
    const v = Number(r.valor_planejado ?? 0)
    if (!Number.isFinite(v) || v <= 0) return sum
    return sum + v
  }, 0)
}

function descricaoComTagRolagem(desc) {
  const d = String(desc ?? "").trim()
  if (!d) return "[Rolagem]"
  if (d.includes("[Rolagem]")) return d
  return `${d} [Rolagem]`
}

function parseMesReferenciaParts(mesRef) {
  const parts = String(mesRef ?? "").split("-")
  const y = Number(parts[0])
  const m = Number(parts[1])
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null
  return { year: y, monthIndex: m - 1 }
}

/**
 * Rolagem de sobras: provisões pendentes do mês anterior passam para o mês atual.
 * O registo antigo fica `nao_precisou` para não voltar a ser contado.
 *
 * @param {string} mesAnterior YYYY-MM
 * @param {string} mesAtual YYYY-MM
 * @param {string} [userId]
 * @returns {Promise<{ rolled: number, totalValor: number }>}
 */
export async function aplicarCarryOver(mesAnterior, mesAtual, userId) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    logSupabaseError("auth.getUser (carry-over)", authError)
    throw authError
  }
  const uid = userId ?? user?.id
  if (!uid) throw new Error("Sessão inválida.")

  const { data: prevRows, error: selErr } = await supabase
    .from("gastos_esporadicos")
    .select("*")
    .eq("client_uid", uid)
    .eq("mes_referencia", mesAnterior)
    .eq("status", "pendente")

  if (selErr) {
    logSupabaseError(`select carry-over mes=${mesAnterior}`, selErr)
    throw selErr
  }

  const pending = (prevRows ?? []).filter(
    (r) => Number(r.valor_planejado ?? 0) > 0 && r.conta_no_total !== false,
  )
  if (pending.length === 0) return { rolled: 0, totalValor: 0 }

  const targetRows = await listarGastosEsporadicosPorCompetencia(mesAtual, uid)
  const byCodigo = new Map()
  for (const r of targetRows) {
    if (r.codigo) byCodigo.set(String(r.codigo), r)
  }

  const partsAtual = parseMesReferenciaParts(mesAtual)
  if (!partsAtual) throw new Error("mesAtual inválido.")
  const { year: yAt, monthIndex: mAt } = partsAtual
  const { weekendLabelCount } = getWeekendsInMonth(yAt, mAt)

  let rolled = 0
  let totalValor = 0

  for (const prev of pending) {
    const v = Number(prev.valor_planejado ?? 0)
    if (!Number.isFinite(v) || v <= 0) continue
    totalValor += v

    const codigoKey = prev.codigo != null && String(prev.codigo).trim() !== "" ? String(prev.codigo) : null

    try {
      if (codigoKey && byCodigo.has(codigoKey)) {
        const ex = byCodigo.get(codigoKey)
        const newV = Math.max(0, Number(ex.valor_planejado ?? 0)) + v
        const patch = { valor_planejado: newV }
        if (codigoKey === "final_de_semana") {
          patch.slots_sexta_no_mes = weekendLabelCount
          patch.valor_por_slot = valorPorSexta(newV, weekendLabelCount)
        }
        await atualizarGastoEsporadico(ex.id, patch, uid)
      } else {
        const insert = {
          competencia: mesAtual,
          codigo: prev.codigo ?? null,
          descricao: descricaoComTagRolagem(prev.descricao),
          valor_planejado: v,
          status: "pendente",
          lancamento_id: null,
          carteira_id: prev.carteira_id ?? null,
          dataAlvo: null,
          contabilizaNoTotal: true,
        }
        if (codigoKey === "final_de_semana") {
          insert.slots_sexta_no_mes = weekendLabelCount
          insert.valor_por_slot = valorPorSexta(v, weekendLabelCount)
        }
        const created = await inserirGastoEsporadico(insert, uid)
        if (codigoKey && created?.id) {
          byCodigo.set(codigoKey, { ...created, codigo: prev.codigo, valor_planejado: v })
        }
      }

      await atualizarGastoEsporadico(prev.id, { status: "nao_precisou" }, uid)
      rolled += 1
    } catch (err) {
      logSupabaseError(`carry-over id=${prev.id}`, err)
      throw err
    }
  }

  return { rolled, totalValor }
}
