import { useEffect, useMemo, useState } from "react"
import { listWallets, saveWallets, WALLETS_UPDATED_EVENT } from "../services/walletsService"
const goldBorder = "#D4AF37"

const BANK_STYLES = [
  { key: "nubank", color: "#8A05BE", icon: "N" },
  { key: "itau", color: "#EC7000", icon: "I" },
  { key: "inter", color: "#FF7A00", icon: "I" },
  { key: "santander", color: "#EC0000", icon: "S" },
  { key: "bradesco", color: "#CC092F", icon: "B" },
  { key: "caixa", color: "#005CA9", icon: "C" },
  { key: "banco do brasil", color: "#FCF800", icon: "BB", textColor: "#111827" },
  { key: "c6", color: "#212121", icon: "C6" },
  { key: "dinheiro", color: "#2E7D32", icon: "💵" },
  { key: "especie", color: "#2E7D32", icon: "💵" },
]

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function parseMoneyInput(value) {
  const raw = String(value ?? "").trim()
  if (!raw) return 0
  const normalized = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".")
  const num = Number(normalized)
  return Number.isFinite(num) ? num : 0
}

function resolveWalletVisual(walletName) {
  const name = String(walletName ?? "").toLowerCase()
  const matched = BANK_STYLES.find((item) => name.includes(item.key))
  if (!matched) return { color: "#475569", icon: "🏦", textColor: "#ffffff" }
  return {
    color: matched.color,
    icon: matched.icon,
    textColor: matched.textColor ?? "#ffffff",
  }
}

function formatSaldoForInput(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ""
  return n.toFixed(2).replace(".", ",")
}

function Carteiras() {
  const [wallets, setWallets] = useState(() => listWallets())
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ nome: "", saldo: "" })

  const totalSaldo = useMemo(
    () => wallets.reduce((sum, wallet) => sum + Number(wallet.saldo ?? 0), 0),
    [wallets],
  )

  useEffect(() => {
    function syncWallets() {
      setWallets(listWallets())
    }
    window.addEventListener(WALLETS_UPDATED_EVENT, syncWallets)
    window.addEventListener("storage", syncWallets)
    return () => {
      window.removeEventListener(WALLETS_UPDATED_EVENT, syncWallets)
      window.removeEventListener("storage", syncWallets)
    }
  }, [])

  function openNewWallet() {
    setEditingId(null)
    setForm({ nome: "", saldo: "" })
    setModalOpen(true)
  }

  function openEditWallet(wallet) {
    setEditingId(wallet.id)
    setForm({
      nome: wallet.nome ?? "",
      saldo: formatSaldoForInput(wallet.saldo),
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingId(null)
    setForm({ nome: "", saldo: "" })
  }

  function handleSubmit(event) {
    event.preventDefault()
    const nome = form.nome.trim()
    const saldo = parseMoneyInput(form.saldo)
    if (!nome) return

    const nextWallets =
      editingId != null
        ? wallets.map((w) => (w.id === editingId ? { ...w, nome, saldo } : w))
        : [{ id: Date.now(), nome, saldo }, ...wallets]
    setWallets(nextWallets)
    saveWallets(nextWallets)
    closeModal()
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#d8c08a]/45 bg-[#f8f2e3]/80 px-4 py-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#3f3011]">Carteiras</h1>
            <p className="mt-1 text-sm text-[#6e5720]">Gestão de contas bancárias e dinheiro físico.</p>
          </div>
          <button
            type="button"
            onClick={openNewWallet}
            className="valora-gold-button rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            Nova Carteira
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="valora-metal-card rounded-2xl px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7a5b16]">Total disponível</p>
          <p className="valora-num mt-1 text-2xl font-semibold text-emerald-700">{formatCurrency(totalSaldo)}</p>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {wallets.map((wallet) => (
          <article key={wallet.id} className="valora-metal-card rounded-2xl p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              {(() => {
                const visual = resolveWalletVisual(wallet.nome)
                return (
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                      style={{
                        backgroundColor: visual.color,
                        color: visual.textColor,
                        border: `1px solid ${goldBorder}`,
                      }}
                    >
                      {visual.icon}
                    </span>
                    <p className="truncate text-sm font-semibold text-slate-800">{wallet.nome}</p>
                  </div>
                )
              })()}
              <button
                type="button"
                onClick={() => openEditWallet(wallet)}
                className="valora-gold-menu shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold"
              >
                Editar
              </button>
            </div>
            <p className="mt-2 text-xs uppercase tracking-[0.12em] text-[#7a5b16]">Saldo disponível</p>
            <p className="valora-num mt-1 text-2xl font-bold text-[#2e220b]">{formatCurrency(wallet.saldo)}</p>
          </article>
        ))}
      </section>

      {modalOpen ? (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-slate-950/45" onClick={closeModal} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <section className="w-full max-w-md rounded-2xl border border-[#d8c08a]/50 bg-[#faf4e6] p-5 shadow-2xl">
              <h2 className="text-lg font-semibold text-[#3b2c0d]">
                {editingId != null ? "Editar Carteira" : "Nova Carteira"}
              </h2>
              <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Instituição / Nome</span>
                  <input
                    value={form.nome}
                    onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                    placeholder="Ex: Itaú ou Espécie"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Saldo atual</span>
                  <input
                    value={form.saldo}
                    onChange={(e) => setForm((prev) => ({ ...prev, saldo: e.target.value }))}
                    placeholder="Ex: 1500,00"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </label>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="valora-gold-button rounded-xl px-4 py-2.5 text-sm font-semibold">
                    {editingId != null ? "Salvar alterações" : "Salvar carteira"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        </>
      ) : null}
    </div>
  )
}

export default Carteiras
