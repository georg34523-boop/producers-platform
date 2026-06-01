export type Currency = 'USD' | 'EUR'

export const CURRENCY_LIST: Currency[] = ['USD', 'EUR']

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
}

export const CURRENCY_LABEL: Record<Currency, string> = {
  USD: 'Долар США',
  EUR: 'Євро',
}

export function fmtMoney(n: number, c: Currency, opts?: { compact?: boolean }): string {
  const formatted = n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
  return opts?.compact ? `${formatted}${CURRENCY_SYMBOL[c]}` : `${formatted} ${CURRENCY_SYMBOL[c]}`
}

/** Конвертація через rate USD→EUR (1 USD = rate EUR). */
export function convert(amount: number, from: Currency, to: Currency, usdEurRate: number): number {
  if (from === to) return amount
  if (from === 'USD' && to === 'EUR') return amount * usdEurRate
  if (from === 'EUR' && to === 'USD') return usdEurRate > 0 ? amount / usdEurRate : amount
  return amount
}

/** Поточний курс для проєкту: override якщо задано, інакше — глобальний. */
export function projectRate(
  globalUsdEurRate: number,
  override: number | null | undefined,
): number {
  const o = Number(override)
  return Number.isFinite(o) && o > 0 ? o : globalUsdEurRate
}
