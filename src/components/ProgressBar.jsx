function ProgressBar({ value, max = 100, label, tone = "bg-blue-500" }) {
  const safeMax = max > 0 ? max : 100
  const percent = Math.min(Math.max(Math.round((value / safeMax) * 100), 0), 100)

  return (
    <div>
      {label ? (
        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
          <span>{label}</span>
          <span>{percent}%</span>
        </div>
      ) : null}
      <div className="h-2.5 rounded-full bg-slate-100">
        <div className={`h-2.5 rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

export default ProgressBar

