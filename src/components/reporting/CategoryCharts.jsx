import { useCallback, useState } from "react"

/** Saturated, distinct colors for pie slices (hex) */
const COLORS = [
  "#e11d48",
  "#2563eb",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#db2777",
  "#4f46e5",
  "#0d9488",
  "#c026d3",
  "#b45309",
]

function formatBrl(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function polar(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function sectorPath(cx, cy, r, startAngle, endAngle) {
  const [sx, sy] = polar(cx, cy, r, startAngle)
  const [ex, ey] = polar(cx, cy, r, endAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey} Z`
}

export function CategoryPieChart({ entries, onSliceClick, size = 200 }) {
  const r = size / 2 - 8
  const cx = size / 2
  const cy = size / 2
  const total = entries.reduce((s, e) => s + e.value, 0) || 1

  const [tip, setTip] = useState(null)
  const [selectedSlice, setSelectedSlice] = useState(null)

  const showTip = useCallback((e, name, value) => {
    setTip({
      name,
      value,
      x: e.clientX,
      y: e.clientY,
    })
  }, [])

  const moveTip = useCallback((e) => {
    setTip((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null))
  }, [])

  const hideTip = useCallback(() => setTip(null), [])

  let acc = 0
  const sectors = entries.map((e, i) => {
    const start = (acc / total) * 360
    acc += e.value
    const end = (acc / total) * 360
    const d = sectorPath(cx, cy, r, start, end)
    const pct = (e.value / total) * 100
    return { d, name: e.name, value: e.value, pct, color: COLORS[i % COLORS.length], key: e.name, start, end }
  })

  const selectedData = selectedSlice ? sectors.find((item) => item.name === selectedSlice) : null

  if (entries.length === 1 && entries[0]) {
    const e0 = entries[0]
    return (
      <div
        className="relative flex flex-col items-center gap-2"
        onMouseLeave={hideTip}
      >
        {tip ? (
          <div
            className="pointer-events-none fixed z-[100] max-w-[min(90vw,16rem)] rounded-lg border border-slate-200 bg-slate-900 px-3 py-2 text-left text-xs text-white shadow-lg"
            style={{ left: tip.x + 14, top: tip.y + 14 }}
            role="tooltip"
          >
            <p className="font-semibold leading-snug">{tip.name}</p>
            <p className="mt-0.5 font-bold tabular-nums text-emerald-300">{formatBrl(tip.value)}</p>
          </div>
        ) : null}
        <svg
          width={size}
          height={size}
          className="shrink-0"
          role="img"
          aria-label="Gastos por categoria"
          onMouseMove={moveTip}
        >
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill={COLORS[0]}
            className={`cursor-pointer transition-all hover:brightness-110 ${
              selectedSlice === e0.name ? "brightness-110" : ""
            }`}
            onClick={() => setSelectedSlice(e0.name)}
            onMouseEnter={(ev) => showTip(ev, e0.name, e0.value)}
            onMouseMove={moveTip}
            tabIndex={0}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") onSliceClick?.(e0.name)
            }}
          />
        </svg>
        {selectedSlice === e0.name ? (
          <div className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">{e0.name}</p>
            <p className="valora-num mt-1 text-base font-bold text-slate-900">{formatBrl(e0.value)}</p>
            <p className="text-xs text-slate-500">100% das despesas do período.</p>
            {onSliceClick ? (
              <button
                type="button"
                onClick={() => onSliceClick(e0.name)}
                className="valora-gold-menu mt-2 rounded-lg px-2.5 py-1 text-xs font-semibold"
              >
                Ver lançamentos da categoria
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-center text-xs text-slate-500">Passe o mouse ou toque no círculo para ver o valor</p>
        )}
      </div>
    )
  }

  return (
    <div className="relative flex flex-col items-center gap-2" onMouseLeave={hideTip}>
      {tip ? (
        <div
          className="pointer-events-none fixed z-[100] max-w-[min(90vw,16rem)] rounded-lg border border-slate-200 bg-slate-900 px-3 py-2 text-left text-xs text-white shadow-lg"
          style={{ left: tip.x + 14, top: tip.y + 14 }}
          role="tooltip"
        >
          <p className="font-semibold leading-snug">{tip.name}</p>
          <p className="mt-0.5 font-bold tabular-nums text-emerald-300">{formatBrl(tip.value)}</p>
        </div>
      ) : null}
      <svg
        width={size}
        height={size}
        className="shrink-0"
        role="img"
        aria-label="Gastos por categoria"
        onMouseMove={moveTip}
      >
        {sectors.map((s) => {
          const isSelected = selectedSlice === s.name
          const mid = (s.start + s.end) / 2
          const [tx, ty] = polar(0, 0, isSelected ? 8 : 0, mid)
          return (
            <path
              key={s.key}
              d={s.d}
              fill={s.color}
              transform={`translate(${tx}, ${ty})`}
              className={`cursor-pointer stroke-white transition-all hover:brightness-110 ${isSelected ? "brightness-110" : ""}`}
              strokeWidth={isSelected ? "2" : "1"}
              onClick={() => setSelectedSlice(s.name)}
              onMouseEnter={(ev) => showTip(ev, s.name, s.value)}
              onMouseMove={moveTip}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault()
                  setSelectedSlice(s.name)
                }
              }}
              tabIndex={0}
            />
          )
        })}
      </svg>
      {selectedData ? (
        <div className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">{selectedData.name}</p>
          <p className="valora-num mt-1 text-base font-bold text-slate-900">{formatBrl(selectedData.value)}</p>
          <p className="text-xs text-slate-500">{selectedData.pct.toFixed(1)}% das despesas do período.</p>
          {onSliceClick ? (
            <button
              type="button"
              onClick={() => onSliceClick(selectedData.name)}
              className="valora-gold-menu mt-2 rounded-lg px-2.5 py-1 text-xs font-semibold"
            >
              Ver lançamentos da categoria
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-center text-xs text-slate-500">Passe o mouse na fatia ou toque para selecionar</p>
      )}
    </div>
  )
}

export function CategoryBarChart({ entries, onBarClick, maxBars = 10 }) {
  const top = entries.slice(0, maxBars)
  const max = Math.max(...top.map((e) => e.value), 1)

  return (
    <div className="space-y-2">
      {top.map((e, i) => (
        <button
          key={e.name}
          type="button"
          onClick={() => onBarClick?.(e.name)}
          className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-left transition hover:border-slate-400 hover:bg-slate-100"
        >
          <span className="w-32 shrink-0 truncate text-xs font-medium text-slate-800 sm:w-40">{e.name}</span>
          <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-3 rounded-full transition"
              style={{ width: `${(e.value / max) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }}
            />
          </div>
          <span className="w-24 shrink-0 text-right text-xs font-semibold text-slate-900">
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(e.value)}
          </span>
        </button>
      ))}
    </div>
  )
}
