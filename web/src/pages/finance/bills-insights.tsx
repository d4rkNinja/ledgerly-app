import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CalendarPlus,
  CreditCard,
  FileText,
  Pencil,
  ReceiptText,
  Share2,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import {
  useEffect,
  useState,
  type FormEvent,
} from 'react'
import { Link } from 'react-router'
import {
  motion,
  useReducedMotion,
} from 'motion/react'
import { useApp } from '@/app/app-state'
import {
  bills as demoBills,
} from '@/domain/demo-data'
import type {
  Bill,
} from '@/domain/types'
import {
  BILL_FREQUENCY_LABELS,
  type BillFrequency,
  type BillInputPayload,
  type RecurringSuggestion,
} from '@/domain/intelligence'
import { api, ApiError } from '@/lib/api-client'
import { toMinor } from '../finance-writes/shared'
import {
  downloadBillCalendarEvent,
} from '@/lib/download'
import { formatDate, formatMoney } from '@/lib/format'
import {
  buildBillReminderSharePayload,
  buildMonthlySummarySharePayload,
  type SharePayload,
} from '@/lib/share'
import { ShareSheet } from '@/components/share-sheet'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  ListRow,
  PageHeader,
  Section,
} from '@/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/beui/select'

import {
  DataSkeleton,
  MoneyText,
  MotionListItem,
  PageFrame,
} from './shared'
import {
  friendlyLabel,
  hasWorkspacePermission,
  useFinanceData,
} from './data'
import {
  describeCategoryChange,
  describeMetricChange,
  previousPeriodRange,
  type MetricComparison,
  type MetricKind,
} from './insights-model'

export function BillsPage() {
  const { demoMode, privacyMode, workspace } = useApp()
  const queryClient = useQueryClient()
  const query = useFinanceData<Bill[]>('bills', '/bills', demoBills)
  const reduce = useReducedMotion()
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)
  const [billDialog, setBillDialog] = useState<{ open: boolean; editing?: Bill }>({ open: false })
  const items = query.data ?? []
  const autopayCount = items.filter((bill) => bill.autopay).length
  // Demo sessions never touch the bills API; hasWorkspacePermission returns
  // true for every permission in demo mode, so exclude demo explicitly.
  const canManageBills =
    !demoMode &&
    hasWorkspacePermission(demoMode, workspace.permissions, 'manage_bills')
  const canShareBills = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'export_data',
  )
  const suggestionsQuery = useQuery({
    queryKey: ['recurring-suggestions', workspace.id],
    queryFn: () =>
      api.get<unknown>(
        `/workspaces/${workspace.id}/recurring-suggestions`,
      ) as Promise<RecurringSuggestion[]>,
    enabled: !demoMode,
    staleTime: 60_000,
  })
  const suggestions = suggestionsQuery.data ?? []
  const billPayload = selectedBill
    ? buildBillReminderSharePayload(selectedBill, {
        locale: navigator.language,
        concealAmounts: privacyMode,
      })
    : null
  return (
    <PageFrame className="bills-page timeline-page">
      <PageHeader
        title="Bills"
        description="Know what is due before it becomes urgent."
        actions={
          canManageBills ? (
            <Button onClick={() => setBillDialog({ open: true })}>
              <CalendarPlus aria-hidden="true" />
              Add bill
            </Button>
          ) : undefined
        }
      />
      {query.isLoading ? (
        <DataSkeleton />
      ) : query.isError ? (
        <ErrorState
          message="Bills are unavailable."
          retry={() => query.refetch()}
        />
      ) : !items.length ? (
        <EmptyState
          icon={<CreditCard />}
          title="No upcoming bills"
          message="Bills due in the next 30 days will appear here."
        />
      ) : (
        <Section>
          <div className="section-heading-row">
            <div>
              <h2>Upcoming</h2>
              <p>Next 30 days</p>
            </div>
            <Badge tone="positive">
              {autopayCount} {autopayCount === 1 ? 'bill' : 'bills'} on autopay
            </Badge>
          </div>
          <div className="timeline-list">
            {items.map((bill, index) => (
              <motion.div
                className="timeline-row"
                key={bill.id}
                initial={reduce ? false : { opacity: 0, x: -7 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: reduce ? 0 : 0.28,
                  delay: reduce ? 0 : Math.min(index * 0.045, 0.2),
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div className="date-block">
                  <span>{formatDate(bill.dueDate).split(' ')[0]}</span>
                  <strong>{formatDate(bill.dueDate).split(' ')[1]}</strong>
                </div>
                <div className="timeline-copy">
                  <strong>{bill.name}</strong>
                  <span>
                    {bill.autopay ? 'Autopay enabled' : 'Manual payment'}
                  </span>
                </div>
                <MoneyText money={bill.amount} />
                {canShareBills ? (
                  <IconButton
                    label={`Share reminder for ${bill.name}`}
                    onClick={() => setSelectedBill(bill)}
                  >
                    <Share2 />
                  </IconButton>
                ) : null}
                {canManageBills ? (
                  <>
                    <IconButton
                      label={`Edit ${bill.name}`}
                      onClick={() => setBillDialog({ open: true, editing: bill })}
                    >
                      <Pencil />
                    </IconButton>
                    <DeleteBillButton bill={bill} />
                  </>
                ) : null}
                {index < items.length - 1 ? (
                  <span className="timeline-line" aria-hidden="true" />
                ) : null}
              </motion.div>
            ))}
          </div>
        </Section>
      )}
      <RecurringSuggestionsSection
        suggestions={suggestions}
        loading={suggestionsQuery.isLoading}
        canManage={canManageBills}
        onChanged={() => {
          void queryClient.invalidateQueries({ queryKey: ['recurring-suggestions', workspace.id] })
          void queryClient.invalidateQueries({ queryKey: ['bills', workspace.id] })
          void queryClient.invalidateQueries({ queryKey: ['attention', workspace.id] })
        }}
      />
      <BillDialog
        open={billDialog.open}
        editing={billDialog.editing ?? null}
        onClose={() => setBillDialog({ open: false })}
        onSaved={() => setBillDialog({ open: false })}
      />
      <ShareSheet
        open={Boolean(selectedBill)}
        onOpenChange={(open) => {
          if (!open) setSelectedBill(null)
        }}
        payload={billPayload}
        privacyNote="Only the bill name, due date, payment mode, and visible amount are included. Payment accounts and IDs stay private."
        extraAction={
          selectedBill ? (
            <Button
              type="button"
              variant="quiet"
              onClick={() =>
                downloadBillCalendarEvent(
                  selectedBill,
                  privacyMode
                    ? undefined
                    : formatMoney(selectedBill.amount),
                )
              }
            >
              <CalendarPlus aria-hidden="true" />
              Add reminder to calendar
            </Button>
          ) : null
        }
      />
    </PageFrame>
  )
}

function RecurringSuggestionsSection({
  suggestions,
  loading,
  canManage,
  onChanged,
}: {
  suggestions: RecurringSuggestion[]
  loading: boolean
  canManage: boolean
  onChanged: () => void
}) {
  const { workspace } = useApp()
  const [feedback, setFeedback] = useState<string | null>(null)
  const act = useMutation({
    mutationFn: async ({ action, signature }: { action: 'accept' | 'dismiss'; signature: string }) =>
      action === 'accept'
        ? api.post<unknown, { signature: string }>(
            `/workspaces/${workspace.id}/recurring-suggestions/accept`,
            { signature },
          )
        : api.post<unknown, { signature: string }>(
            `/workspaces/${workspace.id}/recurring-suggestions/dismiss`,
            { signature },
          ),
    onSuccess: (_result, variables) => {
      setFeedback(
        variables.action === 'accept'
          ? 'Added to your recurring bills.'
          : 'Suggestion hidden. It will not be detected again.',
      )
      onChanged()
    },
    onError: () => {
      setFeedback('That could not be completed. Nothing changed — try again.')
    },
  })

  if (!canManage) return null
  return (
    <Section>
      <div className="section-heading-row">
        <div>
          <h2>Detected recurring payments</h2>
          <p>From your last 180 days. Approve one to track it as a bill.</p>
        </div>
        <Badge tone="neutral">{suggestions.length}</Badge>
      </div>
      {feedback ? (
        <p className="suggestion-feedback" role="status">{feedback}</p>
      ) : null}
      {loading ? (
        <p className="import-picker-status">Looking for patterns…</p>
      ) : suggestions.length === 0 ? (
        <EmptyState
          icon={<Sparkles />}
          title="No new patterns yet"
          message="When a payment repeats at a steady interval for three months or more, it will appear here for your approval."
        />
      ) : (
        <ul className="suggestion-list">
          {suggestions.map((suggestion) => (
            <li key={suggestion.signature} className="suggestion-row" data-direction={suggestion.direction}>
              <div className="suggestion-copy">
                <strong>{suggestion.label}</strong>
                <span>
                  {BILL_FREQUENCY_LABELS[suggestion.frequency as BillFrequency] ?? suggestion.frequency} ·{' '}
                  {suggestion.occurrences} times · next {formatDate(suggestion.nextDueEstimate)}
                </span>
              </div>
              <span className={`suggestion-amount suggestion-amount-${suggestion.direction}`}>
                {formatMoney({ amountMinor: suggestion.amountMinor, currency: suggestion.currency })}
              </span>
              <div className="suggestion-actions">
                <Button
                  variant="primary"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ action: 'accept', signature: suggestion.signature })}
                >
                  Add as bill
                </Button>
                <Button
                  variant="quiet"
                  aria-label={`Dismiss ${suggestion.label} suggestion`}
                  disabled={act.isPending}
                  onClick={() => act.mutate({ action: 'dismiss', signature: suggestion.signature })}
                >
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function DeleteBillButton({ bill }: { bill: Bill }) {
  const { workspace } = useApp()
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => api.delete(`/workspaces/${workspace.id}/bills/${bill.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bills', workspace.id] })
      void queryClient.invalidateQueries({ queryKey: ['attention', workspace.id] })
    },
  })
  return (
    <IconButton
      label={`Delete ${bill.name}`}
      onClick={() => {
        if (window.confirm(`Stop tracking "${bill.name}"? Past activity is not affected.`)) {
          remove.mutate()
        }
      }}
    >
      <Trash2 />
    </IconButton>
  )
}

const FREQUENCY_OPTIONS = Object.entries(BILL_FREQUENCY_LABELS).map(([value, label]) => ({ value, label }))

function BillDialog({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean
  editing: Bill | null
  onClose: () => void
  onSaved: () => void
}) {
  const { workspace } = useApp()
  const queryClient = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const initial = (): BillInputPayload & { amount: string; dueDate: string } => ({
    name: '',
    amount: '',
    amountMinor: 0,
    currency: workspace.currency || 'INR',
    frequency: 'monthly',
    dueDate: today,
    autopay: false,
  })
  const [values, setValues] = useState(initial())
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setErrors({})
    if (editing) {
      setValues({
        name: editing.name,
        amount: String(editing.amount.amountMinor / 100),
        amountMinor: editing.amount.amountMinor,
        currency: editing.amount.currency,
        frequency: editing.frequency ?? 'monthly',
        dueDate: editing.dueDate.slice(0, 10),
        autopay: editing.autopay,
      })
    } else {
      setValues(initial())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  const save = useMutation({
    mutationFn: (body: BillInputPayload) =>
      editing
        ? api.patch(`/workspaces/${workspace.id}/bills/${editing.id}`, body)
        : api.post(`/workspaces/${workspace.id}/bills`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bills', workspace.id] })
      void queryClient.invalidateQueries({ queryKey: ['attention', workspace.id] })
      onSaved()
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) setErrors(error.fields)
      else setErrors({ form: 'The bill could not be saved.' })
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    const parsedAmount = Number.parseFloat(values.amount)
    if (!values.name.trim()) nextErrors.name = 'Enter a name'
    if (Number.isNaN(parsedAmount) || Math.round(parsedAmount * 100) <= 0) {
      nextErrors.amountMinor = 'Enter an amount above zero'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    save.mutate({
      name: values.name.trim(),
      amountMinor: toMinor(parsedAmount),
      currency: values.currency,
      frequency: values.frequency,
      dueDate: new Date(`${values.dueDate}T00:00:00Z`).toISOString(),
      autopay: values.autopay,
    })
  }

  return (
    <Dialog
      open={open}
      title={editing ? 'Edit bill' : 'Add recurring bill'}
      description="Bills project upcoming payments into lists, attention items, and the forecast."
      onClose={save.isPending ? () => undefined : onClose}
    >
      <form className="dialog-form finance-write-form" onSubmit={submit} aria-busy={save.isPending}>
        <Field label="Bill name" error={errors.name}>
          <input
            autoFocus
            maxLength={100}
            value={values.name}
            onChange={(event) => {
              clearErrorKey(setErrors, 'name')
              setValues((current) => ({ ...current, name: event.target.value }))
            }}
            placeholder="Apartment rent"
          />
        </Field>
        <div className="two-fields">
          <Field label={`Amount (${values.currency})`} error={errors.amountMinor}>
            <input
              inputMode="decimal"
              value={values.amount}
              placeholder="0.00"
              onChange={(event) => {
                clearErrorKey(setErrors, 'amountMinor')
                setValues((current) => ({ ...current, amount: event.target.value }))
              }}
            />
          </Field>
          <Field label="Repeats">
            <Select
              value={values.frequency}
              onValueChange={(frequency) => setValues((current) => ({ ...current, frequency }))}
            >
              <SelectTrigger aria-label="Bill frequency" className="w-full" data-field-control>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Next due date" error={errors.dueDate}>
          <input
            type="date"
            value={values.dueDate}
            onChange={(event) => setValues((current) => ({ ...current, dueDate: event.target.value }))}
          />
        </Field>
        <label className="forecast-toggle">
          <input
            type="checkbox"
            checked={values.autopay}
            onChange={(event) => setValues((current) => ({ ...current, autopay: event.target.checked }))}
          />
          Paid automatically
        </label>
        {errors.form ? <p className="field-error" role="alert">{errors.form}</p> : null}
        <div className="dialog-actions">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add bill'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function clearErrorKey(setErrors: (updater: (current: Record<string, string>) => Record<string, string>) => void, key: string) {
  setErrors((current) => {
    const next = { ...current }
    delete next[key]
    return next
  })
}

type ReportView = {
  incomeMinor: number
  spendingMinor: number
  netMinor: number
  byCategory: Record<string, number>
  summary: string
  disclaimer: string
}

function LiveInsightsPage() {
  const { privacyMode, workspace } = useApp()
  const reduce = useReducedMotion()
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null)
  const [period] = useState(() => {
    const to = new Date()
    const from = new Date(
      Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1),
    )
    return { from: from.toISOString(), to: to.toISOString() }
  })
  const reportQuery = useQuery({
    queryKey: ['insights', workspace.id, period.from, period.to],
    queryFn: () =>
      api.get<ReportView>(
        `/workspaces/${workspace.id}/reports/summary?from=${encodeURIComponent(period.from)}&to=${encodeURIComponent(period.to)}`,
      ),
    retry: 1,
  })
  const previousRange = previousPeriodRange(period.from, period.to)
  const previousQuery = useQuery({
    queryKey: ['insights', workspace.id, 'previous', previousRange?.from, previousRange?.to],
    queryFn: () => {
      if (!previousRange) return Promise.resolve(null)
      return api.get<ReportView | null>(
        `/workspaces/${workspace.id}/reports/summary?from=${encodeURIComponent(previousRange.from)}&to=${encodeURIComponent(previousRange.to)}`,
      )
    },
    enabled: previousRange !== null,
    retry: 1,
  })
  const previousReport = previousQuery.data ?? null

  if (reportQuery.isLoading) {
    return (
      <PageFrame className="insights-page analytics-page">
        <PageHeader
          title="Insights"
          description="Loading this month's factual summary."
        />
        <DataSkeleton />
      </PageFrame>
    )
  }
  if (reportQuery.isError || !reportQuery.data) {
    return (
      <PageFrame className="insights-page analytics-page">
        <PageHeader
          title="Insights"
          description="A factual summary of activity in the current month."
        />
        <ErrorState
          message="The live insight report could not be loaded."
          retry={() => reportQuery.refetch()}
        />
      </PageFrame>
    )
  }

  const report = reportQuery.data
  const currency = workspace.currency ?? 'INR'
  const comparisonMaximum = Math.max(
    Math.abs(report.incomeMinor),
    Math.abs(report.spendingMinor),
    1,
  )
  const incomeHeight = Math.max(
    report.incomeMinor === 0 ? 4 : 18,
    Math.round((Math.abs(report.incomeMinor) / comparisonMaximum) * 100),
  )
  const spendingHeight = Math.max(
    report.spendingMinor === 0 ? 4 : 18,
    Math.round((Math.abs(report.spendingMinor) / comparisonMaximum) * 100),
  )
  const categories = Object.entries(report.byCategory ?? {}).sort(
    (left, right) => right[1] - left[1],
  )
  const metricKinds: MetricKind[] = ['income', 'spending', 'net']
  const currentTotals: Record<MetricKind, number> = {
    income: report.incomeMinor,
    spending: report.spendingMinor,
    net: report.netMinor,
  }
  const previousTotals: Record<MetricKind, number> = {
    income: previousReport?.incomeMinor ?? 0,
    spending: previousReport?.spendingMinor ?? 0,
    net: previousReport?.netMinor ?? 0,
  }
  const comparisons: MetricComparison[] = previousReport
    ? metricKinds
        .map((kind) =>
          describeMetricChange(kind, currentTotals[kind], previousTotals[kind]),
        )
        .filter((item): item is MetricComparison => item !== null)
    : []
  const canShareReport =
    workspace.permissions?.includes('export_data') === true
  const reportPeriod = new Date(period.from)

  return (
    <PageFrame className="insights-page analytics-page">
      <PageHeader
        title="Insights"
        description="A factual summary of activity in the current month."
        actions={
          canShareReport ? (
            <Button
              variant="secondary"
              onClick={() =>
                setSharePayload(
                  buildMonthlySummarySharePayload(
                    {
                      period: {
                        year: reportPeriod.getUTCFullYear(),
                        month: reportPeriod.getUTCMonth() + 1,
                      },
                      income: {
                        amountMinor: report.incomeMinor,
                        currency,
                      },
                      spending: {
                        amountMinor: report.spendingMinor,
                        currency,
                      },
                      net: { amountMinor: report.netMinor, currency },
                      workspaceName: workspace.name,
                      topCategory: categories[0]
                        ? {
                            name: categories[0][0],
                            amount: {
                              amountMinor: categories[0][1],
                              currency,
                            },
                          }
                        : undefined,
                    },
                    {
                      locale: navigator.language,
                      concealAmounts: privacyMode,
                    },
                  ),
                )
              }
            >
              <Share2 aria-hidden="true" />
              Share summary
            </Button>
          ) : undefined
        }
      />
      <div className="insight-hero">
        <div>
          <span>Net cash flow this month</span>
          <MoneyText
            money={{ amountMinor: report.netMinor, currency }}
          />
          <Badge tone={report.netMinor >= 0 ? 'positive' : 'warning'}>
            {report.netMinor >= 0 ? (
              <TrendingUp aria-hidden="true" />
            ) : (
              <TrendingDown aria-hidden="true" />
            )}
            {report.netMinor >= 0
              ? 'Income is at or above spending'
              : 'Spending is above income'}
          </Badge>
          {comparisons.map((comparison) => (
            <Badge key={comparison.label} tone={comparison.tone}>
              {comparison.label}
            </Badge>
          ))}
        </div>
        <figure
          className="insight-bars"
          style={{ margin: 0, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
        >
          <figcaption className="insight-chart-caption">
            <span>
              <i className="income" aria-hidden="true" />
              Income
            </span>
            <span>
              <i className="expense" aria-hidden="true" />
              Spending
            </span>
            <span className="visually-hidden">
              Relative comparison of current-month income and spending.
            </span>
          </figcaption>
          {[
            ['income', incomeHeight],
            ['expense', spendingHeight],
          ].map(([kind, height], index) => (
            <motion.span
              key={String(kind)}
              className={String(kind)}
              aria-hidden="true"
              initial={reduce ? false : { scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{
                duration: reduce ? 0 : 0.42,
                delay: reduce ? 0 : Math.min(index * 0.055, 0.2),
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{
                height: `${Number(height)}%`,
                transformOrigin: 'bottom',
              }}
            />
          ))}
        </figure>
      </div>
      <div className="insight-grid">
        <Section>
          <h2>Spending by category</h2>
          {categories.length ? (
            <div className="insight-list">
              {categories.map(([category, amountMinor], index) => (
                <MotionListItem key={category} index={index}>
                  <ListRow
                    leading={<ReceiptText aria-hidden="true" />}
                    title={friendlyLabel(category)}
                    subtitle={
                      (previousReport
                        ? describeCategoryChange(
                            amountMinor,
                            previousReport.byCategory?.[category] ?? 0,
                          )
                        : null) ?? 'Current report period'
                    }
                    trailing={
                      <MoneyText money={{ amountMinor, currency }} />
                    }
                  />
                </MotionListItem>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ReceiptText />}
              title="No spending in this period"
              message="Categories will appear after expense activity is recorded."
            />
          )}
        </Section>
        <Section className="insight-note">
          <FileText aria-hidden="true" />
          <h2>About this report</h2>
          <p>
            {report.summary ||
              'This report summarises income and spending recorded in the selected period.'}
          </p>
          <small>{report.disclaimer}</small>
        </Section>
      </div>
      <ShareSheet
        open={Boolean(sharePayload)}
        onOpenChange={(open) => {
          if (!open) setSharePayload(null)
        }}
        payload={sharePayload}
        privacyNote="Only monthly totals and the top category are included. Transactions, account details, member data, and internal IDs stay private."
      />
    </PageFrame>
  )
}

export function InsightsPage() {
  const { demoMode, privacyMode, workspace } = useApp()
  const reduce = useReducedMotion()
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null)
  if (!demoMode) return <LiveInsightsPage />
  const weeklyIndexes = [
    { week: 1, income: 42, spending: 61 },
    { week: 2, income: 50, spending: 78 },
    { week: 3, income: 58, spending: 82 },
    { week: 4, income: 68, spending: 88 },
  ]
  return (
    <PageFrame className="insights-page analytics-page">
      <PageHeader
        title="Insights"
        description="Patterns that help you decide what to change."
        actions={
          <Button
            variant="secondary"
            onClick={() =>
              setSharePayload(
                buildMonthlySummarySharePayload(
                  {
                    period: { year: 2026, month: 7 },
                    income: { amountMinor: 24650000, currency: 'INR' },
                    spending: { amountMinor: 15470000, currency: 'INR' },
                    net: { amountMinor: 9180000, currency: 'INR' },
                    workspaceName: workspace.name,
                    topCategory: {
                      name: 'Transport',
                      amount: { amountMinor: 3260000, currency: 'INR' },
                    },
                  },
                  {
                    locale: navigator.language,
                    concealAmounts: privacyMode,
                  },
                ),
              )
            }
          >
            <Share2 aria-hidden="true" />
            Share summary
          </Button>
        }
      />
      <div className="insight-hero">
        <div>
          <span>Net cash flow in July</span>
          <MoneyText money={{ amountMinor: 9180000, currency: 'INR' }} />
          <Badge tone="positive">
            <TrendingUp aria-hidden="true" />
            12% better than June
          </Badge>
        </div>
        <figure className="insight-bars" style={{ margin: 0 }}>
          <figcaption className="insight-chart-caption">
            <span>
              <i className="income" aria-hidden="true" />
              Income
            </span>
            <span>
              <i className="expense" aria-hidden="true" />
              Spending
            </span>
            <span className="visually-hidden">
              Four-week relative index comparison. Income rose from 42 in week
              one to 68 in week four. Spending rose from 61 to 88 over the same
              period.
            </span>
          </figcaption>
          {weeklyIndexes.flatMap(({ week, income, spending }) => [
            <motion.span
              key={`income-${week}`}
              className="income"
              aria-hidden="true"
              initial={reduce ? false : { scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{
                duration: reduce ? 0 : 0.42,
                delay: reduce ? 0 : (week - 1) * 0.08,
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{ height: `${income}%`, transformOrigin: 'bottom' }}
            />,
            <motion.span
              key={`spending-${week}`}
              className="expense"
              aria-hidden="true"
              initial={reduce ? false : { scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 1 }}
              transition={{
                duration: reduce ? 0 : 0.42,
                delay: reduce ? 0 : (week - 1) * 0.08 + 0.035,
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{ height: `${spending}%`, transformOrigin: 'bottom' }}
            />,
          ])}
        </figure>
      </div>
      <div className="insight-grid">
        <Section>
          <h2>Where spending changed</h2>
          <div className="insight-list">
            {[
              {
                icon: <TrendingDown aria-hidden="true" />,
                title: 'Dining',
                subtitle: 'Down from last month',
                change: '-18%',
                className: 'positive-text',
              },
              {
                icon: <TrendingUp aria-hidden="true" />,
                title: 'Transport',
                subtitle: 'Higher than your recent average',
                change: '+11%',
                className: 'warning-text',
              },
              {
                icon: <TrendingDown aria-hidden="true" />,
                title: 'Shopping',
                subtitle: 'Down from last month',
                change: '-7%',
                className: 'positive-text',
              },
            ].map((item, index) => (
              <MotionListItem key={item.title} index={index}>
                <ListRow
                  leading={item.icon}
                  title={item.title}
                  subtitle={item.subtitle}
                  trailing={
                    <strong className={item.className}>{item.change}</strong>
                  }
                />
              </MotionListItem>
            ))}
          </div>
        </Section>
        <Section className="insight-note">
          <Sparkles aria-hidden="true" />
          <h2>A useful pattern</h2>
          <p>
            Dining spend fell after you set a weekly limit. At the current pace,
            you could move the remaining amount to your emergency goal.
          </p>
          <Link
            className="button button-secondary"
            to="/app/budgets"
          >
            Review suggestion
          </Link>
        </Section>
      </div>
      <ShareSheet
        open={Boolean(sharePayload)}
        onOpenChange={(open) => {
          if (!open) setSharePayload(null)
        }}
        payload={sharePayload}
        privacyNote="Only monthly totals and the top category are included. Transactions, account details, member data, and internal IDs stay private."
      />
    </PageFrame>
  )
}
