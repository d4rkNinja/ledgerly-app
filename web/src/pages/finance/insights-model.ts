export type ComparisonTone = 'neutral' | 'positive' | 'warning'

export type MetricKind = 'income' | 'spending' | 'net'

export type MetricComparison = {
  label: string
  tone: ComparisonTone
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
