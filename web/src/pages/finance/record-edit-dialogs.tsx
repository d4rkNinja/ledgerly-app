import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Check, Copy } from 'lucide-react'
import { useApp } from '@/app/app-state'
import { CurrencySelect } from '@/components/currency-select'
import { DatePicker } from '@/components/date-picker'
import { Checkbox } from '@/components/motion/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/motion/select'
import { Button, Dialog, Field } from '@/components/ui'
import type { Budget, Goal, Transaction } from '@/domain/types'
import {
  selectableTransactionCategoryNames,
  transactionCategoryModeFor,
} from '@/domain/transaction-categories'
import { api } from '@/lib/api-client'
import { copyTextToClipboard } from '@/lib/clipboard'
import { useTransactionCategories } from '@/lib/transaction-settings'
import {
  dateOnlyFromUtc,
  isDateOnly,
  toUtcDateOnly,
} from '@/lib/date-only'
import {
  addDemoSessionItem,
  clearFieldError,
  dateInputSchema,
  focusFirstInvalidField,
  moneyInputSchema,
  toMinor,
  toUtcDate,
  useWriteFlow,
} from '../finance-writes/shared'

type BudgetRequest = {
  name: string
  amountMinor: number
  currency: string
  period: string
  categories: string[]
  rollover: boolean
  startAt: string
  endAt: string
}

type GoalRequest = {
  name: string
  description?: string
  type?: string
  customType?: string
  direction?: 'receive' | 'pay' | 'save' | 'neutral'
  targetMinor: number
  currentMinor: number
  currency: string
  startDate?: string
  targetDate?: string
  dueDate?: string
  visibility: 'private' | 'workspace'
  contactName?: string
  category?: string
  reminder?: string
  notes?: string
}

type TransactionRequest = {
  accountId: string
  destinationAccountId?: string
  type: NonNullable<Transaction['rawType']>
  amountMinor: number
  currency: string
  category: string
  merchant: string
  notes: string
	  description?: string
	  contactId?: string
  privacy: 'private' | 'workspace' | 'selected'
  occurredAt: string
}

function majorFromMinor(amountMinor: number) {
  const amount = amountMinor / 100
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
}

function dateForInput(value: string | undefined, fallback = new Date()) {
  const parsed = value ? new Date(value) : fallback
  if (Number.isNaN(parsed.getTime())) return fallback.toISOString().slice(0, 10)
  return parsed.toISOString().slice(0, 10)
}

function currentMonthRange() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

function FormFeedback({ message }: { message?: string }) {
  return message ? <p className="form-alert" role="alert">{message}</p> : null
}

function EditActions({
  busy,
  onClose,
  label,
}: {
  busy: boolean
  onClose: () => void
  label: string
}) {
  return (
    <div className="dialog-actions">
      <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" loading={busy}>{label}</Button>
    </div>
  )
}

export function BudgetEditDialog({
  budget,
  open,
  onClose,
}: {
  budget: Budget | null
  open: boolean
  onClose: () => void
}) {
  const { demoMode, workspace } = useApp()
  const [values, setValues] = useState({ name: '', amount: '', currency: 'INR', period: 'monthly', categories: '', rollover: false, startAt: '', endAt: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || !budget) return
    const range = currentMonthRange()
    setValues({
      name: budget.name,
      amount: majorFromMinor(budget.limit.amountMinor),
      currency: budget.limit.currency,
      period: budget.period.toLowerCase().replaceAll(' ', '_'),
      categories: (budget.categories ?? []).join(', '),
      rollover: budget.rollover === true,
      startAt: dateForInput(budget.startAt, new Date(`${range.start}T00:00:00.000Z`)),
      endAt: dateForInput(budget.endAt, new Date(`${range.end}T00:00:00.000Z`)),
    })
    setErrors({})
  }, [budget, open])

  const flow = useWriteFlow<BudgetRequest>({
    open,
    onClose,
    request: (body) => api.patch(`/workspaces/${workspace.id}/budgets/${budget?.id ?? ''}`, body),
    invalidate: ['budgets', 'dashboard', 'insights'],
    successMessage: 'Budget updated.',
    onServerFields: (fields) => setErrors({ ...fields, amount: fields.amountMinor ?? fields.amount }),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!budget) return
    const nextErrors: Record<string, string> = {}
    const amount = moneyInputSchema().safeParse(values.amount)
    if (!values.name.trim()) nextErrors.name = 'Enter a budget name.'
    if (!values.period.trim()) nextErrors.period = 'Enter a budget period.'
    if (!amount.success) nextErrors.amount = amount.error.issues[0]?.message ?? 'Enter a budget limit.'
    if (!dateInputSchema.safeParse(values.startAt).success) nextErrors.startAt = 'Choose a valid start date.'
    if (!dateInputSchema.safeParse(values.endAt).success) nextErrors.endAt = 'Choose a valid end date.'
    if (!nextErrors.startAt && !nextErrors.endAt && values.endAt <= values.startAt) nextErrors.endAt = 'End date must be after the start date.'
    setErrors(nextErrors)
    flow.setFeedback(null)
    if (Object.keys(nextErrors).length) { focusFirstInvalidField(form); return }
    if (!amount.success) return
    const body: BudgetRequest = {
      name: values.name.trim(),
      amountMinor: toMinor(amount.data),
      currency: values.currency,
      period: values.period.trim().toLowerCase(),
      categories: Array.from(new Set(values.categories.split(',').map((item) => item.trim()).filter(Boolean))).slice(0, 20),
      rollover: values.rollover,
      startAt: toUtcDate(values.startAt),
      endAt: toUtcDate(values.endAt, true),
    }
    if (demoMode) {
      flow.completeDemo(() => addDemoSessionItem(workspace.id, 'budgets', {
        ...budget, name: body.name, limit: { amountMinor: body.amountMinor, currency: body.currency }, period: body.period,
        categories: body.categories, rollover: body.rollover, startAt: body.startAt, endAt: body.endAt,
      }), 'Budget updated in this demo session only.')
      return
    }
    flow.submitLive(body)
  }

  return (
    <Dialog open={open} title="Edit budget" description="Change the plan and period without losing its context." onClose={flow.busy ? () => undefined : onClose}>
      <form className="dialog-form finance-write-form" onSubmit={submit} aria-busy={flow.busy || undefined}>
        <Field label="Budget name" error={errors.name}><input autoFocus maxLength={100} value={values.name} onChange={(event) => { clearFieldError(setErrors, 'name'); setValues((current) => ({ ...current, name: event.target.value })) }} /></Field>
        <div className="two-fields">
          <Field label="Limit" error={errors.amount}><div className="currency-input has-currency-select currency-input-icon-only"><CurrencySelect compact iconOnly value={values.currency} onChange={(currency) => setValues((current) => ({ ...current, currency }))} ariaLabel="Change budget currency" /><input inputMode="decimal" value={values.amount} onChange={(event) => { clearFieldError(setErrors, 'amount'); setValues((current) => ({ ...current, amount: event.target.value })) }} /></div></Field>
          <Field label="Period" error={errors.period}><input maxLength={50} value={values.period} onChange={(event) => { clearFieldError(setErrors, 'period'); setValues((current) => ({ ...current, period: event.target.value })) }} /></Field>
        </div>
        <div className="two-fields">
          <DatePicker label="Start date" value={values.startAt} error={errors.startAt} onValueChange={(value) => { clearFieldError(setErrors, 'startAt'); setValues((current) => ({ ...current, startAt: value })) }} />
          <DatePicker label="End date" value={values.endAt} min={values.startAt} error={errors.endAt} onValueChange={(value) => { clearFieldError(setErrors, 'endAt'); setValues((current) => ({ ...current, endAt: value })) }} />
        </div>
        <Field label="Categories" error={errors.categories} hint="Separate categories with commas."><input value={values.categories} onChange={(event) => setValues((current) => ({ ...current, categories: event.target.value }))} /></Field>
        <div className="finance-write-toggle"><Checkbox checked={values.rollover} onCheckedChange={(rollover) => setValues((current) => ({ ...current, rollover }))} aria-label="Roll unused amount forward" /><span><strong>Roll unused amount forward</strong><small>Keep this preference for the current budget.</small></span></div>
        <FormFeedback message={flow.feedback?.message} />
        <EditActions busy={flow.busy} onClose={onClose} label="Save budget" />
      </form>
    </Dialog>
  )
}

export function GoalEditDialog({
  goal,
  open,
  onClose,
}: {
  goal: Goal | null
  open: boolean
  onClose: () => void
}) {
  const { demoMode, workspace } = useApp()
  const [values, setValues] = useState({ name: '', description: '', type: 'savings_target', customType: '', direction: 'save' as 'receive' | 'pay' | 'save' | 'neutral', target: '', current: '', currency: 'INR', startDate: '', targetDate: '', visibility: 'workspace' as 'private' | 'workspace', contactName: '', category: '', reminder: '', notes: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || !goal) return
    setValues({
      name: goal.name,
      description: goal.description ?? '',
      type: goal.type ?? 'savings_target',
      customType: goal.customType ?? '',
      direction: goal.direction ?? 'save',
      target: majorFromMinor(goal.target.amountMinor),
      current: majorFromMinor(goal.saved.amountMinor),
      currency: goal.target.currency,
      startDate: goal.startDate ? dateForInput(goal.startDate) : '',
      targetDate: goal.targetDate ? dateForInput(goal.targetDate) : '',
      visibility: goal.visibility === 'private' ? 'private' : 'workspace',
      contactName: goal.contact?.name ?? goal.contactName ?? '',
      category: goal.category ?? '',
      reminder: goal.reminder ?? '',
      notes: goal.notes ?? '',
    })
    setErrors({})
  }, [goal, open])

  const flow = useWriteFlow<GoalRequest>({
    open,
    onClose,
    request: (body) => api.patch(`/workspaces/${workspace.id}/goals/${goal?.id ?? ''}`, body),
    invalidate: ['goals', 'dashboard', 'insights'],
    successMessage: 'Goal updated.',
    onServerFields: (fields) => setErrors({ ...fields, target: fields.targetMinor ?? fields.target, current: fields.currentMinor ?? fields.current }),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!goal) return
    const nextErrors: Record<string, string> = {}
    const target = moneyInputSchema().safeParse(values.target)
    const current = moneyInputSchema({ allowZero: true }).safeParse(values.current)
    if (!values.name.trim()) nextErrors.name = 'Enter a goal name.'
    if (!target.success) nextErrors.target = target.error.issues[0]?.message ?? 'Enter a target.'
    if (!current.success) nextErrors.current = current.error.issues[0]?.message ?? 'Enter the saved amount.'
    if (target.success && current.success && current.data > target.data) nextErrors.current = 'Saved amount cannot be greater than the target.'
    if (values.targetDate && !dateInputSchema.safeParse(values.targetDate).success) nextErrors.targetDate = 'Choose a valid date.'
    setErrors(nextErrors)
    flow.setFeedback(null)
    if (Object.keys(nextErrors).length) { focusFirstInvalidField(form); return }
    if (!target.success || !current.success) return
    const body: GoalRequest = {
      name: values.name.trim(),
      description: values.description.trim() || undefined,
      type: values.type,
      customType: values.customType.trim() || undefined,
      direction: values.direction,
      targetMinor: toMinor(target.data),
      currentMinor: toMinor(current.data),
      currency: values.currency,
      startDate: values.startDate ? toUtcDate(values.startDate) : undefined,
      targetDate: values.targetDate ? toUtcDate(values.targetDate) : undefined,
      dueDate: values.targetDate ? toUtcDate(values.targetDate) : undefined,
      visibility: values.visibility,
      contactName: values.contactName.trim() || undefined,
      category: values.category.trim() || undefined,
      reminder: values.reminder.trim() || undefined,
      notes: values.notes.trim() || undefined,
    }
    if (demoMode) {
      flow.completeDemo(() => addDemoSessionItem(workspace.id, 'goals', {
        ...goal, name: body.name, target: { amountMinor: body.targetMinor, currency: body.currency }, saved: { amountMinor: body.currentMinor, currency: body.currency }, targetDate: body.targetDate ?? '', visibility: body.visibility,
      }), 'Goal updated in this demo session only.')
      return
    }
    flow.submitLive(body)
  }

  return (
    <Dialog open={open} title="Edit goal" description="Keep the target and saved amount accurate." onClose={flow.busy ? () => undefined : onClose}>
      <form className="dialog-form finance-write-form" onSubmit={submit} aria-busy={flow.busy || undefined}>
        <Field label="Goal name" error={errors.name}><input autoFocus maxLength={100} value={values.name} onChange={(event) => { clearFieldError(setErrors, 'name'); setValues((current) => ({ ...current, name: event.target.value })) }} /></Field>
        <Field label="Description" error={errors.description}><textarea maxLength={500} value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} /></Field>
        <div className="two-fields">
          <Field label="Goal type" error={errors.type}>
            <Select value={values.type} onValueChange={(type) => setValues((current) => ({ ...current, type }))}>
              <SelectTrigger aria-label="Goal type" className="w-full" data-field-control><SelectValue placeholder="Choose a goal type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="receive_payment">Receive payment</SelectItem>
                <SelectItem value="pay_someone">Pay someone</SelectItem>
                <SelectItem value="savings_target">Savings target</SelectItem>
                <SelectItem value="debt_repayment">Debt repayment</SelectItem>
                <SelectItem value="bill_payment">Bill payment</SelectItem>
                <SelectItem value="purchase_target">Purchase target</SelectItem>
                <SelectItem value="monthly_budget_target">Monthly budget target</SelectItem>
                <SelectItem value="emergency_fund">Emergency fund</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Direction" error={errors.direction}>
            <Select value={values.direction} onValueChange={(direction) => setValues((current) => ({ ...current, direction: direction as typeof current.direction }))}>
              <SelectTrigger aria-label="Goal direction" className="w-full" data-field-control><SelectValue placeholder="Choose direction" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="receive">Receive</SelectItem>
                <SelectItem value="pay">Pay</SelectItem>
                <SelectItem value="save">Save</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {values.type === 'custom' ? <Field label="Custom type label" error={errors.customType}><input maxLength={80} value={values.customType} onChange={(event) => setValues((current) => ({ ...current, customType: event.target.value }))} /></Field> : null}
        <div className="two-fields">
          <Field label="Target" error={errors.target}><div className="currency-input has-currency-select currency-input-icon-only"><CurrencySelect compact iconOnly value={values.currency} onChange={(currency) => setValues((current) => ({ ...current, currency }))} ariaLabel="Change goal currency" /><input inputMode="decimal" value={values.target} onChange={(event) => { clearFieldError(setErrors, 'target'); setValues((current) => ({ ...current, target: event.target.value })) }} /></div></Field>
          <Field label="Saved" error={errors.current}><input inputMode="decimal" value={values.current} onChange={(event) => { clearFieldError(setErrors, 'current'); setValues((current) => ({ ...current, current: event.target.value })) }} /></Field>
        </div>
        <div className="two-fields">
          <DatePicker label="Start date" value={values.startDate} error={errors.startDate} clearable onValueChange={(value) => { clearFieldError(setErrors, 'startDate'); setValues((current) => ({ ...current, startDate: value })) }} />
          <DatePicker label="Target date / due date" value={values.targetDate} error={errors.targetDate || errors.dueDate} min={values.startDate} clearable onValueChange={(value) => { clearFieldError(setErrors, 'targetDate'); clearFieldError(setErrors, 'dueDate'); setValues((current) => ({ ...current, targetDate: value })) }} />
        </div>
        <div className="two-fields">
          <Field label="Contact" error={errors.contactName}><input maxLength={200} value={values.contactName} onChange={(event) => setValues((current) => ({ ...current, contactName: event.target.value }))} placeholder="Optional contact name" /></Field>
          <Field label="Category" error={errors.category}><input maxLength={100} value={values.category} onChange={(event) => setValues((current) => ({ ...current, category: event.target.value }))} /></Field>
        </div>
        <div className="two-fields">
          <Field label="Reminder" error={errors.reminder}><input maxLength={100} value={values.reminder} onChange={(event) => setValues((current) => ({ ...current, reminder: event.target.value }))} /></Field>
          <Field label="Notes" error={errors.notes}><input maxLength={2000} value={values.notes} onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))} /></Field>
        </div>
        <Field label="Visibility" error={errors.visibility}>
          <Select value={values.visibility} onValueChange={(value) => { clearFieldError(setErrors, 'visibility'); setValues((current) => ({ ...current, visibility: value as 'private' | 'workspace' })) }}>
            <SelectTrigger aria-label="Goal visibility" className="w-full" data-field-control><SelectValue placeholder="Choose visibility" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="workspace">Workspace</SelectItem>
              <SelectItem value="private">Private</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <FormFeedback message={flow.feedback?.message} />
        <EditActions busy={flow.busy} onClose={onClose} label="Save goal" />
      </form>
    </Dialog>
  )
}

export function TransactionEditDialog({
  transaction,
  open,
  onClose,
}: {
  transaction: Transaction | null
  open: boolean
  onClose: () => void
}) {
  const { demoMode, workspace } = useApp()
  const [values, setValues] = useState({ merchant: '', category: '', amount: '', occurredAt: '', note: '', description: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [idCopyStatus, setIdCopyStatus] = useState('')
  const categoryMode = transactionCategoryModeFor(transaction ?? {})
  const categoriesQuery = useTransactionCategories(categoryMode, open)
  const activeCategoryNames = useMemo(
    () => selectableTransactionCategoryNames(categoriesQuery.data ?? []),
    [categoriesQuery.data],
  )
  const historicalCategory =
    transaction?.category && !activeCategoryNames.includes(transaction.category)
      ? transaction.category
      : ''

  useEffect(() => {
    if (!open || !transaction) return
    setValues({ merchant: transaction.merchant, category: transaction.category, amount: majorFromMinor(transaction.amount.amountMinor), occurredAt: dateOnlyFromUtc(transaction.occurredAt), note: transaction.note ?? '', description: transaction.description ?? '' })
    setErrors({})
    setIdCopyStatus('')
  }, [open, transaction])

  const flow = useWriteFlow<TransactionRequest>({
    open,
    onClose,
    request: (body) => api.patch(`/workspaces/${workspace.id}/transactions/${transaction?.id ?? ''}`, body),
    invalidate: ['transactions', 'accounts', 'vaults', 'budgets', 'dashboard', 'insights'],
    invalidatePeriodReviews: true,
    successMessage: 'Transaction updated.',
    onServerFields: (fields) => setErrors({ ...fields, amount: fields.amountMinor ?? fields.amount, note: fields.notes ?? fields.note }),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!transaction) return
    const nextErrors: Record<string, string> = {}
    const amount = moneyInputSchema().safeParse(values.amount)
    const occurredAt = isDateOnly(values.occurredAt)
      ? values.occurredAt
      : null
    if (values.merchant.trim().length > 200) nextErrors.merchant = 'Keep the description under 200 characters.'
    if (values.category.trim().length > 100) nextErrors.category = 'Keep the category under 100 characters.'
    if (values.note.trim().length > 2000) nextErrors.note = 'Keep the note under 2000 characters.'
	if (values.description.trim().length > 2000) nextErrors.description = 'Keep the description under 2000 characters.'
    if (!amount.success) nextErrors.amount = amount.error.issues[0]?.message ?? 'Enter an amount.'
    if (!occurredAt) nextErrors.occurredAt = 'Choose a valid date.'
    setErrors(nextErrors)
    flow.setFeedback(null)
    if (Object.keys(nextErrors).length) { focusFirstInvalidField(form); return }
    if (!amount.success || !occurredAt) return
    const body: TransactionRequest = {
      accountId: transaction.accountId,
      destinationAccountId: transaction.destinationAccountId,
      type: transaction.rawType ?? (transaction.direction === 'credit' ? 'income' : 'expense'),
      amountMinor: toMinor(amount.data),
      currency: transaction.amount.currency,
      category: values.category.trim(),
      merchant: values.merchant.trim(),
      notes: values.note.trim(),
	  description: values.description.trim(),
	  contactId: transaction.contactId,
      privacy: transaction.privacy ?? 'workspace',
      occurredAt: toUtcDateOnly(occurredAt),
    }
    if (demoMode) {
      flow.completeDemo(() => addDemoSessionItem(workspace.id, 'transactions', {
        ...transaction, merchant: body.merchant || transaction.merchant, category: body.category || transaction.category,
        occurredAt: body.occurredAt, note: body.notes || undefined, amount: { amountMinor: body.amountMinor, currency: body.currency },
      }), 'Transaction updated in this demo session only.')
      return
    }
    flow.submitLive(body)
  }

  return (
    <Dialog open={open} title="Edit transaction" description="Update the entry while keeping its account and audit history intact." onClose={flow.busy ? () => undefined : onClose}>
      <form className="dialog-form finance-write-form" onSubmit={submit} aria-busy={flow.busy || undefined}>
        {transaction?.transactionId ? (
          <Field
            label="Transaction ID"
            hint={idCopyStatus || 'The transaction ID cannot be changed after creation.'}
          >
            <div className="transaction-id-readonly-control">
              <input value={transaction.transactionId} readOnly />
              <Button
                type="button"
                variant="secondary"
                aria-label="Copy transaction ID"
                onClick={() => {
                  void copyTextToClipboard(transaction.transactionId ?? '').then(
                    (copied) =>
                      setIdCopyStatus(
                        copied
                          ? 'Transaction ID copied.'
                          : 'Copy unavailable. Select the ID and copy it manually.',
                      ),
                  )
                }}
              >
                {idCopyStatus === 'Transaction ID copied.' ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" />
                )}
                Copy
              </Button>
            </div>
          </Field>
        ) : null}
        <Field label="Description" error={errors.merchant}><input autoFocus maxLength={200} value={values.merchant} onChange={(event) => { clearFieldError(setErrors, 'merchant'); setValues((current) => ({ ...current, merchant: event.target.value })) }} /></Field>
        <div className="two-fields">
          <Field label="Amount" error={errors.amount} hint={transaction?.hasSplits ? 'This split amount stays fixed until its participant shares are edited.' : undefined}><div className="currency-input has-currency-select currency-input-icon-only"><CurrencySelect compact iconOnly value={transaction?.amount.currency ?? 'INR'} onChange={() => undefined} ariaLabel="Transaction currency" disabled /><input inputMode="decimal" value={values.amount} disabled={transaction?.hasSplits} onChange={(event) => { clearFieldError(setErrors, 'amount'); setValues((current) => ({ ...current, amount: event.target.value })) }} /></div></Field>
          <DatePicker label="Transaction date" value={values.occurredAt} error={errors.occurredAt} clearable onValueChange={(value) => { clearFieldError(setErrors, 'occurredAt'); setValues((current) => ({ ...current, occurredAt: value })) }} />
        </div>
        <Field
          label="Category"
          error={
            errors.category ??
            (categoriesQuery.isError
              ? 'Categories could not be loaded. Try again.'
              : undefined)
          }
          hint={
            historicalCategory
              ? 'The historical category is disabled. Choose an active category to change it.'
              : undefined
          }
        >
          <Select
            value={values.category}
            disabled={categoriesQuery.isLoading || categoriesQuery.isError}
            onValueChange={(category) => {
              clearFieldError(setErrors, 'category')
              setValues((current) => ({ ...current, category }))
            }}
          >
            <SelectTrigger className="w-full" data-field-control>
              <SelectValue placeholder="Choose category" />
            </SelectTrigger>
            <SelectContent>
              {historicalCategory ? (
                <SelectItem value={historicalCategory} disabled>
                  {historicalCategory} (disabled)
                </SelectItem>
              ) : null}
              {activeCategoryNames.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Note" error={errors.note}><textarea maxLength={2000} value={values.note} onChange={(event) => { clearFieldError(setErrors, 'note'); setValues((current) => ({ ...current, note: event.target.value })) }} /></Field>
		<Field label="Description" error={errors.description}><textarea maxLength={2000} value={values.description} onChange={(event) => { clearFieldError(setErrors, 'description'); setValues((current) => ({ ...current, description: event.target.value })) }} /></Field>
        <FormFeedback message={flow.feedback?.message} />
        <EditActions busy={flow.busy} onClose={onClose} label="Save transaction" />
      </form>
    </Dialog>
  )
}
