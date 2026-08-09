import { describe, expect, it } from 'vitest'
import {
  dateOnlyFromUtc,
  isDateOnly,
  toUtcDateOnly,
  todayDateOnly,
} from './date-only'

describe('date-only utilities', () => {
  it('serializes a selected calendar day at UTC midnight without a timezone shift', () => {
    expect(toUtcDateOnly('2026-08-04')).toBe('2026-08-04T00:00:00.000Z')
  })

  it('preserves an existing date-only value and reads API instants in UTC', () => {
    expect(dateOnlyFromUtc('2026-08-04')).toBe('2026-08-04')
    expect(dateOnlyFromUtc('2026-08-04T23:30:00-04:00')).toBe('2026-08-05')
  })

  it('rejects missing and impossible calendar dates', () => {
    expect(isDateOnly('')).toBe(false)
    expect(isDateOnly('2026-02-29')).toBe(false)
    expect(isDateOnly('2026-08-4')).toBe(false)
    expect(isDateOnly('2026-08-04')).toBe(true)
  })

  it('uses the user’s local calendar date for a default value', () => {
    expect(todayDateOnly(new Date(2026, 7, 4, 23, 45))).toBe('2026-08-04')
  })
})
