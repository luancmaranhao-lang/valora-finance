export const payerTagPrefix = "[PAGADOR:"
export const splitTagPrefix = "[RATEIO:"
export const infoTag = "[INFORMATIVO:1]"

export function extractTagValue(text, prefix) {
  const input = String(text ?? "")
  const start = input.indexOf(prefix)
  if (start === -1) return ""
  const end = input.indexOf("]", start)
  if (end === -1) return ""
  return input.slice(start + prefix.length, end).trim()
}

export function removeLancamentoMetaTags(text) {
  return String(text ?? "")
    .replace(/\s*\[(PAGADOR|RATEIO):[^\]]+\]/g, "")
    .replace(/\s*\[INFORMATIVO:1\]/g, "")
    .replace(/\s*\[ASSINATURA\]/g, "")
    .trim()
}

export function getFirstName(name) {
  return String(name ?? "").trim().split(" ")[0] || ""
}

export const dividedPayerValue = "__DIVIDIDO__"
export const jointPayerValue = "__CONTA_CONJUNTA__"

export function resolvePayerShortLabel(payerValue, { currentUserId, nameByUserId = {} }) {
  if (!payerValue) return { label: "Você", initial: "V", tone: "self" }
  if (payerValue === dividedPayerValue) return { label: "Dividido", initial: "D", tone: "split" }
  if (payerValue === jointPayerValue) return { label: "Conjunta", initial: "C", tone: "joint" }
  if (currentUserId && payerValue === currentUserId) return { label: "Você", initial: "V", tone: "self" }
  const name = nameByUserId[payerValue] || ""
  const first = getFirstName(name) || "Parceiro"
  return { label: first, initial: first.slice(0, 1).toUpperCase(), tone: "partner" }
}
