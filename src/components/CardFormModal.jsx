function CardFormModal({ open, formData, onChange, onClose, onSubmit, isSaving }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Novo cartão</h2>
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
              name="nome"
              value={formData.nome}
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
              step="0.01"
              value={formData.limite_total}
              onChange={onChange}
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
              {isSaving ? "Salvando..." : "Salvar cartão"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CardFormModal

