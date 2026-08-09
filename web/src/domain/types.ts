export type WorkspaceType = 'personal' | 'family' | 'office'
export type Role =
  | 'owner'
  | 'administrator'
  | 'finance_manager'
  | 'approver'
  | 'member'
  | 'viewer'
  | 'admin'

export type Permission =
  | 'view_workspace'
  | 'edit_workspace'
  | 'invite_members'
  | 'remove_members'
  | 'manage_roles'
  | 'view_vault'
  | 'create_vault'
  | 'edit_vault'
  | 'archive_vault'
  | 'view_balances'
  | 'view_transactions'
  | 'create_transactions'
  | 'edit_own_transactions'
  | 'edit_all_transactions'
  | 'delete_own_transactions'
  | 'delete_all_transactions'
  | 'manage_budgets'
  | 'manage_goals'
  | 'submit_expenses'
  | 'approve_expenses'
  | 'manage_reimbursements'
  | 'export_data'
  | 'view_audit_history'

export interface Money {
  amountMinor: number
  currency: string
}

export interface Workspace {
  id: string
  name: string
  type: WorkspaceType
  role: Role
  memberCount: number
  currency?: string
  financialMonthStart?: number
  ownerId?: string
  visibility?: 'private'
  createdAt?: string
  updatedAt?: string
  permissions?: Permission[]
}

export interface Account {
  id: string
  name: string
  kind: string
  balance: Money
  maskedNumber: string
  color: string
  bankName?: string
  icon?: string
  notes?: string
  status?: 'active' | 'inactive'
  openingMinor?: number
  excludeFromTotal?: boolean
  privacy?: 'private' | 'workspace' | 'selected'
}

export interface CreatorSummary {
  name: string
  initials: string
  profileImageUrl?: string
  status: 'active' | 'former'
  isCurrentUser: boolean
}

export interface CurrentUser {
  email: string
  name: string
  profileImageUrl?: string
  phoneNumber?: string
  locale: string
  preferredCurrency: string
  emailVerified: boolean
  createdAt?: string
  updatedAt?: string
}

export interface Transaction {
  id: string
  merchant: string
  category: string
  occurredAt: string
  createdAt?: string
  amount: Money
  direction: 'credit' | 'debit'
  status: 'cleared' | 'pending'
  accountId: string
  destinationAccountId?: string
  rawType?: 'expense' | 'income' | 'transfer' | 'refund' | 'reimbursement' | 'adjustment'
  privacy?: 'private' | 'workspace' | 'selected'
  /** True when the server maintains participant allocations for this entry. */
  hasSplits?: boolean
  goalId?: string
  creator?: CreatorSummary
  note?: string
	  description?: string
	  contactId?: string
	  contact?: ContactSummary
}

export interface ContactSummary { id: string; name: string; phone?: string; email?: string }
export interface Contact extends ContactSummary { notes?: string; createdBy: string; createdAt: string; updatedAt: string }
export interface SavedTransactionName { id: string; name: string; createdBy: string; createdAt: string; updatedAt: string }

export interface WorkspaceMember {
  name: string
  email: string
  role: Role
  permissions: Permission[]
  status: 'active' | 'pending' | 'expired' | 'removed'
  joinedAt: string
  invitationId?: string
  invitationStatus?: 'pending' | 'expired'
  profileImageUrl?: string
}

export interface DashboardCategoryInsight {
  name: string
  category?: string
  merchant?: string
  type?: string
  amountMinor: number
  count: number
  currency?: string
}

export interface DashboardCashflowPoint {
  period: string
  incomeMinor: number
  spendingMinor: number
  netMinor: number
  currency?: string
}

export interface DashboardActivity {
  id: string
  label: string
  type: string
  category?: string
  accountId?: string
  contactId?: string
  contact?: ContactSummary
  creator?: CreatorSummary
  description?: string
  amountMinor: number
  currency: string
  occurredAt: string
}

export interface DashboardAnalytics {
  byCategory: DashboardCategoryInsight[]
  bySource: DashboardCategoryInsight[]
  byContact: DashboardContactInsight[]
  byAccount: DashboardAccountInsight[]
  byType: DashboardCategoryInsight[]
  cashflow: DashboardCashflowPoint[]
  monthlyTrend: DashboardCashflowPoint[]
  recentActivity: DashboardActivity[]
  topCategories: DashboardCategoryInsight[]
  monthDetails: DashboardMonthDetails
}

export interface DashboardMetricChange {
  currentMinor: number
  previousMinor: number
  deltaMinor: number
  percent?: number
}

export interface DashboardComparison {
  from: string
  to: string
  income: DashboardMetricChange
  expenses: DashboardMetricChange
  net: DashboardMetricChange
  transactionCount: DashboardMetricChange
  averageValue: DashboardMetricChange
}

export interface DashboardContactInsight {
  id?: string
  name: string
  incomeMinor: number
  paidMinor: number
  netMinor: number
  count: number
  latestDate?: string
  currency?: string
}

export interface DashboardAccountInsight {
  id: string
  name: string
  incomeMinor: number
  paidMinor: number
  netMinor: number
  count: number
  currency?: string
}

export interface DashboardGoalItem {
  id: string
  name: string
  type?: string
  direction?: 'receive' | 'pay' | 'save' | 'neutral'
  status: 'not_started' | 'in_progress' | 'due_soon' | 'due_today' | 'overdue' | 'achieved' | 'cancelled'
  targetMinor: number
  currentMinor: number
  remainingMinor: number
  currency: string
  dueDate?: string
}

export interface DashboardGoalSummary {
  activeCount: number
  expectedIncomeMinor: number
  expectedPaymentsMinor: number
  savingsTargetMinor: number
  dueSoonCount: number
  dueTodayCount: number
  overdueCount: number
  achievedCount: number
  partialCount: number
  completionPercent?: number
  pendingMinor: number
  achievedMinor: number
  nearestDue?: DashboardGoalItem
}

export interface DashboardInsight {
  kind: string
  title: string
  detail: string
  metricMinor?: number
  percent?: number
  currency?: string
}

export interface DashboardRepeatedTransaction {
  label: string
  category?: string
  type: string
  amountMinor: number
  count: number
  currency: string
}

export interface DashboardMonthDetails {
  openingBalanceMinor?: number
  closingBalanceMinor?: number
  largestIncome?: DashboardActivity
  largestExpense?: DashboardActivity
  mostActiveDay?: string
  topSpendingCategory?: string
  highestValueContact?: DashboardContactInsight
  repeatedTransactions: DashboardRepeatedTransaction[]
}

export interface Dashboard extends DashboardAnalytics {
  currency: string
  balanceMinor: number
  incomeMinor: number
  spendingMinor: number
  transactionCount: number
  averageValueMinor: number
  highestIncomeMinor: number
  highestExpenseMinor: number
  amountReceivedMinor: number
  amountPaidMinor: number
  pendingGoalMinor: number
  achievedGoalMinor: number
  goalSummary: DashboardGoalSummary
  allActiveGoals: DashboardGoalSummary
  goalHighlights: DashboardGoalItem[]
  insights: DashboardInsight[]
  previousComparison?: DashboardComparison
  recentTransactions: Transaction[]
  pendingApprovals: number
  unreadNotifications: number
}

export interface Budget {
  id: string
  name: string
  spent: Money
  limit: Money
  period: string
  spendingKnown?: boolean
  categories?: string[]
  rollover?: boolean
  startAt?: string
  endAt?: string
}

export interface Goal {
  id: string
  name: string
  description?: string
  type?: string
  customType?: string
  direction?: 'receive' | 'pay' | 'save' | 'neutral'
  saved: Money
  target: Money
  remaining?: Money
  startDate?: string
  targetDate?: string
  dueDate?: string
  status?: 'not_started' | 'in_progress' | 'due_soon' | 'due_today' | 'overdue' | 'achieved' | 'cancelled'
  visibility?: 'private' | 'workspace'
  contactId?: string
  contactName?: string
  contact?: ContactSummary
  accountId?: string
  category?: string
  reminder?: string
  notes?: string
  cancelledAt?: string
  completionDate?: string
  linkedTransactionIds?: string[]
  createdBySummary?: CreatorSummary
  history?: GoalHistoryEntry[]
}

export interface GoalHistoryEntry {
  action: string
  actorId?: string
  amountMinor?: number
  date?: string
  createdAt: string
}

export interface Bill {
  id: string
  name: string
  dueDate: string
  amount: Money
  autopay: boolean
}

export interface ApiErrorShape {
  code: string
  message: string
  fields?: Record<string, string>
  requestId?: string
}

export interface ApiEnvelope<T> {
  data: T
}

export interface ApiErrorEnvelope {
  error: ApiErrorShape
}
