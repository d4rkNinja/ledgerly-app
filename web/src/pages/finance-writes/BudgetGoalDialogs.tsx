import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { useApp } from '@/app/app-state'
import { ContactNamePicker } from '@/components/contact-name-picker'
import { CurrencySelect } from '@/components/currency-select'
import { DatePicker } from '@/components/date-picker'
import { Checkbox } from '@/components/motion/checkbox'
import { Button, Dialog, Field } from '@/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/motion/select'
import type { Account, Budget, Contact, Goal } from '@/domain/types'
import { api } from '@/lib/api-client'
import {
  DemoWriteNotice,
  DialogActions,
  WriteFeedback,
} from './components'
import {
  addDemoSessionItem,
  clearFieldError,
  createDemoId,
  currencySchema,
  currentMonthRange,
  dateInputSchema,
  focusFirstInvalidField,
  friendlyFinanceLabel,
  mapServerFields,
  moneyInputSchema,
  toFieldErrors,
  toMinor,
  toUtcDate,
  useWriteFlow,
} from './shared'

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
  contactId?: string
  contactName?: string
  accountId?: string
  category?: string
  reminder?: string
  notes?: string
}

const categoryListSchema = z
  .string()
  .trim()
  .refine((value) => {
    if (!value) return true
    const categories = value.split(',').map((item) => item.trim())
    return (
      categories.length <= 20 &&
      categories.every(
        (category) => category.length > 0 && category.length <= 50,
      )
    )
  }, 'Use up to 20 comma-separated categories, each under 50 characters')

const budgetSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter a budget name')
      .max(100, 'Keep the name under 100 characters'),
    amount: moneyInputSchema(),
    currency: currencySchema,
    period: z
      .string()
      .trim()
      .min(1, 'Choose a period')
      .max(50, 'Keep the period under 50 characters'),
    categories: categoryListSchema,
    rollover: z.boolean(),
    startAt: dateInputSchema,
    endAt: dateInputSchema,
  })
  .superRefine((values, context) => {
    if (values.endAt < values.startAt) {
      context.addIssue({
        code: 'custom',
        path: ['endAt'],
        message: 'End date must be on or after the start date',
      })
    }
  })

const optionalDateSchema = z
  .string()
  .trim()
  .refine(
    (value) => !value || dateInputSchema.safeParse(value).success,
    'Choose a valid date',
  )

const goalSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter a goal name')
      .max(100, 'Keep the name under 100 characters'),
    target: moneyInputSchema(),
    current: moneyInputSchema({
      allowZero: true,
    }),
    currency: currencySchema,
    description: z.string().trim().max(500, 'Keep the description under 500 characters'),
    type: z.enum([
      'receive_payment',
      'pay_someone',
      'savings_target',
      'debt_repayment',
      'bill_payment',
      'purchase_target',
      'monthly_budget_target',
      'emergency_fund',
      'custom',
    ]),
    customType: z.string().trim().max(80, 'Keep the custom type under 80 characters'),
    direction: z.enum(['receive', 'pay', 'save', 'neutral']),
    startDate: optionalDateSchema,
    targetDate: optionalDateSchema,
    dueDate: optionalDateSchema,
    visibility: z.enum(['private', 'workspace']),
    contactName: z.string().trim().max(200, 'Keep the contact name under 200 characters'),
    contactId: z.string().trim(),
    accountId: z.string().trim(),
    category: z.string().trim().max(100, 'Keep the category under 100 characters'),
    reminder: z.string().trim().max(100, 'Keep the reminder under 100 characters'),
    notes: z.string().trim().max(2000, 'Keep notes under 2,000 characters'),
  })
  .superRefine((values, context) => {
    if (values.current > values.target) {
      context.addIssue({
        code: 'custom',
        path: ['current'],
        message: 'Current amount cannot be more than the target',
      })
    }
    if (values.type === 'custom' && !values.customType) {
      context.addIssue({
        code: 'custom',
        path: ['customType'],
        message: 'Enter a label for a custom goal type',
      })
    }
    if (values.startDate && values.dueDate && values.dueDate < values.startDate) {
      context.addIssue({
        code: 'custom',
        path: ['dueDate'],
        message: 'Due date must be on or after the start date',
      })
    }
  })

export function BudgetCreateDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { demoMode, preferredCurrency, workspace } = useApp()
  const range = currentMonthRange()
  const [values, setValues] = useState({
    name: '',
    amount: '',
    currency: preferredCurrency,
    period: 'monthly',
    categories: '',
    rollover: false,
    startAt: range.startAt,
    endAt: range.endAt,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    const nextRange = currentMonthRange()
    setValues({
      name: '',
      amount: '',
      currency: preferredCurrency,
      period: 'monthly',
      categories: '',
      rollover: false,
      startAt: nextRange.startAt,
      endAt: nextRange.endAt,
    })
    setErrors({})
  }, [open, preferredCurrency])

  const flow = useWriteFlow<BudgetRequest>({
    open,
    onClose,
    request: (body) =>
      api.post<unknown, BudgetRequest>(
        `/workspaces/${workspace.id}/budgets`,
        body,
      ),
    invalidate: ['budgets', 'dashboard', 'insights'],
    successMessage: 'Budget created.',
    onServerFields: (fields) =>
      setErrors(
        mapServerFields(fields, {
          amountMinor: 'amount',
        }),
      ),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const form = event.currentTarget
    setErrors({})
    flow.setFeedback(null)
    const result = budgetSchema.safeParse(values)
    if (!result.success) {
      setErrors(toFieldErrors(result.error))
      focusFirstInvalidField(form)
      return
    }

    const body: BudgetRequest = {
      name: result.data.name,
      amountMinor: toMinor(result.data.amount),
      currency: result.data.currency,
      period: result.data.period,
      categories: result.data.categories
        ? Array.from(
            new Set(
              result.data.categories
                .split(',')
                .map((category) => category.trim())
                .filter(Boolean),
            ),
          )
        : [],
      rollover: result.data.rollover,
      startAt: toUtcDate(result.data.startAt),
      endAt: toUtcDate(result.data.endAt, true),
    }

    if (demoMode) {
      flow.completeDemo(
        () =>
          addDemoSessionItem<Budget>(
            workspace.id,
            'budgets',
            {
              id: createDemoId('budget'),
              name: body.name,
              spent: {
                amountMinor: 0,
                currency: body.currency,
              },
              limit: {
                amountMinor: body.amountMinor,
                currency: body.currency,
              },
              period: friendlyFinanceLabel(body.period),
              spendingKnown: true,
            },
          ),
        'Budget added to this demo session only. No server data changed.',
      )
      return
    }

    flow.submitLive(body)
  }

  return (
    <Dialog
      open={open}
      title="Create budget"
      description={
        demoMode
        ? 'Try a session-only spending plan without changing server data.'
          : 'Set an amount and date range for this workspace.'
      }
      onClose={flow.busy ? () => undefined : onClose}
    >
      <form
        className="dialog-form finance-write-form"
        onSubmit={submit}
        aria-busy={flow.busy || undefined}
      >
        {demoMode ? <DemoWriteNotice /> : null}
        <Field label="Budget name" error={errors.name}>
          <input
            autoFocus
            maxLength={100}
            value={values.name}
            onChange={(event) =>
              {
                clearFieldError(setErrors, 'name')
                setValues((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            }
            placeholder="Monthly groceries"
          />
        </Field>
        <div className="two-fields">
          <Field label="Period" error={errors.period}>
            <Select
              value={values.period}
              onValueChange={(value) =>
                {
                  clearFieldError(setErrors, 'period')
                  setValues((current) => ({
                    ...current,
                    period: value,
                  }))
                }
              }
            >
              <SelectTrigger
                aria-label="Budget period"
                className="w-full"
                data-field-control
              >
                <SelectValue placeholder="Choose period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="two-fields">
          <Field label="Limit" error={errors.amount}>
            <div className="currency-input has-currency-select currency-input-icon-only">
              <CurrencySelect
                compact
                iconOnly
                value={values.currency}
                onChange={(currency) =>
                  {
                    clearFieldError(setErrors, 'amount')
                    setValues((current) => ({ ...current, currency }))
                  }
                }
                ariaLabel="Change currency"
              />
              <input
                inputMode="decimal"
                value={values.amount}
                onChange={(event) =>
                  {
                    clearFieldError(setErrors, 'amount')
                    setValues((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                }
                placeholder="0.00"
                aria-label="Budget limit"
              />
            </div>
          </Field>
        </div>
        <div className="two-fields">
          <DatePicker
            label="Start date"
            value={values.startAt}
            error={errors.startAt}
            onValueChange={(value) => {
              clearFieldError(setErrors, 'startAt')
              setValues((current) => ({ ...current, startAt: value }))
            }}
          />
          <DatePicker
            label="End date"
            value={values.endAt}
            min={values.startAt}
            error={errors.endAt}
            onValueChange={(value) => {
              clearFieldError(setErrors, 'endAt')
              setValues((current) => ({ ...current, endAt: value }))
            }}
          />
        </div>
        <Field
          label="Categories"
          error={errors.categories}
          hint="Optional, separated by commas."
        >
          <input
            value={values.categories}
            onChange={(event) =>
              {
                clearFieldError(setErrors, 'categories')
                setValues((current) => ({
                  ...current,
                  categories: event.target.value,
                }))
              }
            }
            placeholder="Groceries, Dining"
          />
        </Field>
        <div className="finance-write-toggle">
          <Checkbox
            checked={values.rollover}
            onCheckedChange={(rollover) =>
              setValues((current) => ({ ...current, rollover }))
            }
            aria-label="Roll unused amount forward"
          />
          <span>
            <strong>Roll unused amount forward</strong>
            <small>
              Preserve this preference for future budget calculations.
            </small>
          </span>
        </div>
        {flow.feedback ? <WriteFeedback feedback={flow.feedback} /> : null}
        <DialogActions
          busy={flow.busy}
          demoMode={demoMode}
          onCancel={onClose}
          submitLabel="Create budget"
        />
      </form>
    </Dialog>
  )
}

export function GoalCreateDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { demoMode, preferredCurrency, userId, workspace } = useApp()
  const queryClient = useQueryClient()
  const contactsQuery = useQuery<Contact[]>({
    queryKey: ['contacts', workspace.id],
    queryFn: () => api.get<Contact[]>(`/workspaces/${workspace.id}/contacts`),
    enabled: open && !demoMode,
  })
  const contacts = contactsQuery.data ?? []
  const accountsQuery = useQuery<Account[]>({
    queryKey: ['accounts', workspace.id],
    queryFn: () => api.get<Account[]>(`/workspaces/${workspace.id}/accounts`),
    enabled: open && !demoMode,
  })
  const accounts = accountsQuery.data ?? []
  const firstAccountId = accountsQuery.data?.[0]?.id
  const [values, setValues] = useState({
    name: '',
    description: '',
    type: 'savings_target',
    customType: '',
    direction: 'save' as 'receive' | 'pay' | 'save' | 'neutral',
    target: '',
    current: '0',
    currency: preferredCurrency,
    startDate: '',
    targetDate: '',
    dueDate: '',
    visibility: 'workspace' as 'private' | 'workspace',
    contactId: '',
    contactName: '',
    accountId: '',
    category: '',
    reminder: '',
    notes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [contactDialogOpen, setContactDialogOpen] = useState(false)
  const [contactDraft, setContactDraft] = useState({ name: '', phone: '', email: '' })
  const [contactError, setContactError] = useState('')
  const [contactSaving, setContactSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setValues({
      name: '',
      description: '',
      type: 'savings_target',
      customType: '',
      direction: 'save',
      target: '',
      current: '0',
      currency: preferredCurrency,
      startDate: '',
      targetDate: '',
      dueDate: '',
      visibility: 'workspace',
      contactId: '',
      contactName: '',
      accountId: '',
      category: '',
      reminder: '',
      notes: '',
    })
    setErrors({})
    setContactDialogOpen(false)
    setContactDraft({ name: '', phone: '', email: '' })
    setContactError('')
  }, [open, preferredCurrency])

  useEffect(() => {
    if (!open || values.accountId || !firstAccountId) return
    setValues((current) => ({ ...current, accountId: firstAccountId }))
  }, [firstAccountId, open, values.accountId])

  const flow = useWriteFlow<GoalRequest>({
    open,
    onClose,
    request: (body) =>
      api.post<unknown, GoalRequest>(
        `/workspaces/${workspace.id}/goals`,
        body,
      ),
    invalidate: ['goals', 'dashboard', 'insights'],
    successMessage: 'Goal created.',
    onServerFields: (fields) =>
      setErrors(
        mapServerFields(fields, {
          targetMinor: 'target',
          currentMinor: 'current',
        }),
      ),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const form = event.currentTarget
    setErrors({})
    flow.setFeedback(null)
    const result = goalSchema.safeParse(values)
    if (!result.success) {
      setErrors(toFieldErrors(result.error))
      focusFirstInvalidField(form)
      return
    }

    const body: GoalRequest = {
      name: result.data.name,
      description: result.data.description || undefined,
      type: result.data.type,
      customType: result.data.customType || undefined,
      direction: result.data.direction,
      targetMinor: toMinor(result.data.target),
      currentMinor: toMinor(result.data.current),
      currency: result.data.currency,
      startDate: result.data.startDate
        ? toUtcDate(result.data.startDate)
        : undefined,
      targetDate: result.data.targetDate
        ? toUtcDate(result.data.targetDate)
        : undefined,
      dueDate: result.data.dueDate
        ? toUtcDate(result.data.dueDate)
        : undefined,
      visibility: result.data.visibility,
      contactId: result.data.contactId || undefined,
      contactName: result.data.contactName || undefined,
      accountId: result.data.accountId || undefined,
      category: result.data.category || undefined,
      reminder: result.data.reminder || undefined,
      notes: result.data.notes || undefined,
    }

    if (demoMode) {
      flow.completeDemo(
        () =>
          addDemoSessionItem<Goal>(
            workspace.id,
            'goals',
            {
              id: createDemoId('goal'),
              name: body.name,
              saved: {
                amountMinor: body.currentMinor,
                currency: body.currency,
              },
              target: {
                amountMinor: body.targetMinor,
                currency: body.currency,
              },
              targetDate: body.targetDate ?? '',
              dueDate: body.dueDate,
              description: body.description,
              type: body.type,
              direction: body.direction,
              contactId: body.contactId,
              contactName: body.contactName,
              category: body.category,
              notes: body.notes,
            },
          ),
        'Goal added to this demo session only. No server data changed.',
      )
      return
    }

    flow.submitLive(body)
  }

  const createContact = async (event: FormEvent) => {
    event.preventDefault()
    const name = contactDraft.name.trim()
    if (!name) {
      setContactError('Enter a contact name.')
      return
    }
    setContactSaving(true)
    setContactError('')
    try {
      const input = {
        name,
        phone: contactDraft.phone.trim(),
        email: contactDraft.email.trim(),
      }
      const contact = demoMode
        ? {
            id: createDemoId('contact'),
            ...input,
            createdBy: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : await api.post<Contact, typeof input>(
            `/workspaces/${workspace.id}/contacts`,
            input,
          )
      if (demoMode) {
        addDemoSessionItem<Contact>(workspace.id, 'contacts', contact)
      } else {
        await queryClient.invalidateQueries({ queryKey: ['contacts', workspace.id] })
      }
      setValues((current) => ({
        ...current,
        contactId: contact.id,
        contactName: contact.name,
      }))
      setContactDialogOpen(false)
    } catch {
      setContactError('Could not create that contact. Check the name and try again.')
    } finally {
      setContactSaving(false)
    }
  }

  return (
    <>
      <Dialog
      open={open}
      title="Create goal"
      description={
        demoMode
        ? 'Try a session-only savings goal without changing server data.'
          : 'Set a target and optional date for this workspace.'
      }
      onClose={flow.busy ? () => undefined : onClose}
    >
      <form
        className="dialog-form finance-write-form"
        onSubmit={submit}
        aria-busy={flow.busy || undefined}
      >
        {demoMode ? <DemoWriteNotice /> : null}
        <Field label="Goal name" error={errors.name}>
          <input
            autoFocus
            maxLength={100}
            value={values.name}
            onChange={(event) =>
              {
                clearFieldError(setErrors, 'name')
                setValues((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            }
            placeholder="Japan 2027"
          />
        </Field>
        <Field label="Description" error={errors.description}>
          <textarea
            maxLength={500}
            value={values.description}
            onChange={(event) => {
              clearFieldError(setErrors, 'description')
              setValues((current) => ({ ...current, description: event.target.value }))
            }}
            placeholder="What does completing this commitment make possible?"
          />
        </Field>
        <div className="two-fields">
          <Field label="Goal type" error={errors.type}>
            <Select
              value={values.type}
              onValueChange={(type) => {
                clearFieldError(setErrors, 'type')
                setValues((current) => ({
                  ...current,
                  type,
                  direction:
                    type === 'receive_payment'
                      ? 'receive'
                      : type === 'pay_someone' || type === 'debt_repayment' || type === 'bill_payment'
                        ? 'pay'
                        : type === 'custom'
                          ? current.direction
                          : 'save',
                }))
              }}
            >
              <SelectTrigger aria-label="Goal type" className="w-full" data-field-control>
                <SelectValue placeholder="Choose a goal type" />
              </SelectTrigger>
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
            <Select
              value={values.direction}
              onValueChange={(direction) => {
                clearFieldError(setErrors, 'direction')
                setValues((current) => ({
                  ...current,
                  direction: direction as typeof current.direction,
                }))
              }}
            >
              <SelectTrigger aria-label="Goal direction" className="w-full" data-field-control>
                <SelectValue placeholder="Choose direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="receive">Receive</SelectItem>
                <SelectItem value="pay">Pay</SelectItem>
                <SelectItem value="save">Save</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {values.type === 'custom' ? (
          <Field label="Custom type label" error={errors.customType}>
            <input
              maxLength={80}
              value={values.customType}
              onChange={(event) => {
                clearFieldError(setErrors, 'customType')
                setValues((current) => ({ ...current, customType: event.target.value }))
              }}
              placeholder="Annual family contribution"
            />
          </Field>
        ) : null}
        <div className="two-fields">
          <Field
            label="Visibility"
            error={errors.visibility}
            hint="Private goals are visible only to you."
          >
            <Select
              value={values.visibility}
              onValueChange={(value) =>
                {
                  clearFieldError(setErrors, 'visibility')
                  setValues((current) => ({
                    ...current,
                    visibility: value as 'private' | 'workspace',
                  }))
                }
              }
            >
              <SelectTrigger
                aria-label="Goal visibility"
                className="w-full"
                data-field-control
              >
                <SelectValue placeholder="Choose visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="workspace">Workspace</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="two-fields">
          <Field label="Target amount" error={errors.target}>
            <div className="currency-input has-currency-select currency-input-icon-only">
              <CurrencySelect
                compact
                iconOnly
                value={values.currency}
                onChange={(currency) =>
                  {
                    clearFieldError(setErrors, 'target')
                    setValues((current) => ({ ...current, currency }))
                  }
                }
                ariaLabel="Change currency"
              />
              <input
                inputMode="decimal"
                value={values.target}
                onChange={(event) =>
                  {
                    clearFieldError(setErrors, 'target')
                    setValues((current) => ({
                      ...current,
                      target: event.target.value,
                    }))
                  }
                }
                placeholder="0.00"
                aria-label="Target amount"
              />
            </div>
          </Field>
          <Field label="Already saved" error={errors.current}>
            <div className="currency-input currency-input-readonly">
              <span>{values.currency}</span>
              <input
                inputMode="decimal"
                value={values.current}
                onChange={(event) =>
                  {
                    clearFieldError(setErrors, 'current')
                    setValues((current) => ({
                      ...current,
                      current: event.target.value,
                    }))
                  }
                }
                aria-label="Current saved amount"
              />
            </div>
          </Field>
        </div>
        <Field label="Contact" error={errors.contactName} hint="Search an existing contact or create one inline.">
          <ContactNamePicker
            inputValue={values.contactName}
            inputAriaLabel="Goal contact"
            contacts={contacts}
            savedNames={[]}
            isLoading={contactsQuery.isLoading}
            isError={Boolean(contactsQuery.error)}
            onInputChange={(contactName) => {
              clearFieldError(setErrors, 'contactName')
              setValues((current) => ({ ...current, contactName, contactId: '' }))
            }}
            onContactSelect={(contact) => {
              clearFieldError(setErrors, 'contactName')
              setValues((current) => ({ ...current, contactName: contact.name, contactId: contact.id }))
            }}
            onSavedNameSelect={() => undefined}
            disabled={flow.busy}
          />
          {!values.contactId && values.contactName.trim() ? (
            <Button
              type="button"
              variant="secondary"
              disabled={flow.busy}
              onClick={() => {
                setContactDraft({ name: values.contactName.trim(), phone: '', email: '' })
                setContactError('')
                setContactDialogOpen(true)
              }}
            >
              Create “{values.contactName.trim()}” as a contact
            </Button>
          ) : null}
          {values.contactId && contacts.find((contact) => contact.id === values.contactId) ? (
            <small className="field-hint">
              {[contacts.find((contact) => contact.id === values.contactId)?.phone, contacts.find((contact) => contact.id === values.contactId)?.email]
                .filter(Boolean)
                .join(' · ') || 'Contact selected'}
            </small>
          ) : null}
        </Field>
        <div className="two-fields">
          <Field label="Account" error={errors.accountId} hint="Optional account used for progress transactions.">
            <Select
              value={values.accountId || 'none'}
              onValueChange={(accountId) => setValues((current) => ({ ...current, accountId: accountId === 'none' ? '' : accountId }))}
            >
              <SelectTrigger aria-label="Goal account" className="w-full" data-field-control>
                <SelectValue placeholder="No account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No account</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} · {account.balance.currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Category" error={errors.category}>
            <input
              maxLength={100}
              value={values.category}
              onChange={(event) => setValues((current) => ({ ...current, category: event.target.value }))}
              placeholder="Savings"
            />
          </Field>
        </div>
        <div className="two-fields">
          <DatePicker
            label="Start date"
            value={values.startDate}
            error={errors.startDate}
            clearable
            onValueChange={(value) => {
              clearFieldError(setErrors, 'startDate')
              setValues((current) => ({ ...current, startDate: value }))
            }}
          />
          <DatePicker
            label="Target date / due date"
            value={values.targetDate}
            min={values.startDate}
            error={errors.targetDate || errors.dueDate}
            clearable
            onValueChange={(value) => {
              clearFieldError(setErrors, 'targetDate')
              clearFieldError(setErrors, 'dueDate')
              setValues((current) => ({ ...current, targetDate: value, dueDate: value }))
            }}
          />
        </div>
        <div className="two-fields">
          <Field label="Reminder" error={errors.reminder}>
            <input
              maxLength={100}
              value={values.reminder}
              onChange={(event) => setValues((current) => ({ ...current, reminder: event.target.value }))}
              placeholder="7 days before due date"
            />
          </Field>
          <Field label="Notes" error={errors.notes}>
            <input
              maxLength={2000}
              value={values.notes}
              onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Payment details or context"
            />
          </Field>
        </div>
        {flow.feedback ? <WriteFeedback feedback={flow.feedback} /> : null}
        <DialogActions
          busy={flow.busy}
          demoMode={demoMode}
          onCancel={onClose}
          submitLabel="Create goal"
        />
      </form>
    </Dialog>
      <Dialog
        open={contactDialogOpen}
        title="Create contact"
        description="The contact will be saved in this workspace and selected for the goal."
        onClose={contactSaving ? () => undefined : () => setContactDialogOpen(false)}
      >
        <form className="dialog-form finance-write-form" onSubmit={createContact}>
          <Field label="Name" error={contactError}>
            <input
              autoFocus
              value={contactDraft.name}
              onChange={(event) => setContactDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Alex Morgan"
            />
          </Field>
          <div className="two-fields">
            <Field label="Phone"><input value={contactDraft.phone} onChange={(event) => setContactDraft((current) => ({ ...current, phone: event.target.value }))} /></Field>
            <Field label="Email"><input type="email" value={contactDraft.email} onChange={(event) => setContactDraft((current) => ({ ...current, email: event.target.value }))} /></Field>
          </div>
          {contactError ? <p className="form-alert" role="alert">{contactError}</p> : null}
          <DialogActions busy={contactSaving} demoMode={demoMode} onCancel={() => setContactDialogOpen(false)} submitLabel="Create contact" />
        </form>
      </Dialog>
    </>
  )
}
