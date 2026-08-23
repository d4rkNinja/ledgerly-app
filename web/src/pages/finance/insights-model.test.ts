import { describe, expect, it } from 'vitest'
import {
  describeCategoryChange,
  describeMetricChange,
  insightsPeriodValueForMode,
  insightsReportRange,
  previousPeriodRange,
} from './insights-model'

describe('previousPeriodRange', () => {
  it('returns a range of equal length immediately before the current one', () => {
    const range = previousPeriodRange(
      '2026-08-01T00:00:00.000Z',
      '2026-08-23T10:30:00.000Z',
    )
    expect(range).toEqual({
      from: '2026-07-09T13:30:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    })
  })

  it('rejects invalid or inverted ranges', () => {
    expect(previousPeriodRange('not-a-date', '2026-08-01T00:00:00.000Z')).toBeNull()
    expect(previousPeriodRange('2026-08-01T00:00:00.000Z', 'also-bad')).toBeNull()
    expect(previousPeriodRange('2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')).toBeNull()
    expect(previousPeriodRange('2026-08-02T00:00:00.000Z', '2026-08-01T00:00:00.000Z')).toBeNull()
  })
})

describe('insightsPeriodValueForMode', () => {
  const today = '2026-08-23'

  it('resolves civil month modes', () => {
    expect(insightsPeriodValueForMode('this-month', '', '', '', today)).toEqual({
      mode: 'this-month',
      month: '2026-08-01',
      from: '2026-08-01',
      to: '2026-08-31',
    })
    expect(insightsPeriodValueForMode('last-month', '', '', '', today)).toEqual({
      mode: 'last-month',
      month: '2026-07-01',
      from: '2026-07-01',
      to: '2026-07-31',
    })
    expect(
      insightsPeriodValueForMode('custom-month', '2025-02-15', '', '', today),
    ).toEqual({
      mode: 'custom-month',
      month: '2025-02-01',
      from: '2025-02-01',
      to: '2025-02-28',
    })
  })

  it('orders a custom range and tolerates invalid input', () => {
    expect(
      insightsPeriodValueForMode('custom-range', '', '2026-03-05', '2026-03-01', today),
    ).toEqual({
      mode: 'custom-range',
      month: '2026-03-01',
      from: '2026-03-01',
      to: '2026-03-05',
    })
    expect(
      insightsPeriodValueForMode('custom-range', '', 'not-a-date', 'also-bad', today),
    ).toEqual({
      mode: 'custom-range',
      month: '2026-08-01',
      from: '2026-08-01',
      to: '2026-08-31',
    })
  })

  it('resolves week, rolling seven day, and year modes', () => {
    expect(insightsPeriodValueForMode('this-week', '', '', '', today)).toEqual({
      mode: 'this-week',
      month: '2026-08-01',
      from: '2026-08-17',
      to: '2026-08-23',
    })
    expect(insightsPeriodValueForMode('last-7-days', '', '', '', today)).toEqual({
      mode: 'last-7-days',
      month: '2026-08-01',
      from: '2026-08-17',
      to: '2026-08-23',
    })
    expect(insightsPeriodValueForMode('this-year', '', '', '', today)).toEqual({
      mode: 'this-year',
      month: '2026-01-01',
      from: '2026-01-01',
      to: '2026-12-31',
    })
  })

  it('builds an exclusive UTC request range', () => {
    const period = insightsPeriodValueForMode('this-month', '', '', '', today)
    expect(insightsReportRange(period)).toEqual({
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
    })
  })
})

describe('describeMetricChange', () => {
  it('shows nothing when both periods are empty', () => {
    expect(describeMetricChange('spending', 0, 0)).toBeNull()
  })

  it('reports neutral no-prior-activity when only current activity exists', () => {
    expect(describeMetricChange('income', 500, 0)).toEqual({
      label: 'Income: no prior-period activity',
      tone: 'neutral',
    })
  })

  it('reports neutral unchanged totals', () => {
    expect(describeMetricChange('net', 250, 250)).toEqual({
      label: 'Net cash flow unchanged vs previous period',
      tone: 'neutral',
    })
  })

  it('treats higher income and net as positive and lower as warning', () => {
    expect(describeMetricChange('income', 220, 200)).toEqual({
      label: 'Income up 10% vs previous period',
      tone: 'positive',
    })
    expect(describeMetricChange('income', 180, 200)).toEqual({
      label: 'Income down 10% vs previous period',
      tone: 'warning',
    })
    expect(describeMetricChange('net', 60, 40)).toEqual({
      label: 'Net cash flow up 50% vs previous period',
      tone: 'positive',
    })
  })

  it('inverts the tone for spending so reductions read positively', () => {
    expect(describeMetricChange('spending', 150, 200)).toEqual({
      label: 'Spending down 25% vs previous period',
      tone: 'positive',
    })
    expect(describeMetricChange('spending', 240, 200)).toEqual({
      label: 'Spending up 20% vs previous period',
      tone: 'warning',
    })
  })

  it('ignores non-finite amounts', () => {
    expect(describeMetricChange('income', Number.NaN, 100)).toBeNull()
    expect(describeMetricChange('income', 100, Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('describeCategoryChange', () => {
  it('labels new and vanished categories factually', () => {
    expect(describeCategoryChange(300, 0)).toBe('New category this period')
    expect(describeCategoryChange(0, 300)).toBe('No spending in this period')
  })

  it('describes percentage movement from the previous period', () => {
    expect(describeCategoryChange(41_000, 50_000)).toBe(
      'Down 18% from the previous period',
    )
    expect(describeCategoryChange(70_000, 50_000)).toBe(
      'Up 40% from the previous period',
    )
  })

  it('reports unchanged categories and ignores empty pairs', () => {
    expect(describeCategoryChange(50_000, 50_000)).toBe(
      'Unchanged from the previous period',
    )
    expect(describeCategoryChange(0, 0)).toBeNull()
    expect(describeCategoryChange(Number.NaN, 50_000)).toBeNull()
  })
})
