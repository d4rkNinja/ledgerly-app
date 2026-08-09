export type DateOnly = `${number}-${number}-${number}`

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u

function partsFor(value: string) {
  const match = DATE_ONLY_PATTERN.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function dateOnlyFromParts(year: number, month: number, day: number): DateOnly {
  return `${year}-${pad(month)}-${pad(day)}` as DateOnly
}

function dateOnlyFromUtcDate(date: Date): DateOnly {
  return dateOnlyFromParts(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  )
}

/** Returns true only for a real YYYY-MM-DD calendar day. */
export function isDateOnly(value: string | null | undefined): value is DateOnly {
  return typeof value === 'string' && partsFor(value) !== null
}

/** Returns today in the user's local calendar, not the browser's UTC day. */
export function todayDateOnly(now = new Date()): DateOnly {
  return dateOnlyFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/**
 * Reads server instants as UTC calendar dates while preserving a date-only
 * value verbatim. This keeps a selected day from moving when a device's local
 * timezone differs from the API's UTC storage timezone.
 */
export function dateOnlyFromUtc(
  value: string | null | undefined,
  fallback: DateOnly = todayDateOnly(),
): DateOnly {
  if (isDateOnly(value)) return value
  if (!value) return fallback

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback
  return dateOnlyFromUtcDate(parsed)
}

/** Serializes a calendar date at UTC midnight without parsing it in local time. */
export function toUtcDateOnly(value: DateOnly): string {
  const parts = partsFor(value)
  if (!parts) throw new TypeError(`Expected a valid date-only value, received ${value}`)
  return `${dateOnlyFromParts(parts.year, parts.month, parts.day)}T00:00:00.000Z`
}

export function dateOnlyToUtcDate(value: DateOnly) {
  const parts = partsFor(value)
  if (!parts) throw new TypeError(`Expected a valid date-only value, received ${value}`)
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

export function addDateOnlyDays(value: DateOnly, days: number): DateOnly {
  const date = dateOnlyToUtcDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return dateOnlyFromUtcDate(date)
}

export function addDateOnlyMonths(value: DateOnly, months: number): DateOnly {
  const date = dateOnlyToUtcDate(value)
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate()
  date.setUTCDate(Math.min(day, lastDay))
  return dateOnlyFromUtcDate(date)
}

export function startOfDateOnlyMonth(value: DateOnly): DateOnly {
  const date = dateOnlyToUtcDate(value)
  return dateOnlyFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
}

export function dateOnlyWeekday(value: DateOnly) {
  return dateOnlyToUtcDate(value).getUTCDay()
}

export function formatDateOnly(
  value: DateOnly,
  options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  },
  locale = typeof navigator === 'undefined' ? 'en-IN' : navigator.language || 'en-IN',
) {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: 'UTC',
  }).format(dateOnlyToUtcDate(value))
}
