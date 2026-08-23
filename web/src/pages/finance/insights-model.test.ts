import { describe, expect, it } from 'vitest'
import {
  describeCategoryChange,
  describeMetricChange,
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
