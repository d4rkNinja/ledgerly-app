import { describe, expect, it } from 'vitest'
import {
  splitShareMinorFromMajor,
  validateTransactionSplits,
} from './transaction-splits'

describe('transaction split shares', () => {
  it('converts positive major-unit shares without floating-point drift', () => {
    expect(splitShareMinorFromMajor('40.05')).toBe(4005)
    expect(splitShareMinorFromMajor('0.29')).toBe(29)
  })

  it('builds member-email rows and requires an exact total', () => {
    expect(
      validateTransactionSplits(
        [
          { memberEmail: 'asha@example.test', amountMajor: '40' },
          { memberEmail: 'bina@example.test', amountMajor: '60.25' },
          { memberEmail: 'ignored@example.test', amountMajor: '' },
        ],
        10025,
      ),
    ).toMatchObject({
      ok: true,
      splits: [
        { memberEmail: 'asha@example.test', amountMinor: 4000 },
        { memberEmail: 'bina@example.test', amountMinor: 6025 },
      ],
    })
  })

  it('rejects empty, zero, over-precise, and mismatched allocations', () => {
    expect(validateTransactionSplits([], 1000)).toMatchObject({
      ok: false,
      reason: 'empty',
    })
    expect(
      validateTransactionSplits(
        [{ memberEmail: 'asha@example.test', amountMajor: '0' }],
        1000,
      ),
    ).toMatchObject({ ok: false, reason: 'invalid' })
    expect(
      validateTransactionSplits(
        [{ memberEmail: 'asha@example.test', amountMajor: '1.001' }],
        1000,
      ),
    ).toMatchObject({ ok: false, reason: 'invalid' })
    expect(
      validateTransactionSplits(
        [{ memberEmail: 'asha@example.test', amountMajor: '9.99' }],
        1000,
      ),
    ).toMatchObject({ ok: false, reason: 'total', allocatedMinor: 999 })
  })
})
