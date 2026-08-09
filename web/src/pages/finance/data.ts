import { useQuery } from '@tanstack/react-query'
import { useApp } from '@/app/app-state'
import type {
  Dashboard,
  DashboardActivity,
  DashboardAccountInsight,
  DashboardCashflowPoint,
  DashboardCategoryInsight,
  DashboardComparison,
  DashboardContactInsight,
  DashboardGoalItem,
  DashboardGoalSummary,
  DashboardInsight,
  DashboardMonthDetails,
  DashboardRepeatedTransaction,
  Goal,
  Transaction,
} from '@/domain/types'
import { api } from '@/lib/api-client'

export function useFinanceData<T>(
  key: string,
  path: string,
  fallback: T,
  enabled = true,
  retry: boolean | number = 1,
) {
  const { demoMode, workspace } = useApp()
  return useQuery({
    queryKey: [key, workspace.id, demoMode ? 'demo' : 'live', path],
    queryFn: async () => {
      if (demoMode) return fallback
      const response = await api.get<unknown>(
        `/workspaces/${workspace.id}${path}`,
      )
      return normalizeFinanceData<T>(key, response)
    },
    enabled,
    retry,
  })
}

export function hasWorkspacePermission(
  demoMode: boolean,
  permissions: string[] | undefined,
  permission: string,
) {
  return demoMode || permissions?.includes(permission) === true
}

export function normalizeFinanceData<T>(key: string, response: unknown): T {
  if (key === 'dashboard' && isRecord(response)) {
    const recent = Array.isArray(response.recentTransactions)
      ? normalizeFinanceData<Transaction[]>(
          'transactions',
          response.recentTransactions,
        )
      : []
    const analytics = {
      byCategory: normalizeDashboardCategories(response.byCategory),
      bySource: normalizeDashboardCategories(response.bySource),
      byContact: normalizeDashboardContacts(response.byContact),
      byAccount: normalizeDashboardAccounts(response.byAccount),
      byType: normalizeDashboardCategories(response.byType),
      cashflow: normalizeDashboardCashflow(response.cashflow),
      monthlyTrend: normalizeDashboardCashflow(response.monthlyTrend),
      recentActivity: normalizeDashboardActivity(response.recentActivity),
      topCategories: normalizeDashboardCategories(response.topCategories),
      monthDetails: normalizeDashboardMonthDetails(response.monthDetails),
    }
    return {
      currency: String(response.currency ?? 'INR'),
      balanceMinor: Number(response.balanceMinor ?? 0),
      incomeMinor: Number(response.incomeMinor ?? 0),
      spendingMinor: Number(response.spendingMinor ?? 0),
      transactionCount: Number(response.transactionCount ?? 0),
      averageValueMinor: Number(response.averageValueMinor ?? 0),
      highestIncomeMinor: Number(response.highestIncomeMinor ?? 0),
      highestExpenseMinor: Number(response.highestExpenseMinor ?? 0),
      amountReceivedMinor: Number(response.amountReceivedMinor ?? 0),
      amountPaidMinor: Number(response.amountPaidMinor ?? 0),
      pendingGoalMinor: Number(response.pendingGoalMinor ?? 0),
      achievedGoalMinor: Number(response.achievedGoalMinor ?? 0),
      goalSummary: normalizeDashboardGoalSummary(response.goalSummary),
      allActiveGoals: normalizeDashboardGoalSummary(response.allActiveGoals),
      goalHighlights: normalizeDashboardGoalItems(response.goalHighlights),
      insights: normalizeDashboardInsights(response.insights),
      previousComparison: normalizeDashboardComparison(response.previousComparison),
      recentTransactions: recent,
      pendingApprovals: Number(response.pendingApprovals ?? 0),
      unreadNotifications: Number(response.unreadNotifications ?? 0),
      ...analytics,
    } as Dashboard as T
  }
  if (key === 'transaction') {
    if (!isRecord(response)) return null as T
    const normalized = normalizeFinanceData<Transaction[]>('transactions', [response])
    return (normalized[0] ?? null) as T
  }
  if (key === 'goal') {
    if (!isRecord(response)) return null as T
    const normalized = normalizeFinanceData<Goal[]>('goals', [response])
    return (normalized[0] ?? null) as T
  }
  if (!Array.isArray(response)) return response as T
  if (key === 'accounts') {
    return response.map((item) => {
      const account = item as Record<string, unknown>
      const bankName = nonEmptyString(account.bankName)
      const icon = nonEmptyString(account.icon)
      const notes = nonEmptyString(account.notes)
      return {
        id: String(account.id),
        name: String(account.name),
        kind: String(account.type ?? 'Account'),
        balance: {
          amountMinor: Number(account.balanceMinor ?? 0),
          currency: String(account.currency ?? 'INR'),
        },
        maskedNumber:
          nonEmptyString(account.maskedIdentifier) ??
          nonEmptyString(account.maskedNumber) ??
          'Manual account',
        color: nonEmptyString(account.color) ?? '#536d52',
        ...(bankName ? { bankName } : {}),
        ...(icon ? { icon } : {}),
        ...(notes ? { notes } : {}),
        status: normalizeAccountStatus(account.status, account.active),
        openingMinor: Number(account.openingMinor ?? 0),
        excludeFromTotal: Boolean(account.excludeFromTotal),
        privacy: normalizeRecordPrivacy(account.privacy),
      }
    }) as T
  }
  if (key === 'transactions') {
    return response.map((item) => {
      const transaction = item as Record<string, unknown>
      const type = String(transaction.type ?? 'expense')
      const creator = normalizeCreatorSummary(transaction.creator)
      return {
        id: String(transaction.id),
        merchant: String(
          transaction.merchant ?? transaction.notes ?? 'Transaction',
        ),
        category: String(transaction.category ?? type),
        occurredAt: String(transaction.occurredAt),
        createdAt: transaction.createdAt
          ? String(transaction.createdAt)
          : undefined,
        amount: {
          amountMinor: Number(transaction.amountMinor ?? 0),
          currency: String(transaction.currency ?? 'INR'),
        },
        direction:
          type === 'income' || type === 'refund' || type === 'reimbursement'
            ? 'credit'
            : 'debit',
        status: 'cleared',
        accountId: String(transaction.accountId ?? ''),
        destinationAccountId: transaction.destinationAccountId
          ? String(transaction.destinationAccountId)
          : undefined,
        rawType: normalizeTransactionType(type),
        privacy: normalizeRecordPrivacy(transaction.privacy),
        hasSplits: transaction.hasSplits === true || (Array.isArray(transaction.splits) && transaction.splits.length > 0),
        goalId: transaction.goalId ? String(transaction.goalId) : undefined,
        creator,
        note: transaction.notes ? String(transaction.notes) : undefined,
		description: transaction.description ? String(transaction.description) : undefined,
		contactId: transaction.contactId ? String(transaction.contactId) : undefined,
		contact: transaction.contact && typeof transaction.contact === 'object' ? transaction.contact : undefined,
      }
    }) as T
  }
  if (key === 'budgets') {
    return response.map((item) => {
      const budget = item as Record<string, unknown>
      return {
        id: String(budget.id),
        name: String(budget.name),
        spent: {
          amountMinor:
            typeof budget.spentMinor === 'number'
              ? Number(budget.spentMinor)
              : 0,
          currency: String(budget.currency ?? 'INR'),
        },
        limit: {
          amountMinor: Number(budget.amountMinor ?? 0),
          currency: String(budget.currency ?? 'INR'),
        },
        period: String(budget.period ?? 'Current period'),
        spendingKnown: typeof budget.spentMinor === 'number',
        categories: Array.isArray(budget.categories)
          ? budget.categories.filter(
              (category): category is string => typeof category === 'string',
            )
          : [],
        rollover: Boolean(budget.rollover),
        startAt: budget.startAt ? String(budget.startAt) : undefined,
        endAt: budget.endAt ? String(budget.endAt) : undefined,
      }
    }) as T
  }
  if (key === 'goals') {
    return response.map((item) => {
      const goal = item as Record<string, unknown>
      return {
        id: String(goal.id),
        name: String(goal.name),
        saved: {
          amountMinor: Number(goal.currentMinor ?? 0),
          currency: String(goal.currency ?? 'INR'),
        },
        target: {
          amountMinor: Number(goal.targetMinor ?? 0),
          currency: String(goal.currency ?? 'INR'),
        },
        targetDate: String(goal.targetDate ?? ''),
        description: goal.description ? String(goal.description) : undefined,
        type: goal.type ? String(goal.type) : undefined,
        customType: goal.customType ? String(goal.customType) : undefined,
        direction: normalizeGoalDirection(goal.direction),
        remaining: {
          amountMinor: Number(goal.remainingMinor ?? Math.max(Number(goal.targetMinor ?? 0) - Number(goal.currentMinor ?? 0), 0)),
          currency: String(goal.currency ?? 'INR'),
        },
        startDate: goal.startDate ? String(goal.startDate) : undefined,
        dueDate: goal.dueDate ? String(goal.dueDate) : undefined,
        status: normalizeGoalStatus(goal.status),
        visibility: normalizeGoalVisibility(goal.visibility),
        contactId: goal.contactId ? String(goal.contactId) : undefined,
        contactName: goal.contactName ? String(goal.contactName) : undefined,
        contact: normalizeContactSummary(goal.contact),
        accountId: goal.accountId ? String(goal.accountId) : undefined,
        category: goal.category ? String(goal.category) : undefined,
        reminder: goal.reminder ? String(goal.reminder) : undefined,
        notes: goal.notes ? String(goal.notes) : undefined,
        cancelledAt: goal.cancelledAt ? String(goal.cancelledAt) : undefined,
        completionDate: goal.completionDate ? String(goal.completionDate) : undefined,
        linkedTransactionIds: Array.isArray(goal.linkedTransactionIds)
          ? goal.linkedTransactionIds.filter((id): id is string => typeof id === 'string')
          : [],
        createdBySummary: normalizeCreatorSummary(goal.createdBySummary),
        history: Array.isArray(goal.history)
          ? goal.history.filter(isRecord).map((entry) => ({
              action: String(entry.action ?? 'updated'),
              actorId: entry.actorId ? String(entry.actorId) : undefined,
              amountMinor: entry.amountMinor == null ? undefined : Number(entry.amountMinor),
              date: entry.date ? String(entry.date) : undefined,
              createdAt: String(entry.createdAt ?? ''),
            }))
          : [],
      }
    }) as T
  }
  if (key === 'bills') {
    return response.map((item) => {
      const bill = item as Record<string, unknown>
      return {
        id: String(bill.id),
        name: String(bill.name ?? 'Upcoming bill'),
        dueDate: String(bill.dueDate ?? ''),
        amount: {
          amountMinor: Number(bill.amountMinor ?? 0),
          currency: String(bill.currency ?? 'INR'),
        },
        autopay: Boolean(bill.autopay),
      }
    }) as T
  }
  if (key === 'claims') {
    return response.map((item) => {
      const claim = item as Record<string, unknown>
      const reimbursementStatus = String(
        claim.reimbursementStatus ?? 'not_reimbursed',
      )
      const rawStatus = String(claim.status ?? 'pending')
      const status =
        reimbursementStatus === 'reimbursed'
          ? 'Reimbursed'
          : rawStatus === 'pending'
            ? 'Needs approval'
            : friendlyLabel(rawStatus)
      return {
        id: String(claim.id),
        person: 'Workspace member',
        purpose: String(claim.description ?? 'Expense claim'),
        amount: {
          amountMinor: Number(claim.amountMinor ?? 0),
          currency: String(claim.currency ?? 'INR'),
        },
        status,
        rawStatus,
        reimbursementStatus,
        submittedBy: claim.submittedBy
          ? String(claim.submittedBy)
          : undefined,
        approvalComment: claim.approvalComment
          ? String(claim.approvalComment)
          : undefined,
      }
    }) as T
  }
  return response as T
}

function normalizeDashboardCategories(value: unknown): DashboardCategoryInsight[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const row = isRecord(item) ? item : {}
    return {
      name: String(row.name ?? row.category ?? 'Uncategorised'),
      category: row.category ? String(row.category) : undefined,
      merchant: row.merchant ? String(row.merchant) : undefined,
      type: row.type ? String(row.type) : undefined,
      amountMinor: Number(row.amountMinor ?? 0),
      count: Number(row.count ?? 0),
      currency: row.currency ? String(row.currency) : undefined,
    }
  })
}

function normalizeDashboardCashflow(value: unknown): DashboardCashflowPoint[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const row = isRecord(item) ? item : {}
    return {
      period: String(row.period ?? ''),
      incomeMinor: Number(row.incomeMinor ?? 0),
      spendingMinor: Number(row.spendingMinor ?? 0),
      netMinor: Number(row.netMinor ?? 0),
      currency: row.currency ? String(row.currency) : undefined,
    }
  })
}

function normalizeDashboardActivity(value: unknown): DashboardActivity[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const row = isRecord(item) ? item : {}
    return {
      id: String(row.id ?? ''),
      label: String(row.label ?? 'Transaction'),
      type: String(row.type ?? 'expense'),
      category: row.category ? String(row.category) : undefined,
      accountId: row.accountId ? String(row.accountId) : undefined,
      contactId: row.contactId ? String(row.contactId) : undefined,
      contact: normalizeContactSummary(row.contact),
      creator: normalizeCreatorSummary(row.creator),
      description: row.description ? String(row.description) : undefined,
      amountMinor: Number(row.amountMinor ?? 0),
      currency: String(row.currency ?? 'INR'),
      occurredAt: String(row.occurredAt ?? ''),
    }
  })
}

function normalizeDashboardContacts(value: unknown): DashboardContactInsight[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const row = isRecord(item) ? item : {}
    return {
      id: row.id ? String(row.id) : undefined,
      name: String(row.name ?? 'Contact'),
      incomeMinor: Number(row.incomeMinor ?? 0),
      paidMinor: Number(row.paidMinor ?? 0),
      netMinor: Number(row.netMinor ?? Number(row.incomeMinor ?? 0) - Number(row.paidMinor ?? 0)),
      count: Number(row.count ?? 0),
      latestDate: row.latestDate ? String(row.latestDate) : undefined,
      currency: row.currency ? String(row.currency) : undefined,
    }
  })
}

function normalizeDashboardAccounts(value: unknown): DashboardAccountInsight[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const row = isRecord(item) ? item : {}
    const incomeMinor = Number(row.incomeMinor ?? 0)
    const paidMinor = Number(row.paidMinor ?? 0)
    return {
      id: String(row.id ?? ''),
      name: String(row.name ?? 'Account'),
      incomeMinor,
      paidMinor,
      netMinor: Number(row.netMinor ?? incomeMinor - paidMinor),
      count: Number(row.count ?? 0),
      currency: row.currency ? String(row.currency) : undefined,
    }
  })
}

function normalizeDashboardGoalItems(value: unknown): DashboardGoalItem[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((row) => ({
    id: String(row.id ?? ''),
    name: String(row.name ?? 'Goal'),
    type: row.type ? String(row.type) : undefined,
    direction: normalizeGoalDirection(row.direction),
    status: normalizeGoalStatus(row.status) ?? 'not_started',
    targetMinor: Number(row.targetMinor ?? 0),
    currentMinor: Number(row.currentMinor ?? 0),
    remainingMinor: Number(row.remainingMinor ?? 0),
    currency: String(row.currency ?? 'INR'),
    dueDate: row.dueDate ? String(row.dueDate) : undefined,
  }))
}

function normalizeDashboardGoalSummary(value: unknown): DashboardGoalSummary {
  const row = isRecord(value) ? value : {}
  return {
    activeCount: Number(row.activeCount ?? 0),
    expectedIncomeMinor: Number(row.expectedIncomeMinor ?? 0),
    expectedPaymentsMinor: Number(row.expectedPaymentsMinor ?? 0),
    savingsTargetMinor: Number(row.savingsTargetMinor ?? 0),
    dueSoonCount: Number(row.dueSoonCount ?? 0),
    dueTodayCount: Number(row.dueTodayCount ?? 0),
    overdueCount: Number(row.overdueCount ?? 0),
    achievedCount: Number(row.achievedCount ?? 0),
    partialCount: Number(row.partialCount ?? 0),
    completionPercent: row.completionPercent == null ? undefined : Number(row.completionPercent),
    pendingMinor: Number(row.pendingMinor ?? 0),
    achievedMinor: Number(row.achievedMinor ?? 0),
    nearestDue: normalizeDashboardGoalItems(row.nearestDue ? [row.nearestDue] : [])[0],
  }
}

function normalizeDashboardInsights(value: unknown): DashboardInsight[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((row) => ({
    kind: String(row.kind ?? 'insight'),
    title: String(row.title ?? 'Useful insight'),
    detail: String(row.detail ?? ''),
    metricMinor: row.metricMinor == null ? undefined : Number(row.metricMinor),
    percent: row.percent == null ? undefined : Number(row.percent),
    currency: row.currency ? String(row.currency) : undefined,
  }))
}

function normalizeDashboardMetricChange(value: unknown) {
  const row = isRecord(value) ? value : {}
  return {
    currentMinor: Number(row.currentMinor ?? 0),
    previousMinor: Number(row.previousMinor ?? 0),
    deltaMinor: Number(row.deltaMinor ?? 0),
    percent: row.percent == null ? undefined : Number(row.percent),
  }
}

function normalizeDashboardComparison(value: unknown): DashboardComparison | undefined {
  if (!isRecord(value)) return undefined
  return {
    from: String(value.from ?? ''),
    to: String(value.to ?? ''),
    income: normalizeDashboardMetricChange(value.income),
    expenses: normalizeDashboardMetricChange(value.expenses),
    net: normalizeDashboardMetricChange(value.net),
    transactionCount: normalizeDashboardMetricChange(value.transactionCount),
    averageValue: normalizeDashboardMetricChange(value.averageValue),
  }
}

function normalizeDashboardMonthDetails(value: unknown): DashboardMonthDetails {
  const row = isRecord(value) ? value : {}
  const repeatedTransactions: DashboardRepeatedTransaction[] = Array.isArray(row.repeatedTransactions)
    ? row.repeatedTransactions.filter(isRecord).map((item) => ({
        label: String(item.label ?? 'Transaction'),
        category: item.category ? String(item.category) : undefined,
        type: String(item.type ?? 'expense'),
        amountMinor: Number(item.amountMinor ?? 0),
        count: Number(item.count ?? 0),
        currency: String(item.currency ?? 'INR'),
      }))
    : []
  return {
    openingBalanceMinor: row.openingBalanceMinor == null ? undefined : Number(row.openingBalanceMinor),
    closingBalanceMinor: row.closingBalanceMinor == null ? undefined : Number(row.closingBalanceMinor),
    largestIncome: normalizeDashboardActivityOne(row.largestIncome),
    largestExpense: normalizeDashboardActivityOne(row.largestExpense),
    mostActiveDay: row.mostActiveDay ? String(row.mostActiveDay) : undefined,
    topSpendingCategory: row.topSpendingCategory ? String(row.topSpendingCategory) : undefined,
    highestValueContact: isRecord(row.highestValueContact)
      ? normalizeDashboardContacts([row.highestValueContact])[0]
      : undefined,
    repeatedTransactions,
  }
}

function normalizeDashboardActivityOne(value: unknown): DashboardActivity | undefined {
  if (!isRecord(value) || !value.id) return undefined
  return normalizeDashboardActivity([value])[0]
}

function normalizeContactSummary(value: unknown) {
  if (!isRecord(value) || !value.id || !value.name) return undefined
  return {
    id: String(value.id),
    name: String(value.name),
    phone: value.phone ? String(value.phone) : undefined,
    email: value.email ? String(value.email) : undefined,
  }
}

function normalizeCreatorSummary(value: unknown) {
  if (!isRecord(value)) return undefined
  const status = normalizeCreatorStatus(value.status)
  const name =
    nonEmptyString(value.name) ??
    (status === 'former' ? 'Former member' : 'Workspace member')
  const initials = nonEmptyString(value.initials) ?? initialsForName(name)
  const profileImageUrl = nonEmptyString(value.profileImageUrl)

  return {
    name,
    initials,
    status,
    isCurrentUser: value.isCurrentUser === true,
    ...(profileImageUrl ? { profileImageUrl } : {}),
  }
}

function normalizeRecordPrivacy(
  value: unknown,
): 'private' | 'workspace' | 'selected' | undefined {
  return value === 'private' || value === 'workspace' || value === 'selected'
    ? value
    : undefined
}

function normalizeAccountStatus(
  value: unknown,
  active: unknown,
): 'active' | 'inactive' {
  return value === 'inactive' || active === false ? 'inactive' : 'active'
}

function normalizeGoalVisibility(
  value: unknown,
): 'private' | 'workspace' | undefined {
  return value === 'private' || value === 'workspace' ? value : undefined
}

function normalizeGoalDirection(value: unknown): 'receive' | 'pay' | 'save' | 'neutral' | undefined {
  return value === 'receive' || value === 'pay' || value === 'save' || value === 'neutral'
    ? value
    : undefined
}

function normalizeGoalStatus(value: unknown):
  | 'not_started'
  | 'in_progress'
  | 'due_soon'
  | 'due_today'
  | 'overdue'
  | 'achieved'
  | 'cancelled'
  | undefined {
  return value === 'not_started' || value === 'in_progress' || value === 'due_soon' || value === 'due_today' || value === 'overdue' || value === 'achieved' || value === 'cancelled'
    ? value
    : undefined
}

function normalizeTransactionType(
  value: string,
): Transaction['rawType'] {
  return value === 'expense' ||
    value === 'income' ||
    value === 'transfer' ||
    value === 'refund' ||
    value === 'reimbursement' ||
    value === 'adjustment'
    ? value
    : 'expense'
}

function normalizeCreatorStatus(value: unknown): 'active' | 'former' {
  return nonEmptyString(value)?.toLowerCase() === 'active'
    ? 'active'
    : 'former'
}

function nonEmptyString(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function initialsForName(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return initials || 'FM'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function canDeleteTransaction(
  demoMode: boolean,
  permissions: string[] | undefined,
  transaction: { creator?: { isCurrentUser?: boolean } },
  _userId?: string,
) {
  if (demoMode || permissions?.includes('delete_all_transactions') === true) {
    return true
  }
  return (
    permissions?.includes('delete_own_transactions') === true &&
    transaction.creator?.isCurrentUser === true
  )
}

export function canEditTransaction(
  demoMode: boolean,
  permissions: string[] | undefined,
  transaction: { creator?: { isCurrentUser?: boolean } },
) {
  if (demoMode || permissions?.includes('edit_all_transactions') === true) {
    return true
  }
  return (
    permissions?.includes('edit_own_transactions') === true &&
    transaction.creator?.isCurrentUser === true
  )
}

export function friendlyLabel(value: string) {
  const normalized = value.trim().replaceAll('_', ' ')
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : 'Custom'
}
