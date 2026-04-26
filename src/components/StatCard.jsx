function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

const toneStyles = {
  positive: "text-emerald-600 bg-emerald-50 border-emerald-200",
  negative: "text-rose-600 bg-rose-50 border-rose-200",
  neutral: "text-blue-600 bg-blue-50 border-blue-200",
}

function StatCard({ title, value, subtitle, tone = "neutral" }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex items-start justify-between gap-3">
        <h3 className="text-sm font-medium text-slate-500">{title}</h3>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${toneStyles[tone] ?? toneStyles.neutral}`}
        >
          {tone === "positive" ? "Positivo" : tone === "negative" ? "Atencao" : "Neutro"}
        </span>
      </header>

      <p className="text-2xl font-semibold tracking-tight text-slate-900">{formatCurrency(value)}</p>
      {subtitle ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}
    </article>
  )
}

export default StatCard

