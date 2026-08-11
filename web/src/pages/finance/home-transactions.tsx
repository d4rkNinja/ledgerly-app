import {
  ArrowDownLeft,
  BanknoteArrowUp,
  Download,
  Filter,
  PiggyBank,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  Split,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'motion/react'
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router'
import { z } from 'zod'
import { BottomSheet } from '@/components/motion/bottom-sheet'
import { DatePicker } from '@/components/date-picker'
import { ContactNamePicker } from '@/components/contact-name-picker'
import { Checkbox } from '@/components/motion/checkbox'
import {
  addDateOnlyDays,
  addDateOnlyMonths,
  isDateOnly,
  startOfDateOnlyMonth,
  todayDateOnly,
  toUtcDateOnly,
  type DateOnly,
} from '@/lib/date-only'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import {
  clearFieldError,
  dateInputSchema,
  focusFirstInvalidField,
  moneyInputSchema,
} from '../finance-writes/shared'
import { useApp } from '@/app/app-state'
import { CurrencySelect } from '@/components/currency-select'
import {
  categoriesForTransactionMode,
  selectableTransactionCategoryNames,
  transactionCategoryModeFor,
  transactionSequencePreview,
  type TransactionCategoryMode,
} from '@/domain/transaction-categories'
import {
  accounts as demoAccounts,
  budgets as demoBudgets,
  contacts as demoContacts,
  goals as demoGoals,
  savedTransactionNames as demoSavedTransactionNames,
  transactions as demoTransactionsWithoutIds,
} from '@/domain/demo-data'
import type {
  Account,
  Budget,
  CreatorSummary,
  Dashboard,
  DashboardCashflowPoint,
  DashboardGoalItem,
  DashboardMetricChange,
  Transaction,
	Contact,
	SavedTransactionName,
  WorkspaceMember,
} from '@/domain/types'

import { api, ApiError } from '@/lib/api-client'
import { SPRING_PRESS } from '@/lib/ease'
import { downloadWorkspaceExport } from '@/lib/export'
import { formatDate, formatMoney } from '@/lib/format'
import { invalidatePeriodReviewQueries } from '@/lib/period-review-query'
import { matchesTransactionSearch } from '@/lib/search'
import { buildSafeTextSharePayload } from '@/lib/share'
import {
  validateTransactionSplits,
  type TransactionSplitInput,
} from '@/lib/transaction-splits'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/motion/select'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  ListRow,
  PageHeader,
  Section,
  SuccessNotice,
} from '@/components/ui'
import {
  addDemoSessionItem,
  removeDemoSessionItem,
  useDemoSessionCollection,
} from '../finance-writes'

import {
  DataSkeleton,
  FeedbackNotice,
  InfoNotice,
  MoneyText,
  MotionLink,
  MotionListItem,
  PageFrame,
  Progress,
  type Feedback,
} from './shared'
import {
  canEditTransaction,
  friendlyLabel,
  canDeleteTransaction,
  hasWorkspacePermission,
  useFinanceData,
} from './data'
import { buildDashboardModel } from './dashboard-model'
import {
  useTransactionCategories,
  useTransactionSequences,
} from '@/lib/transaction-settings'
import {
  PeriodSelector,
  type DashboardPeriodMode,
  type DashboardPeriodValue,
} from './period-selector'
import { PeriodReviewCard } from './period-review'
import { RecordActionDrawer } from './record-action-drawer'
import { TransactionEditDialog } from './record-edit-dialogs'

const demoTransactions: Transaction[] = demoTransactionsWithoutIds.map(
  (transaction, index) => ({
    ...transaction,
    transactionId:
      transaction.direction === 'credit'
        ? '0001'
        : String(index).padStart(4, '0'),
    transactionIdScope:
      transaction.direction === 'credit' ? 'income' : 'expense',
  }),
)

const demoDashboard: Dashboard = {
  ...buildDashboardModel(
    demoTransactions,
    new Date('2026-07-25T12:00:00.000Z'),
  ),
  currency: 'INR',
  balanceMinor: demoAccounts.reduce(
    (total, account) => total + account.balance.amountMinor,
    0,
  ),
  incomeMinor: 12600000,
  spendingMinor: 634000,
  transactionCount: demoTransactions.length,
  averageValueMinor: Math.round(demoTransactions.reduce((total, transaction) => total + transaction.amount.amountMinor, 0) / Math.max(demoTransactions.length, 1)),
  highestIncomeMinor: Math.max(...demoTransactions.filter((transaction) => transaction.direction === 'credit').map((transaction) => transaction.amount.amountMinor), 0),
  highestExpenseMinor: Math.max(...demoTransactions.filter((transaction) => transaction.direction === 'debit').map((transaction) => transaction.amount.amountMinor), 0),
  amountReceivedMinor: 12600000,
  amountPaidMinor: 634000,
  pendingGoalMinor: demoGoals.reduce((total, goal) => total + Math.max(goal.target.amountMinor - goal.saved.amountMinor, 0), 0),
  achievedGoalMinor: 0,
  recentTransactions: demoTransactions,
  pendingApprovals: 0,
  unreadNotifications: 0,
  goalSummary: {
    activeCount: demoGoals.length,
    expectedIncomeMinor: 0,
    expectedPaymentsMinor: demoGoals.reduce((total, goal) => total + Math.max(goal.target.amountMinor - goal.saved.amountMinor, 0), 0),
    savingsTargetMinor: demoGoals.reduce((total, goal) => total + Math.max(goal.target.amountMinor - goal.saved.amountMinor, 0), 0),
    dueSoonCount: 0,
    dueTodayCount: 0,
    overdueCount: 0,
    achievedCount: 0,
    partialCount: demoGoals.length,
    pendingMinor: demoGoals.reduce((total, goal) => total + Math.max(goal.target.amountMinor - goal.saved.amountMinor, 0), 0),
    achievedMinor: 0,
  },
  allActiveGoals: {
    activeCount: demoGoals.length,
    expectedIncomeMinor: 0,
    expectedPaymentsMinor: 0,
    savingsTargetMinor: 0,
    dueSoonCount: 0,
    dueTodayCount: 0,
    overdueCount: 0,
    achievedCount: 0,
    partialCount: demoGoals.length,
    pendingMinor: demoGoals.reduce((total, goal) => total + Math.max(goal.target.amountMinor - goal.saved.amountMinor, 0), 0),
    achievedMinor: 0,
  },
  goalHighlights: [],
  insights: [],
}

function CreatorAvatar({
  creator,
}: {
  creator?: CreatorSummary
}) {
  const name = creator?.name ?? 'Creator unavailable'
  return (
    <span
      className="avatar creator-avatar"
      title={name}
      aria-label={name}
    >
      {creator?.profileImageUrl ? (
        <img src={creator.profileImageUrl} alt="" />
      ) : (
        creator?.initials ?? '—'
      )}
    </span>
  )
}

function transactionSubtitle(transaction: Transaction) {
  const creator = transaction.creator
    ? transaction.creator.name +
      (transaction.creator.status === 'former' ? ' · Former member' : '')
    : 'Creator unavailable'
  const createdAt = transaction.createdAt
    ? 'Created ' + formatDate(transaction.createdAt)
    : 'Creation time unavailable'
  return [
    transaction.transactionId
      ? `ID ${transaction.transactionId}`
      : undefined,
    transaction.category,
    formatDate(transaction.occurredAt),
    creator,
    createdAt,
  ]
    .filter(Boolean)
    .join(' · ')
}

function comparisonText(change: DashboardMetricChange | undefined, currency: string) {
  if (!change) return 'No comparable prior period'
  if (change.previousMinor === 0) return 'No prior activity'
  const percent = change.percent == null ? '' : ` · ${Math.abs(change.percent).toFixed(0)}%`
  return `${change.deltaMinor >= 0 ? 'Up' : 'Down'} ${formatMoney({ amountMinor: Math.abs(change.deltaMinor), currency })}${percent}`
}

function goalStatusLabel(goal: DashboardGoalItem) {
  switch (goal.status) {
    case 'due_today': return 'Due today'
    case 'due_soon': return 'Due soon'
    case 'overdue': return 'Overdue'
    case 'achieved': return 'Achieved'
    case 'in_progress': return 'Partially completed'
    case 'cancelled': return 'Cancelled'
    default: return 'Not started'
  }
}

function goalDirectionLabel(goal: DashboardGoalItem) {
  switch (goal.direction) {
    case 'receive': return 'Expected income'
    case 'pay': return 'Expected payment'
    case 'save': return 'Savings target'
    default: return 'Planned commitment'
  }
}

const MONTH_QUERY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
const DATE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/

function validDateKey(value: string | null) {
  if (!value || !DATE_KEY_PATTERN.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : null
}

// Transaction links historically carried RFC3339 bounds. Keep those links
// readable while the dashboard itself uses civil date-only query values.
function validDateOrTimestampKey(value: string | null) {
  const dateOnly = validDateKey(value)
  if (dateOnly) return dateOnly
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

function endOfDateOnlyMonth(month: DateOnly) {
  return addDateOnlyDays(addDateOnlyMonths(startOfDateOnlyMonth(month), 1), -1)
}

function dateOnlyForMonthKey(value: string | null, fallback: DateOnly) {
  const candidate = value && MONTH_QUERY_PATTERN.test(value) ? `${value}-01` : ''
  return isDateOnly(candidate) ? candidate : fallback
}

function periodValueForMode(
  mode: DashboardPeriodMode,
  month: DateOnly,
  from: DateOnly,
  to: DateOnly,
  today = todayDateOnly(),
): DashboardPeriodValue {
  const currentMonth = startOfDateOnlyMonth(today)
  switch (mode) {
    case 'last-month': {
      const lastMonth = addDateOnlyMonths(currentMonth, -1)
      return { mode, month: lastMonth, from: lastMonth, to: endOfDateOnlyMonth(lastMonth) }
    }
    case 'custom-month': {
      const selectedMonth = startOfDateOnlyMonth(month)
      return { mode, month: selectedMonth, from: selectedMonth, to: endOfDateOnlyMonth(selectedMonth) }
    }
    case 'custom-range': {
      const safeFrom = isDateOnly(from) ? from : currentMonth
      const safeTo = isDateOnly(to) && to >= safeFrom ? to : endOfDateOnlyMonth(currentMonth)
      return {
        mode,
        month: startOfDateOnlyMonth(safeFrom),
        from: safeFrom,
        to: safeTo,
      }
    }
    case 'this-week': {
      const mondayOffset = (new Date(`${today}T12:00:00.000Z`).getUTCDay() + 6) % 7
      const weekStart = addDateOnlyDays(today, -mondayOffset)
      return { mode, month: startOfDateOnlyMonth(weekStart), from: weekStart, to: addDateOnlyDays(weekStart, 6) }
    }
    case 'last-7-days':
      return { mode, month: startOfDateOnlyMonth(addDateOnlyDays(today, -6)), from: addDateOnlyDays(today, -6), to: today }
    case 'this-year': {
      const yearStart = `${today.slice(0, 4)}-01-01` as DateOnly
      return { mode, month: yearStart, from: yearStart, to: `${today.slice(0, 4)}-12-31` as DateOnly }
    }
    case 'all-time':
      // The date-only values remain display fallbacks; the API request uses
      // allTime=true so earlier and future-declared records are not clipped.
      return { mode, month: startOfDateOnlyMonth(today), from: '1970-01-01', to: today }
    case 'this-month':
    default:
      return { mode: 'this-month', month: currentMonth, from: currentMonth, to: endOfDateOnlyMonth(currentMonth) }
  }
}

export function dashboardPeriodFromSearchParams(searchParams: URLSearchParams, today = todayDateOnly()) {
  const currentMonth = startOfDateOnlyMonth(today)
  const month = dateOnlyForMonthKey(searchParams.get('month'), currentMonth)
  const from = validDateKey(searchParams.get('from')) as DateOnly | null
  const to = validDateKey(searchParams.get('to')) as DateOnly | null
  const rawMode = searchParams.get('period') as DashboardPeriodMode | null
  const allTimeRequested = searchParams.get('allTime') === 'true' || searchParams.get('allTime') === '1'
  const mode: DashboardPeriodMode = rawMode === 'this-month' || rawMode === 'last-month' || rawMode === 'custom-month' || rawMode === 'custom-range' || rawMode === 'this-week' || rawMode === 'last-7-days' || rawMode === 'this-year' || rawMode === 'all-time'
    ? rawMode
    : allTimeRequested
      ? 'all-time'
      : from && to
      ? 'custom-range'
      : searchParams.get('month')
        ? 'custom-month'
        : 'this-month'
  return periodValueForMode(mode, month, from ?? currentMonth, to ?? endOfDateOnlyMonth(currentMonth), today)
}

function dashboardPeriodPath(period: DashboardPeriodValue) {
  const query = new URLSearchParams()
  if (period.mode === 'all-time') {
    query.set('allTime', 'true')
  } else if (period.mode === 'this-month' || period.mode === 'last-month' || period.mode === 'custom-month') {
    query.set('month', period.month.slice(0, 7))
  } else {
    query.set('from', period.from)
    query.set('to', period.to)
  }
  return `/dashboard?${query.toString()}`
}

function dashboardDrilldownPath(period: DashboardPeriodValue, field: 'category' | 'type' | 'accountId' | 'contactId' | 'merchant', value: string) {
  const query = period.mode === 'all-time'
    ? new URLSearchParams({ allTime: 'true' })
    : new URLSearchParams({ from: period.from, to: period.to })
  query.set(field, value)
  return `/app/transactions?${query.toString()}`
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T12:00:00.000Z`))
}

const CASHFLOW_DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/

function cashflowDayRange(period: string | null) {
  if (!period || !CASHFLOW_DAY_PATTERN.test(period) || !isDateOnly(period)) return null
  const nextDay = addDateOnlyDays(period, 1)
  return {
    period,
    from: `${period}T00:00:00.000Z`,
    to: `${nextDay}T00:00:00.000Z`,
  }
}

function transactionApiDateRange(from: string, to: string) {
  const toExclusive = isDateOnly(to)
    ? `${addDateOnlyDays(to, 1)}T00:00:00.000Z`
    : `${to}T23:59:59.999Z`
  return {
    from: `${from}T00:00:00.000Z`,
    to: toExclusive,
  }
}

function cashflowTransactionPath(
  range: ReturnType<typeof cashflowDayRange>,
  limit = 12,
) {
  if (!range) return '/transactions?limit=12'
  return `/transactions?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&limit=${limit}`
}

function transactionDay(transaction: Transaction) {
  const occurredAt = new Date(transaction.occurredAt)
  if (Number.isNaN(occurredAt.getTime())) return ''
  return `${occurredAt.getUTCFullYear()}-${String(occurredAt.getUTCMonth() + 1).padStart(2, '0')}-${String(occurredAt.getUTCDate()).padStart(2, '0')}`
}

function demoTransactionsForCashflowDay(period: string | null) {
  return period
    ? demoTransactions.filter((transaction) => transactionDay(transaction) === period)
    : []
}

function CashflowDetailContent({
  point,
  currency,
  transactions,
  isLoading,
  isError,
  headingId,
  headingLabel,
}: {
  point: DashboardCashflowPoint
  currency: string
  transactions: Transaction[]
  isLoading: boolean
  isError: boolean
  headingId?: string
  headingLabel?: string
}) {
  const transactionHeadingId = `cashflow-transactions-${point.period}`
  const transferMinor = transactions.reduce(
    (total, transaction) =>
      transaction.rawType === 'transfer'
        ? total + transaction.amount.amountMinor
        : total,
    0,
  )
  return (
    <div className="cashflow-detail-content">
      {headingId ? <h3 id={headingId}>{headingLabel ?? `Cashflow for ${point.period}`}</h3> : null}
      <p className="cashflow-detail-date">{formatDate(`${point.period}T12:00:00.000Z`)}</p>
      <dl className="cashflow-detail-metrics">
        <div>
          <dt>Income</dt>
          <dd>
            <MoneyText
              money={{
                amountMinor: point.incomeMinor,
                currency: point.currency ?? currency,
              }}
            />
          </dd>
        </div>
        <div>
          <dt>Spending</dt>
          <dd>
            <MoneyText
              money={{
                amountMinor: point.spendingMinor,
                currency: point.currency ?? currency,
              }}
            />
          </dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd>
            <MoneyText
              money={{
                amountMinor: point.netMinor,
                currency: point.currency ?? currency,
              }}
            />
          </dd>
        </div>
        <div>
          <dt>Transfers</dt>
          <dd>
            <MoneyText money={{ amountMinor: transferMinor, currency }} />
          </dd>
        </div>
      </dl>
      <section
        className="cashflow-detail-transactions"
        aria-labelledby={transactionHeadingId}
      >
        <h4 id={transactionHeadingId}>Transactions</h4>
        {isLoading ? (
          <p role="status">Loading transactions for this day…</p>
        ) : isError ? (
          <p role="alert">Transactions for this day could not be loaded.</p>
        ) : transactions.length ? (
          <ul aria-label={`Transactions on ${point.period}`}>
            {transactions.map((transaction) => (
              <li key={transaction.id}>
                <div>
                  <strong>{transaction.merchant}</strong>
                  <span>
                    {friendlyLabel(transaction.rawType ?? transaction.direction)} ·{' '}
                    {transaction.category} ·{' '}
                    {transaction.creator?.name ?? 'Creator unavailable'}
                  </span>
                </div>
                <MoneyText
                  money={transaction.amount}
                  signed={transaction.rawType === 'transfer' ? undefined : transaction.direction}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p>No accessible transactions were recorded on this day.</p>
        )}
        <Link
          className="cashflow-detail-link"
          to={`/app/transactions?date=${encodeURIComponent(point.period)}`}
        >
          View all entries for {point.period}
        </Link>
      </section>
    </div>
  )
}

export function HomePage() {
  const { demoMode, userName, workspace } = useApp()
  const queryClient = useQueryClient()
  const reduce = useReducedMotion()
  const mobile = useMediaQuery('(max-width: 680px)')
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const [selectedCashflowPeriod, setSelectedCashflowPeriod] = useState<string | null>(null)
  const [selectedDailyPeriod, setSelectedDailyPeriod] = useState<string | null>(null)
  const [selectedRecentTransaction, setSelectedRecentTransaction] = useState<Transaction | null>(null)
  const [editingRecentTransaction, setEditingRecentTransaction] = useState<Transaction | null>(null)
  const [balancePeriod, setBalancePeriod] = useState<'year' | 'month'>('month')
  const today = todayDateOnly()
  const period = dashboardPeriodFromSearchParams(searchParams, today)
  const selectedMonth = period.month.slice(0, 7)
  const currentYear = Number(today.slice(0, 4))
  const currentYearPeriod = periodValueForMode('this-year', period.month, period.from, period.to, today)
  const selectedCashflowRange = cashflowDayRange(selectedCashflowPeriod)
  const selectedDailyRange = cashflowDayRange(selectedDailyPeriod)
  const accountQuery = useFinanceData<Account[]>('accounts', '/accounts', demoAccounts)
  const transactionQuery = useFinanceData<Transaction[]>(
    'transactions',
    '/transactions',
    demoTransactions,
    demoMode,
  )
  const budgetQuery = useFinanceData<Budget[]>('budgets', '/budgets', demoBudgets)
  const dashboardQuery = useFinanceData<Dashboard>(
    'dashboard',
    dashboardPeriodPath(period),
    demoDashboard,
  )
  const monthDashboardQuery = useFinanceData<Dashboard>(
    'dashboard',
    `/dashboard?month=${encodeURIComponent(selectedMonth)}`,
    demoDashboard,
  )
  const yearDashboardQuery = useFinanceData<Dashboard>(
    'dashboard',
    dashboardPeriodPath(currentYearPeriod),
    demoDashboard,
  )
  const cashflowTransactionsQuery = useFinanceData<Transaction[]>(
    'transactions',
    cashflowTransactionPath(selectedCashflowRange),
    demoTransactionsForCashflowDay(selectedCashflowPeriod),
    Boolean(selectedCashflowRange),
  )
  const dailyTransactionsQuery = useFinanceData<Transaction[]>(
    'transactions',
    cashflowTransactionPath(selectedDailyRange),
    demoTransactionsForCashflowDay(selectedDailyPeriod),
    Boolean(selectedDailyRange),
  )
  const recent = useDemoSessionCollection(
    demoMode,
    workspace.id,
    'transactions',
    demoMode
      ? transactionQuery.data ?? []
      : dashboardQuery.data?.recentTransactions ?? [],
  )
  const navigate = useNavigate()

  const updatePeriod = (change: Partial<DashboardPeriodValue> & { mode: DashboardPeriodMode }) => {
    const next = periodValueForMode(
      change.mode,
      change.month ?? period.month,
      change.from ?? period.from,
      change.to ?? period.to,
      today,
    )
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('month')
    nextSearchParams.delete('from')
    nextSearchParams.delete('to')
    nextSearchParams.delete('allTime')
    nextSearchParams.set('period', next.mode)
    if (next.mode === 'all-time') {
      nextSearchParams.set('allTime', 'true')
    } else if (next.mode === 'this-month' || next.mode === 'last-month' || next.mode === 'custom-month') {
      nextSearchParams.set('month', next.month.slice(0, 7))
    } else {
      nextSearchParams.set('from', next.from)
      nextSearchParams.set('to', next.to)
      nextSearchParams.set('month', next.month.slice(0, 7))
    }
    navigate(
      {
        pathname: location.pathname,
        search: `?${nextSearchParams.toString()}`,
        hash: location.hash,
      },
      { replace: true, state: location.state },
    )
  }

  const clearPeriod = () => {
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('period')
    nextSearchParams.delete('month')
    nextSearchParams.delete('from')
    nextSearchParams.delete('to')
    nextSearchParams.delete('allTime')
    navigate(
      {
        pathname: location.pathname,
        search: nextSearchParams.toString() ? `?${nextSearchParams.toString()}` : '',
        hash: location.hash,
      },
      { replace: true, state: location.state },
    )
  }

  useEffect(() => {
    if (
      selectedCashflowPeriod &&
      !selectedCashflowPeriod.startsWith(`${selectedMonth}-`)
    ) {
      setSelectedCashflowPeriod(null)
    }
  }, [selectedCashflowPeriod, selectedMonth])

  useEffect(() => {
    if (!selectedCashflowPeriod || mobile) return

    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Element &&
        (target.closest('[data-cashflow-detail]') ||
          target.closest('[data-cashflow-bar]'))
      ) {
        return
      }
      setSelectedCashflowPeriod(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedCashflowPeriod(null)
    }

    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobile, selectedCashflowPeriod])

  useEffect(() => {
    if (!selectedDailyPeriod || mobile) return
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Element &&
        (target.closest('[data-daily-detail]') || target.closest('[data-daily-bar]'))
      ) {
        return
      }
      setSelectedDailyPeriod(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedDailyPeriod(null)
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobile, selectedDailyPeriod])

  if (
    accountQuery.isLoading ||
    (demoMode && transactionQuery.isLoading) ||
    budgetQuery.isLoading ||
    dashboardQuery.isLoading ||
    monthDashboardQuery.isLoading ||
    yearDashboardQuery.isLoading
  ) {
    return (
      <PageFrame>
        <PageHeader
          eyebrow={workspace.name}
          title={`Good morning, ${userName.split(' ')[0]}`}
          description="Loading the money that needs your attention."
        />
        <DataSkeleton />
      </PageFrame>
    )
  }
  if (
    accountQuery.isError ||
    (demoMode && transactionQuery.isError) ||
    budgetQuery.isError ||
    dashboardQuery.isError ||
    monthDashboardQuery.isError ||
    yearDashboardQuery.isError
  ) {
    const unavailable = [
      accountQuery.isError ? 'accounts' : '',
      demoMode && transactionQuery.isError ? 'transactions' : '',
      budgetQuery.isError ? 'budgets' : '',
      dashboardQuery.isError ? 'analytics' : '',
      monthDashboardQuery.isError ? 'month summary' : '',
      yearDashboardQuery.isError ? 'year summary' : '',
    ].filter(Boolean)
    return (
      <PageFrame>
        <PageHeader
          eyebrow={workspace.name}
          title={`Good morning, ${userName.split(' ')[0]}`}
          description="The dashboard needs another moment."
        />
        <ErrorState
          message={`Dashboard data is unavailable right now: ${unavailable.join(', ')}.`}
          retry={() => {
            void Promise.all([
              accountQuery.refetch(),
              ...(demoMode ? [transactionQuery.refetch()] : []),
              budgetQuery.refetch(),
              dashboardQuery.refetch(),
              monthDashboardQuery.refetch(),
              yearDashboardQuery.refetch(),
            ])
          }}
        />
      </PageFrame>
    )
  }

  const activeAccounts = accountQuery.data ?? []
  const activeBudgets = budgetQuery.data ?? []
  const dashboard = dashboardQuery.data ?? demoDashboard
  const monthDashboard = monthDashboardQuery.data ?? demoDashboard
  const yearDashboard = yearDashboardQuery.data ?? demoDashboard
  const balanceDashboard = balancePeriod === 'year' ? yearDashboard : monthDashboard
  const accountTotals = Array.from(
    activeAccounts
      .reduce((totals, account) => {
        totals.set(
          account.balance.currency,
          (totals.get(account.balance.currency) ?? 0) +
            account.balance.amountMinor,
        )
        return totals
      }, new Map<string, number>())
      .entries(),
    ([currency, amountMinor]) => ({ currency, amountMinor }),
  )
  const canCreateTransactions = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'create_transactions',
  )
  const canShareTransactions = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'export_data',
  )
  const deleteRecentTransaction = async () => {
    if (!selectedRecentTransaction) return
    if (demoMode) {
      removeDemoSessionItem(workspace.id, 'transactions', selectedRecentTransaction.id)
      return
    }
    await api.delete<void>(
      `/workspaces/${workspace.id}/transactions/${selectedRecentTransaction.id}`,
    )
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transactions', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['accounts', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['vaults', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['budgets', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['insights', workspace.id] }),
      invalidatePeriodReviewQueries(queryClient, workspace.id),
    ])
  }
  const selectedMonthLabel = monthLabel(selectedMonth)
  const selectedPeriodLabel = period.mode === 'all-time'
    ? 'All time'
    : period.mode === 'this-month' || period.mode === 'last-month' || period.mode === 'custom-month'
    ? selectedMonthLabel
    : `${formatDate(`${period.from}T12:00:00.000Z`)} – ${formatDate(`${period.to}T12:00:00.000Z`)}`
  const balancePeriodLabel = balancePeriod === 'year'
    ? `Current year · ${currentYear}`
    : `Selected month · ${selectedMonthLabel}`
  const balanceBarMaximum = Math.max(
    balanceDashboard.incomeMinor,
    balanceDashboard.spendingMinor,
    1,
  )
  const topCategory = dashboard.topCategories[0]
  const cashflowPoints = dashboard.cashflow
  const cashflowMaximum = Math.max(
    ...cashflowPoints.map((point) =>
      Math.max(Math.abs(point.incomeMinor), Math.abs(point.spendingMinor)),
    ),
    1,
  )
  const cashflowBars = cashflowPoints.map((point) =>
    Math.max(
      12,
      Math.round(
        (Math.max(Math.abs(point.incomeMinor), Math.abs(point.spendingMinor)) /
          cashflowMaximum) *
          100,
      ),
    ),
  )
  const topCategoryMaximum = Math.max(
    ...dashboard.topCategories.map((category) => category.amountMinor),
    1,
  )
  const selectedCashflowPoint =
    cashflowPoints.find((point) => point.period === selectedCashflowPeriod) ??
    null
  const [monthYearValue, monthNumberValue] = selectedMonth.split('-').map(Number)
  const daysInSelectedMonth = new Date(
    Date.UTC(monthYearValue, monthNumberValue, 0),
  ).getUTCDate()
  const monthCashflowByPeriod = new Map(
    monthDashboard.cashflow.map((point) => [point.period, point]),
  )
  const dailyMonthPoints = Array.from({ length: daysInSelectedMonth }, (_, index) => {
    const day = index + 1
    const period = `${selectedMonth}-${String(day).padStart(2, '0')}`
    return monthCashflowByPeriod.get(period) ?? {
      period,
      incomeMinor: 0,
      spendingMinor: 0,
      netMinor: 0,
      currency: monthDashboard.currency,
    }
  })
  const dailyMonthMaximum = Math.max(
    ...dailyMonthPoints.map((point) => point.incomeMinor + point.spendingMinor),
    1,
  )
  const selectedDailyPoint = dailyMonthPoints.find(
    (point) => point.period === selectedDailyPeriod,
  ) ?? null

  if (!activeAccounts.length) {
    return (
      <PageFrame>
        <PageHeader
          eyebrow={workspace.name}
          title={`Good morning, ${userName.split(' ')[0]}`}
          description="Add an account before recording money in this workspace."
        />
        <PeriodSelector
          value={period}
          onChange={updatePeriod}
          onClear={clearPeriod}
        />
        <PeriodReviewCard
          workspace={workspace}
          demoMode={demoMode}
          period={period}
        />
        <EmptyState
          icon={<WalletCards />}
          title="No accounts yet"
          message="Once an account is available, Ledgerly can show balances, activity, and budget pace here."
        />
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <PageHeader
        eyebrow={workspace.name}
        title={`Good morning, ${userName.split(' ')[0]}`}
        description="Here is the money that needs your attention."
        actions={
          canCreateTransactions ? (
          <Button onClick={() => navigate('/app/transactions?add=1')}>
            <Plus aria-hidden="true" />
            Add transaction
          </Button>
          ) : undefined
        }
      />
      <PeriodSelector
        value={period}
        onChange={updatePeriod}
        onClear={clearPeriod}
      />
      <PeriodReviewCard
        workspace={workspace}
        demoMode={demoMode}
        period={period}
      />
      {!canCreateTransactions ? (
        <InfoNotice>
          Your workspace role can view money activity but cannot create
          transactions.
        </InfoNotice>
      ) : null}
      <section className="balance-hero" aria-label="Account balance overview">
        <div className="balance-summary">
          <div className="balance-heading-row">
            <div className="balance-total">
              <span>
                {accountTotals.length > 1
                  ? 'Available by currency'
                  : 'Available across accounts'}
              </span>
              <div className="balance-amount-row">
                {accountTotals.length === 1 ? (
                  <MoneyText money={accountTotals[0]} />
                ) : (
                  <div className="balance-currency-list">
                    {accountTotals.map((total) => (
                      <MoneyText key={total.currency} money={total} />
                    ))}
                  </div>
                )}
                <Select
                  value={balancePeriod}
                  onValueChange={(value) => setBalancePeriod(value as 'year' | 'month')}
                  className="balance-period-select"
                >
                  <SelectTrigger
                    className="balance-period-trigger"
                    aria-label="Balance summary period"
                  >
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent className="balance-period-menu">
                    <SelectItem value="year">Year</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <small>
            {demoMode ? (
              <>
                <TrendingUp aria-hidden="true" />
                Income is ahead of spending this month
              </>
            ) : (
              <>
                <ShieldCheck aria-hidden="true" />
                Balances reflect the latest available account data
              </>
            )}
          </small>
          <div className="balance-cashflow-summary">
            <div className="balance-period-label">{balancePeriodLabel}</div>
            <div className="balance-metrics">
              <div>
                <span>Income</span>
                <MoneyText money={{ amountMinor: balanceDashboard.incomeMinor, currency: balanceDashboard.currency }} />
              </div>
              <div>
                <span>Expenses</span>
                <MoneyText money={{ amountMinor: balanceDashboard.spendingMinor, currency: balanceDashboard.currency }} />
              </div>
              <div>
                <span>Net movement</span>
                <MoneyText money={{ amountMinor: balanceDashboard.incomeMinor - balanceDashboard.spendingMinor, currency: balanceDashboard.currency }} />
              </div>
            </div>
            <div
              className="balance-comparison"
              role="img"
              aria-label={`${balancePeriodLabel}: income ${formatMoney({ amountMinor: balanceDashboard.incomeMinor, currency: balanceDashboard.currency })}; expenses ${formatMoney({ amountMinor: balanceDashboard.spendingMinor, currency: balanceDashboard.currency })}`}
            >
              {([
                ['Income', balanceDashboard.incomeMinor, 'income'],
                ['Expenses', balanceDashboard.spendingMinor, 'expense'],
              ] as const).map(([label, value, tone], index) => (
                <div className={`balance-comparison-row balance-comparison-${tone}`} key={`${balancePeriod}-${label}-${value}`}>
                  <span>{label}</span>
                  <div aria-hidden="true">
                    <motion.i
                      initial={reduce ? false : { scaleX: 0 }}
                      animate={{ scaleX: Math.max(value > 0 ? 0.025 : 0, value / balanceBarMaximum) }}
                      transition={{
                        duration: reduce ? 0 : 0.65,
                        delay: reduce ? 0 : index * 0.08,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="dashboard-kpi-grid" aria-label={`${selectedPeriodLabel} financial summary`}>
        <article className="dashboard-kpi-card dashboard-kpi-primary">
          <span>Income</span>
          <strong><MoneyText money={{ amountMinor: dashboard.incomeMinor, currency: dashboard.currency }} /></strong>
          <small>{comparisonText(dashboard.previousComparison?.income, dashboard.currency)}</small>
        </article>
        <article className="dashboard-kpi-card dashboard-kpi-primary">
          <span>Expenses</span>
          <strong><MoneyText money={{ amountMinor: dashboard.spendingMinor, currency: dashboard.currency }} /></strong>
          <small>{comparisonText(dashboard.previousComparison?.expenses, dashboard.currency)}</small>
        </article>
        <article className="dashboard-kpi-card dashboard-kpi-net">
          <span>Net cash flow</span>
          <strong><MoneyText money={{ amountMinor: dashboard.incomeMinor - dashboard.spendingMinor, currency: dashboard.currency }} /></strong>
          <small>{comparisonText(dashboard.previousComparison?.net, dashboard.currency)}</small>
        </article>
        <article className="dashboard-kpi-card">
          <span>Transactions</span>
          <strong>{dashboard.transactionCount}</strong>
          <small>{comparisonText(dashboard.previousComparison?.transactionCount, dashboard.currency)}</small>
        </article>
        <article className="dashboard-kpi-card">
          <span>Average value</span>
          <strong><MoneyText money={{ amountMinor: dashboard.averageValueMinor, currency: dashboard.currency }} /></strong>
          <small>{comparisonText(dashboard.previousComparison?.averageValue, dashboard.currency)}</small>
        </article>
        <article className="dashboard-kpi-card">
          <span>Highest income</span>
          <strong><MoneyText money={{ amountMinor: dashboard.highestIncomeMinor, currency: dashboard.currency }} /></strong>
          <small>Largest received entry</small>
        </article>
        <article className="dashboard-kpi-card">
          <span>Highest expense</span>
          <strong><MoneyText money={{ amountMinor: dashboard.highestExpenseMinor, currency: dashboard.currency }} /></strong>
          <small>Largest paid entry</small>
        </article>
        <article className="dashboard-kpi-card">
          <span>Amount received</span>
          <strong><MoneyText money={{ amountMinor: dashboard.amountReceivedMinor, currency: dashboard.currency }} /></strong>
          <small>Actual income only</small>
        </article>
        <article className="dashboard-kpi-card">
          <span>Amount paid</span>
          <strong><MoneyText money={{ amountMinor: dashboard.amountPaidMinor, currency: dashboard.currency }} /></strong>
          <small>Actual expenses only</small>
        </article>
        <article className="dashboard-kpi-card dashboard-kpi-goal">
          <span>Pending goals</span>
          <strong><MoneyText money={{ amountMinor: dashboard.pendingGoalMinor, currency: dashboard.currency }} /></strong>
          <small>Planned commitments left</small>
        </article>
        <article className="dashboard-kpi-card dashboard-kpi-goal">
          <span>Achieved goals</span>
          <strong><MoneyText money={{ amountMinor: dashboard.achievedGoalMinor, currency: dashboard.currency }} /></strong>
          <small>Completed commitments</small>
        </article>
      </section>
      <div className="home-grid analytics-grid dashboard-attention-grid">
        <Section className="home-dashboard-card dashboard-goals-card" aria-labelledby="dashboard-goals-heading">
          <div className="section-heading-row">
            <div>
              <span className="monthly-summary-kicker">Planned commitments · {selectedPeriodLabel}</span>
              <h2 id="dashboard-goals-heading">Upcoming and overdue goals</h2>
              <p>Planned goals stay separate from actual income and expenses.</p>
            </div>
            <Link to="/app/goals">View goals</Link>
          </div>
          <div className="goal-summary-grid" aria-label={`${selectedPeriodLabel} goal summary`}>
            <div><span>Active</span><strong>{dashboard.goalSummary.activeCount}</strong></div>
            <div><span>Expected income</span><strong><MoneyText money={{ amountMinor: dashboard.goalSummary.expectedIncomeMinor, currency: dashboard.currency }} /></strong></div>
            <div><span>Expected payments</span><strong><MoneyText money={{ amountMinor: dashboard.goalSummary.expectedPaymentsMinor, currency: dashboard.currency }} /></strong></div>
            <div><span>Savings targets</span><strong><MoneyText money={{ amountMinor: dashboard.goalSummary.savingsTargetMinor, currency: dashboard.currency }} /></strong></div>
            <div><span>Due soon</span><strong>{dashboard.goalSummary.dueSoonCount + dashboard.goalSummary.dueTodayCount}</strong></div>
            <div><span>Overdue</span><strong>{dashboard.goalSummary.overdueCount}</strong></div>
            <div><span>Achieved</span><strong>{dashboard.goalSummary.achievedCount}</strong></div>
            <div><span>Completion</span><strong>{dashboard.goalSummary.completionPercent == null ? '—' : `${dashboard.goalSummary.completionPercent.toFixed(0)}%`}</strong></div>
          </div>
          <p className="dashboard-planned-note">
            All active goals: {dashboard.allActiveGoals.activeCount} · remaining{' '}
            <MoneyText money={{ amountMinor: dashboard.allActiveGoals.pendingMinor, currency: dashboard.currency }} />
          </p>
          {dashboard.goalHighlights.length ? (
            <div className="analytics-list dashboard-goal-list">
              {dashboard.goalHighlights.slice(0, 6).map((goal) => (
                <Link className="analytics-row analytics-row-link" key={goal.id} to={`/app/goals?goal=${encodeURIComponent(goal.id)}`}>
                  <div className="analytics-row-heading">
                    <strong>{goal.name}</strong>
                    <span>{goalStatusLabel(goal)} · {goalDirectionLabel(goal)}{goal.dueDate ? ` · ${formatDate(goal.dueDate)}` : ''}</span>
                  </div>
                  <span className="analytics-money-pair">
                    <span>Remaining <MoneyText money={{ amountMinor: goal.remainingMinor, currency: goal.currency }} /></span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={<PiggyBank />} title="No goals need attention" message="Create a goal to track a planned commitment without changing actual cashflow." />
          )}
        </Section>
        <Section className="home-dashboard-card dashboard-insights-card" aria-labelledby="dashboard-insights-heading">
          <div className="section-heading-row">
            <div>
              <span className="monthly-summary-kicker">Facts from actual data</span>
              <h2 id="dashboard-insights-heading">Useful insights</h2>
              <p>Deterministic observations for {selectedPeriodLabel.toLowerCase()}.</p>
            </div>
          </div>
          {dashboard.insights.length ? (
            <div className="analytics-list">
              {dashboard.insights.map((insight) => (
                <div className="analytics-row" key={`${insight.kind}-${insight.title}`}>
                  <div className="analytics-row-heading">
                    <strong>{insight.title}</strong>
                    <span>{insight.detail}</span>
                  </div>
                  {insight.metricMinor != null ? <MoneyText money={{ amountMinor: insight.metricMinor, currency: insight.currency ?? dashboard.currency }} /> : insight.percent != null ? <strong>{insight.percent.toFixed(0)}%</strong> : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<TrendingUp />} title="No additional insight yet" message="Insights appear when the selected period has enough factual activity to compare." />
          )}
        </Section>
      </div>
      <Section className="dashboard-cashflow-chart dashboard-charts-tail home-dashboard-card">
        <div className="section-heading-row">
          <div>
            <span className="monthly-summary-kicker">{selectedPeriodLabel}</span>
            <h2>Income versus spending</h2>
            <p>Daily movement and the transactions behind every bar.</p>
          </div>
        </div>
        <div className="income-spending-comparison" role="img" aria-label={`Income ${formatMoney({ amountMinor: dashboard.incomeMinor, currency: dashboard.currency })}; spending ${formatMoney({ amountMinor: dashboard.spendingMinor, currency: dashboard.currency })}`}>
          {([
            ['Income', dashboard.incomeMinor, 'income'],
            ['Spending', dashboard.spendingMinor, 'spending'],
          ] as const).map(([label, amountMinor, tone]) => {
            const maximum = Math.max(dashboard.incomeMinor, dashboard.spendingMinor, 1)
            return (
              <div key={label} className={`comparison-bar comparison-bar-${tone}`}>
                <div>
                  <span>{label}</span>
                  <MoneyText money={{ amountMinor, currency: dashboard.currency }} />
                </div>
                <span aria-hidden="true">
                  <motion.i
                    key={`${label}-${amountMinor}-${maximum}`}
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{
                      scaleX: Math.max(0.04, amountMinor / maximum),
                    }}
                    transition={{
                      duration: reduce ? 0 : 0.6,
                      delay: reduce ? 0 : tone === 'spending' ? 0.08 : 0,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  />
                </span>
              </div>
            )
          })}
          <div className="comparison-insights">
            <span>Net <MoneyText money={{ amountMinor: dashboard.incomeMinor - dashboard.spendingMinor, currency: dashboard.currency }} /></span>
            <span>Top category <strong>{topCategory?.name ?? 'No category yet'}</strong></span>
          </div>
        </div>
        <div
          className="cashflow-figure"
          role="group"
          aria-label={
            cashflowPoints.length
              ? `Daily cashflow for ${selectedPeriodLabel}. Select a bar for its transactions.`
              : 'No cashflow data is available for this workspace yet.'
          }
        >
          {cashflowBars.length ? (
            <div className="cashflow-bars">
              {cashflowBars.map((height, index) => {
                const point = cashflowPoints[index]
                const selected = point?.period === selectedCashflowPeriod
                const detailId = point
                  ? `cashflow-detail-${point.period}`
                  : undefined
                return (
                  <div
                    className="cashflow-bar-wrap"
                    key={point?.period ?? index}
                  >
                    <button
                      type="button"
                      className="cashflow-bar"
                      data-cashflow-bar=""
                      aria-label={`View cashflow details for ${point?.period ?? 'this day'}`}
                      aria-expanded={selected}
                      aria-controls={selected ? detailId : undefined}
                      onClick={() =>
                        setSelectedCashflowPeriod((current) =>
                          current === point?.period ? null : point?.period ?? null,
                        )
                      }
                    >
                      <motion.span
                        key={`${point?.period ?? index}-${height}`}
                        aria-hidden="true"
                        className="cashflow-bar-fill"
                        initial={reduce ? false : { scaleY: 0, opacity: 0 }}
                        animate={{ scaleY: 1, opacity: 1 }}
                        transition={{
                          duration: reduce ? 0 : 0.42,
                          delay: reduce ? 0 : Math.min(index * 0.045, 0.2),
                          ease: [0.16, 1, 0.3, 1],
                        }}
                        style={{
                          height: `${height}%`,
                          transformOrigin: 'bottom',
                        }}
                      />
                    </button>
                    {selected && point && !mobile ? (
                      <div
                        className="cashflow-detail-popover"
                        data-cashflow-detail=""
                        id={detailId}
                        role="dialog"
                        aria-labelledby={`${detailId}-title`}
                      >
                        <CashflowDetailContent
                          point={point}
                          currency={dashboard.currency}
                          transactions={cashflowTransactionsQuery.data ?? []}
                          isLoading={cashflowTransactionsQuery.isLoading}
                          isError={cashflowTransactionsQuery.isError}
                          headingId={`${detailId}-title`}
                        />
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="cashflow-empty-state">
              <div
                className="cashflow-empty-bars"
                aria-hidden="true"
              >
                {[24, 38, 30, 52, 34, 44, 28].map((height, index) => (
                  <span
                    key={index}
                    data-testid="cashflow-empty-bar"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
              <span className="cashflow-empty">No recorded cashflow yet</span>
            </div>
          )}
          <div className="cashflow-caption">
            <span>{cashflowPoints[0]?.period ?? 'No activity'}</span>
            <span>{cashflowPoints.at(-1)?.period ?? 'Add an entry'}</span>
          </div>
        </div>
      </Section>
      {mobile && selectedCashflowPoint ? (
        <BottomSheet
          open
          onOpenChange={(open) => {
            if (!open) setSelectedCashflowPeriod(null)
          }}
          snapPoints={['auto', 0.86]}
          title={`Cashflow for ${selectedCashflowPoint.period}`}
          description="Daily income, spending, and accessible transactions."
          className="app-bottom-sheet cashflow-detail-sheet"
        >
          <CashflowDetailContent
            point={selectedCashflowPoint}
            currency={dashboard.currency}
            transactions={cashflowTransactionsQuery.data ?? []}
            isLoading={cashflowTransactionsQuery.isLoading}
            isError={cashflowTransactionsQuery.isError}
          />
        </BottomSheet>
      ) : null}
      {canCreateTransactions ? (
        <div className="quick-actions" aria-label="Quick actions">
          {[
            [ArrowDownLeft, 'Add income', '/app/transactions?add=income'],
            [ReceiptText, 'Add expense', '/app/transactions?add=expense'],
            [BanknoteArrowUp, 'Transfer', '/app/transactions?add=transfer'],
            [Split, 'Split expense', '/app/transactions?add=split'],
          ].map(([Icon, label, to], index) => (
            <MotionListItem key={String(label)} index={index}>
              <MotionLink
                to={String(to)}
                whileTap={reduce ? undefined : { scale: 0.97 }}
                transition={reduce ? { duration: 0 } : SPRING_PRESS}
              >
                <span>
                  <Icon aria-hidden="true" />
                </span>
                {String(label)}
              </MotionLink>
            </MotionListItem>
          ))}
        </div>
      ) : null}
      <div className="home-grid">
        <Section className="span-two">
          <div className="section-heading-row">
            <div>
              <h2>Recent activity</h2>
              <p>Latest changes across this workspace</p>
            </div>
            <Link to="/app/transactions">View all</Link>
          </div>
          <div className="row-list">
            {recent.length ? (
              recent.slice(0, 4).map((transaction, index) => (
                <MotionListItem key={transaction.id} index={index}>
                 <ListRow
                    onClick={() => setSelectedRecentTransaction(transaction)}
                    leading={<CreatorAvatar creator={transaction.creator} />}
                    title={transaction.merchant}
                    subtitle={transactionSubtitle(transaction)}
                    trailing={
                      <div
                        className={`transaction-amount transaction-amount-${transaction.direction}`}
                      >
                        <MoneyText
                          money={transaction.amount}
                          signed={transaction.direction}
                        />
                        {transaction.status === 'pending' ? (
                          <Badge tone="warning">Pending</Badge>
                        ) : null}
                      </div>
                    }
                  />
                </MotionListItem>
              ))
            ) : (
              <EmptyState
                icon={<ReceiptText />}
                title="No recent activity"
                message="New income, expenses, transfers, and splits will appear here."
              />
            )}
          </div>
        </Section>
        <Section className="budget-peek">
          <div className="section-heading-row">
            <div>
              <h2>Budget pace</h2>
              <p>{activeBudgets[0]?.period ?? 'This month'}</p>
            </div>
            <Link to="/app/budgets">Details</Link>
          </div>
          <div className="budget-stack">
            {activeBudgets.length ? (
              activeBudgets.map((budget, index) => {
                const percentage = budget.limit.amountMinor
                  ? (budget.spent.amountMinor / budget.limit.amountMinor) * 100
                  : 0
                return (
                  <MotionListItem key={budget.id} index={index}>
                    <div>
                      <div className="budget-title-row">
                        <strong>{budget.name}</strong>
                        <span>
                          <MoneyText money={budget.spent} /> of{' '}
                          <MoneyText money={budget.limit} />
                        </span>
                      </div>
                      <Progress
                        value={percentage}
                        label={`${budget.name} used`}
                        tone={percentage >= 85 ? 'warning' : 'accent'}
                      />
                    </div>
                  </MotionListItem>
                )
              })
            ) : (
              <EmptyState
                icon={<PiggyBank />}
                title="No budgets yet"
                message="Budgets will appear here once one is available for this workspace."
              />
            )}
          </div>
        </Section>
      </div>
      <div className="home-grid analytics-grid">
        <Section className="home-dashboard-card">
          <div className="section-heading-row">
            <div>
              <h2>Spending by category</h2>
              <p>Workspace-visible expenses in this period</p>
            </div>
          </div>
          {dashboard.topCategories.length ? (
            <div className="analytics-list">
              {dashboard.topCategories.map((category) => (
                <div className="analytics-row" key={category.name}>
                  <div className="analytics-row-heading">
                    <strong>{category.name}</strong>
                    <span>
                      {category.count} {category.count === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>
                  <Progress
                    value={(category.amountMinor / topCategoryMaximum) * 100}
                    label={category.name + ' spending'}
                  />
                  <MoneyText
                    money={{
                      amountMinor: category.amountMinor,
                      currency: category.currency ?? dashboard.currency,
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<TrendingUp />}
              title="No category data yet"
              message="Visible expenses will be grouped here as entries are recorded."
            />
          )}
        </Section>
        <Section className="home-dashboard-card">
          <div className="section-heading-row">
            <div>
              <h2>Monthly trend</h2>
              <p>Income, spending, and net movement</p>
            </div>
          </div>
          {dashboard.monthlyTrend.length ? (
            <div className="analytics-list">
              {dashboard.monthlyTrend.map((point) => (
                <div className="analytics-row" key={point.period}>
                  <div className="analytics-row-heading">
                    <strong>{point.period}</strong>
                    <span>{point.netMinor >= 0 ? 'Net positive' : 'Net negative'}</span>
                  </div>
                  <div className="analytics-money-pair">
                    <span>
                      In <MoneyText money={{ amountMinor: point.incomeMinor, currency: point.currency ?? dashboard.currency }} />
                    </span>
                    <span>
                      Out <MoneyText money={{ amountMinor: point.spendingMinor, currency: point.currency ?? dashboard.currency }} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<TrendingUp />}
              title="No trend data yet"
              message="Income and spending trends will appear after the first visible entry."
            />
          )}
        </Section>
      </div>
      <div className="home-grid analytics-grid">
        <Section className="home-dashboard-card">
          <div className="section-heading-row">
            <div>
              <h2>Income by source</h2>
              <p>Actual received money in this period</p>
            </div>
          </div>
          {dashboard.bySource.length ? (
            <div className="analytics-list">
              {dashboard.bySource.slice(0, 6).map((source) => (
                <Link
                  className="analytics-row analytics-row-link"
                  key={source.name}
                  to={dashboardDrilldownPath(
                    period,
                    source.merchant ? 'merchant' : source.category ? 'category' : 'type',
                    source.merchant ?? source.category ?? source.type ?? source.name,
                  )}
                >
                  <div className="analytics-row-heading">
                    <strong>{source.name}</strong>
                    <span>{source.count} {source.count === 1 ? 'entry' : 'entries'}</span>
                  </div>
                  <MoneyText money={{ amountMinor: source.amountMinor, currency: source.currency ?? dashboard.currency }} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={<ArrowDownLeft />} title="No income sources yet" message="Income entries will be grouped by their source here." />
          )}
        </Section>
        <Section className="home-dashboard-card">
          <div className="section-heading-row">
            <div>
              <h2>Contact activity</h2>
              <p>Received, paid, count, and latest declared date</p>
            </div>
          </div>
          {dashboard.byContact.length ? (
            <div className="analytics-list">
              {dashboard.byContact.slice(0, 6).map((contact) => (
                <Link
                  className="analytics-row analytics-row-link"
                  key={`${contact.id ?? contact.name}-${contact.name}`}
                  to={contact.id ? dashboardDrilldownPath(period, 'contactId', contact.id) : '/app/transactions'}
                >
                  <div className="analytics-row-heading">
                    <strong>{contact.name}</strong>
                    <span>{contact.count} {contact.count === 1 ? 'entry' : 'entries'}{contact.latestDate ? ` · ${formatDate(contact.latestDate)}` : ''}</span>
                  </div>
                  <span className="analytics-money-pair">
                    <span>In <MoneyText money={{ amountMinor: contact.incomeMinor, currency: contact.currency ?? dashboard.currency }} /></span>
                    <span>Out <MoneyText money={{ amountMinor: contact.paidMinor, currency: contact.currency ?? dashboard.currency }} /></span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={<ReceiptText />} title="No contact activity yet" message="Link a contact to an entry to see totals and recency here." />
          )}
        </Section>
      </div>
      <div className="home-grid analytics-grid">
        <Section className="home-dashboard-card" aria-labelledby="dashboard-account-heading">
          <div className="section-heading-row">
            <div>
              <h2 id="dashboard-account-heading">By account</h2>
              <p>Exact actual movement for each visible account in {selectedPeriodLabel.toLowerCase()}.</p>
            </div>
          </div>
          {dashboard.byAccount.length ? (
            <div className="analytics-list">
              {dashboard.byAccount.slice(0, 8).map((account) => (
                <Link className="analytics-row analytics-row-link" key={account.id} to={dashboardDrilldownPath(period, 'accountId', account.id)}>
                  <div className="analytics-row-heading">
                    <strong>{account.name}</strong>
                    <span>{account.count} {account.count === 1 ? 'entry' : 'entries'} · net {formatMoney({ amountMinor: account.netMinor, currency: account.currency ?? dashboard.currency })}</span>
                  </div>
                  <span className="analytics-money-pair">
                    <span>In <MoneyText money={{ amountMinor: account.incomeMinor, currency: account.currency ?? dashboard.currency }} /></span>
                    <span>Out <MoneyText money={{ amountMinor: account.paidMinor, currency: account.currency ?? dashboard.currency }} /></span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={<WalletCards />} title="No account activity yet" message="Visible account movement will appear here." />
          )}
        </Section>
        <Section className="home-dashboard-card" aria-labelledby="dashboard-type-heading">
          <div className="section-heading-row">
            <div>
              <h2 id="dashboard-type-heading">By transaction type</h2>
              <p>Income, expense, transfer, and other recorded types.</p>
            </div>
          </div>
          {dashboard.byType.length ? (
            <div className="analytics-list">
              {dashboard.byType.map((type) => (
                <Link className="analytics-row analytics-row-link" key={type.type ?? type.name} to={dashboardDrilldownPath(period, 'type', type.type ?? type.name)}>
                  <div className="analytics-row-heading">
                    <strong>{friendlyLabel(type.type ?? type.name)}</strong>
                    <span>{type.count} {type.count === 1 ? 'entry' : 'entries'}</span>
                  </div>
                  <MoneyText money={{ amountMinor: type.amountMinor, currency: type.currency ?? dashboard.currency }} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={<ReceiptText />} title="No transaction types yet" message="Recorded transaction types will be summarized here." />
          )}
        </Section>
      </div>
      <Section className="home-dashboard-card month-details-card">
        <div className="section-heading-row">
          <div>
            <span className="monthly-summary-kicker">{selectedMonthLabel}</span>
            <h2>Month details</h2>
            <p>Deterministic patterns from declared transaction dates.</p>
          </div>
          <Link to={dashboardDrilldownPath(period, 'type', 'expense')}>Review expenses</Link>
        </div>
        <div className="month-details-grid" aria-label="Month detail summary">
          <div><span>Largest income</span><strong>{dashboard.monthDetails.largestIncome?.label ?? 'No income yet'}</strong><small>{dashboard.monthDetails.largestIncome ? formatMoney({ amountMinor: dashboard.monthDetails.largestIncome.amountMinor, currency: dashboard.currency }) : '—'}</small></div>
          <div><span>Largest expense</span><strong>{dashboard.monthDetails.largestExpense?.label ?? 'No expense yet'}</strong><small>{dashboard.monthDetails.largestExpense ? formatMoney({ amountMinor: dashboard.monthDetails.largestExpense.amountMinor, currency: dashboard.currency }) : '—'}</small></div>
          <div><span>Most active day</span><strong>{dashboard.monthDetails.mostActiveDay ? formatDate(`${dashboard.monthDetails.mostActiveDay}T12:00:00.000Z`) : 'No activity yet'}</strong><small>Based on entry count</small></div>
          <div><span>Top spending category</span><strong>{dashboard.monthDetails.topSpendingCategory ?? 'No category yet'}</strong><small>Actual expenses only</small></div>
          <div><span>Highest-value contact</span><strong>{dashboard.monthDetails.highestValueContact?.name ?? 'No contact yet'}</strong><small>{dashboard.monthDetails.highestValueContact ? formatMoney({ amountMinor: dashboard.monthDetails.highestValueContact.incomeMinor + dashboard.monthDetails.highestValueContact.paidMinor, currency: dashboard.currency }) : '—'}</small></div>
          <div><span>Repeated entries</span><strong>{dashboard.monthDetails.repeatedTransactions.length || 'None detected'}</strong><small>Same label, type, category, and amount</small></div>
        </div>
        {dashboard.monthDetails.repeatedTransactions.length ? (
          <div className="analytics-list month-repeated-list">
            {dashboard.monthDetails.repeatedTransactions.map((repeat) => (
              <div className="analytics-row" key={`${repeat.label}-${repeat.type}-${repeat.amountMinor}`}>
                <div className="analytics-row-heading"><strong>{repeat.label}</strong><span>{repeat.count} repeats · {friendlyLabel(repeat.type)}</span></div>
                <MoneyText money={{ amountMinor: repeat.amountMinor, currency: repeat.currency }} />
              </div>
            ))}
          </div>
        ) : null}
      </Section>
      <Section className="home-dashboard-card daily-month-card">
        <div className="section-heading-row daily-month-heading">
          <div>
            <span className="monthly-summary-kicker">{selectedMonthLabel}</span>
            <h2>Daily money movement</h2>
            <p>One stacked bar per day for money received and expenses.</p>
          </div>
          <div className="daily-month-legend" aria-label="Chart legend">
            <span><i className="daily-legend-income" />Received</span>
            <span><i className="daily-legend-expense" />Expenses</span>
          </div>
        </div>
        <div className="daily-month-scroll">
          <div
            className="daily-month-chart"
            style={{ '--daily-month-days': daysInSelectedMonth } as CSSProperties}
          >
            {dailyMonthPoints.map((point, index) => {
              const day = index + 1
              const incomeHeight = (point.incomeMinor / dailyMonthMaximum) * 100
              const expenseHeight = (point.spendingMinor / dailyMonthMaximum) * 100
              const dayLabel = new Intl.DateTimeFormat('en-GB', {
                day: 'numeric',
                month: 'long',
                timeZone: 'UTC',
              }).format(new Date(`${point.period}T12:00:00.000Z`))
              const showDayLabel = day === 1 || day === daysInSelectedMonth || day % 5 === 0
              return (
                <button
                  type="button"
                  className={`daily-month-column${selectedDailyPeriod === point.period ? ' is-selected' : ''}`}
                  data-testid="daily-month-bar"
                  data-daily-bar=""
                  aria-label={`${dayLabel}: received ${formatMoney({ amountMinor: point.incomeMinor, currency: point.currency ?? monthDashboard.currency })}; expenses ${formatMoney({ amountMinor: point.spendingMinor, currency: point.currency ?? monthDashboard.currency })}`}
                  aria-expanded={selectedDailyPeriod === point.period}
                  aria-controls={selectedDailyPeriod === point.period ? 'daily-month-detail' : undefined}
                  onClick={() => setSelectedDailyPeriod((current) => current === point.period ? null : point.period)}
                  key={point.period}
                >
                  <div className="daily-month-stack" aria-hidden="true">
                    <motion.span
                      className="daily-month-income"
                      initial={reduce ? false : { scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : Math.min(index * 0.018, 0.3), ease: [0.16, 1, 0.3, 1] }}
                      style={{
                        height: `${incomeHeight}%`,
                        bottom: `${expenseHeight}%`,
                      }}
                    />
                    <motion.span
                      className="daily-month-expense"
                      initial={reduce ? false : { scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : Math.min(index * 0.018 + 0.05, 0.35), ease: [0.16, 1, 0.3, 1] }}
                      style={{ height: `${expenseHeight}%`, bottom: 0 }}
                    />
                  </div>
                  <span aria-hidden="true">{showDayLabel ? day : ''}</span>
                </button>
              )
            })}
          </div>
        </div>
        {!mobile && selectedDailyPoint ? (
          <div
            className="daily-month-detail-popover"
            data-daily-detail=""
            id="daily-month-detail"
            role="dialog"
            aria-labelledby="daily-month-detail-title"
          >
            <CashflowDetailContent
              point={selectedDailyPoint}
              currency={monthDashboard.currency}
              transactions={dailyTransactionsQuery.data ?? []}
              isLoading={dailyTransactionsQuery.isLoading}
              isError={dailyTransactionsQuery.isError}
              headingId="daily-month-detail-title"
              headingLabel={`Daily details for ${selectedDailyPoint.period}`}
            />
          </div>
        ) : null}
      </Section>
      {mobile && selectedDailyPoint ? (
        <BottomSheet
          open
          onOpenChange={(open) => {
            if (!open) setSelectedDailyPeriod(null)
          }}
          snapPoints={['auto', 0.88]}
          title={`Daily details for ${selectedDailyPoint.period}`}
          description="Income, expenses, transfers, and entries for this day."
          className="app-bottom-sheet daily-month-detail-sheet"
        >
          <CashflowDetailContent
            point={selectedDailyPoint}
            currency={monthDashboard.currency}
            transactions={dailyTransactionsQuery.data ?? []}
            isLoading={dailyTransactionsQuery.isLoading}
            isError={dailyTransactionsQuery.isError}
          />
        </BottomSheet>
      ) : null}
      <RecordActionDrawer
        open={Boolean(selectedRecentTransaction)}
        onClose={() => setSelectedRecentTransaction(null)}
        title={selectedRecentTransaction?.merchant || 'Transaction details'}
        description="Review this entry before editing, sharing, or deleting it."
        details={selectedRecentTransaction ? [
          { label: 'Type', value: friendlyLabel(selectedRecentTransaction.rawType ?? selectedRecentTransaction.direction) },
          ...(selectedRecentTransaction.transactionId ? [{ label: 'Transaction ID', value: selectedRecentTransaction.transactionId, copyable: true }] : []),
          { label: 'Amount', value: formatMoney(selectedRecentTransaction.amount) },
          { label: 'Date', value: formatDate(selectedRecentTransaction.occurredAt) },
          { label: 'Category', value: selectedRecentTransaction.category || 'Uncategorised' },
          { label: 'Status', value: friendlyLabel(selectedRecentTransaction.status) },
          { label: 'Created by', value: selectedRecentTransaction.creator?.name ?? 'Creator unavailable' },
          ...(selectedRecentTransaction.note ? [{ label: 'Note', value: selectedRecentTransaction.note }] : []),
		  ...(selectedRecentTransaction.description ? [{ label: 'Description', value: selectedRecentTransaction.description }] : []),
		  ...(selectedRecentTransaction.contact ? [{ label: 'Contact', value: [selectedRecentTransaction.contact.name, selectedRecentTransaction.contact.phone, selectedRecentTransaction.contact.email].filter(Boolean).join(' · ') }] : []),
        ] : []}
        onEdit={
          selectedRecentTransaction && canEditTransaction(
            demoMode,
            workspace.permissions,
            selectedRecentTransaction,
          )
            ? () => setEditingRecentTransaction(selectedRecentTransaction)
            : undefined
        }
        canShare={canShareTransactions}
        sharePath={selectedRecentTransaction && !demoMode ? `/workspaces/${workspace.id}/transactions/${selectedRecentTransaction.id}/share` : undefined}
        demoSharePayload={
          selectedRecentTransaction && demoMode
            ? buildSafeTextSharePayload({
                title: 'Transaction summary',
                text: `${selectedRecentTransaction.transactionId ? `ID ${selectedRecentTransaction.transactionId} · ` : ''}${selectedRecentTransaction.category || 'Transaction'}: ${formatMoney(selectedRecentTransaction.amount)} on ${formatDate(selectedRecentTransaction.occurredAt)}`,
              })
            : undefined
        }
        canDelete={Boolean(selectedRecentTransaction) && canDeleteTransaction(
          demoMode,
          workspace.permissions,
          selectedRecentTransaction ?? { creator: undefined },
        )}
        deleteLabel="Delete transaction"
        deleteDescription="The server reverses the affected balances before removing this entry."
        onDelete={deleteRecentTransaction}
      />
      <TransactionEditDialog
        transaction={editingRecentTransaction}
        open={Boolean(editingRecentTransaction)}
        onClose={() => setEditingRecentTransaction(null)}
      />
    </PageFrame>
  )
}

const transactionSchema = z.object({
  merchant: z.string().trim().min(2, 'Enter a name or description'),
  amount: moneyInputSchema(),
  category: z.string().min(1, 'Choose a category'),
  accountId: z.string().min(1, 'Choose an account'),
  occurredAt: dateInputSchema,
  note: z.string().max(240, 'Keep the note under 240 characters').optional(),
	description: z.string().max(2000, 'Keep the description under 2000 characters').optional(),
	contactId: z.string().optional(),
  transactionId: z.string().trim().max(18, 'Keep the transaction ID under 19 digits'),
  autoGenerateTransactionId: z.boolean(),
})

function selectedTransactionDateToUtc(value: string) {
  if (!isDateOnly(value)) {
    throw new TypeError('Choose a valid transaction date.')
  }
  return toUtcDateOnly(value)
}

type AddMode = TransactionCategoryMode
type LiveTransactionMode = AddMode

export function TransactionDialog({
  open,
  initialMode,
  accounts,
  onClose,
  onDemoAdded,
}: {
  open: boolean
  initialMode: AddMode
  accounts: Account[]
  onClose: () => void
  onDemoAdded: (transaction: Transaction) => void
}) {
  const { demoMode, preferredCurrency, workspace } = useApp()
  const queryClient = useQueryClient()
  const reduce = useReducedMotion()
  const [mode, setMode] = useState<AddMode>(initialMode)
  const availableAccounts = useMemo(
    () => accounts.filter((account) => account.status !== 'inactive'),
    [accounts],
  )
  const initialAccountId =
    availableAccounts.find(
      (account) =>
        account.balance.currency.toUpperCase() === preferredCurrency,
    )?.id ?? availableAccounts[0]?.id ?? ''
  const initialCategory = demoMode
    ? categoriesForTransactionMode(initialMode)[0] ?? ''
    : ''
  const [values, setValues] = useState({
    merchant: '',
    amount: '',
    category: initialCategory,
    accountId: initialAccountId,
    occurredAt: todayDateOnly(),
    note: '',
		description: '',
		contactId: '',
    transactionId: '',
    autoGenerateTransactionId: true,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [splitShares, setSplitShares] = useState<Record<string, string>>({})
  const [splitShareErrors, setSplitShareErrors] = useState<
    Record<string, string>
  >({})
  const [splitShareError, setSplitShareError] = useState('')
  const [submitLocked, setSubmitLocked] = useState(false)
	const [showDescription, setShowDescription] = useState(false)
  const submitLock = useRef(false)
  const closeTimer = useRef<number | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    setMode(initialMode)
    if (open) {
      setValues({
        merchant: '',
        amount: '',
        category: demoMode
          ? categoriesForTransactionMode(initialMode)[0] ?? ''
          : '',
        accountId: initialAccountId,
        occurredAt: todayDateOnly(),
        note: '',
		description: '',
		contactId: '',
        transactionId: '',
        autoGenerateTransactionId: true,
      })
      setErrors({})
      setFeedback(null)
      setSplitShares({})
      setSplitShareErrors({})
      setSplitShareError('')
      submitLock.current = false
      setSubmitLocked(false)
    } else if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [demoMode, initialAccountId, initialMode, open, preferredCurrency])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
      }
    }
  }, [])
  useEffect(() => {
    const selectedIsAvailable = availableAccounts.some(
      (account) => account.id === values.accountId,
    )
    if ((!values.accountId || !selectedIsAvailable) && availableAccounts[0]) {
      setValues((current) => ({
        ...current,
        accountId: availableAccounts[0].id,
      }))
    }
  }, [availableAccounts, values.accountId])

  const selectedAccount = availableAccounts.find(
    (account) => account.id === values.accountId,
  )
  const selectedCurrency = selectedAccount?.balance.currency ?? preferredCurrency
	const contactsQuery = useQuery({ queryKey: ['contacts', workspace.id], queryFn: () => api.get<Contact[]>(`/workspaces/${workspace.id}/contacts`), enabled: open && !demoMode })
	const savedNamesQuery = useQuery({ queryKey: ['saved-transaction-names', workspace.id], queryFn: () => api.get<SavedTransactionName[]>(`/workspaces/${workspace.id}/saved-transaction-names`), enabled: open && !demoMode })
	const membersQuery = useQuery({
	  queryKey: ['workspace-members', workspace.id],
	  queryFn: () =>
	    api.get<WorkspaceMember[]>(
	      `/workspaces/${encodeURIComponent(workspace.id)}/members`,
	    ),
	  enabled: open && !demoMode && mode === 'split',
	  retry: 1,
	})
	const contacts = contactsQuery.data ?? []
	const savedNames = savedNamesQuery.data ?? []
  const categoriesQuery = useTransactionCategories(mode, open)
  const sequencesQuery = useTransactionSequences(open)
  const categoryNames = useMemo(
    () =>
      demoMode
        ? [...categoriesForTransactionMode(mode)]
        : selectableTransactionCategoryNames(categoriesQuery.data ?? []),
    [categoriesQuery.data, demoMode, mode],
  )
  const modeSequence = sequencesQuery.data?.find(
    (setting) => setting.transactionType === mode,
  )
  const activeSplitMembers = useMemo(() => {
    const seen = new Set<string>()
    return (Array.isArray(membersQuery.data) ? membersQuery.data : []).filter(
      (member) => {
        const email = member.email.trim().toLocaleLowerCase()
        if (member.status !== 'active' || !email || seen.has(email)) return false
        seen.add(email)
        return true
      },
    )
  }, [membersQuery.data])

  useEffect(() => {
    if (!open || categoriesQuery.isLoading) return
    setValues((current) =>
      categoryNames.includes(current.category)
        ? current
        : { ...current, category: categoryNames[0] ?? '' },
    )
  }, [categoryNames, categoriesQuery.isLoading, mode, open])

  useEffect(() => {
    if (!open || !modeSequence) return
    setValues((current) => ({
      ...current,
      autoGenerateTransactionId: modeSequence.autoGenerate,
      transactionId: '',
    }))
  }, [mode, modeSequence, open])

  const changeMode = (nextMode: AddMode) => {
    setMode(nextMode)
    setValues((current) => ({
      ...current,
      category: demoMode
        ? categoriesForTransactionMode(nextMode)[0] ?? ''
        : '',
      transactionId: '',
      autoGenerateTransactionId:
        sequencesQuery.data?.find(
          (setting) => setting.transactionType === nextMode,
        )?.autoGenerate ?? true,
    }))
    setErrors({})
    setFeedback(null)
    setSplitShares({})
    setSplitShareErrors({})
    setSplitShareError('')
  }

  const updateSplitShare = (memberEmail: string, amountMajor: string) => {
    setSplitShares((current) => ({ ...current, [memberEmail]: amountMajor }))
    setSplitShareErrors((current) => {
      if (!current[memberEmail]) return current
      const next = { ...current }
      delete next[memberEmail]
      return next
    })
    setSplitShareError('')
  }

  const mutation = useMutation({
    mutationFn: ({
      body,
      transactionType,
      idempotencyKey,
      splits,
    }: {
      body: typeof values
      transactionType: LiveTransactionMode
      idempotencyKey: string
      splits: TransactionSplitInput[]
    }) => {
      const sourceAccount = availableAccounts.find(
        (account) => account.id === body.accountId,
      )
      return api.post<Transaction, Record<string, unknown>>(
        `/workspaces/${workspace.id}/transactions`,
        {
          merchant:
            transactionType === 'transfer' ? undefined : body.merchant.trim(),
          destinationAccountId:
            transactionType === 'transfer' ? body.merchant.trim() : undefined,
          amountMinor: Math.round(Number(body.amount) * 100),
          currency: sourceAccount?.balance.currency ?? '',
          category: body.category,
          accountId: body.accountId,
          notes: body.note.trim() || undefined,
		  description: body.description.trim() || undefined,
          contactId: body.contactId || undefined,
          autoGenerateTransactionId: body.autoGenerateTransactionId,
          transactionId: body.autoGenerateTransactionId
            ? undefined
            : body.transactionId.trim(),
          type: transactionType,
          splits: transactionType === 'split' ? splits : undefined,
          occurredAt: selectedTransactionDateToUtc(body.occurredAt),
        },
        {
          'Idempotency-Key': idempotencyKey,
        },
      )
    },
    onSuccess: (transaction) => {
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['transactions', workspace.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['accounts', workspace.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['budgets', workspace.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['dashboard', workspace.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['insights', workspace.id],
        }),
        invalidatePeriodReviewQueries(queryClient, workspace.id),
      ])
      if (!mounted.current) return
      setFeedback({
        tone: 'success',
        message: transaction.transactionId
          ? `Transaction ${transaction.transactionId} saved.`
          : 'Transaction saved.',
      })
      closeTimer.current = window.setTimeout(onClose, 700)
    },
    onError: (error) => {
      if (!mounted.current) return
      submitLock.current = false
      setSubmitLocked(false)
	  setShowDescription(false)
      if (error instanceof ApiError && error.fields) {
        setErrors((current) => ({
          ...current,
          ...error.fields,
          transactionId:
            error.fields?.transactionId ?? current.transactionId,
        }))
        if (error.fields.splits) setSplitShareError(error.fields.splits)
      }
      setFeedback({
        tone: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'The server could not save this transaction. No changes were made.',
      })
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const form = event.currentTarget
    if (submitLock.current || mutation.isPending) return
    setErrors({})
    setFeedback(null)
    setSplitShareErrors({})
    setSplitShareError('')
    if (
      !values.autoGenerateTransactionId &&
      !/^\d{1,18}$/.test(values.transactionId.trim())
    ) {
      setErrors({
        transactionId: 'Enter a transaction ID containing 1 to 18 digits.',
      })
      focusFirstInvalidField(form)
      return
    }
    const result = transactionSchema.safeParse(values)
    if (!result.success) {
      setErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.message,
          ]),
        ),
      )
      focusFirstInvalidField(form)
      return
    }
    const sourceAccount = availableAccounts.find(
      (account) => account.id === values.accountId,
    )
    if (!sourceAccount) {
      setErrors({ accountId: 'Choose a valid source account.' })
      focusFirstInvalidField(form)
      return
    }
    let validatedSplits: TransactionSplitInput[] = []
    if (!demoMode && mode === 'split') {
      if (membersQuery.isLoading || membersQuery.isError) {
        setSplitShareError(
          membersQuery.isError
            ? 'Workspace members could not be loaded. Try again.'
            : 'Workspace members are still loading.',
        )
        return
      }
      if (activeSplitMembers.length === 0) {
        setSplitShareError(
          'At least one active workspace member is required for a split.',
        )
        return
      }
      const splitValidation = validateTransactionSplits(
        activeSplitMembers.map((member) => ({
          memberEmail: member.email,
          amountMajor: splitShares[member.email] ?? '',
        })),
        Math.round(result.data.amount * 100),
      )
      if (!splitValidation.ok) {
        setSplitShareErrors(splitValidation.fieldErrors)
        setSplitShareError(
          splitValidation.reason === 'empty'
            ? 'Enter a positive share for at least one active member.'
            : splitValidation.reason === 'invalid'
              ? 'Fix the highlighted member shares.'
              : `Shares total ${formatMoney({ amountMinor: splitValidation.allocatedMinor, currency: sourceAccount.balance.currency })}; they must equal ${formatMoney({ amountMinor: Math.round(result.data.amount * 100), currency: sourceAccount.balance.currency })}.`,
        )
        form.querySelector<HTMLInputElement>('[data-split-share]')?.focus()
        return
      }
      validatedSplits = splitValidation.splits
    }
    if (mode === 'transfer') {
      const destinationAccount = availableAccounts.find(
        (account) => account.id === values.merchant,
      )
      if (!destinationAccount) {
        setErrors({ merchant: 'Choose a valid destination account.' })
        focusFirstInvalidField(form)
        return
      }
      if (destinationAccount.id === sourceAccount.id) {
        setErrors({
          merchant: 'Choose a different destination account.',
          accountId: 'Choose two different accounts for a transfer.',
        })
        focusFirstInvalidField(form)
        return
      }
      if (destinationAccount.balance.currency !== sourceAccount.balance.currency) {
        setErrors({
          merchant: `Choose a ${sourceAccount.balance.currency} account. Cross-currency transfers are not supported.`,
        })
        focusFirstInvalidField(form)
        return
      }
    }
    submitLock.current = true
    setSubmitLocked(true)
    if (demoMode) {
      onDemoAdded({
        id: `demo-${Date.now()}`,
        transactionId: values.autoGenerateTransactionId
          ? modeSequence?.preview ??
            transactionSequencePreview(
              modeSequence?.nextNumber ?? 1,
              modeSequence?.minimumDigits ?? 4,
            )
          : values.transactionId.trim(),
        transactionIdScope: mode,
        merchant:
          mode === 'transfer'
            ? `Transfer to ${
                availableAccounts.find((account) => account.id === values.merchant)
                  ?.name ?? 'account'
              }`
            : values.merchant.trim(),
        category: values.category,
        occurredAt: selectedTransactionDateToUtc(values.occurredAt),
        amount: {
          amountMinor: Math.round(result.data.amount * 100),
          currency: sourceAccount.balance.currency,
        },
        direction: mode === 'income' ? 'credit' : 'debit',
        status: 'cleared',
        accountId: values.accountId,
        note: values.note.trim() || 'Saved only in this demo session',
		description: values.description.trim() || undefined,
      })
      setFeedback({
        tone: 'success',
        message: 'Added to this demo session only.',
      })
      closeTimer.current = window.setTimeout(onClose, 700)
      return
    }
    mutation.mutate({
      body: values,
      transactionType: mode,
      idempotencyKey: crypto.randomUUID(),
      splits: validatedSplits,
    })
  }

  return (
    <Dialog
      open={open}
      title={
        mode === 'expense'
          ? 'Add expense'
          : mode === 'income'
            ? 'Add income'
            : mode === 'transfer'
              ? 'Transfer money'
              : 'Split an expense'
      }
      description={
        demoMode
          ? 'This change stays in your local demo session.'
          : mode === 'split'
            ? 'Assign the full amount across active workspace members.'
            : 'Review the details before saving.'
      }
      onClose={submitLocked ? () => undefined : onClose}
    >
      <div className="segmented-control" role="tablist" aria-label="Transaction type">
        {(['expense', 'income', 'transfer', 'split'] as AddMode[]).map((item) => (
          <motion.button
            key={item}
            id={`transaction-${item}-tab`}
            type="button"
            role="tab"
            aria-selected={mode === item}
            aria-controls={`transaction-${item}-panel`}
            tabIndex={mode === item ? 0 : -1}
            onClick={() => changeMode(item)}
            onKeyDown={(event) => {
              if (
                event.key !== 'ArrowLeft' &&
                event.key !== 'ArrowRight' &&
                event.key !== 'Home' &&
                event.key !== 'End'
              ) {
                return
              }
              event.preventDefault()
              const modes: AddMode[] = ['expense', 'income', 'transfer', 'split']
              const currentIndex = modes.indexOf(item)
              const nextIndex =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? modes.length - 1
                    : event.key === 'ArrowRight'
                      ? (currentIndex + 1) % modes.length
                      : (currentIndex - 1 + modes.length) % modes.length
              const nextMode = modes[nextIndex]
              changeMode(nextMode)
              requestAnimationFrame(() => {
                document.getElementById(`transaction-${nextMode}-tab`)?.focus()
              })
            }}
            whileTap={reduce ? undefined : { scale: 0.96 }}
            transition={reduce ? { duration: 0 } : SPRING_PRESS}
          >
            <motion.span
              key={mode === item ? 'selected' : 'idle'}
              initial={
                reduce || mode !== item
                  ? false
                  : { opacity: 0.72, scale: 0.94 }
              }
              animate={{ opacity: 1, scale: 1 }}
              transition={reduce ? { duration: 0 } : SPRING_PRESS}
            >
              {item}
            </motion.span>
          </motion.button>
        ))}
      </div>
      <form
        id={`transaction-${mode}-panel`}
        className="dialog-form"
        role="tabpanel"
        aria-label={`${friendlyLabel(mode)} transaction details`}
        aria-labelledby={`transaction-${mode}-tab`}
        onSubmit={submit}
      >
        {!accounts.length ? (
          <InfoNotice>
            Add an account before recording a transaction.
          </InfoNotice>
        ) : null}
        {accounts.length > 0 && !availableAccounts.length ? (
          <InfoNotice>
            Activate an account before recording a transaction.
          </InfoNotice>
        ) : null}
        <div className="transaction-id-entry">
          <Field
            label="Transaction ID"
            error={errors.transactionId}
            hint={
              values.autoGenerateTransactionId
                ? 'The current sequence assigns this numeric ID when saved.'
                : 'Enter 1 to 18 digits. IDs must be unique within this transaction type.'
            }
          >
            <input
              inputMode="numeric"
              maxLength={18}
              value={
                values.autoGenerateTransactionId
                  ? modeSequence?.preview ?? ''
                  : values.transactionId
              }
              placeholder={
                values.autoGenerateTransactionId
                  ? 'Assigned when saved'
                  : '0001'
              }
              disabled={values.autoGenerateTransactionId}
              readOnly={values.autoGenerateTransactionId}
              onChange={(event) => {
                clearFieldError(setErrors, 'transactionId')
                setValues((current) => ({
                  ...current,
                  transactionId: event.target.value.replace(/\D/g, '').slice(0, 18),
                }))
              }}
            />
          </Field>
          <div className="transaction-id-auto-toggle">
            <Checkbox
              checked={values.autoGenerateTransactionId}
              onCheckedChange={(autoGenerateTransactionId) => {
                clearFieldError(setErrors, 'transactionId')
                setValues((current) => ({
                  ...current,
                  autoGenerateTransactionId,
                  transactionId: autoGenerateTransactionId
                    ? ''
                    : current.transactionId,
                }))
              }}
              aria-label="Auto Generate transaction ID"
            />
            <span>
              <strong>Auto Generate</strong>
              <small>
                Initial setting for {friendlyLabel(mode).toLowerCase()} transactions
              </small>
            </span>
          </div>
        </div>
        <Field
          label={mode === 'transfer' ? 'Destination' : 'Name or description'}
          error={errors.merchant}
        >
          {mode === 'transfer' ? (
            <Select
              value={values.merchant}
              onValueChange={(value) =>
                {
                  clearFieldError(setErrors, 'merchant')
                  setValues((current) => ({ ...current, merchant: value }))
                }
              }
            >
              <SelectTrigger className="w-full" data-field-control>
                <SelectValue placeholder="Choose a destination account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Choose a destination account</SelectItem>
                {availableAccounts
                  .filter((account) => account.id !== values.accountId)
                  .map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} · {account.balance.currency}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : (
            <ContactNamePicker
              inputValue={values.merchant}
              inputAriaLabel="Name or description"
              contacts={contacts}
              savedNames={savedNames}
              isLoading={contactsQuery.isLoading || savedNamesQuery.isLoading}
              isError={Boolean(contactsQuery.error || savedNamesQuery.error)}
              onInputChange={(merchant) => {
                clearFieldError(setErrors, 'merchant')
                setValues((current) => {
                  const selectedContact = contacts.find(
                    (contact) => contact.id === current.contactId,
                  )
                  return {
                    ...current,
                    merchant,
                    contactId:
                      selectedContact?.name === merchant
                        ? current.contactId
                        : '',
                  }
                })
              }}
              onContactSelect={(contact) => {
                clearFieldError(setErrors, 'merchant')
                setValues((current) => ({
                  ...current,
                  merchant: contact.name,
                  contactId: contact.id,
                }))
              }}
              onSavedNameSelect={(savedName) => {
                clearFieldError(setErrors, 'merchant')
                setValues((current) => ({
                  ...current,
                  merchant: savedName.name,
                  contactId: '',
                }))
              }}
            />
          )}
        </Field>
        <Field label="Amount" error={errors.amount}>
          <div className="currency-input has-currency-select currency-input-icon-only">
            <CurrencySelect
              compact
              iconOnly
              value={selectedCurrency}
              onChange={(currency) => {
                clearFieldError(setErrors, 'amount')
                setSplitShareError('')
                const matchingAccount = availableAccounts.find(
                  (account) => account.balance.currency === currency,
                )
                if (matchingAccount) {
                  setValues((current) => ({
                    ...current,
                    accountId: matchingAccount.id,
                  }))
                }
              }}
              ariaLabel="Change currency"
              disabled={!accounts.length}
            />
            <input
              inputMode="decimal"
              value={values.amount}
              onChange={(event) =>
                {
                  clearFieldError(setErrors, 'amount')
                  setSplitShareError('')
                  setValues((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
              }
              placeholder="0.00"
              aria-label="Amount"
            />
          </div>
        </Field>
        {!demoMode && mode === 'split' ? (
          <fieldset
            className="transaction-split-editor"
            aria-describedby="transaction-split-editor-hint"
          >
            <legend>Member shares</legend>
            <p id="transaction-split-editor-hint">
              Enter a share for each participant. Shares must be positive and
              total the transaction amount exactly.
            </p>
            {membersQuery.isLoading ? (
              <p className="settings-inline-status" role="status">
                Loading active members…
              </p>
            ) : membersQuery.isError ? (
              <div className="transaction-split-query-error" role="alert">
                <span>Workspace members could not be loaded.</span>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void membersQuery.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : activeSplitMembers.length ? (
              <div
                className="transaction-split-share-list"
                aria-label="Active member shares"
              >
                {activeSplitMembers.map((member, index) => {
                  const inputId = `transaction-split-share-${index}`
                  const errorId = `${inputId}-error`
                  const shareError = splitShareErrors[member.email]
                  return (
                    <div className="transaction-split-share-row" key={member.email}>
                      <label htmlFor={inputId}>
                        <span>
                          <strong>{member.name || member.email}</strong>
                          <small>{member.email}</small>
                        </span>
                        <span className="transaction-split-share-input">
                          <span aria-hidden="true">{selectedCurrency}</span>
                          <input
                            id={inputId}
                            data-split-share
                            inputMode="decimal"
                            maxLength={20}
                            value={splitShares[member.email] ?? ''}
                            placeholder="0.00"
                            aria-label={`Share for ${member.name || member.email}`}
                            aria-invalid={Boolean(shareError)}
                            aria-describedby={shareError ? errorId : undefined}
                            onChange={(event) =>
                              updateSplitShare(member.email, event.target.value)
                            }
                          />
                        </span>
                      </label>
                      {shareError ? (
                        <small id={errorId} className="field-error" role="alert">
                          {shareError}
                        </small>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="field-error" role="alert">
                At least one active workspace member is required for a split.
              </p>
            )}
            {splitShareError ? (
              <p className="field-error" role="alert">
                {splitShareError}
              </p>
            ) : null}
          </fieldset>
        ) : null}
        <DatePicker
          label="Transaction date"
          value={values.occurredAt}
          error={errors.occurredAt}
          onValueChange={(occurredAt) => {
            if (!isDateOnly(occurredAt)) return
            clearFieldError(setErrors, 'occurredAt')
            setValues((current) => ({ ...current, occurredAt }))
          }}
        />
        <div className="two-fields">
          <Field
            label={mode === 'transfer' ? 'From account' : 'Account'}
            error={errors.accountId}
          >
            <Select
              value={values.accountId}
              onValueChange={(value) =>
                {
                  clearFieldError(setErrors, 'accountId')
                  clearFieldError(setErrors, 'merchant')
                  setValues((current) => ({ ...current, accountId: value }))
                }
              }
            >
              <SelectTrigger className="w-full" data-field-control>
                <SelectValue placeholder="Choose source account" />
              </SelectTrigger>
              <SelectContent>
                {availableAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Category"
            error={errors.category}
          >
            <Select
              value={values.category}
              disabled={
                (!demoMode && categoriesQuery.isLoading) ||
                (!demoMode && categoriesQuery.isError) ||
                !categoryNames.length
              }
              onValueChange={(value) =>
                {
                  clearFieldError(setErrors, 'category')
                  setValues((current) => ({ ...current, category: value }))
                }
              }
            >
              <SelectTrigger className="w-full" data-field-control>
                <SelectValue placeholder="Choose category" />
              </SelectTrigger>
              <SelectContent>
                {!demoMode && categoriesQuery.isLoading ? (
                  <SelectItem value="__loading-categories__" disabled>
                    Loading categories…
                  </SelectItem>
                ) : !demoMode && categoriesQuery.isError ? (
                  <SelectItem value="__category-error__" disabled>
                    Categories unavailable
                  </SelectItem>
                ) : categoryNames.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {!demoMode && categoriesQuery.isError ? (
          <p className="field-error" role="alert">
            Categories could not be loaded. Close this dialog and try again.
          </p>
        ) : null}
        {!demoMode &&
        !categoriesQuery.isLoading &&
        !categoriesQuery.isError &&
        !categoryNames.length ? (
          <InfoNotice>
            Add an active {friendlyLabel(mode).toLowerCase()} category in Settings before saving.
          </InfoNotice>
        ) : null}
        <Field label="Note" error={errors.note}>
          <textarea
            value={values.note}
            onChange={(event) =>
              {
                clearFieldError(setErrors, 'note')
                setValues((current) => ({ ...current, note: event.target.value }))
              }
            }
            placeholder="Optional details"
          />
        </Field>
		{showDescription ? <Field label="Description" error={errors.description}><textarea autoFocus maxLength={2000} value={values.description} onChange={(event)=>{clearFieldError(setErrors,'description');setValues((current)=>({...current,description:event.target.value}))}} placeholder="Add optional details" /></Field> : <Button type="button" variant="quiet" onClick={()=>setShowDescription(true)}><Plus aria-hidden="true" /> Add description</Button>}
        {feedback ? <FeedbackNotice feedback={feedback} /> : null}
        <div className="dialog-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={submitLocked}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={mutation.isPending}
            disabled={
              submitLocked ||
              !availableAccounts.length ||
              (!demoMode && categoriesQuery.isLoading) ||
              (!demoMode && categoriesQuery.isError) ||
              !categoryNames.length ||
              (!demoMode &&
                mode === 'split' &&
                (membersQuery.isLoading ||
                  membersQuery.isError ||
                  !activeSplitMembers.length))
            }
          >
            {demoMode ? 'Add to demo' : 'Save'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function transactionFilterQueryFromSearchParams(
  searchParams: URLSearchParams,
) {
  const query = new URLSearchParams()
  const from = validDateOrTimestampKey(searchParams.get('from'))
  const to = validDateOrTimestampKey(searchParams.get('to'))
  const selectedDateRange = cashflowDayRange(searchParams.get('date'))
  if (from && to && from <= to) {
    const range = transactionApiDateRange(from, to)
    query.set('from', range.from)
    query.set('to', range.to)
  } else if (selectedDateRange) {
    query.set('from', selectedDateRange.from)
    query.set('to', selectedDateRange.to)
  }

  for (const key of [
    'transactionId',
    'type',
    'category',
    'accountId',
    'contactId',
    'merchant',
    'search',
    'minAmountMinor',
    'maxAmountMinor',
  ]) {
    const value = searchParams.get(key)?.trim()
    if (value) query.set(key, value)
  }
  return query
}

function amountMinorFromMajorFilter(value: string) {
  const normalized = value.trim()
  if (!normalized) return null
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return undefined
  const [major, fraction = ''] = normalized.split('.')
  const amountMinor = Number(major) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(amountMinor) && amountMinor >= 0
    ? amountMinor
    : undefined
}

function majorFilterFromMinor(value: string) {
  if (!/^\d+$/.test(value)) return ''
  const amountMinor = Number(value)
  if (!Number.isSafeInteger(amountMinor)) return ''
  const major = Math.floor(amountMinor / 100)
  const fraction = String(amountMinor % 100).padStart(2, '0')
  return fraction === '00' ? String(major) : `${major}.${fraction}`
}

export function TransactionsPage() {
  const { demoMode, workspace } = useApp()
  const queryClient = useQueryClient()
  const reduce = useReducedMotion()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedDateRange = cashflowDayRange(searchParams.get('date'))
  const rangeFrom = validDateOrTimestampKey(searchParams.get('from'))
  const rangeTo = validDateOrTimestampKey(searchParams.get('to'))
  const selectedFilterRange = rangeFrom && rangeTo && rangeFrom <= rangeTo
    ? { from: rangeFrom, to: rangeTo }
    : null
  const selectedCategory = searchParams.get('category')?.trim() || ''
  const selectedType = searchParams.get('type')?.trim() || ''
  const selectedContactId = searchParams.get('contactId')?.trim() || ''
  const selectedMerchant = searchParams.get('merchant')?.trim() || ''
  const selectedAccountId = searchParams.get('accountId')?.trim() || ''
  const selectedTransactionIdFilter =
    searchParams.get('transactionId')?.trim() || ''
  const selectedMinAmountMinor =
    searchParams.get('minAmountMinor')?.trim() || ''
  const selectedMaxAmountMinor =
    searchParams.get('maxAmountMinor')?.trim() || ''
  const search = searchParams.get('search')?.trim() || ''
  const activeTransactionQuery = transactionFilterQueryFromSearchParams(
    searchParams,
  )
  const transactionQueryPath = (() => {
    if (activeTransactionQuery.size === 0) return '/transactions'
    const query = new URLSearchParams(activeTransactionQuery)
    if (!selectedFilterRange) query.set('limit', '100')
    return `/transactions?${query.toString()}`
  })()
  const query = useFinanceData<Transaction[]>(
    'transactions',
    transactionQueryPath,
    demoTransactions,
  )
  const accountQuery = useFinanceData<Account[]>(
    'accounts',
    '/accounts',
    demoAccounts,
  )
  const contactsQuery = useFinanceData<Contact[]>(
    'contacts',
    '/contacts',
    demoContacts,
  )
  const savedNamesQuery = useFinanceData<SavedTransactionName[]>(
    'saved-transaction-names',
    '/saved-transaction-names',
    demoSavedTransactionNames,
  )
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterTransactionId, setFilterTransactionId] = useState(
    selectedTransactionIdFilter,
  )
  const [filterType, setFilterType] = useState(selectedType)
  const [filterCategory, setFilterCategory] = useState(selectedCategory)
  const [filterAccountId, setFilterAccountId] = useState(selectedAccountId)
  const [filterContactId, setFilterContactId] = useState(selectedContactId)
  const [filterMinAmount, setFilterMinAmount] = useState(
    majorFilterFromMinor(selectedMinAmountMinor),
  )
  const [filterMaxAmount, setFilterMaxAmount] = useState(
    majorFilterFromMinor(selectedMaxAmountMinor),
  )
  const [filterFrom, setFilterFrom] = useState(rangeFrom ?? '')
  const [filterTo, setFilterTo] = useState(rangeTo ?? '')
  const [dateFilterError, setDateFilterError] = useState('')
  const [amountFilterError, setAmountFilterError] = useState('')
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [exportFeedback, setExportFeedback] = useState('')
  const exportMutation = useMutation({
    mutationFn: () =>
      downloadWorkspaceExport(workspace.id, activeTransactionQuery),
    onMutate: () => setExportFeedback(''),
    onSuccess: (filename) => {
      setExportFeedback(`${filename} downloaded with the active filters.`)
    },
    onError: () => setExportFeedback(''),
  })

  useEffect(() => {
    setFilterTransactionId(selectedTransactionIdFilter)
    setFilterType(selectedType)
    setFilterCategory(selectedCategory)
    setFilterAccountId(selectedAccountId)
    setFilterContactId(selectedContactId)
    setFilterMinAmount(majorFilterFromMinor(selectedMinAmountMinor))
    setFilterMaxAmount(majorFilterFromMinor(selectedMaxAmountMinor))
    setFilterFrom(rangeFrom ?? selectedDateRange?.period ?? '')
    setFilterTo(rangeTo ?? selectedDateRange?.period ?? '')
  }, [
    rangeFrom,
    rangeTo,
    selectedAccountId,
    selectedCategory,
    selectedContactId,
    selectedDateRange?.period,
    selectedMaxAmountMinor,
    selectedMinAmountMinor,
    selectedTransactionIdFilter,
    selectedType,
  ])
  const canCreateTransactions = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'create_transactions',
  )
  const modeParam = searchParams.get('add')
  const mode: AddMode =
    modeParam === 'income' ||
    modeParam === 'transfer' ||
    modeParam === 'split' ||
    modeParam === 'expense'
      ? modeParam
      : 'expense'
  const dialogOpen = canCreateTransactions && Boolean(modeParam)
  const items = useDemoSessionCollection(
    demoMode,
    workspace.id,
    'transactions',
    query.data ?? [],
  )
  const requestedTransactionId = searchParams.get('transaction')?.trim() ?? ''
  const listedTransaction = requestedTransactionId
    ? items.find((transaction) => transaction.id === requestedTransactionId)
    : undefined
  const transactionDetailQuery = useFinanceData<Transaction | null>(
    'transaction',
    requestedTransactionId ? `/transactions/${encodeURIComponent(requestedTransactionId)}` : '/transactions/__none__',
    null,
    Boolean(requestedTransactionId && !listedTransaction && !demoMode),
    false,
  )
  useEffect(() => {
    if (!requestedTransactionId) {
      if (selectedTransaction) setSelectedTransaction(null)
      return
    }
    if (query.isLoading && !demoMode) return
    const resolvedTransaction = listedTransaction ?? transactionDetailQuery.data
    if (resolvedTransaction) {
      if (selectedTransaction?.id !== resolvedTransaction.id) {
        setSelectedTransaction(resolvedTransaction)
      }
      return
    }
    if (demoMode || transactionDetailQuery.isError || transactionDetailQuery.isSuccess) {
      setSelectedTransaction(null)
      const nextSearchParams = new URLSearchParams(searchParams)
      nextSearchParams.delete('transaction')
      setSearchParams(nextSearchParams, { replace: true })
    }
  }, [
    demoMode,
    listedTransaction,
    query.isLoading,
    requestedTransactionId,
    searchParams,
    selectedTransaction,
    setSearchParams,
    transactionDetailQuery.data,
    transactionDetailQuery.isError,
    transactionDetailQuery.isSuccess,
  ])
  const clearTransactionSelection = () => {
    setSelectedTransaction(null)
    if (!searchParams.has('transaction')) return
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('transaction')
    setSearchParams(nextSearchParams, { replace: true })
  }
  const selectTransaction = (transaction: Transaction) => {
    setSelectedTransaction(transaction)
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.set('transaction', transaction.id)
    setSearchParams(nextSearchParams)
  }
  const dateFilteredItems = selectedFilterRange
    ? items.filter((item) => {
        const day = transactionDay(item)
        return day >= selectedFilterRange.from && day <= selectedFilterRange.to
      })
    : selectedDateRange
      ? items.filter((item) => transactionDay(item) === selectedDateRange.period)
      : items
  const activeMinAmountMinor = /^\d+$/.test(selectedMinAmountMinor)
    ? Number(selectedMinAmountMinor)
    : null
  const activeMaxAmountMinor = /^\d+$/.test(selectedMaxAmountMinor)
    ? Number(selectedMaxAmountMinor)
    : null
  const filtered = dateFilteredItems.filter((item) => {
    const matchesSearch = matchesTransactionSearch(item, search)
    const matchesTransactionId =
      !selectedTransactionIdFilter ||
      item.transactionId === selectedTransactionIdFilter
    const matchesCategory = !selectedCategory || item.category === selectedCategory
    const matchesType =
      !selectedType || transactionCategoryModeFor(item) === selectedType
    const matchesContact = !selectedContactId || item.contactId === selectedContactId
    const matchesMerchant = !selectedMerchant || item.merchant === selectedMerchant
    const matchesAccount = !selectedAccountId || item.accountId === selectedAccountId
    const matchesMinimumAmount =
      activeMinAmountMinor === null ||
      item.amount.amountMinor >= activeMinAmountMinor
    const matchesMaximumAmount =
      activeMaxAmountMinor === null ||
      item.amount.amountMinor <= activeMaxAmountMinor
    return matchesSearch && matchesTransactionId && matchesCategory && matchesType && matchesContact && matchesMerchant && matchesAccount && matchesMinimumAmount && matchesMaximumAmount
  })
  const canShareTransactions = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'export_data',
  )
  const canExportTransactions = !demoMode && canShareTransactions
  const updateSearch = (value: string) => {
    const nextSearchParams = new URLSearchParams(searchParams)
    const normalized = value.trim()
    if (normalized) nextSearchParams.set('search', normalized)
    else nextSearchParams.delete('search')
    setSearchParams(nextSearchParams, { replace: true })
  }
  const clearFilters = () => {
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('date')
    nextSearchParams.delete('from')
    nextSearchParams.delete('to')
    nextSearchParams.delete('category')
    nextSearchParams.delete('type')
    nextSearchParams.delete('contactId')
    nextSearchParams.delete('merchant')
    nextSearchParams.delete('accountId')
    nextSearchParams.delete('transactionId')
    nextSearchParams.delete('minAmountMinor')
    nextSearchParams.delete('maxAmountMinor')
    setSearchParams(nextSearchParams)
    setFilterTransactionId('')
    setFilterType('')
    setFilterCategory('')
    setFilterAccountId('')
    setFilterContactId('')
    setFilterMinAmount('')
    setFilterMaxAmount('')
    setFilterFrom('')
    setFilterTo('')
    setDateFilterError('')
    setAmountFilterError('')
  }
  const toggleFilters = () => {
    setFiltersOpen((open) => {
      const next = !open
      if (next) {
        setDateFilterError('')
        setAmountFilterError('')
      }
      return next
    })
  }
  const applyFilters = () => {
    const minAmountMinor = amountMinorFromMajorFilter(filterMinAmount)
    const maxAmountMinor = amountMinorFromMajorFilter(filterMaxAmount)
    if (minAmountMinor === undefined || maxAmountMinor === undefined) {
      setAmountFilterError(
        'Enter non-negative amounts with no more than two decimal places.',
      )
      return
    }
    if (
      minAmountMinor !== null &&
      maxAmountMinor !== null &&
      minAmountMinor > maxAmountMinor
    ) {
      setAmountFilterError('Maximum amount must be at least the minimum amount.')
      return
    }
    setAmountFilterError('')
    if (
      (filterFrom || filterTo) &&
      (!validDateKey(filterFrom) || !validDateKey(filterTo))
    ) {
      setDateFilterError('Choose valid From and To dates.')
      return
    }
    if (filterFrom && filterTo && filterFrom > filterTo) {
      setDateFilterError('The To date must be on or after the From date.')
      return
    }
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('date')
    if (filterFrom && filterTo) {
      nextSearchParams.set('from', filterFrom)
      nextSearchParams.set('to', filterTo)
    } else {
      nextSearchParams.delete('from')
      nextSearchParams.delete('to')
    }
    const setOrDelete = (key: string, value: string) => {
      const normalized = value.trim()
      if (normalized) nextSearchParams.set(key, normalized)
      else nextSearchParams.delete(key)
    }
    setOrDelete('transactionId', filterTransactionId)
    setOrDelete('type', filterType)
    setOrDelete('category', filterCategory)
    setOrDelete('accountId', filterAccountId)
    setOrDelete('contactId', filterContactId)
    setOrDelete(
      'minAmountMinor',
      minAmountMinor === null ? '' : String(minAmountMinor),
    )
    setOrDelete(
      'maxAmountMinor',
      maxAmountMinor === null ? '' : String(maxAmountMinor),
    )
    setSearchParams(nextSearchParams)
    setDateFilterError('')
    setFiltersOpen(false)
  }
  const deleteSelectedTransaction = async () => {
    if (!selectedTransaction) return
    if (demoMode) {
      removeDemoSessionItem(workspace.id, 'transactions', selectedTransaction.id)
      return
    }
    await api.delete<void>(
      `/workspaces/${workspace.id}/transactions/${selectedTransaction.id}`,
    )
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transactions', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['accounts', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['vaults', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['budgets', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['insights', workspace.id] }),
      invalidatePeriodReviewQueries(queryClient, workspace.id),
    ])
  }

  return (
    <PageFrame>
      <PageHeader
        title="Transactions"
        description="Every movement, with context."
        actions={
          canCreateTransactions ? (
          <Button onClick={() => {
            const next = new URLSearchParams(searchParams)
            next.set('add', 'expense')
            setSearchParams(next)
          }}>
            <Plus aria-hidden="true" />
            Add transaction
          </Button>
          ) : undefined
        }
      />
      {!canCreateTransactions ? (
        <InfoNotice>
          Your workspace role does not include permission to create
          transactions. Existing entries remain available to review.
        </InfoNotice>
      ) : null}
      {selectedFilterRange || selectedDateRange || selectedCategory || selectedType || selectedContactId || selectedMerchant || selectedAccountId || selectedTransactionIdFilter || selectedMinAmountMinor || selectedMaxAmountMinor ? (
        <div className="transaction-date-filter" role="status">
          <span>
            {selectedFilterRange
              ? `Showing entries from ${formatDate(`${selectedFilterRange.from}T12:00:00.000Z`)} to ${formatDate(`${selectedFilterRange.to}T12:00:00.000Z`)}`
              : selectedDateRange
                ? `Showing entries for ${formatDate(`${selectedDateRange.period}T12:00:00.000Z`)}`
                : 'Showing matching entries'}
            {selectedCategory ? ` · Category: ${selectedCategory}` : ''}
            {selectedType ? ` · Type: ${friendlyLabel(selectedType)}` : ''}
            {selectedTransactionIdFilter ? ` · ID: ${selectedTransactionIdFilter}` : ''}
            {selectedMerchant ? ` · Source: ${selectedMerchant}` : ''}
            {selectedContactId ? ' · Contact filter' : ''}
            {selectedAccountId ? ' · Account filter' : ''}
            {selectedMinAmountMinor
              ? ` · Minimum amount: ${majorFilterFromMinor(selectedMinAmountMinor)}`
              : ''}
            {selectedMaxAmountMinor
              ? ` · Maximum amount: ${majorFilterFromMinor(selectedMaxAmountMinor)}`
              : ''}
          </span>
          <Button type="button" variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : null}
      <div
        className="toolbar"
        role="search"
        aria-label="Search and filter transactions"
      >
        <div className="toolbar-search transaction-search-picker">
          <Search aria-hidden="true" />
          <ContactNamePicker
            contacts={contactsQuery.data ?? []}
            savedNames={savedNamesQuery.data ?? []}
            isLoading={contactsQuery.isLoading || savedNamesQuery.isLoading}
            isError={Boolean(contactsQuery.error || savedNamesQuery.error)}
            inputValue={search}
            onInputChange={updateSearch}
            onContactSelect={(contact) => updateSearch(contact.name)}
            onSavedNameSelect={(name) => updateSearch(name.name)}
            inputAriaLabel="Search entries by transaction ID, name, description, or contact"
            inputPlaceholder="Search ID, name, description, or contact"
            openOnFocus
          />
        </div>
        <Button
          variant="secondary"
          aria-expanded={filtersOpen}
          aria-controls="transaction-filters"
          onClick={toggleFilters}
        >
          <Filter aria-hidden="true" />
          {activeTransactionQuery.size === 0 ? 'Filters' : 'Filtered'}
        </Button>
        {canExportTransactions ? (
          <Button
            variant="secondary"
            loading={exportMutation.isPending}
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
          >
            <Download aria-hidden="true" />
            Export CSV
          </Button>
        ) : null}
      </div>
      <AnimatePresence initial={false}>
        {filtersOpen ? (
          <motion.div
            id="transaction-filters"
            className="filter-panel transaction-filter-panel"
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }
            }
          >
            <div className="transaction-filter-fields">
              <Field label="Transaction ID">
                <input
                  inputMode="numeric"
                  maxLength={18}
                  value={filterTransactionId}
                  placeholder="Exact ID"
                  onChange={(event) =>
                    setFilterTransactionId(
                      event.target.value.replace(/\D/g, '').slice(0, 18),
                    )
                  }
                />
              </Field>
              <Field label="Type">
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-full" data-field-control>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All types</SelectItem>
                    {(['expense', 'income', 'transfer', 'split'] as AddMode[]).map(
                      (transactionType) => (
                        <SelectItem key={transactionType} value={transactionType}>
                          {friendlyLabel(transactionType)}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Category">
                <input
                  maxLength={100}
                  value={filterCategory}
                  placeholder="Exact category"
                  onChange={(event) => setFilterCategory(event.target.value)}
                />
              </Field>
              <Field label="Account">
                <Select
                  value={filterAccountId}
                  onValueChange={setFilterAccountId}
                >
                  <SelectTrigger className="w-full" data-field-control>
                    <SelectValue placeholder="All accounts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All accounts</SelectItem>
                    {(accountQuery.data ?? []).map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Contact">
                <Select
                  value={filterContactId}
                  onValueChange={setFilterContactId}
                >
                  <SelectTrigger className="w-full" data-field-control>
                    <SelectValue placeholder="All contacts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All contacts</SelectItem>
                    {(contactsQuery.data ?? []).map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Min amount"
                hint="Major currency units"
                error={amountFilterError || undefined}
              >
                <input
                  inputMode="decimal"
                  value={filterMinAmount}
                  placeholder="0.00"
                  onChange={(event) => {
                    setFilterMinAmount(event.target.value)
                    setAmountFilterError('')
                  }}
                />
              </Field>
              <Field label="Max amount" hint="Major currency units">
                <input
                  inputMode="decimal"
                  value={filterMaxAmount}
                  placeholder="No maximum"
                  onChange={(event) => {
                    setFilterMaxAmount(event.target.value)
                    setAmountFilterError('')
                  }}
                />
              </Field>
            </div>
            <div className="transaction-filter-dates">
              <DatePicker
                label="From date"
                value={filterFrom}
                max={filterTo || undefined}
                error={dateFilterError || undefined}
                onValueChange={(value) => {
                  setFilterFrom(value)
                  setDateFilterError('')
                }}
              />
              <DatePicker
                label="To date"
                value={filterTo}
                min={filterFrom || undefined}
                onValueChange={(value) => {
                  setFilterTo(value)
                  setDateFilterError('')
                }}
              />
              <div className="transaction-filter-date-actions">
                <Button type="button" variant="secondary" onClick={clearFilters}>
                  Clear
                </Button>
                <Button type="button" onClick={applyFilters}>
                  Apply filters
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {exportFeedback ? (
        <SuccessNotice>{exportFeedback}</SuccessNotice>
      ) : null}
      {exportMutation.error ? (
        <div className="form-alert" role="alert">
          {exportMutation.error instanceof ApiError
            ? exportMutation.error.message
            : 'Workspace export could not be downloaded. Try again.'}
        </div>
      ) : null}
      {query.isLoading || accountQuery.isLoading ? (
        <DataSkeleton />
      ) : query.isError || accountQuery.isError ? (
        <ErrorState
          message={
            query.isError
              ? 'Transactions could not be loaded.'
              : 'Accounts could not be loaded, so transaction entry is unavailable.'
          }
          retry={() => {
            void Promise.all([query.refetch(), accountQuery.refetch()])
          }}
        />
      ) : filtered.length ? (
        <Section className="transaction-list-section">
          <div className="transaction-group-heading">
            <span>Recent</span>
            <span aria-live="polite">{filtered.length} loaded entries</span>
          </div>
          <div className="row-list">
            <AnimatePresence initial={false}>
              {filtered.map((transaction, index) => (
                <MotionListItem
                  key={transaction.id}
                  index={index}
                  layout
                >
                  <ListRow
                    onClick={() => selectTransaction(transaction)}
                    leading={<CreatorAvatar creator={transaction.creator} />}
                    title={transaction.merchant}
                    subtitle={transactionSubtitle(transaction) + (transaction.note ? ` · ${transaction.note}` : '')}
                    trailing={
                      <div className="transaction-trailing">
                        <div
                          className={`transaction-amount transaction-amount-${transaction.direction}`}
                        >
                          <MoneyText
                            money={transaction.amount}
                            signed={transaction.direction}
                          />
                          {transaction.status === 'pending' ? (
                            <Badge tone="warning">Pending</Badge>
                          ) : (
                            <Badge tone="positive">Cleared</Badge>
                          )}
                        </div>
                      </div>
                    }
                  />
                </MotionListItem>
              ))}
            </AnimatePresence>
          </div>
        </Section>
      ) : (
        <EmptyState
          icon={<ReceiptText />}
          title={search ? 'No matches' : 'No transactions yet'}
          message={
            search
              ? 'Try a different name or description.'
              : 'Add your first income or expense to start a clear record.'
          }
          action={
            !search && canCreateTransactions ? (
              <Button onClick={() => {
                const next = new URLSearchParams(searchParams)
                next.set('add', 'expense')
                setSearchParams(next)
              }}>
                Add transaction
              </Button>
            ) : undefined
          }
        />
      )}
      <TransactionDialog
        open={dialogOpen}
        initialMode={mode}
        accounts={accountQuery.data ?? []}
        onClose={() => {
          const nextSearchParams = new URLSearchParams(searchParams)
          nextSearchParams.delete('add')
          const nextSearch = nextSearchParams.toString()

          navigate(
            {
              pathname: location.pathname,
              search: nextSearch ? `?${nextSearch}` : '',
              hash: location.hash,
            },
            {
              replace: true,
              state: location.state,
            },
          )
        }}
        onDemoAdded={(item) =>
          addDemoSessionItem(workspace.id, 'transactions', item)
        }
      />
      <RecordActionDrawer
        open={Boolean(selectedTransaction)}
        onClose={clearTransactionSelection}
        title={selectedTransaction?.merchant || 'Transaction details'}
        description="Review this entry before editing, sharing, or deleting it."
        details={selectedTransaction ? [
          { label: 'Type', value: friendlyLabel(selectedTransaction.rawType ?? selectedTransaction.direction) },
          ...(selectedTransaction.transactionId ? [{ label: 'Transaction ID', value: selectedTransaction.transactionId, copyable: true }] : []),
          { label: 'Amount', value: formatMoney(selectedTransaction.amount) },
          { label: 'Date', value: formatDate(selectedTransaction.occurredAt) },
          { label: 'Category', value: selectedTransaction.category || 'Uncategorised' },
          { label: 'Status', value: friendlyLabel(selectedTransaction.status) },
          { label: 'Created by', value: selectedTransaction.creator?.name ?? 'Creator unavailable' },
          ...(selectedTransaction.note ? [{ label: 'Note', value: selectedTransaction.note }] : []),
		  ...(selectedTransaction.description ? [{ label: 'Description', value: selectedTransaction.description }] : []),
		  ...(selectedTransaction.contact ? [{ label: 'Contact', value: [selectedTransaction.contact.name, selectedTransaction.contact.phone, selectedTransaction.contact.email].filter(Boolean).join(' · ') }] : []),
        ] : []}
        onEdit={
          selectedTransaction && canEditTransaction(
            demoMode,
            workspace.permissions,
            selectedTransaction,
          )
            ? () => setEditingTransaction(selectedTransaction)
            : undefined
        }
        canShare={canShareTransactions}
        sharePath={selectedTransaction && !demoMode ? `/workspaces/${workspace.id}/transactions/${selectedTransaction.id}/share` : undefined}
        demoSharePayload={
          selectedTransaction && demoMode
            ? buildSafeTextSharePayload({
                title: 'Transaction summary',
                text: `${selectedTransaction.transactionId ? `ID ${selectedTransaction.transactionId} · ` : ''}${selectedTransaction.category || 'Transaction'}: ${formatMoney(selectedTransaction.amount)} on ${formatDate(selectedTransaction.occurredAt)}`,
              })
            : undefined
        }
        canDelete={Boolean(selectedTransaction) && canDeleteTransaction(
          demoMode,
          workspace.permissions,
          selectedTransaction ?? { creator: undefined },
        )}
        deleteLabel="Delete transaction"
        deleteDescription="The server reverses the affected balances before removing this entry."
        onDelete={deleteSelectedTransaction}
      />
      <TransactionEditDialog
        transaction={editingTransaction}
        open={Boolean(editingTransaction)}
        onClose={() => setEditingTransaction(null)}
      />
    </PageFrame>
  )
}
