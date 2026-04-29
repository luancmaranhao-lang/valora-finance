import { supabase } from "./supabaseClient"
import { listarDividas } from "./dividasService"
import { listarLancamentos } from "./lancamentosService"
import { metasService } from "./metasService"

function parseDateOnly(value) {
  const raw = String(value ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const fallback = new Date(value)
    return Number.isNaN(fallback.getTime()) ? null : fallback
  }
  const [y, m, d] = raw.split("-").map(Number)
  const local = new Date(y, m - 1, d)
  return Number.isNaN(local.getTime()) ? null : local
}

/**
 * Lançamentos do usuário + do grupo (casal) quando sharing de grupo existe.
 * Respeita RLS: só retorna o que as policies permitem.
 */
export async function listarLancamentosConsolidadosCasal() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!user?.id) return { lancamentos: [], coUserIds: [] }

  const { data: memberEntry } = await supabase
    .from("membros_grupo")
    .select("grupo_id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!memberEntry?.grupo_id) {
    const mine = await listarLancamentos()
    return { lancamentos: mine ?? [], coUserIds: [user.id] }
  }

  const { data: membersRows } = await supabase
    .from("membros_grupo")
    .select("user_id")
    .eq("grupo_id", memberEntry.grupo_id)

  const userIds = (membersRows ?? []).map((m) => m.user_id).filter(Boolean)
  if (userIds.length <= 1) {
    const mine = await listarLancamentos()
    return { lancamentos: mine ?? [], coUserIds: [user.id] }
  }

  const { data, error } = await supabase
    .from("lancamentos")
    .select("*")
    .in("user_id", userIds)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) {
    const mine = await listarLancamentos()
    return { lancamentos: mine ?? [], coUserIds: [user.id] }
  }

  return { lancamentos: data ?? [], coUserIds: userIds }
}

/** @param {Array<Record<string, unknown>>} lancamentosDoMes */
function totaisConsolidadosDoMes(lancamentosDoMes) {
  const pending = new Set(["pendente", "agendada", "atrasada"])
  let receitaTotal = 0
  let receitaPaga = 0
  let receitaPendente = 0
  let despesaTotal = 0
  let despesaPaga = 0
  let despesaPendente = 0

  for (const row of lancamentosDoMes) {
    const tipo = (row.tipo ?? "").toString().toLowerCase()
    const st = (row.status ?? "").toString().toLowerCase()
    const v = Number(row.valor ?? 0)
    const isPago = st === "pago"
    const isPendente = pending.has(st) || st === "pendente"

    if (tipo === "receita") {
      receitaTotal += v
      if (isPago) receitaPaga += v
      else if (isPendente) receitaPendente += v
    } else {
      despesaTotal += v
      if (isPago) despesaPaga += v
      else if (isPendente) despesaPendente += v
    }
  }

  const saldoPrevistoFimMes = receitaTotal - despesaPaga - despesaPendente
  const totalMovimentosPendentes = receitaPendente + despesaPendente

  return {
    receita_total_mes: receitaTotal,
    receita_paga_mes: receitaPaga,
    receita_pendente_mes: receitaPendente,
    despesa_total_mes: despesaTotal,
    despesas_pagas_mes: despesaPaga,
    despesas_pendentes_mes: despesaPendente,
    /** A pagar (despesas ainda em aberto no mês) */
    ainda_a_pagar_despesas: despesaPendente,
    /** Receitas − despesas pagas − despesas pendentes (equivalente ao saldo previsto do dashboard) */
    saldo_previsto_fim_mes: saldoPrevistoFimMes,
    /** Soma dos valores com status pendente (receitas + despesas), útil para leitura rápida */
    soma_valores_status_pendente: totalMovimentosPendentes,
  }
}

export async function montarPacoteMentorMensal(/** @type {number} */ year, /** @type {number} */ monthIndex) {
  const { lancamentos, coUserIds } = await listarLancamentosConsolidadosCasal()

  function inMonth(item) {
    const raw = item.data ?? item.date
    if (!raw) return false
    const d = parseDateOnly(raw)
    if (!d) return false
    return d.getFullYear() === year && d.getMonth() === monthIndex
  }

  const noMes = lancamentos.filter(inMonth)
  const totaisMes = totaisConsolidadosDoMes(noMes)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [minhasDividas, metas] = await Promise.all([listarDividas(), metasService.listarMetas()])

  const resumoTotaisTexto = `Mês ${String(monthIndex + 1).padStart(2, "0")}/${year}: receita prevista no mês R$ ${totaisMes.receita_total_mes.toFixed(2)}; despesas já pagas R$ ${totaisMes.despesas_pagas_mes.toFixed(2)}; despesas ainda a pagar (pendentes) R$ ${totaisMes.despesas_pendentes_mes.toFixed(2)}; saldo previsto (receitas − despesas pagas − pendentes) R$ ${totaisMes.saldo_previsto_fim_mes.toFixed(2)}. Dívidas macro abaixo. Use estes números para responder "quanto ainda tenho que pagar" (foco em despesas pendentes) e o fechamento do mês.`

  return {
    userId: user?.id,
    coUserIds,
    mesReferencia: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    totaisMes,
    resumoTotaisParaMentor: resumoTotaisTexto,
    lancamentosMes: noMes.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      tipo: row.tipo,
      categoria: row.categoria,
      valor: row.valor,
      data: row.data,
      status: row.status,
      recorrencia: row.recorrencia,
      descricao: row.descricao,
    })),
    dividasMacro: minhasDividas.map((d) => ({
      credor: d.credor,
      valor_total: d.valor_total,
      valor_restante: d.valor_restante,
      status: d.status,
    })),
    metas: (metas ?? []).map((m) => ({
      nome: m.nome,
      valor_alvo: m.valor_alvo,
      valor_atual: m.valor_atual,
      prazo: m.prazo,
    })),
  }
}
