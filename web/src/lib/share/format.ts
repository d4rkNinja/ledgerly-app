import type { Money } from '@/domain/types'
import { formatMoney } from '@/lib/format'

import type { MonthlySummaryPeriod } from './types'

export const DEFAULT_SHARE_LOCALE = 'en-IN'

export function canonicalShareLocale(locale?: string): string {
  try {
    return Intl.getCanonicalLocales(locale || DEFAULT_SHARE_LOCALE)[0]
  } catch {
    return DEFAULT_SHARE_LOCALE
  }
}
export function formatShareMoney(
  money: Money,
  locale?: string,
  absolute = false,
): string {
  if (!Number.isFinite(money.amountMinor)) {
    throw new RangeError('Share amounts must be finite minor-unit numbers.')
  }

  const currency = money.currency.trim().toUpperCase()
  if (!/^[A-Z]{3}$/u.test(currency)) {
    throw new RangeError('Share currencies must be three-letter currency codes.')
  }

  return formatMoney(
    {
      amountMinor: absolute
        ? Math.abs(money.amountMinor)
        : money.amountMinor,
      currency,
    },
    canonicalShareLocale(locale),
  )
}

function validDate(value: string | Date): Date | null {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatShareDate(
  value: string | Date,
  locale?: string,
  timeZone?: string,
): string | null {
  const date = validDate(value)
  if (!date) return null

  const isDateOnly =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)

  try {
    return new Intl.DateTimeFormat(canonicalShareLocale(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: isDateOnly ? 'UTC' : timeZone || 'UTC',
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat(DEFAULT_SHARE_LOCALE, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date)
  }
}

export function formatShareMonth(
  period: MonthlySummaryPeriod,
  locale?: string,
): string {
  if (
    !Number.isInteger(period.year) ||
    !Number.isInteger(period.month) ||
    period.year < 1 ||
    period.month < 1 ||
    period.month > 12
  ) {
    throw new RangeError('Share periods require a valid year and month (1-12).')
  }

  const date = new Date(Date.UTC(period.year, period.month - 1, 1))
  return new Intl.DateTimeFormat(canonicalShareLocale(locale), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}
