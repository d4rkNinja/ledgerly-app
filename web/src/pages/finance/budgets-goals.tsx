import {
  PiggyBank,
  Plus,
  Target,
  Check,
  CircleDollarSign,
  Link2,
  RotateCcw,
  X,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  motion,
  useReducedMotion,
} from 'motion/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useApp } from '@/app/app-state'
import {
  budgets as demoBudgets,
  goals as demoGoals,
} from '@/domain/demo-data'
import type {
  Budget,
  Account,
  Goal,
} from '@/domain/types'
import { formatDate, formatMoney } from '@/lib/format'
import { ApiError, api } from '@/lib/api-client'
import { invalidatePeriodReviewQueries } from '@/lib/period-review-query'
import {
  dateOnlyToUtcDate,
  isDateOnly,
  todayDateOnly,
  toUtcDateOnly,
  type DateOnly,
} from '@/lib/date-only'
import { DatePicker } from '@/components/date-picker'
import {
  Dialog,
  Field,
} from '@/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/motion/select'
import { buildSafeTextSharePayload, type SharePayload } from '@/lib/share'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
} from '@/components/ui'
import {
  BudgetCreateDialog,
  GoalCreateDialog,
  removeDemoSessionItem,
  useDemoSessionCollection,
  useQueryDialog,
} from '../finance-writes'

import {
  DataSkeleton,
  InfoNotice,
  MoneyText,
  PageFrame,
  Progress,
} from './shared'
import { hasWorkspacePermission, useFinanceData } from './data'
import { RecordActionDrawer } from './record-action-drawer'
import { BudgetEditDialog, GoalEditDialog } from './record-edit-dialogs'

type GoalActionMode = 'progress' | 'transaction' | 'link' | 'reschedule'

function goalActionError(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

function goalDueDateOnly(goal: Goal): DateOnly | null {
  const value = goal.dueDate ?? goal.targetDate
  const date = value?.slice(0, 10)
  return isDateOnly(date) ? date : null
}

function goalDeadlineLabel(goal: Goal, today = todayDateOnly()) {
  if (goal.status === 'achieved') {
    return goal.completionDate
      ? `Completed ${formatDate(goal.completionDate)}`
      : 'Completed'
  }
  if (goal.status === 'cancelled') return 'Cancelled'
  const dueDate = goalDueDateOnly(goal)
  if (!dueDate) return 'No due date'
  const days = Math.round(
    (dateOnlyToUtcDate(dueDate).getTime() - dateOnlyToUtcDate(today).getTime()) /
      86_400_000,
  )
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`
  if (days === 0) return 'Due today'
  return `${days} day${days === 1 ? '' : 's'} remaining`
}

function goalHistoryActionLabel(action: string) {
  return action.replaceAll('_', ' ')
}

function goalTransactionType(goal: Goal) {
  if (goal.direction === 'receive') return 'income'
  if (goal.direction === 'pay') return 'expense'
  if (goal.direction === 'save') return 'transfer'
  return 'expense'
}

function GoalActionDialog({
  goal,
  mode,
  open,
  onClose,
  onComplete,
}: {
  goal: Goal | null
  mode: GoalActionMode | null
  open: boolean
  onClose: () => void
  onComplete: () => void
}) {
  const { demoMode, workspace } = useApp()
  const queryClient = useQueryClient()
  const accountsQuery = useFinanceData<Account[]>('accounts', '/accounts', [])
  const accounts = accountsQuery.data ?? []
  const firstAccountId = accountsQuery.data?.[0]?.id
  const [amount, setAmount] = useState('')
  const [occurredAt, setOccurredAt] = useState<DateOnly>(todayDateOnly())
  const [dueDate, setDueDate] = useState<DateOnly | ''>('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [accountId, setAccountId] = useState('')
  const [destinationAccountId, setDestinationAccountId] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const idempotencyKey = useRef<string | null>(null)

  useEffect(() => {
    if (!open || !goal) return
    setAmount('')
    setOccurredAt(todayDateOnly())
    setDueDate((goal.dueDate ? goal.dueDate.slice(0, 10) : goal.targetDate ? goal.targetDate.slice(0, 10) : '') as DateOnly | '')
    setCategory(goal.category ?? '')
    setDescription(goal.name)
    setNotes(goal.notes ?? '')
    setAccountId(goal.accountId ?? firstAccountId ?? '')
    setDestinationAccountId('')
    setTransactionId('')
    setConfirming(false)
    setBusy(false)
    setFeedback('')
    idempotencyKey.current = null
  }, [firstAccountId, goal, open])

  const type = goal ? goalTransactionType(goal) : 'expense'
  const selectedAccount = accounts.find((account) => account.id === accountId)
  const availableDestinations = accounts.filter((account) => account.id !== accountId)

  const invalidate = async (includePeriodReview: boolean) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['goals', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['transactions', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['accounts', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['insights', workspace.id] }),
      ...(includePeriodReview
        ? [invalidatePeriodReviewQueries(queryClient, workspace.id)]
        : []),
    ])
  }

  const execute = async () => {
    if (!goal || !mode || busy) return
    const amountMinor = Math.round(Number(amount) * 100)
    if (mode === 'link' && !transactionId.trim()) {
      setFeedback('Enter the transaction ID to link.')
      return
    }
    if (mode !== 'reschedule' && mode !== 'link' && (!Number.isSafeInteger(amountMinor) || amountMinor <= 0)) {
      setFeedback('Enter a positive amount in major currency units.')
      return
    }
    if (mode === 'reschedule' && !dueDate) {
      setFeedback('Choose a due date.')
      return
    }
    if (mode === 'transaction' && (!accountId || (type === 'transfer' && !destinationAccountId))) {
      setFeedback(type === 'transfer' ? 'Choose source and destination accounts.' : 'Choose an account.')
      return
    }
    setBusy(true)
    setFeedback('')
    const actionKey = () => {
      idempotencyKey.current ??= crypto.randomUUID()
      return idempotencyKey.current
    }
    try {
      if (demoMode) {
        setFeedback('This goal action is session-only in demo mode.')
        await new Promise((resolve) => window.setTimeout(resolve, 250))
      } else if (mode === 'progress') {
        await api.post(
          `/workspaces/${workspace.id}/goals/${goal.id}/progress`,
          { amountMinor, occurredAt: toUtcDateOnly(occurredAt) },
          { 'Idempotency-Key': actionKey() },
        )
      } else if (mode === 'reschedule') {
        if (!dueDate) return
        await api.post(
          `/workspaces/${workspace.id}/goals/${goal.id}/reschedule`,
          { dueDate: toUtcDateOnly(dueDate as DateOnly) },
        )
      } else if (mode === 'link') {
        await api.post(
          `/workspaces/${workspace.id}/goals/${goal.id}/link-transaction`,
          { transactionId: transactionId.trim() },
          { 'Idempotency-Key': actionKey() },
        )
      } else {
        await api.post(
          `/workspaces/${workspace.id}/goals/${goal.id}/transactions`,
          {
            amountMinor,
            occurredAt: toUtcDateOnly(occurredAt),
            accountId,
            destinationAccountId: type === 'transfer' ? destinationAccountId : undefined,
            transactionType: type,
            category,
            description,
            notes,
            contactId: goal.contactId,
            currency: selectedAccount?.balance.currency ?? goal.target.currency,
            privacy: 'workspace',
          },
          { 'Idempotency-Key': actionKey() },
        )
      }
      await invalidate(mode === 'transaction')
      onComplete()
    } catch (error) {
      setFeedback(goalActionError(error, 'The goal action could not be saved. No changes were made.'))
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (mode === 'transaction' && !confirming) {
      setConfirming(true)
      return
    }
    void execute()
  }

  const title = mode === 'progress'
    ? 'Record goal progress'
    : mode === 'transaction'
      ? 'Create linked transaction'
      : mode === 'link'
        ? 'Link existing transaction'
        : 'Reschedule goal'

  return (
    <Dialog
      open={open && Boolean(goal && mode)}
      title={title}
      description={mode === 'transaction' ? 'The transaction will be linked to this goal and use the declared transaction date.' : undefined}
      onClose={busy ? () => undefined : onClose}
    >
      <form className="dialog-form finance-write-form" onSubmit={submit} aria-busy={busy || undefined}>
        {goal ? <p className="goal-action-context"><strong>{goal.name}</strong><span>{formatMoney(goal.remaining ?? { amountMinor: Math.max(0, goal.target.amountMinor - goal.saved.amountMinor), currency: goal.target.currency })} remaining</span></p> : null}
        {mode === 'reschedule' ? (
          <DatePicker label="New due date" value={dueDate} min={goal?.startDate?.slice(0, 10)} error={feedback} onValueChange={(value) => { setFeedback(''); setDueDate(value as DateOnly) }} />
        ) : mode === 'link' ? (
          <Field label="Transaction ID" error={feedback} hint="Paste an existing transaction ID from the transaction details or URL.">
            <input value={transactionId} onChange={(event) => { setFeedback(''); setTransactionId(event.target.value) }} placeholder="Transaction ID" />
          </Field>
        ) : (
          <>
            <div className="two-fields">
              <Field label="Amount" error={feedback && !confirming ? feedback : undefined}>
                <input inputMode="decimal" value={amount} onChange={(event) => { setFeedback(''); setAmount(event.target.value) }} placeholder="0.00" aria-label="Goal action amount" />
              </Field>
              <DatePicker label="Completion date" value={occurredAt} onValueChange={(value) => setOccurredAt(value as DateOnly)} />
            </div>
            {mode === 'transaction' ? (
              <>
                <div className="two-fields">
                  <Field label="Account" error={feedback && !confirming ? feedback : undefined}>
                    <Select value={accountId || 'none'} onValueChange={(value) => setAccountId(value === 'none' ? '' : value)}>
                      <SelectTrigger aria-label="Goal transaction account" className="w-full" data-field-control><SelectValue placeholder="Choose account" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Choose account</SelectItem>
                        {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name} · {account.balance.currency}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  {type === 'transfer' ? (
                    <Field label="Destination account">
                      <Select value={destinationAccountId || 'none'} onValueChange={(value) => setDestinationAccountId(value === 'none' ? '' : value)}>
                        <SelectTrigger aria-label="Goal destination account" className="w-full" data-field-control><SelectValue placeholder="Choose destination" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Choose destination</SelectItem>
                          {availableDestinations.map((account) => <SelectItem key={account.id} value={account.id}>{account.name} · {account.balance.currency}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : null}
                </div>
                <div className="two-fields">
                  <Field label="Category"><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder={goal?.category || 'Goal progress'} /></Field>
                  <Field label="Description"><input value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
                </div>
                <Field label="Notes"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
              </>
            ) : null}
          </>
        )}
        {confirming ? (
          <div className="goal-action-confirmation" role="alert">
            <strong>Record this real transaction?</strong>
            <p>This creates a transaction dated {occurredAt} and links it to “{goal?.name}”.</p>
            <div className="dialog-actions">
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>Review</Button>
              <Button type="button" onClick={() => void execute()} loading={busy}>Confirm and record</Button>
            </div>
          </div>
        ) : (
          <>
            {feedback ? <p className="form-alert" role="alert">{feedback}</p> : null}
            <div className="dialog-actions">
              <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button type="submit" loading={busy}>{mode === 'transaction' ? 'Review transaction' : mode === 'progress' ? 'Save progress' : mode === 'link' ? 'Link transaction' : 'Reschedule'}</Button>
            </div>
          </>
        )}
      </form>
    </Dialog>
  )
}

function GoalLifecycleActions({
  goal,
  workspaceId,
  demoMode,
  onChanged,
}: {
  goal: Goal
  workspaceId: string
  demoMode: boolean
  onChanged: () => Promise<void>
}) {
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cancel = async () => {
    if (!confirmCancel || busy) return
    setBusy(true)
    setError('')
    try {
      if (!demoMode) await api.post(`/workspaces/${workspaceId}/goals/${goal.id}/cancel`, {})
      await onChanged()
      setConfirmCancel(false)
    } catch (cause) {
      setError(goalActionError(cause, 'Could not update the goal status.'))
    } finally {
      setBusy(false)
    }
  }
  const reopen = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (!demoMode) await api.post(`/workspaces/${workspaceId}/goals/${goal.id}/reopen`, {})
      await onChanged()
    } catch (cause) {
      setError(goalActionError(cause, 'Could not reopen the goal.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="goal-lifecycle-actions">
      {error ? <p className="form-alert" role="alert">{error}</p> : null}
      {goal.status === 'cancelled' ? (
        <Button type="button" variant="secondary" onClick={() => void reopen()} loading={busy}><RotateCcw aria-hidden="true" /> Reopen</Button>
      ) : confirmCancel ? (
        <div className="goal-action-confirmation" role="alert">
          <strong>Cancel this goal?</strong>
          <p>Progress and linked transactions stay in history. You can reopen it later.</p>
          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={() => setConfirmCancel(false)} disabled={busy}>Keep active</Button>
            <Button type="button" variant="danger" onClick={() => void cancel()} loading={busy}>Cancel goal</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setConfirmCancel(true)} disabled={busy}><X aria-hidden="true" /> Cancel goal</Button>
      )}
    </div>
  )
}

export function BudgetsPage() {
  const { demoMode, workspace } = useApp()
  const queryClient = useQueryClient()
  const query = useFinanceData<Budget[]>('budgets', '/budgets', demoBudgets)
  const canManageBudgets = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'manage_budgets',
  )
  const [dialogOpen, setDialogOpen] = useQueryDialog(
    'add',
    canManageBudgets,
  )
  const reduce = useReducedMotion()
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const items = useDemoSessionCollection(
    demoMode,
    workspace.id,
    'budgets',
    query.data ?? [],
  )
  const spendingAvailable =
    demoMode || items.every((budget) => budget.spendingKnown !== false)
  const budgetTotals = Array.from(
    items
      .reduce((totals, budget) => {
        const currency = budget.limit.currency
        const current = totals.get(currency) ?? {
          planned: 0,
          spent: 0,
          count: 0,
        }
        totals.set(currency, {
          planned: current.planned + budget.limit.amountMinor,
          spent: current.spent + budget.spent.amountMinor,
          count: current.count + 1,
        })
        return totals
      }, new Map<string, { planned: number; spent: number; count: number }>())
      .entries(),
    ([currency, totals]) => ({
      currency,
      ...totals,
      safeToSpend: Math.max(0, totals.planned - totals.spent),
    }),
  )
  const canShareBudget = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'export_data',
  )
  const deleteSelectedBudget = async () => {
    if (!selectedBudget) return
    if (demoMode) {
      removeDemoSessionItem(workspace.id, 'budgets', selectedBudget.id)
      return
    }
    await api.delete<void>(
      `/workspaces/${workspace.id}/budgets/${selectedBudget.id}`,
    )
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['budgets', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['insights', workspace.id] }),
    ])
  }
  const demoBudgetSharePayload: SharePayload | undefined = selectedBudget
    ? buildSafeTextSharePayload({
        title: 'Budget summary',
        text: `${selectedBudget.name} budget: ${formatMoney(selectedBudget.limit)} for a ${selectedBudget.period} period`,
      })
    : undefined

  return (
    <PageFrame>
      <PageHeader
        title="Budgets"
        description="A calm view of what is safe to spend."
        actions={
          canManageBudgets ? (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus aria-hidden="true" />
              New budget
            </Button>
          ) : undefined
        }
      />
      {!canManageBudgets ? (
        <InfoNotice>
          Your workspace role cannot create or manage budgets.
        </InfoNotice>
      ) : null}
      {query.isLoading ? (
        <DataSkeleton />
      ) : query.isError ? (
        <ErrorState
          message="Budgets are unavailable."
          retry={() => query.refetch()}
        />
      ) : !items.length ? (
        <EmptyState
          icon={<PiggyBank />}
          title="No budgets yet"
          message="Create a budget to track a safe spending pace."
          action={
            canManageBudgets ? (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus aria-hidden="true" />
                Create budget
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {budgetTotals.length === 1 ? (
            <section className="budget-overview" aria-label="Budget summary">
              <div>
                <span>Planned this month</span>
                <MoneyText
                  money={{
                    amountMinor: budgetTotals[0].planned,
                    currency: budgetTotals[0].currency,
                  }}
                />
              </div>
              {spendingAvailable ? (
                <>
                  <div>
                    <span>Spent</span>
                    <MoneyText
                      money={{
                        amountMinor: budgetTotals[0].spent,
                        currency: budgetTotals[0].currency,
                      }}
                    />
                  </div>
                  <div>
                    <span>Safe to spend</span>
                    <MoneyText
                      money={{
                        amountMinor: budgetTotals[0].safeToSpend,
                        currency: budgetTotals[0].currency,
                      }}
                    />
                  </div>
                </>
              ) : (
                <div>
                  <span>Spending progress</span>
                  <strong>Not included</strong>
                </div>
              )}
            </section>
          ) : (
            <section
              className="budget-currency-overview"
              aria-label="Budget summary by currency"
            >
              {budgetTotals.map((total) => (
                <article key={total.currency}>
                  <header>
                    <strong>{total.currency}</strong>
                    <Badge>
                      {total.count}{' '}
                      {total.count === 1 ? 'budget' : 'budgets'}
                    </Badge>
                  </header>
                  <div>
                    <span>Planned</span>
                    <MoneyText
                      money={{
                        amountMinor: total.planned,
                        currency: total.currency,
                      }}
                    />
                  </div>
                  {spendingAvailable ? (
                    <>
                      <div>
                        <span>Spent</span>
                        <MoneyText
                          money={{
                            amountMinor: total.spent,
                            currency: total.currency,
                          }}
                        />
                      </div>
                      <div>
                        <span>Safe to spend</span>
                        <MoneyText
                          money={{
                            amountMinor: total.safeToSpend,
                            currency: total.currency,
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <div>
                      <span>Spending progress</span>
                      <strong>Not included</strong>
                    </div>
                  )}
                </article>
              ))}
            </section>
          )}
          <div className="budget-detail-grid">
            {items.map((budget, index) => {
              const percentage = budget.limit.amountMinor
                ? (budget.spent.amountMinor / budget.limit.amountMinor) * 100
                : 0
              return (
                <motion.article
                  className="budget-detail record-card-interactive"
                  key={budget.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for ${budget.name} budget`}
                  onClick={() => setSelectedBudget(budget)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    setSelectedBudget(budget)
                  }}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: reduce ? 0 : 0.3,
                    delay: reduce ? 0 : Math.min(index * 0.045, 0.2),
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <header>
                    <span className="category-icon debit">
                      <PiggyBank aria-hidden="true" />
                    </span>
                  </header>
                  <h2>{budget.name}</h2>
                  {spendingAvailable ? (
                    <>
                      <p>
                        <MoneyText money={budget.spent} /> spent of{' '}
                        <MoneyText money={budget.limit} />
                      </p>
                      <Progress
                        value={percentage}
                        label={`${budget.name} budget used`}
                        tone={percentage > 85 ? 'warning' : 'accent'}
                      />
                      <small>
                        {percentage > 85
                          ? 'Close to the monthly limit'
                          : `${Math.round(100 - percentage)}% remains for ${budget.period}`}
                      </small>
                    </>
                  ) : (
                    <>
                      <p>
                        Planned limit <MoneyText money={budget.limit} />
                      </p>
                      <small>
                        Spending progress is not included by the live budget
                        endpoint.
                      </small>
                    </>
                  )}
                </motion.article>
              )
            })}
          </div>
        </>
      )}
      <BudgetCreateDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
      <RecordActionDrawer
        open={Boolean(selectedBudget)}
        onClose={() => setSelectedBudget(null)}
        title={selectedBudget?.name ?? 'Budget details'}
        description="Review the plan before you change or share it."
        details={selectedBudget ? [
          { label: 'Limit', value: formatMoney(selectedBudget.limit) },
          { label: 'Spent', value: selectedBudget.spendingKnown === false ? 'Not available' : formatMoney(selectedBudget.spent) },
          { label: 'Period', value: selectedBudget.period },
          { label: 'Categories', value: selectedBudget.categories?.length ? selectedBudget.categories.join(', ') : 'All eligible spending' },
          { label: 'Rollover', value: selectedBudget.rollover ? 'Enabled' : 'Off' },
        ] : []}
        onEdit={canManageBudgets && selectedBudget ? () => setEditingBudget(selectedBudget) : undefined}
        canShare={canShareBudget}
        sharePath={selectedBudget && !demoMode ? `/workspaces/${workspace.id}/budgets/${selectedBudget.id}/share` : undefined}
        demoSharePayload={demoMode ? demoBudgetSharePayload : undefined}
        canDelete={canManageBudgets}
        deleteLabel="Delete budget"
        onDelete={deleteSelectedBudget}
      />
      <BudgetEditDialog
        budget={editingBudget}
        open={Boolean(editingBudget)}
        onClose={() => setEditingBudget(null)}
      />
    </PageFrame>
  )
}

export function GoalsPage() {
  const { demoMode, workspace } = useApp()
  const queryClient = useQueryClient()
  const query = useFinanceData<Goal[]>('goals', '/goals', demoGoals)
  const [searchParams, setSearchParams] = useSearchParams()
  const canManageGoals = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'manage_goals',
  )
  const [dialogOpen, setDialogOpen] = useQueryDialog(
    'add',
    canManageGoals,
  )
  const reduce = useReducedMotion()
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const [goalActionTarget, setGoalActionTarget] = useState<Goal | null>(null)
  const [goalActionMode, setGoalActionMode] = useState<GoalActionMode | null>(null)
  const items = useDemoSessionCollection(
    demoMode,
    workspace.id,
    'goals',
    query.data ?? [],
  )
  const requestedGoalId = searchParams.get('goal')?.trim() ?? ''
  const listedGoal = requestedGoalId
    ? items.find((goal) => goal.id === requestedGoalId)
    : undefined
  const goalDetailQuery = useFinanceData<Goal | null>(
    'goal',
    requestedGoalId ? `/goals/${encodeURIComponent(requestedGoalId)}` : '/goals/__none__',
    null,
    Boolean(requestedGoalId && !listedGoal && !demoMode),
    false,
  )
  const canShareGoal = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'export_data',
  )
  const canCreateGoalTransactions = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'create_transactions',
  )
  const refreshGoals = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['goals', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['insights', workspace.id] }),
    ])
    await query.refetch()
  }
  const clearGoalSelection = () => {
    setSelectedGoal(null)
    if (!searchParams.has('goal')) return
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.delete('goal')
    setSearchParams(nextSearchParams, { replace: true })
  }
  const selectGoal = (goal: Goal) => {
    setSelectedGoal(goal)
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.set('goal', goal.id)
    setSearchParams(nextSearchParams)
  }
  useEffect(() => {
    if (query.isLoading || query.isError) return
    if (!requestedGoalId) {
      if (selectedGoal) setSelectedGoal(null)
      return
    }
    const resolvedGoal = listedGoal ?? goalDetailQuery.data
    if (resolvedGoal) {
      if (selectedGoal?.id !== resolvedGoal.id) setSelectedGoal(resolvedGoal)
      return
    }
    if (demoMode || goalDetailQuery.isError || goalDetailQuery.isSuccess) {
      setSelectedGoal(null)
      const nextSearchParams = new URLSearchParams(searchParams)
      nextSearchParams.delete('goal')
      setSearchParams(nextSearchParams, { replace: true })
    }
  }, [
    demoMode,
    goalDetailQuery.data,
    goalDetailQuery.isError,
    goalDetailQuery.isSuccess,
    listedGoal,
    query.isError,
    query.isLoading,
    requestedGoalId,
    searchParams,
    selectedGoal,
    setSearchParams,
  ])
  const openGoalAction = (mode: GoalActionMode) => {
    if (!selectedGoal) return
    setGoalActionTarget(selectedGoal)
    setGoalActionMode(mode)
    clearGoalSelection()
  }
  const deleteSelectedGoal = async () => {
    if (!selectedGoal) return
    if (demoMode) {
      removeDemoSessionItem(workspace.id, 'goals', selectedGoal.id)
      return
    }
    await api.delete<void>(
      `/workspaces/${workspace.id}/goals/${selectedGoal.id}`,
    )
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['goals', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['insights', workspace.id] }),
    ])
  }
  const demoGoalSharePayload: SharePayload | undefined = selectedGoal
    ? buildSafeTextSharePayload({
        title: 'Goal summary',
        text: `${selectedGoal.name} goal: ${formatMoney(selectedGoal.saved)} saved of ${formatMoney(selectedGoal.target)}`,
      })
    : undefined
  return (
    <PageFrame>
      <PageHeader
        title="Goals"
        description="Turn longer-term plans into small, visible steps."
        actions={
          canManageGoals ? (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus aria-hidden="true" />
              New goal
            </Button>
          ) : undefined
        }
      />
      {!canManageGoals ? (
        <InfoNotice>
          Your workspace role cannot create or manage goals.
        </InfoNotice>
      ) : null}
      {query.isLoading ? (
        <DataSkeleton />
      ) : query.isError ? (
        <ErrorState
          message="Goals are unavailable."
          retry={() => query.refetch()}
        />
      ) : !items.length ? (
        <EmptyState
          icon={<Target />}
          title="No goals yet"
          message="Goals will appear here once one is available for this workspace."
          action={
            canManageGoals ? (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus aria-hidden="true" />
                Create goal
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="goal-grid">
          {items.map((goal, index) => {
            const percentage = goal.target.amountMinor
              ? (goal.saved.amountMinor / goal.target.amountMinor) * 100
              : 0
            const status = goal.status ?? (percentage >= 100 ? 'achieved' : 'in_progress')
            const statusLabel = status === 'achieved'
              ? 'Achieved'
              : status === 'cancelled'
                ? 'Cancelled'
                : status === 'overdue'
                  ? 'Overdue'
                  : status === 'due_today'
                    ? 'Due today'
                    : status === 'due_soon'
                      ? 'Due soon'
                      : percentage > 0
                        ? 'In progress'
                        : 'Not started'
            return (
              <motion.article
                className={`goal-card goal-tone-${index} record-card-interactive`}
                key={goal.id}
                role="button"
                tabIndex={0}
                aria-label={`View details for ${goal.name} goal`}
                onClick={() => selectGoal(goal)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  selectGoal(goal)
                }}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reduce ? 0 : 0.3,
                  delay: reduce ? 0 : Math.min(index * 0.045, 0.2),
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <header>
                  <span>
                    <Target aria-hidden="true" />
                  </span>
                  <Badge tone={status === 'achieved' ? 'positive' : status === 'overdue' || status === 'cancelled' ? 'warning' : 'neutral'}>
                    {statusLabel}
                  </Badge>
                </header>
                <h2>{goal.name}</h2>
                <div className="goal-money">
                  <MoneyText money={goal.saved} />
                  <span>
                    of <MoneyText money={goal.target} />
                  </span>
                </div>
                <Progress value={percentage} label={`${goal.name} progress`} />
                <footer>
                  <span>
                    {goal.dueDate || goal.targetDate
                      ? `Due ${formatDate(goal.dueDate ?? goal.targetDate ?? '')}`
                      : 'No target date'}
                  </span>
                  <strong>{Math.round(percentage)}%</strong>
                </footer>
              </motion.article>
            )
          })}
        </div>
      )}
      <GoalCreateDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
      <RecordActionDrawer
        open={Boolean(selectedGoal)}
        onClose={clearGoalSelection}
        title={selectedGoal?.name ?? 'Goal details'}
        description="Keep the target and progress clear before taking an action."
        details={selectedGoal ? [
          { label: 'Saved', value: formatMoney(selectedGoal.saved) },
          { label: 'Target', value: formatMoney(selectedGoal.target) },
          { label: 'Remaining', value: formatMoney(selectedGoal.remaining ?? { amountMinor: Math.max(0, selectedGoal.target.amountMinor - selectedGoal.saved.amountMinor), currency: selectedGoal.target.currency }) },
          { label: 'Percentage', value: `${Math.round(selectedGoal.target.amountMinor > 0 ? Math.min(100, Math.max(0, selectedGoal.saved.amountMinor / selectedGoal.target.amountMinor * 100)) : 0)}%` },
          { label: 'Status', value: (selectedGoal.status ?? 'in_progress').replaceAll('_', ' ') },
          { label: 'Type', value: selectedGoal.type ?? 'savings_target' },
          { label: 'Direction', value: selectedGoal.direction ?? 'save' },
          { label: 'Contact', value: [selectedGoal.contact?.name ?? selectedGoal.contactName, selectedGoal.contact?.phone, selectedGoal.contact?.email].filter(Boolean).join(' · ') || 'No contact' },
          { label: 'Account', value: selectedGoal.accountId ?? 'No account' },
          { label: 'Category', value: selectedGoal.category ?? 'No category' },
          { label: 'Description', value: selectedGoal.description ?? 'No description' },
          { label: 'Start date', value: selectedGoal.startDate ? formatDate(selectedGoal.startDate) : 'No start date' },
          { label: 'Due date', value: selectedGoal.dueDate || selectedGoal.targetDate ? formatDate(selectedGoal.dueDate ?? selectedGoal.targetDate ?? '') : 'No due date' },
          { label: 'Days remaining', value: goalDeadlineLabel(selectedGoal) },
          { label: 'Created by', value: selectedGoal.createdBySummary?.name ?? 'Creator unavailable' },
          { label: 'Completion', value: selectedGoal.completionDate ? formatDate(selectedGoal.completionDate) : 'Not completed' },
          { label: 'Linked transactions', value: `${selectedGoal.linkedTransactionIds?.length ?? 0} linked` },
          { label: 'Visibility', value: selectedGoal.visibility === 'private' ? 'Private' : 'Workspace' },
        ] : []}
        actionContent={selectedGoal ? (
          <div className="goal-detail-content">
            <section className="goal-detail-section" aria-labelledby="goal-linked-transactions-title">
              <h3 id="goal-linked-transactions-title">Linked transactions</h3>
              {selectedGoal.linkedTransactionIds?.length ? (
                <ul className="goal-linked-transaction-list">
                  {selectedGoal.linkedTransactionIds.map((transactionId) => (
                    <li key={transactionId}>
                      <Link to={`/app/transactions?transaction=${encodeURIComponent(transactionId)}`}>
                        Open transaction {transactionId}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="goal-detail-muted">No linked transactions yet.</p>}
            </section>
            <section className="goal-detail-section" aria-labelledby="goal-history-title">
              <h3 id="goal-history-title">Activity history</h3>
              {selectedGoal.history?.length ? (
                <ul className="goal-history-list">
                  {selectedGoal.history.slice().reverse().map((entry, index) => (
                    <li key={`${entry.createdAt}-${entry.action}-${index}`}>
                      <strong>{goalHistoryActionLabel(entry.action)}</strong>
                      <span>{entry.amountMinor == null ? '' : ` · ${formatMoney({ amountMinor: entry.amountMinor, currency: selectedGoal.target.currency })}`}</span>
                      <small>
                        {[entry.date ? formatDate(entry.date) : null, entry.actorId ? `Actor ${entry.actorId}` : 'System activity', entry.createdAt ? `Recorded ${formatDate(entry.createdAt)}` : null].filter(Boolean).join(' · ')}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : <p className="goal-detail-muted">No activity recorded yet.</p>}
            </section>
            {canManageGoals ? (
              <div className="goal-action-menu">
                <div className="goal-action-grid">
                  <Button type="button" variant="secondary" onClick={() => openGoalAction('progress')} disabled={selectedGoal.status === 'cancelled' || selectedGoal.status === 'achieved'}>
                    <CircleDollarSign aria-hidden="true" /> Record progress
                  </Button>
                  {canCreateGoalTransactions ? (
                    <Button type="button" onClick={() => openGoalAction('transaction')} disabled={selectedGoal.status === 'cancelled' || selectedGoal.status === 'achieved'}>
                      <Check aria-hidden="true" /> Record transaction
                    </Button>
                  ) : null}
                  <Button type="button" variant="secondary" onClick={() => openGoalAction('link')} disabled={selectedGoal.status === 'cancelled' || selectedGoal.status === 'achieved'}>
                    <Link2 aria-hidden="true" /> Link transaction
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => openGoalAction('reschedule')} disabled={selectedGoal.status === 'cancelled'}>
                    <RotateCcw aria-hidden="true" /> Reschedule
                  </Button>
                </div>
                <GoalLifecycleActions goal={selectedGoal} workspaceId={workspace.id} demoMode={demoMode} onChanged={refreshGoals} />
              </div>
            ) : null}
          </div>
        ) : undefined}
        onEdit={canManageGoals && selectedGoal ? () => setEditingGoal(selectedGoal) : undefined}
        canShare={canShareGoal}
        sharePath={selectedGoal && !demoMode ? `/workspaces/${workspace.id}/goals/${selectedGoal.id}/share` : undefined}
        demoSharePayload={demoMode ? demoGoalSharePayload : undefined}
        canDelete={canManageGoals}
        deleteLabel="Delete goal"
        onDelete={deleteSelectedGoal}
      />
      <GoalEditDialog
        goal={editingGoal}
        open={Boolean(editingGoal)}
        onClose={() => setEditingGoal(null)}
      />
      <GoalActionDialog
        goal={goalActionTarget}
        mode={goalActionMode}
        open={Boolean(goalActionTarget && goalActionMode)}
        onClose={() => {
          setGoalActionTarget(null)
          setGoalActionMode(null)
        }}
        onComplete={() => {
          setGoalActionTarget(null)
          setGoalActionMode(null)
          void refreshGoals()
        }}
      />
    </PageFrame>
  )
}
