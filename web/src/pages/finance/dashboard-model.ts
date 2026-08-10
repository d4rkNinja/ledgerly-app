import type {
  DashboardAnalytics,
  DashboardActivity,
  DashboardCashflowPoint,
  DashboardCategoryInsight,
  Transaction,
} from '@/domain/types'

function occurredAtFor(transaction: Transaction, now: Date) {
  const value = new Date(transaction.occurredAt)
  return Number.isNaN(value.getTime()) ? now : value
}

function isCredit(transaction: Transaction) {
  return transaction.direction === 'credit'
}

function periodFor(date: Date, monthly: boolean) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  if (monthly) return year + '-' + month
  const day = String(date.getUTCDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}

function addPoint(
  points: Map<string, DashboardCashflowPoint>,
  period: string,
  transaction: Transaction,
) {
  const current = points.get(period) ?? {
    period,
    incomeMinor: 0,
    spendingMinor: 0,
    netMinor: 0,
    currency: transaction.amount.currency,
  }
  if (isCredit(transaction)) {
    current.incomeMinor += transaction.amount.amountMinor
  } else {
    current.spendingMinor += transaction.amount.amountMinor
  }
  current.netMinor = current.incomeMinor - current.spendingMinor
  points.set(period, current)
}

export function buildDashboardModel(
  transactions: Transaction[],
  now = new Date(),
): DashboardAnalytics {
  const categories = new Map<string, DashboardCategoryInsight>()
  const cashflow = new Map<string, DashboardCashflowPoint>()
  const monthly = new Map<string, DashboardCashflowPoint>()
  const ordered = [...transactions].sort(
    (left, right) =>
      occurredAtFor(right, now).getTime() - occurredAtFor(left, now).getTime(),
  )

  for (const transaction of ordered) {
    const date = occurredAtFor(transaction, now)
    addPoint(cashflow, periodFor(date, false), transaction)
    addPoint(monthly, periodFor(date, true), transaction)

    if (!isCredit(transaction)) {
      const category = transaction.category.trim() || 'Uncategorised'
      const current = categories.get(category) ?? {
        name: category,
        category,
        type: 'expense',
        amountMinor: 0,
        count: 0,
        currency: transaction.amount.currency,
      }
      current.amountMinor += transaction.amount.amountMinor
      current.count += 1
      categories.set(category, current)
    }
  }

  const byCategory = [...categories.values()].sort(
    (left, right) =>
      right.amountMinor - left.amountMinor ||
      left.name.localeCompare(right.name),
  )
  const topCategories = byCategory.slice(0, 5)
  const toPoints = (points: Map<string, DashboardCashflowPoint>) =>
    [...points.values()].sort((left, right) =>
      left.period.localeCompare(right.period),
    )
  const recentActivity: DashboardActivity[] = ordered
    .slice(0, 10)
    .map((transaction) => {
      const occurredAt = occurredAtFor(transaction, now)
      return {
        id: transaction.id,
        transactionId: transaction.transactionId,
        label: transaction.merchant.trim() || transaction.category || 'Transaction',
        type: isCredit(transaction) ? 'income' : 'expense',
        category: transaction.category,
        amountMinor: transaction.amount.amountMinor,
        currency: transaction.amount.currency,
        occurredAt: occurredAt.toISOString(),
      }
    })

  return {
    byCategory,
    bySource: [],
    byContact: [],
    byAccount: [],
    byType: [],
    cashflow: toPoints(cashflow),
    monthlyTrend: toPoints(monthly),
    recentActivity,
    topCategories,
    monthDetails: { repeatedTransactions: [] },
  }
}
