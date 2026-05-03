import { useCallback, useEffect, useState } from "react"
import {
  aplicarCarryOver,
  listarGastosEsporadicosPorCompetencia,
  somaPendentePlanejado,
} from "../services/gastosEsporadicosService"

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0))
}

function monthLabelFromKey(ym) {
  const parts = String(ym ?? "").split("-")
  const y = Number(parts[0])
  const m = Number(parts[1])
  if (!Number.isFinite(y) || !Number.isFinite(m)) return String(ym ?? "")
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
}

/**
 * Aviso de rolagem de provisões pendentes do mês anterior para o mês em foco.
 *
 * @param {{
 *   mesAtual: string
 *   mesAnterior: string
 *   onCarryOverSuccess?: () => void | Promise<void>
 *   onCarryOverError?: (message: string) => void
 *   refreshSignal?: number
 * }} props
 */
export default function CarryOverBanner({
  mesAtual,
  mesAnterior,
  onCarryOverSuccess,
  onCarryOverError,
  refreshSignal = 0,
}) {
  const [amount, setAmount] = useState(0)
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function verificar() {
      if (!mesAtual || !mesAnterior) {
        setVisible(false)
        return
      }
      const dismissKey = `valora:carryOverDismissed:${mesAtual}`
      if (sessionStorage.getItem(dismissKey) === "1") {
        setVisible(false)
        return
      }
      try {
        const rowsPrev = await listarGastosEsporadicosPorCompetencia(mesAnterior)
        if (cancelled) return
        const total = somaPendentePlanejado(rowsPrev)
        if (total > 0) {
          setAmount(total)
          setVisible(true)
        } else {
          setAmount(0)
          setVisible(false)
        }
      } catch (err) {
        console.error("[CarryOverBanner] Erro ao verificar sobras:", err)
        if (!cancelled) {
          setVisible(false)
        }
      }
    }
    void verificar()
    return () => {
      cancelled = true
    }
  }, [mesAtual, mesAnterior, refreshSignal])

  const handleAplicar = useCallback(async () => {
    setBusy(true)
    try {
      await aplicarCarryOver(mesAnterior, mesAtual)
      sessionStorage.setItem(`valora:carryOverDismissed:${mesAtual}`, "1")
      setVisible(false)
      setAmount(0)
      await onCarryOverSuccess?.()
    } catch (err) {
      console.error("[CarryOverBanner] Erro ao aplicar carry-over:", err)
      onCarryOverError?.(err?.message || "Não foi possível aplicar a rolagem.")
    } finally {
      setBusy(false)
    }
  }, [mesAnterior, mesAtual, onCarryOverError, onCarryOverSuccess])

  const handleDispensar = useCallback(() => {
    sessionStorage.setItem(`valora:carryOverDismissed:${mesAtual}`, "1")
    setVisible(false)
  }, [mesAtual])

  if (!visible || amount <= 0) return null

  const labelPrev = monthLabelFromKey(mesAnterior)
  const labelCur = monthLabelFromKey(mesAtual)

  return (
    <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50 to-white px-4 py-4 shadow-sm">
      <p className="text-sm font-semibold text-amber-950">Sobras de planejamento</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        Encontramos <span className="font-semibold text-amber-900">{formatCurrency(amount)}</span> em provisões ainda
        pendentes em <span className="capitalize">{labelPrev}</span>. Deseja rolar esse saldo para{" "}
        <span className="capitalize">{labelCur}</span>?
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleAplicar()}
          className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "A rolar…" : "Rolar para este mês"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleDispensar}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Agora não
        </button>
      </div>
    </div>
  )
}
