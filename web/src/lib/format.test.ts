import { describe, expect, it } from 'vitest'
import { formatDate } from './format'

describe('formatDate', () => {
  it('keeps the stored UTC calendar day in negative-offset timezones', () => {
    expect(formatDate('2026-08-04T00:00:00.000Z')).toMatch(/Aug.*4|4.*Aug/u)
  })

  it('handles invalid server values without throwing', () => {
    expect(formatDate('not-a-date')).toBe('Invalid date')
  })
})
