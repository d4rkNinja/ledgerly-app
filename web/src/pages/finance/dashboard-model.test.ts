import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/domain/types'
import { buildDashboardModel } from './dashboard-model'

const transactions: Transaction[] = [
  {
    id: 'expense-2',
    merchant: 'Market',
    category: 'Groceries',
    occurredAt: '2026-08-02T10:00:00.000Z',
    amount: { amountMinor: 700, currency: 'INR' },
    direction: 'debit',
    status: 'cleared',
    accountId: 'account-a',
  },
  {
    id: 'income-1',
    merchant: 'Salary',
    category: 'Income',
    occurredAt: '2026-08-01T10:00:00.000Z',
    amount: { amountMinor: 5000, currency: 'INR' },
    direction: 'credit',
    status: 'cleared',
    accountId: 'account-a',
  },
  {
    id: 'expense-1',
    merchant: 'Cafe',
    category: 'Dining',
    occurredAt: '2026-08-01T09:00:00.000Z',
    amount: { amountMinor: 300, currency: 'INR' },
    direction: 'debit',
    status: 'cleared',
    accountId: 'account-a',
  },
]

describe('buildDashboardModel', () => {
  it('aggregates real transactions into deterministic insight arrays', () => {
    const model = buildDashboardModel(
      [...transactions].reverse(),
      new Date('2026-08-02T12:00:00.000Z'),
    )

    expect(model.byCategory).toEqual([
      expect.objectContaining({ name: 'Groceries', amountMinor: 700, count: 1 }),
      expect.objectContaining({ name: 'Dining', amountMinor: 300, count: 1 }),
    ])
    expect(model.topCategories.map((item) => item.name)).toEqual([
      'Groceries',
      'Dining',
    ])
    expect(model.cashflow).toEqual([
      expect.objectContaining({
        period: '2026-08-01',
        incomeMinor: 5000,
        spendingMinor: 300,
        netMinor: 4700,
      }),
      expect.objectContaining({
        period: '2026-08-02',
        incomeMinor: 0,
        spendingMinor: 700,
        netMinor: -700,
      }),
    ])
    expect(model.monthlyTrend).toEqual([
      expect.objectContaining({
        period: '2026-08',
        incomeMinor: 5000,
        spendingMinor: 1000,
        netMinor: 4000,
      }),
    ])
    expect(model.recentActivity.map((item) => item.id)).toEqual([
      'expense-2',
      'income-1',
      'expense-1',
    ])
  })

  it('returns empty arrays for an empty workspace', () => {
    expect(buildDashboardModel([], new Date('2026-08-02T12:00:00.000Z'))).toEqual({
      byCategory: [],
      bySource: [],
      byContact: [],
      byAccount: [],
      byType: [],
      cashflow: [],
      monthlyTrend: [],
      recentActivity: [],
      topCategories: [],
      monthDetails: { repeatedTransactions: [] },
    })
  })
})
