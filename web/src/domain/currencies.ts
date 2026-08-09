export const DEFAULT_CURRENCY = 'INR'

export const CURRENCY_OPTIONS = [
  { value: 'INR', label: 'Indian rupee (INR)' },
  { value: 'USD', label: 'US dollar (USD)' },
  { value: 'EUR', label: 'Euro (EUR)' },
  { value: 'GBP', label: 'British pound (GBP)' },
  { value: 'AED', label: 'UAE dirham (AED)' },
  { value: 'AUD', label: 'Australian dollar (AUD)' },
  { value: 'CAD', label: 'Canadian dollar (CAD)' },
  { value: 'CHF', label: 'Swiss franc (CHF)' },
  { value: 'CNY', label: 'Chinese yuan (CNY)' },
  { value: 'HKD', label: 'Hong Kong dollar (HKD)' },
  { value: 'JPY', label: 'Japanese yen (JPY)' },
  { value: 'KRW', label: 'South Korean won (KRW)' },
  { value: 'MXN', label: 'Mexican peso (MXN)' },
  { value: 'NZD', label: 'New Zealand dollar (NZD)' },
  { value: 'SGD', label: 'Singapore dollar (SGD)' },
  { value: 'ZAR', label: 'South African rand (ZAR)' },
] as const

export type SupportedCurrency = (typeof CURRENCY_OPTIONS)[number]['value']

const supportedCurrencies = new Set<string>(
  CURRENCY_OPTIONS.map(({ value }) => value),
)

export function normalizeCurrency(value: unknown, fallback = DEFAULT_CURRENCY) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z]{3}$/u.test(normalized) ? normalized : fallback
}

export function isSupportedCurrency(
  value: unknown,
): value is SupportedCurrency {
  return typeof value === 'string' && supportedCurrencies.has(value)
}

export function currencyLabel(value: string) {
  const normalized = normalizeCurrency(value)
  return (
    CURRENCY_OPTIONS.find((option) => option.value === normalized)?.label ??
    `${normalized} currency (${normalized})`
  )
}
