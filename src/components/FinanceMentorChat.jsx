import { useEffect, useRef, useState } from "react"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
})

function FinanceMentorChat({ monthlySnapshot, analysisScope, mentorContext }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Olá. Pergunte o que quiser sobre o seu mês ou peça um plano para quitar dívidas. Uso os seus lançamentos, metas e dívidas macro consolidados.",
    },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)

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
    const futureContext = JSON.stringify(analysisScope?.futureByMonth ?? [], null, 0)
    return `Você é o Mentor Financeiro premium do app Valora. Seu tom é direto, profissional e focado em soluções.
Mês atual de análise: ${mesAtualNome}.
RESUMO: Receitas: R$ ${receitaTotal.toFixed(2)}, Despesas Totais: R$ ${despesasTotais.toFixed(2)}, Despesas Pagas: R$ ${despesasRealizadas.toFixed(2)}, Despesas Pendentes: R$ ${despesasPendentes.toFixed(2)}, Saldo Previsto: R$ ${saldoPrevisto.toFixed(2)}.
CARTEIRAS: Total disponível em carteiras: R$ ${totalWalletBalance.toFixed(2)}. Lista de carteiras: ${resumoWallets || "Sem carteiras cadastradas."}
MÉTRICAS OPERACIONAIS: despesas pagas no mês R$ ${despesasPagasMes.toFixed(2)}; despesas pendentes no mês R$ ${despesasPendentesMes.toFixed(2)}; receitas do mês R$ ${receitasMes.toFixed(2)}; saldo previsto do mês R$ ${saldoPrevistoMes.toFixed(2)}.
ALERTA DE CONTAS VENCIDAS/PENDENTES: ${resumoVencidas || "Nenhuma conta atrasada."}
TODOS OS LANÇAMENTOS DO MÊS: ${resumoLancamentos || "Sem lançamentos no mês."}
TENDÊNCIA MESES SUBSEQUENTES: ${futureContext}

Sua missão: Analise os lançamentos para identificar onde o usuário está gastando mais, alerte com urgência sobre contas vencidas, sugira cortes se o saldo estiver negativo e ajude a estruturar um planejamento para o mês subsequente.
Quando o usuário perguntar sobre prioridades de pagamento com dinheiro em carteira, use obrigatoriamente o total disponível em carteiras e a lista de carteiras acima para recomendar uma ordem prática, priorizando contas vencidas e próximas do vencimento sem ultrapassar o saldo disponível.
Responda em português, com seções curtas e objetivas, usando markdown simples (títulos curtos, listas e negrito quando fizer sentido).`
  }

  function renderSimpleMarkdown(text) {
    const lines = String(text ?? "").split("\n")
    const blocks = []
    let listItems = []
    let paragraph = []

    function flushList() {
      if (listItems.length === 0) return
      blocks.push({ type: "list", items: listItems })
      listItems = []
    }
    function flushParagraph() {
      if (paragraph.length === 0) return
      blocks.push({ type: "paragraph", text: paragraph.join("\n") })
      paragraph = []
    }

    for (const raw of lines) {
      const line = raw.trimEnd()
      if (!line.trim()) {
        flushList()
        flushParagraph()
        continue
      }
      if (line.startsWith("### ")) {
        flushList()
        flushParagraph()
        blocks.push({ type: "h3", text: line.replace(/^###\s+/, "") })
        continue
      }
      if (line.startsWith("- ")) {
        flushParagraph()
        listItems.push(line.replace(/^-+\s*/, ""))
        continue
      }
      flushList()
      paragraph.push(line)
    }
    flushList()
    flushParagraph()

    function renderInlineBold(value) {
      const parts = String(value).split(/(\*\*[^*]+\*\*)/g)
      return parts.map((part, idx) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) {
          return <strong key={idx}>{part.slice(2, -2)}</strong>
        }
        return <span key={idx}>{part}</span>
      })
    }

    return (
      <div className="space-y-2.5 whitespace-pre-wrap break-words">
        {blocks.map((block, idx) => {
          if (block.type === "h3") {
            return (
              <h3 key={idx} className="text-sm font-semibold text-slate-900">
                {renderInlineBold(block.text)}
              </h3>
            )
          }
          if (block.type === "list") {
            return (
              <ul key={idx} className="list-disc space-y-1 pl-4">
                {block.items.map((item, itemIdx) => (
                  <li key={`${idx}-${itemIdx}`}>{renderInlineBold(item)}</li>
                ))}
              </ul>
            )
          }
          return (
            <p key={idx} className="leading-relaxed">
              {renderInlineBold(block.text)}
            </p>
          )
        })}
      </div>
    )
  }

  async function send() {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const apiKey = import.meta.env.VITE_OPENAI_API_KEY
    if (!apiKey) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          kind: "error",
          text: "Desculpe, tive um problema de conexão. Tente novamente em instantes.",
        },
      ])
      return
    }
    setInput("")

    const userBlock = { role: "user", text: trimmed }
    setMessages((m) => [...m, userBlock])
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
      setMessages((m) => [...m, { role: "assistant", text: textoResposta }])
    } catch (err) {
      console.error("OpenAI chat error:", err)
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          kind: "error",
          text: "Desculpe, tive um problema de conexão. Tente novamente em instantes.",
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Mentor financeiro (chat)</h2>

      <div className="mt-4 h-[340px] space-y-3 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
              msg.role === "user"
                ? "ml-4 border border-slate-200 bg-white text-slate-900"
                : msg.kind === "error"
                  ? "mr-4 border border-rose-200 bg-rose-50 text-rose-700 shadow-sm"
                  : "mr-4 border border-slate-100 bg-white text-slate-800 shadow-sm"
            }`}
          >
            {msg.role === "assistant" && msg.kind !== "error" ? renderSimpleMarkdown(msg.text) : msg.text}
          </div>
        ))}
        {loading ? <p className="text-sm text-slate-500">Pensando...</p> : null}
        <div ref={endRef} />
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), void send())}
          placeholder="Ex: Como posso cortar gastos em lazer este mês?"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-300"
        />
        <button
          type="button"
          disabled={loading}
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
