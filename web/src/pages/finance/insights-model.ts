import {
  addDateOnlyDays,
  addDateOnlyMonths,
  isDateOnly,
  startOfDateOnlyMonth,
  todayDateOnly,
  type DateOnly,
} from '@/lib/date-only'
import type { DashboardPeriodMode } from './period-selector'

export type ComparisonTone = 'neutral' | 'positive' | 'warning'

export type MetricKind = 'income' | 'spending' | 'net'

export type MetricComparison = {
  label: string
  tone: ComparisonTone
}

export type InsightsPeriodMode =
  | 'this-month'
  | 'last-month'
  | 'custom-month'
  | 'custom-range'
  | 'this-week'
  | 'last-7-days'
  | 'this-year'

export const INSIGHTS_PERIOD_MODES: readonly InsightsPeriodMode[] = [
  'this-month',
  'last-month',
  'custom-month',
  'custom-range',
  'this-week',
  'last-7-days',
  'this-year',
]

export function isInsightsPeriodMode(
  mode: DashboardPeriodMode,
): mode is InsightsPeriodMode {
  return INSIGHTS_PERIOD_MODES.includes(mode as InsightsPeriodMode)
}

const METRIC_LABELS: Record<MetricKind, string> = {
  income: 'Income',
  spending: 'Spending',
  net: 'Net cash flow',
}

const IMPROVES_WHEN_HIGHER: Record<MetricKind, boolean> = {
  income: true,
  net: true,
  spending: false,
}

function isAmount(value: number) {
  return Number.isFinite(value)
}

export function previousPeriodRange(
  fromISO: string,
  toISO: string,
): { from: string; to: string } | null {
  const from = new Date(fromISO)
  const to = new Date(toISO)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null
  const duration = to.getTime() - from.getTime()
  if (duration <= 0) return null
  return {
    from: new Date(from.getTime() - duration).toISOString(),
    to: from.toISOString(),
  }
}

export type InsightsPeriodValue = {
  mode: InsightsPeriodMode
  month: DateOnly
  from: DateOnly
  to: DateOnly
}

function endOfDateOnlyMonth(month: DateOnly): DateOnly {
  const start = startOfDateOnlyMonth(month)
  return addDateOnlyDays(addDateOnlyMonths(start, 1), -1)
}

function safeDateOnly(value: string | undefined, fallback: DateOnly): DateOnly {
  return isDateOnly(value) ? value : fallback
}

export function insightsPeriodValueForMode(
  mode: InsightsPeriodMode,
  month: string,
  from: string,
  to: string,
  today = todayDateOnly(),
): InsightsPeriodValue {
  const currentMonth = startOfDateOnlyMonth(today)
  switch (mode) {
    case 'last-month': {
      const lastMonth = addDateOnlyMonths(currentMonth, -1)
      return { mode, month: lastMonth, from: lastMonth, to: endOfDateOnlyMonth(lastMonth) }
    }
    case 'custom-month': {
      const selectedMonth = startOfDateOnlyMonth(safeDateOnly(month, currentMonth))
      return { mode, month: selectedMonth, from: selectedMonth, to: endOfDateOnlyMonth(selectedMonth) }
    }
    case 'custom-range': {
      const safeFrom = safeDateOnly(from, currentMonth)
      const safeTo = safeDateOnly(to, endOfDateOnlyMonth(currentMonth))
      const orderedFrom = safeTo >= safeFrom ? safeFrom : safeTo
      const orderedTo = safeTo >= safeFrom ? safeTo : safeFrom
      return {
        mode,
        month: startOfDateOnlyMonth(orderedFrom),
        from: orderedFrom,
        to: orderedTo,
      }
    }
    case 'this-week': {
      const mondayOffset = (new Date(`${today}T12:00:00.000Z`).getUTCDay() + 6) % 7
      const weekStart = addDateOnlyDays(today, -mondayOffset)
      return { mode, month: startOfDateOnlyMonth(weekStart), from: weekStart, to: addDateOnlyDays(weekStart, 6) }
    }
    case 'last-7-days':
      return { mode, month: startOfDateOnlyMonth(addDateOnlyDays(today, -6)), from: addDateOnlyDays(today, -6), to: today }
    case 'this-year': {
      const yearStart = `${today.slice(0, 4)}-01-01` as DateOnly
      return { mode, month: yearStart, from: yearStart, to: `${today.slice(0, 4)}-12-31` as DateOnly }
    }
    case 'this-month':
    default:
      return { mode: 'this-month', month: currentMonth, from: currentMonth, to: endOfDateOnlyMonth(currentMonth) }
  }
}

export function insightsReportRange(period: InsightsPeriodValue) {
  return {
    from: `${period.from}T00:00:00.000Z`,
    // Exclusive upper bound so the whole civil "to" day is included.
    to: `${addDateOnlyDays(period.to, 1)}T00:00:00.000Z`,
  }
}

export function describeMetricChange(
  kind: MetricKind,
  currentMinor: number,
  previousMinor: number,
): MetricComparison | null {
  if (!isAmount(currentMinor) || !isAmount(previousMinor)) return null
  const label = METRIC_LABELS[kind]
  if (previousMinor === 0 && currentMinor === 0) return null
  if (previousMinor === 0) {
    return { label: `${label}: no prior-period activity`, tone: 'neutral' }
  }
  const delta = currentMinor - previousMinor
  if (delta === 0) {
    return { label: `${label} unchanged vs previous period`, tone: 'neutral' }
  }
  const percent = Math.round((Math.abs(delta) / previousMinor) * 100)
  const direction = delta > 0 ? 'up' : 'down'
  const improved = IMPROVES_WHEN_HIGHER[kind] ? delta > 0 : delta < 0
  return {
    label: `${label} ${direction} ${percent}% vs previous period`,
    tone: improved ? 'positive' : 'warning',
  }
}

export function describeCategoryChange(
  currentMinor: number,
  previousMinor: number,
): string | null {
  if (!isAmount(currentMinor) || !isAmount(previousMinor)) return null
  if (previousMinor <= 0 && currentMinor <= 0) return null
  if (previousMinor <= 0) return 'New category this period'
  if (currentMinor <= 0) return 'No spending in this period'
  if (currentMinor === previousMinor) return 'Unchanged from the previous period'
  const percent = Math.round(
    (Math.abs(currentMinor - previousMinor) / previousMinor) * 100,
  )
  const direction = currentMinor > previousMinor ? 'Up' : 'Down'
  return `${direction} ${percent}% from the previous period`
}
