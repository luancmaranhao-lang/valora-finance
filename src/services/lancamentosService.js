import { supabase } from "./supabaseClient"
import { normalizeOptionalUuid } from "./gastosEsporadicosService"

function normalizeDateOnly(value) {
  if (!value) return value

  if (typeof value === "string") {
    const trimmed = value.trim()
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/)
    if (match?.[1]) return match[1]
    return trimmed
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-")
  }

  return value
}

function normalizeLancamentoPayload(lancamento = {}) {
  const payload = { ...lancamento }

  if ("recorrencia" in payload && payload.recorrencia == null) {
    payload.recorrencia = "unica"
  }

  if ("dia_vencimento" in payload) {
    payload.dia_vencimento =
      payload.dia_vencimento === null || payload.dia_vencimento === undefined || payload.dia_vencimento === ""
        ? null
        : Number(payload.dia_vencimento)
  }

  if ("data" in payload) {
    payload.data = normalizeDateOnly(payload.data)
  }

  if ("numero_parcelas" in payload) {
    payload.numero_parcelas =
      payload.numero_parcelas === null || payload.numero_parcelas === undefined || payload.numero_parcelas === ""
        ? 1
        : Number(payload.numero_parcelas)
  }

  if ("cartao_id" in payload) {
    payload.cartao_id =
      payload.cartao_id === null || payload.cartao_id === undefined || payload.cartao_id === "" ? null : payload.cartao_id
  }

  if ("carteira_id" in payload) {
    payload.carteira_id = normalizeOptionalUuid(payload.carteira_id)
  }

  return payload
}

function incrementDateByMonths(baseDate, monthsToAdd) {
  const [year, month, day] = String(baseDate)
    .slice(0, 10)
    .split("-")
    .map(Number)

  const date = new Date(year, (month ?? 1) - 1 + monthsToAdd, day ?? 1)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function splitInstallments(totalValue, count) {
  const valueInCents = Math.round(Number(totalValue) * 100)
  const baseInCents = Math.floor(valueInCents / count)
  const remainder = valueInCents - baseInCents * count

  return Array.from({ length: count }, (_, idx) => {
    const cents = baseInCents + (idx < remainder ? 1 : 0)
    return cents / 100
  })
}

function extractDebtCredorFromDescription(description) {
  const raw = String(description ?? "").trim()
  const prefixes = ["Parcela planejada da dívida — ", "Pagamento dívida macro — "]
  for (const prefix of prefixes) {
    if (raw.startsWith(prefix)) {
      return raw.slice(prefix.length).trim()
    }
  }
  return ""
}

async function applyDebtReductionFromPaidLancamento(previousRow, nextPayload) {
  const previousStatus = String(previousRow?.status ?? "").toLowerCase()
  const nextStatus = String(nextPayload?.status ?? "").toLowerCase()
  if (previousStatus === "pago" || nextStatus !== "pago") return

  const tipo = String(nextPayload?.tipo ?? previousRow?.tipo ?? "").toLowerCase()
  if (tipo !== "despesa") return

  const description = nextPayload?.descricao ?? previousRow?.descricao
  const credor = extractDebtCredorFromDescription(description)
  if (!credor) return

  const userId = previousRow?.user_id
  if (!userId) return

  const valorLancamento = Number(nextPayload?.valor ?? previousRow?.valor ?? 0)
  if (!Number.isFinite(valorLancamento) || valorLancamento <= 0) return

  const { data: debtRow, error: debtError } = await supabase
    .from("dividas_macro")
    .select("id, valor_restante, valor_total, status")
    .eq("user_id", userId)
    .eq("credor", credor)
    .order("created_at", { ascending: false })
    .maybeSingle()

  if (debtError || !debtRow) return

  const restanteAtual = Number(debtRow.valor_restante ?? 0)
  if (restanteAtual <= 0) return

  const abatido = Math.min(restanteAtual, valorLancamento)
  const novoRestante = Math.max(0, restanteAtual - abatido)
  const novoStatus = novoRestante <= 0 ? "Quitada" : debtRow.status

  await supabase
    .from("dividas_macro")
    .update({
      valor_restante: novoRestante,
      status: novoStatus,
    })
    .eq("id", debtRow.id)
    .eq("user_id", userId)
}

export async function listarLancamentos() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    throw authError
  }

  let query = supabase.from("lancamentos").select("*")

  if (user?.id) {
    query = query.eq("user_id", user.id)
  }

  const { data, error } = await query.order("data", { ascending: false }).order("created_at", { ascending: false })

  if (error) {
    throw error
  }

  return data
}

export async function criarLancamento(lancamento) {
  const payload = normalizeLancamentoPayload(lancamento)

  const tipo = (payload.tipo ?? "").toString().toLowerCase()
  const parcelas = Number(payload.numero_parcelas ?? 1)
  const isInstallmentExpense = tipo === "despesa" && Number.isInteger(parcelas) && parcelas > 1

  if (isInstallmentExpense) {
    const installmentValues = splitInstallments(payload.valor ?? 0, parcelas)
    const baseDescription = payload.descricao ?? "Despesa parcelada"
    const baseDate = normalizeDateOnly(payload.data)
    const firstStatus = payload.status ?? "pendente"
    const basePayload = { ...payload }
    delete basePayload.numero_parcelas

    const parcelRows = installmentValues.map((installmentValue, idx) => ({
      ...basePayload,
      descricao: `${baseDescription} (${idx + 1}/${parcelas})`,
      valor: installmentValue,
      data: incrementDateByMonths(baseDate, idx),
      status: idx === 0 ? firstStatus : "pendente",
    }))

    const { data, error } = await supabase.from("lancamentos").insert(parcelRows).select("*")
    if (error) {
      throw error
    }

    return data
  }

  delete payload.numero_parcelas
  const { data, error } = await supabase.from("lancamentos").insert(payload).select("*").single()

  if (error) {
    throw error
  }

  return data
}

export async function importarLancamentosAutomaticos(lancamentos) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    throw authError
  }
  if (!user?.id) {
    throw new Error("Usuario nao autenticado.")
  }

  const normalized = (lancamentos ?? []).map((item) => ({
    ...item,
    user_id: user.id,
    fonte: "automatico",
    status_conciliacao: "pendente_revisao",
    visibilidade: "privado",
  }))

  if (normalized.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from("lancamentos")
    .upsert(normalized, { onConflict: "user_id,external_id", ignoreDuplicates: false })
    .select("*")

  if (error) {
    throw error
  }

  return data
}

export async function revisarLancamentoConciliacao(id, { visibilidade, aprovado = true }) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    throw authError
  }

  let query = supabase
    .from("lancamentos")
    .update({
      visibilidade: visibilidade ?? "privado",
      status_conciliacao: aprovado ? "aprovado" : "pendente_revisao",
    })
    .eq("id", id)

  if (user?.id) {
    query = query.eq("user_id", user.id)
  }

  const { data, error } = await query.select("*").single()

  if (error) {
    throw error
  }

  return data
}

export async function atualizarLancamento(id, lancamento) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    throw authError
  }

  const payload = normalizeLancamentoPayload(lancamento)
  let existingQuery = supabase.from("lancamentos").select("*").eq("id", id)
  if (user?.id) {
    existingQuery = existingQuery.eq("user_id", user.id)
  }
  const { data: existingRow, error: existingError } = await existingQuery.single()
  if (existingError) {
    throw existingError
  }

  let query = supabase.from("lancamentos").update(payload).eq("id", id)

  if (user?.id) {
    query = query.eq("user_id", user.id)
  }

  const { data, error } = await query.select("*").single()

  if (error) {
    throw error
  }

  await applyDebtReductionFromPaidLancamento(existingRow, payload)

  return data
}

export async function removerLancamento(id) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    throw authError
  }

  let query = supabase.from("lancamentos").delete().eq("id", id)

  if (user?.id) {
    query = query.eq("user_id", user.id)
  }

  const { error } = await query

  if (error) {
    throw error
  }

  return true
}

