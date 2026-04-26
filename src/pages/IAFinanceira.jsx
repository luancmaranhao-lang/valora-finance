import { useEffect, useMemo, useState } from "react"
import EmptyState from "../components/EmptyState"
import PageHeader from "../components/PageHeader"
import StatusBadge from "../components/StatusBadge"
import { listarContas } from "../services/contasService"
import { listarLancamentos } from "../services/lancamentosService"

const GEMINI_SYSTEM_PROMPT =
  "Você é o mentor do Valora Finance. Analise os gastos de uma família no Rio de Janeiro. Seja direto, aponte o maior vilão do mês (ex: excesso de iFood ou Uber) e dê uma dica prática baseada no custo de vida local. Responda em formato JSON com os campos: saude_financeira (0-100), alerta_critico (string), sugestao_acao (string)."

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function IAFinanceira() {
  const [transactions, setTransactions] = useState([])
  const [accounts, setAccounts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [aiResponse, setAiResponse] = useState(null)

  const simplifiedMonthlyData = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    const pendingStatuses = new Set(["pendente", "agendada", "atrasada"])

    function isCurrentMonth(dateValue) {
      if (!dateValue) return false
      const date = new Date(dateValue)
      if (Number.isNaN(date.getTime())) return false
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear
    }

    const monthlyTransactions = transactions
      .filter((item) => isCurrentMonth(item.data ?? item.date))
      .map((item) => ({
        categoria: item.categoria ?? item.category ?? "Outros",
        valor: Number(item.valor ?? item.value ?? 0),
        tipo: (item.tipo ?? item.type ?? "").toString().toLowerCase(),
        pago: true,
      }))

    const monthlyAccounts = accounts
      .filter((item) => isCurrentMonth(item.vencimento ?? item.dueDate))
      .map((item) => {
        const status = (item.status ?? "").toString().toLowerCase()
        return {
          categoria: item.categoria ?? item.category ?? "Conta fixa",
          valor: Number(item.valor ?? item.value ?? 0),
          tipo: "conta_pagar",
          pago: !pendingStatuses.has(status),
        }
      })

    return [...monthlyTransactions, ...monthlyAccounts]
  }, [transactions, accounts])

  const summary = useMemo(() => {
    const receitas = simplifiedMonthlyData
      .filter((item) => item.tipo === "receita")
      .reduce((sum, item) => sum + item.valor, 0)
    const despesas = simplifiedMonthlyData
      .filter((item) => item.tipo === "despesa")
      .reduce((sum, item) => sum + item.valor, 0)
    const contasPendentes = simplifiedMonthlyData
      .filter((item) => item.tipo === "conta_pagar" && !item.pago)
      .reduce((sum, item) => sum + item.valor, 0)
    const saldoPrevisto = receitas - despesas - contasPendentes

    return { receitas, despesas, contasPendentes, saldoPrevisto }
  }, [simplifiedMonthlyData])

  useEffect(() => {
    const timer = setTimeout(() => {
      async function loadData() {
        try {
          setIsLoading(true)
          setErrorMessage("")
          const [transactionsData, accountsData] = await Promise.all([listarLancamentos(), listarContas()])
          setTransactions(transactionsData ?? [])
          setAccounts(accountsData ?? [])
        } catch {
          setErrorMessage("Nao foi possivel carregar os dados financeiros para analise.")
        } finally {
          setIsLoading(false)
        }
      }

      void loadData()
    }, 0)

    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    async function processWithGemini() {
      if (isLoading || simplifiedMonthlyData.length === 0) return

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        setErrorMessage("VITE_GEMINI_API_KEY nao configurada para processar analise de IA.")
        return
      }

      try {
        setIsAiLoading(true)
        const payload = {
          dados_mensais: simplifiedMonthlyData,
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: `${GEMINI_SYSTEM_PROMPT}\n\nDados:\n${JSON.stringify(payload)}` }],
                },
              ],
              generationConfig: {
                responseMimeType: "application/json",
              },
            }),
          },
        )

        if (!response.ok) {
          throw new Error("Falha ao consultar o Gemini.")
        }

        const result = await response.json()
        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) {
          throw new Error("Resposta da IA veio vazia.")
        }

        const parsed = JSON.parse(text)
        setAiResponse(parsed)
      } catch (error) {
        setErrorMessage(error?.message || "Nao foi possivel processar a analise com IA.")
      } finally {
        setIsAiLoading(false)
      }
    }

    void processWithGemini()
  }, [isLoading, simplifiedMonthlyData])

  const healthTone =
    (aiResponse?.saude_financeira ?? 0) >= 75
      ? "success"
      : (aiResponse?.saude_financeira ?? 0) >= 55
        ? "info"
        : (aiResponse?.saude_financeira ?? 0) >= 35
          ? "warning"
          : "danger"

  return (
    <div className="space-y-6">
      <PageHeader
        title="IA Financeira"
        subtitle="Analise viva do mes com base em lancamentos e contas a pagar reais."
      />

      {isLoading ? (
        <EmptyState title="Carregando base financeira" description="Buscando lancamentos e contas do mes atual..." />
      ) : null}

      {isAiLoading ? (
        <EmptyState title="IA processando analise" description="Gerando diagnostico financeiro com Gemini..." />
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
          {errorMessage}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Saude financeira (IA)</p>
          <div className="mt-2">
            <StatusBadge label={`${aiResponse?.saude_financeira ?? 0}/100`} tone={healthTone} />
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Receitas do mes</p>
          <p className="mt-2 text-lg font-semibold text-emerald-700">{formatCurrency(summary.receitas)}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Despesas + contas pendentes</p>
          <p className="mt-2 text-lg font-semibold text-rose-700">
            {formatCurrency(summary.despesas + summary.contasPendentes)}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Saldo previsto</p>
          <p className={`mt-2 text-lg font-semibold ${summary.saldoPrevisto >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {formatCurrency(summary.saldoPrevisto)}
          </p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Alerta critico</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            {aiResponse?.alerta_critico ?? "Aguardando processamento da IA para gerar alerta."}
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Sugestao de acao</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            {aiResponse?.sugestao_acao ?? "Aguardando processamento da IA para sugerir proxima acao."}
          </p>
        </article>
      </section>
    </div>
  )
}

export default IAFinanceira

