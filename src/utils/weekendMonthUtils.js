/**
 * Conta quantas sextas-feiras existem no mês civil (ano, monthIndex 0–11).
 * Usado para o item nativo "Final de Semana": a reserva total é dividida por sexta.
 *
 * @param {number} year
 * @param {number} monthIndex
 * @returns {number}
 */
export function countFridaysInMonth(year, monthIndex) {
  const last = new Date(year, monthIndex + 1, 0).getDate()
  let n = 0
  for (let d = 1; d <= last; d += 1) {
    const day = new Date(year, monthIndex, d).getDay()
    if (day === 5) n += 1
  }
  return n
}

/**
 * Conta sábados no mês (referência alternativa para "fim de semana").
 * @param {number} year
 * @param {number} monthIndex
 * @returns {number}
 */
export function countSaturdaysInMonth(year, monthIndex) {
  const last = new Date(year, monthIndex + 1, 0).getDate()
  let n = 0
  for (let d = 1; d <= last; d += 1) {
    if (new Date(year, monthIndex, d).getDay() === 6) n += 1
  }
  return n
}

/**
 * @param {number} year
 * @param {number} monthIndex
 * @returns {{ fridays: number, saturdays: number, weekendLabelCount: number }}
 */
export function getWeekendsInMonth(year, monthIndex) {
  const fridays = countFridaysInMonth(year, monthIndex)
  const saturdays = countSaturdaysInMonth(year, monthIndex)
  return {
    fridays,
    saturdays,
    /** Preferência de negócio: contar sextas para divisão da reserva */
    weekendLabelCount: fridays,
  }
}

/**
 * Valor da reserva por sexta-feira (quando houver pelo menos uma sexta).
 * @param {number} totalPlanejado
 * @param {number} fridayCount
 * @returns {number | null}
 */
export function valorPorSexta(totalPlanejado, fridayCount) {
  const total = Number(totalPlanejado)
  if (!Number.isFinite(total) || total <= 0) return null
  if (!fridayCount || fridayCount < 1) return null
  return Math.round((total / fridayCount) * 100) / 100
}
