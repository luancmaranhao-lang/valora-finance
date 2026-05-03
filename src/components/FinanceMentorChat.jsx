import { useCallback, useEffect, useRef, useState } from "react"
import OpenAI from "openai"
import ReactMarkdown from "react-markdown"
import { appendMentorExchange, countMentorConsultasUsuarioHoje, limparMensagensMentor } from "../services/mentorMensagensService"
import { createCheckoutSession } from "../services/stripeService"
import { supabase } from "../services/supabaseClient"

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
})

const MIN_LAUNCHES_FOR_MENTOR = 5
const FREE_MENTOR_CONSULTAS_POR_DIA = 2
const PREMIUM_PRICE_LABEL = "R$ 24,90"

const DEFAULT_WELCOME = {
  role: "assistant",
  text: "Olá. Pergunte o que quiser sobre o seu mês ou peça um plano para quitar dívidas. Uso lançamentos, carteiras, provisões variáveis (gastos_esporadicos), metas e o saldo real disponível após reservas.",
}

function buildChatStorageKey(userId, year, month) {
  if (!userId) return null
  return `valora_ai_chat_${userId}_${year}_${month}`
}

function normalizeStoredMessages(raw) {
  if (!Array.isArray(raw)) return null
  const out = []
  for (const m of raw) {
    if (!m || typeof m !== "object") continue
    const role = m.role === "user" || m.role === "assistant" ? m.role : null
    if (!role) continue
    const text =
      typeof m.text === "string" ? m.text : typeof m.content === "string" ? m.content : ""
    if (!String(text).trim()) continue
    const row = { role, text }
    if (m.kind === "error") row.kind = "error"
    out.push(row)
  }
  return out.length > 0 ? out : null
}

function writeChatToStorage(key, messages) {
  if (!key || typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify(messages))
  } catch {
    /* quota / private mode */
  }
}

function TrashIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.78 41.78 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function FinanceMentorChat({
  monthlySnapshot,
  analysisScope,
  mentorContext,
  userId = null,
  authReady = true,
  chatYear,
  chatMonth,
  monthLaunchCount = 0,
  variablePlanningReady = false,
  isPremium = false,
  isSubscriptionLoading = false,
  competencia = null,
}) {
  const storageKey =
    userId && typeof chatYear === "number" && typeof chatMonth === "number"
      ? buildChatStorageKey(userId, chatYear, chatMonth)
      : null

  const [messages, setMessages] = useState(null)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [consultasHoje, setConsultasHoje] = useState(0)
  const [clearingHistory, setClearingHistory] = useState(false)
  const [mentorNotice, setMentorNotice] = useState("")
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const endRef = useRef(null)

  const monthLabel = mentorContext?.monthName || "este mês"
  /** Aviso informativo (não bloqueia o chat): quanto mais dados, mais fiável o contexto enviado ao modelo. */
  const mostrarAvisoDadosIncompletos =
    monthLaunchCount < MIN_LAUNCHES_FOR_MENTOR || !variablePlanningReady
  const limiteFreemiumAtingido =
    !isSubscriptionLoading && !isPremium && consultasHoje >= FREE_MENTOR_CONSULTAS_POR_DIA
  const chatInputBloqueado = limiteFreemiumAtingido || isSubscriptionLoading

  const refreshConsultasHoje = useCallback(async () => {
    if (!userId || isPremium) {
      setConsultasHoje(0)
      return
    }
    const n = await countMentorConsultasUsuarioHoje(userId)
    setConsultasHoje(n)
  }, [userId, isPremium])

  useEffect(() => {
    void refreshConsultasHoje()
  }, [refreshConsultasHoje])

  useEffect(() => {
    if (!authReady) return
    if (!storageKey) {
      setMessages([DEFAULT_WELCOME])
      return
    }
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        const normalized = normalizeStoredMessages(parsed)
        if (normalized) {
          setMessages(normalized)
          return
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    setMessages([DEFAULT_WELCOME])
  }, [authReady, storageKey])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  function buildSystemPrompt() {
    const receitaTotal = Number(monthlySnapshot?.receitas ?? 0)
    const despesasTotais = Number(monthlySnapshot?.despesasTotais ?? 0)
    const despesasRealizadas = Number(monthlySnapshot?.despesasPagas ?? 0)
    const despesasPendentes = Number(monthlySnapshot?.despesasPend ?? 0)
    const saldoPrevisto = Number(monthlySnapshot?.saldoPrevisto ?? 0)
    const mesAtualNome = mentorContext?.monthName || "Mês atual"
    const contasVencidas = mentorContext?.overduePending ?? []
    const todosLancamentos = mentorContext?.allMonthTransactions ?? []
    const resumoVencidas = contasVencidas
      .map((c) => `${c.descricao}: R$ ${Number(c.valor ?? 0).toFixed(2)} (Venc: ${c.dataVencimento})`)
      .join(" | ")
    const resumoLancamentos = todosLancamentos
      .map((l) => `${l.descricao}: R$ ${Number(l.valor ?? 0).toFixed(2)} [${l.tipo}/${l.status}]`)
      .join(" | ")
    const wallets = mentorContext?.wallets ?? []
    const totalWalletBalance = Number(mentorContext?.totalWalletBalance ?? 0)
    const resumoWallets = wallets
      .map((w) => `${w.nome}: R$ ${Number(w.saldo ?? 0).toFixed(2)}`)
      .join(" | ")
    const despesasPagasMes = Number(mentorContext?.expensesPaidMonth ?? 0)
    const despesasPendentesMes = Number(mentorContext?.expensesPendingMonth ?? 0)
    const receitasMes = Number(mentorContext?.receitasMes ?? receitaTotal)
    const saldoPrevistoMes = Number(mentorContext?.saldoPrevistoMes ?? saldoPrevisto)
    const totalVariaveisPendentes = Number(mentorContext?.totalVariaveisPendentes ?? 0)
    const saldoRealDisponivel = Number(mentorContext?.saldoRealDisponivel ?? NaN)
    const saldoRealFormula = mentorContext?.saldoRealDisponivelFormula ?? ""
    const provisoesResumo = mentorContext?.provisoesResumo ?? "Sem dados de provisões."
    const metasResumo = mentorContext?.metasResumo ?? "Sem metas cadastradas."
    const beneficioVsMercadoResumo =
      mentorContext?.beneficioVsMercadoResumo ??
      "Sem resumo automático; use a lista de lançamentos e as regras de benefício abaixo."
    const ws = mentorContext?.weekendStats
    const weekendLine =
      ws && typeof ws.fridays === "number"
        ? `Sextas no mês: ${ws.fridays}; sábados: ${ws.saturdays}; contagem usada para divisão de reservas (sexta): ${ws.weekendLabelCount}.`
        : ""
    const futureContext = JSON.stringify(analysisScope?.futureByMonth ?? [], null, 0)
    const saldoRealNum = Number.isFinite(saldoRealDisponivel) ? saldoRealDisponivel.toFixed(2) : saldoPrevistoMes.toFixed(2)
    return `Você é o Mentor Financeiro integrado ao app Valora. Tom direto, profissional e focado em soluções. Você cruza dados reais e previstos das fontes: tabela lançamentos (receitas/despesas do mês), tabela gastos_esporadicos (planejamento variável; use valor_planejado agregado nas provisões abaixo), tabela metas (objetivos de longo prazo).

Mês atual de análise: ${mesAtualNome}.
${weekendLine}

## Dados numéricos (use estes valores; não invente)
RESUMO LANÇAMENTOS (mês): Receitas R$ ${receitaTotal.toFixed(2)} · Despesas totais R$ ${despesasTotais.toFixed(2)} · Despesas pagas R$ ${despesasRealizadas.toFixed(2)} · Despesas pendentes R$ ${despesasPendentes.toFixed(2)} · Saldo previsto do fluxo do mês (receitas − pagas − pendentes) R$ ${saldoPrevisto.toFixed(2)}.

CARTEIRAS: Total R$ ${totalWalletBalance.toFixed(2)}. Detalhe: ${resumoWallets || "Sem carteiras cadastradas."}

SALDO REAL DISPONÍVEL (pós-reservas): R$ ${saldoRealNum}. Fórmula aplicada no app: ${saldoRealFormula || "Carteiras − despesas pendentes do mês (lançamentos) − total de provisões variáveis ainda pendentes (gastos_esporadicos, status pendente, conta no total)."}
Interpretação: é o que sobra em carteiras depois de descontar compromissos já lançados como pendentes e as reservas de variáveis ainda não consumidas. Quando falar em "quanto posso gastar" ou "caixa livre", priorize este valor em relação ao saldo previsto de fluxo.

PROVISÕES VARIÁVEIS (gastos_esporadicos — pendentes no total): soma pendente R$ ${Number.isFinite(totalVariaveisPendentes) ? totalVariaveisPendentes.toFixed(2) : "0.00"}. Detalhe: ${provisoesResumo}

METAS (tabela metas): ${metasResumo}

MÉTRICAS OPERACIONAIS: despesas pagas no mês R$ ${despesasPagasMes.toFixed(2)}; despesas pendentes no mês R$ ${despesasPendentesMes.toFixed(2)}; receitas do mês R$ ${receitasMes.toFixed(2)}; saldo previsto do mês R$ ${saldoPrevistoMes.toFixed(2)}.

ALERTA DE CONTAS VENCIDAS/PENDENTES: ${resumoVencidas || "Nenhuma conta atrasada."}
TODOS OS LANÇAMENTOS DO MÊS: ${resumoLancamentos || "Sem lançamentos no mês."}
TENDÊNCIA MESES SUBSEQUENTES: ${futureContext}

DETECÇÃO HEURÍSTICA BENEFÍCIO × MERCADO/ALIMENTAÇÃO (use como pista; confirme na lista acima): ${beneficioVsMercadoResumo}

## Prioridade absoluta (obrigatória)
Toda recomendação sobre gastos, prioridade de pagamento, margem ou "quanto pode usar" deve **ancorar explicitamente** no **Saldo Real Disponível** (carteiras menos despesas pendentes do mês nos lançamentos menos provisões variáveis pendentes). Não contradiga esse número nem sugira valores superiores ao caixa livre assim calculado. O saldo previsto de fluxo do mês é complementar, nunca substituto para decisões de caixa imediato.

## Regras de inteligência (obrigatórias)
1. Sempre que orientar gasto extra, citação explícita do **Saldo real disponível (pós-reservas)** com o valor R$ ${saldoRealNum} no bloco "Situação atual" (e relacione com provisões quando relevante).
2. Para **Lazer** e **Final de semana**: use a divisão por sextas do mês conforme indicado nas provisões (função getWeekendsInMonth no app — mesma lógica que gerou as referências "por sexta" acima).
3. **Receitas**: se houver receita relevante no mês e metas com gap (falta até o objetivo), sugira primeiro **aporte em metas** antes de ampliar gastos discricionários.
4. **Benefício de alimentação × Mercado/Alimentação (caixa vs benefício):** sempre que existir despesa em categoria **Mercado** ou **Alimentação** cujo valor seja **aproximadamente o mesmo** (ex.: ±15%) de uma receita de **Vale Alimentação**, **Ticket Alimentação**, **VR/VA** ou descrição equivalente no mês, trate o par como **compensado pelo benefício**: **não** peça para pagar essa despesa com **Saldo Real** nem com dinheiro das carteiras comuns — explique que o custo tende a sair do benefício. Se o benefício estiver **previsto ou já recebido (pago)** no mês, considere o par **anulado para efeito de pressão sobre o caixa** (não impacta a recomendação de “o que pagar agora” com dinheiro comum).
5. **Bloco "O que pagar agora":** **exclua** ou **marque como já coberta por benefício** as despesas Mercado/Alimentação que estiverem pareadas com receita de vale/ticket conforme a regra 4; liste primeiro o que **efetivamente** deve sair de **conta bancária, dinheiro, PIX, débito, boleto ou fatura de cartão** (caixa real).
6. **Bloco "Prioridade de pagamento":** priorize **boletos, faturas de cartão, financiamentos, aluguel, condomínio, energia, água, internet** e outras obrigações que **saem de conta corrente / dinheiro / cartão**; **depois** despesas variáveis discricionárias. **Não** trate compras de mercado cobertas por vale como prioridade de liquidação com saldo comum.
7. Prioridades com dinheiro em carteira: use o total em carteiras, o saldo real disponível e a lista de contas pendentes/vencidas **após** aplicar a lógica de benefício acima; não recomende gastos acima do caixa disponível após reservas.

Sua missão: Analise os lançamentos para identificar onde o usuário está gastando mais, alerte com urgência sobre contas vencidas, sugira cortes se o saldo estiver negativo e ajude a estruturar um planejamento para o mês subsequente.
Responda em português usando Markdown limpo e legível. Regras obrigatórias de formatação:
- Use títulos com "##".
- Use listas numeradas quando recomendar sequência de ações.
- Evite parágrafos longos; prefira blocos curtos.
- Estruture a resposta SEMPRE nestes blocos:
  1. Situação atual
  2. Prioridade de pagamento
  3. O que pagar agora
  4. O que esperar
  5. Alerta final`
  }

  async function clearConversation() {
    setMentorNotice("")
    if (storageKey && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(storageKey)
      } catch {
        /* ignore */
      }
    }
    if (userId) {
      setClearingHistory(true)
      try {
        await limparMensagensMentor(userId)
      } catch (err) {
        console.error("[FinanceMentorChat] limpar Supabase:", err)
        setMentorNotice("Não foi possível limpar o histórico no servidor. A conversa local foi reiniciada.")
      } finally {
        setClearingHistory(false)
      }
      void refreshConsultasHoje()
    }
    setMessages([DEFAULT_WELCOME])
  }

  async function handleAssinarPremium() {
    setMentorNotice("")
    try {
      setUpgradeLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.id) {
        setMentorNotice("Faça login novamente para assinar.")
        return
      }
      const { url } = await createCheckoutSession({ userId: user.id, email: user.email ?? "" })
      if (url) window.location.href = url
    } catch (err) {
      console.error("[FinanceMentorChat] checkout:", err)
      setMentorNotice("Não foi possível abrir o checkout. Tente de novo em instantes.")
    } finally {
      setUpgradeLoading(false)
    }
  }

  async function send() {
    const trimmed = input.trim()
    if (!trimmed || loading || messages == null || chatInputBloqueado) return

    const apiKey = import.meta.env.VITE_OPENAI_API_KEY
    if (!apiKey) {
      setMessages((m) => {
        const next = [
          ...m,
          {
            role: "assistant",
            kind: "error",
            text: "Desculpe, tive um problema de conexão. Tente novamente em instantes.",
          },
        ]
        writeChatToStorage(storageKey, next)
        return next
      })
      return
    }
    setInput("")

    const userBlock = { role: "user", text: trimmed }
    setMessages((m) => {
      const next = [...m, userBlock]
      writeChatToStorage(storageKey, next)
      return next
    })
    setLoading(true)

    try {
      const systemPrompt = buildSystemPrompt()
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: trimmed },
        ],
      })
      const textoResposta = response?.choices?.[0]?.message?.content || "Sem resposta do modelo."
      setMessages((m) => {
        const next = [...m, { role: "assistant", text: textoResposta }]
        writeChatToStorage(storageKey, next)
        return next
      })
      if (userId && !isPremium) {
        await appendMentorExchange(userId, competencia, trimmed, textoResposta)
        void refreshConsultasHoje()
      }
    } catch (err) {
      console.error("OpenAI chat error:", err)
      setMessages((m) => {
        const next = [
          ...m,
          {
            role: "assistant",
            kind: "error",
            text: "Desculpe, tive um problema de conexão. Tente novamente em instantes.",
          },
        ]
        writeChatToStorage(storageKey, next)
        return next
      })
    } finally {
      setLoading(false)
    }
  }

  if (!authReady || messages == null) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Mentor financeiro (chat)</h2>
        <p className="mt-4 text-sm text-slate-500">Carregando conversa...</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Mentor financeiro (chat)</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Limpar histórico (Supabase + este dispositivo)"
            aria-label="Limpar histórico do mentor"
            disabled={clearingHistory || !userId}
            onClick={() => void clearConversation()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/90 bg-white text-slate-500 shadow-sm transition hover:border-amber-300/80 hover:bg-amber-50/90 hover:text-amber-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isSubscriptionLoading ? (
        <p className="mt-2 text-xs text-slate-500">A verificar plano…</p>
      ) : null}

      {mostrarAvisoDadosIncompletos ? (
        <div className="mt-3 rounded-xl border border-sky-200/90 bg-sky-50/90 px-3 py-3 text-sm leading-relaxed text-sky-950">
          <p className="font-semibold">Dica para respostas mais confiáveis</p>
          <p className="mt-1.5 text-xs sm:text-sm">
            O mentor usa os seus lançamentos do mês, carteiras e provisões em <strong className="font-semibold">{monthLabel}</strong>.
            Quanto mais completo estiver o mês (recomendamos pelo menos <strong>{MIN_LAUNCHES_FOR_MENTOR}</strong> lançamentos) e o
            planejamento de variáveis em <strong>Lançamentos</strong>, mais fiáveis ficam os números — sobretudo o{" "}
            <strong>Saldo Real</strong>.
          </p>
          <p className="mt-2 text-[11px] text-sky-900/90">
            Agora: <strong>{monthLaunchCount}</strong> lançamento(s) no mês · Provisões{" "}
            <strong>{competencia ?? "—"}</strong>: {variablePlanningReady ? "registadas" : "ainda sem registo"}
          </p>
        </div>
      ) : null}

      {limiteFreemiumAtingido ? (
        <div className="mt-3 rounded-xl border border-violet-200/90 bg-violet-50/95 px-3 py-3 text-sm text-violet-950">
          <p className="font-semibold">Limite gratuito atingido</p>
          <p className="mt-1.5 text-xs sm:text-sm">
            Já usou <strong>{FREE_MENTOR_CONSULTAS_POR_DIA}</strong> consultas gratuitas hoje. Assine o plano Premium para continuar sem limite diário.
          </p>
          <button
            type="button"
            disabled={upgradeLoading}
            onClick={() => void handleAssinarPremium()}
            className="valora-gold-button mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60 sm:w-auto"
          >
            {upgradeLoading ? "A abrir…" : `Assinar Plano Premium (${PREMIUM_PRICE_LABEL})`}
          </button>
        </div>
      ) : null}

      {mentorNotice ? (
        <p className="mt-2 text-xs text-rose-600" role="status">
          {mentorNotice}
        </p>
      ) : null}

      <div className="mt-4 space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:p-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`w-full rounded-xl px-4 py-4 text-sm leading-relaxed ${
              msg.role === "user"
                ? "border border-slate-200 bg-white text-slate-900 sm:ml-auto sm:max-w-[88%]"
                : msg.kind === "error"
                  ? "border border-rose-200 bg-rose-50 text-rose-700 shadow-sm sm:mr-auto sm:max-w-[88%]"
                  : "border border-slate-100 bg-white text-slate-800 shadow-sm sm:mr-auto sm:max-w-[88%]"
            }`}
          >
            {msg.role === "assistant" && msg.kind !== "error" ? (
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="mb-3 text-xl font-bold text-slate-900">{children}</h1>,
                  h2: ({ children }) => <h2 className="mb-2 mt-4 text-lg font-bold text-slate-900">{children}</h2>,
                  h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-bold text-slate-900">{children}</h3>,
                  p: ({ children }) => <p className="mb-3 leading-relaxed text-slate-700">{children}</p>,
                  strong: ({ children }) => <strong className="font-bold text-slate-900">{children}</strong>,
                  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
                  li: ({ children }) => <li className="leading-relaxed text-slate-700">{children}</li>,
                }}
              >
                {msg.content || msg.text || ""}
              </ReactMarkdown>
            ) : (
              msg.text
            )}
          </div>
        ))}
        {loading ? <p className="text-sm text-slate-500">Pensando...</p> : null}
        <div ref={endRef} />
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && !e.shiftKey && !chatInputBloqueado && (e.preventDefault(), void send())
          }
          placeholder={
            chatInputBloqueado
              ? isSubscriptionLoading
                ? "A carregar…"
                : "Limite diário atingido"
              : "Ex: Como posso cortar gastos em lazer este mês?"
          }
          disabled={chatInputBloqueado || loading}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        />
        <button
          type="button"
          disabled={loading || chatInputBloqueado}
          onClick={() => void send()}
          className="valora-gold-button shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? "Carregando..." : "Enviar"}
        </button>
      </div>
    </section>
  )
}

export default FinanceMentorChat
