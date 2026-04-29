const WALLETS_STORAGE_KEY = "valora:wallets"
export const WALLETS_UPDATED_EVENT = "wallets:updated"

const DEFAULT_WALLETS = [
  { id: 1, nome: "Nubank", saldo: 1500.0 },
  { id: 2, nome: "Dinheiro na Mão", saldo: 250.0 },
]

function normalizeWallet(row) {
  return {
    id: row?.id ?? Date.now(),
    nome: String(row?.nome ?? "").trim(),
    saldo: Number(row?.saldo ?? 0),
  }
}

export function listWallets() {
  if (typeof window === "undefined") return DEFAULT_WALLETS
  try {
    const raw = window.localStorage.getItem(WALLETS_STORAGE_KEY)
    if (!raw) return DEFAULT_WALLETS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_WALLETS
    return parsed.map(normalizeWallet).filter((w) => w.nome)
  } catch {
    return DEFAULT_WALLETS
  }
}

export function saveWallets(wallets) {
  if (typeof window === "undefined") return
  const normalized = Array.isArray(wallets) ? wallets.map(normalizeWallet) : []
  window.localStorage.setItem(WALLETS_STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new Event(WALLETS_UPDATED_EVENT))
}

export function getWalletsSummary() {
  const wallets = listWallets()
  const totalSaldo = wallets.reduce((sum, wallet) => sum + Number(wallet.saldo ?? 0), 0)
  return { wallets, totalSaldo }
}
