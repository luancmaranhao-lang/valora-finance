import { useMemo } from "react"

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

const monthNames = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
]

function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function AnnualSummaryModal({ open, onClose, year, transactions = [] }) {
  const rows = useMemo(() => {
    const pendingStatuses = new Set(["pendente", "agendada", "atrasada"])
    const result = Array.from({ length: 12 }, (_, month) => ({
      month,
      label: monthNames[month],
      receitas: 0,
      despesas: 0,
      pendentes: 0,
    }))

    for (const item of transactions) {
      const date = parseDate(item.data ?? item.date)
      if (!date || date.getFullYear() !== year) continue
      const m = date.getMonth()
      const tipo = (item.tipo ?? item.type ?? "").toString().toLowerCase()
      const valor = Number(item.valor ?? item.value ?? 0)
      const status = (item.status ?? "").toString().toLowerCase()

      if (tipo === "receita") result[m].receitas += valor
      if (tipo === "despesa") result[m].despesas += valor
      if (pendingStatuses.has(status)) result[m].pendentes += valor
    }

    return result
  }, [transactions, year])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="annual-summary-title"
        className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 id="annual-summary-title" className="text-base font-semibold text-slate-900">
            Resumo anual {year}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Fechar
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-2">Mês</th>
                <th className="pb-2 pr-2 text-right">Receitas</th>
                <th className="pb-2 pr-2 text-right">Despesas</th>
                <th className="pb-2 text-right">Pendentes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.month} className="border-t border-slate-100">
                  <td className="py-2 font-medium text-slate-800">{row.label}</td>
                  <td className="py-2 text-right text-emerald-700">{formatCurrency(row.receitas)}</td>
                  <td className="py-2 text-right text-rose-700">{formatCurrency(row.despesas)}</td>
                  <td className="py-2 text-right text-amber-700">{formatCurrency(row.pendentes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          Valores com base nos lançamentos já registrados no ano. Pendentes somam lançamentos com status pendente,
          agendada ou atrasada.
        </p>
      </div>
    </div>
  )
}

export default AnnualSummaryModal
