function CardFormModal({ open, formData, onChange, onClose, onSubmit, isSaving, isEditing = false }) {
  if (!open) return null

  function handleMoneyKeyDown(event) {
    if (!event.shiftKey) return
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
    event.preventDefault()
    const input = event.currentTarget
    const current = Number(input.value || 0)
    const delta = event.key === "ArrowUp" ? 10 : -10
    const next = Math.max(0, current + delta)
    input.value = String(next)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{isEditing ? "Editar cartão" : "Novo cartão"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            Fechar
          </button>
        </div>

        <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">Nome do Cartão</span>
            <input
              name="nome_cartao"
              value={formData.nome_cartao}
              onChange={onChange}
              placeholder="Ex: Nubank"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Bandeira</span>
            <select
              name="bandeira"
              value={formData.bandeira}
              onChange={onChange}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option>Visa</option>
              <option>Mastercard</option>
              <option>Elo</option>
              <option>American Express</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Limite Total</span>
            <input
              name="limite_total"
              type="number"
              min="0"
              step="1"
              value={formData.limite_total}
              onChange={onChange}
              onKeyDown={handleMoneyKeyDown}
              placeholder="0,00"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Dia de Vencimento</span>
            <input
              name="dia_vencimento"
              type="number"
              min="1"
              max="31"
              value={formData.dia_vencimento}
              onChange={onChange}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Dia de Fechamento</span>
            <input
              name="dia_fechamento"
              type="number"
              min="1"
              max="31"
              value={formData.dia_fechamento}
              onChange={onChange}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <div className="sm:col-span-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-70"
            >
              {isSaving ? "Salvando..." : isEditing ? "Salvar alterações" : "Salvar cartão"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CardFormModal

