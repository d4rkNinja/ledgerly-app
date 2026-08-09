import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react'
import { z } from 'zod'
import { useApp } from '@/app/app-state'
import { Checkbox } from '@/components/motion/checkbox'
import { CurrencySelect } from '@/components/currency-select'
import { Dialog, Field } from '@/components/ui'
import type { Account, Money } from '@/domain/types'
import { formatMoney } from '@/lib/format'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/motion/select'
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
  focusFirstInvalidField,
  friendlyFinanceLabel,
  mapServerFields,
  moneyInputSchema,
  toFieldErrors,
  toMinor,
  useWriteFlow,
} from './shared'

type AccountPrivacy = 'private' | 'workspace'
type AccountStatus = 'active' | 'inactive'

export type AccountRequest = {
  name: string
  bankName: string
  type: string
  maskedIdentifier: string
  openingMinor: number
  currency: string
  color: string
  icon: string
  notes: string
  status: AccountStatus
  excludeFromTotal: boolean
  privacy: AccountPrivacy
}

type AccountFormValues = {
  name: string
  bankName: string
  type: string
  maskedIdentifier: string
  opening: string
  currency: string
  color: string
  icon: string
  notes: string
  status: AccountStatus
  excludeFromTotal: boolean
  privacy: AccountPrivacy
}

const ACCOUNT_TYPES = [
  ['savings', 'Savings'],
  ['current', 'Current'],
  ['credit_card', 'Credit card'],
  ['cash', 'Cash'],
  ['digital_wallet', 'Digital wallet'],
  ['investment', 'Investment'],
  ['custom', 'Other'],
] as const

const ACCOUNT_COLORS = [
  ['#2d7d5a', 'Evergreen'],
  ['#456b7d', 'Slate'],
  ['#7b6253', 'Clay'],
  ['#805ba1', 'Violet'],
  ['#a25c49', 'Terracotta'],
] as const

const ACCOUNT_ICONS = [
  ['landmark', 'Bank'],
  ['wallet', 'Wallet'],
  ['credit-card', 'Card'],
  ['piggy-bank', 'Savings'],
] as const

const accountSchema = z.object({
  name: z.string().trim().min(1, 'Enter an account name').max(100, 'Keep the name under 100 characters'),
  bankName: z.string().trim().max(100, 'Keep the bank name under 100 characters'),
  type: z.string().trim().min(1, 'Choose an account type').max(50, 'Keep the type under 50 characters'),
  maskedIdentifier: z.string().trim().max(100, 'Keep the account identifier under 100 characters'),
  opening: moneyInputSchema({ allowNegative: true, allowZero: true }),
  currency: currencySchema,
  color: z.string().regex(/^#[0-9a-f]{6}$/iu, 'Choose an account colour'),
  icon: z.string().trim().min(1, 'Choose an account icon').max(50, 'Keep the icon under 50 characters'),
  notes: z.string().trim().max(500, 'Keep notes under 500 characters'),
  status: z.enum(['active', 'inactive']),
  excludeFromTotal: z.boolean(),
  privacy: z.enum(['private', 'workspace']),
})

function defaultAccountValues(currency: string): AccountFormValues {
  return {
    name: '',
    bankName: '',
    type: 'savings',
    maskedIdentifier: '',
    opening: '0',
    currency,
    color: '#2d7d5a',
    icon: 'landmark',
    notes: '',
    status: 'active',
    excludeFromTotal: false,
    privacy: 'workspace',
  }
}

function majorFromMinor(amountMinor: number) {
  const amount = amountMinor / 100
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
}

function toAccountRequest(values: AccountFormValues): AccountRequest | null {
  const result = accountSchema.safeParse(values)
  if (!result.success) return null
  const { opening, ...account } = result.data
  return {
    ...account,
    openingMinor: toMinor(opening),
  }
}

function errorsForAccount(values: AccountFormValues) {
  const result = accountSchema.safeParse(values)
  return result.success ? {} : toFieldErrors(result.error)
}

function projectedBalance(account: Account | undefined, opening: string): Money {
  if (!account) return { amountMinor: 0, currency: 'INR' }
  const parsed = moneyInputSchema({ allowNegative: true, allowZero: true }).safeParse(opening)
  if (!parsed.success) return account.balance
  const originalOpening = account.openingMinor ?? account.balance.amountMinor
  return {
    ...account.balance,
    amountMinor: account.balance.amountMinor + toMinor(parsed.data) - originalOpening,
  }
}

function DerivedBalance({
  balance,
  hint,
}: {
  balance: Money
  hint: string
}) {
  return (
    <div className="account-derived-balance">
      <span>Current balance</span>
      <output aria-label="Current balance">{formatMoney(balance)}</output>
      <small>{hint}</small>
    </div>
  )
}

function AccountFields({
  values,
  setValues,
  errors,
  setErrors,
  currentBalance,
  currentBalanceHint,
  currencyReadOnly = false,
}: {
  values: AccountFormValues
  setValues: Dispatch<SetStateAction<AccountFormValues>>
  errors: Record<string, string>
  setErrors: Dispatch<SetStateAction<Record<string, string>>>
  currentBalance: Money
  currentBalanceHint: string
  currencyReadOnly?: boolean
}) {
  const update = <Key extends keyof AccountFormValues>(
    field: Key,
    value: AccountFormValues[Key],
  ) => {
    clearFieldError(setErrors, field)
    setValues((current) => ({ ...current, [field]: value }))
  }

  return (
    <>
      <Field label="Account name" error={errors.name}>
        <input
          autoFocus
          maxLength={100}
          value={values.name}
          onChange={(event) => update('name', event.target.value)}
          placeholder="Everyday savings"
        />
      </Field>
      <div className="two-fields">
        <Field label="Bank name" error={errors.bankName}>
          <input
            maxLength={100}
            value={values.bankName}
            onChange={(event) => update('bankName', event.target.value)}
            placeholder="Example Bank"
          />
        </Field>
        <Field label="Account type" error={errors.type}>
          <Select value={values.type} onValueChange={(value) => update('type', value)}>
            <SelectTrigger className="w-full" data-field-control>
              <SelectValue placeholder="Choose account type" />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPES.map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="two-fields">
        <Field
          label="Account identifier"
          error={errors.maskedIdentifier}
          hint="Use a masked value such as •••• 1842."
        >
          <input
            maxLength={100}
            value={values.maskedIdentifier}
            onChange={(event) => update('maskedIdentifier', event.target.value)}
            placeholder="•••• 1842"
          />
        </Field>
        <Field label="Status" error={errors.status}>
          <Select value={values.status} onValueChange={(value) => update('status', value as AccountStatus)}>
            <SelectTrigger className="w-full" data-field-control>
              <SelectValue placeholder="Choose status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="two-fields">
        <Field
          label="Opening balance"
          error={errors.opening}
          hint="Use a minus sign only when the account starts in debt."
        >
          <div className="currency-input has-currency-select currency-input-icon-only">
            <CurrencySelect
              compact
              iconOnly
              value={values.currency}
              onChange={(currency) => update('currency', currency)}
              ariaLabel={currencyReadOnly ? 'Account currency' : 'Change currency'}
              disabled={currencyReadOnly}
            />
            <input
              inputMode="decimal"
              value={values.opening}
              onChange={(event) => update('opening', event.target.value)}
              aria-label="Opening balance"
            />
          </div>
        </Field>
        <DerivedBalance balance={currentBalance} hint={currentBalanceHint} />
      </div>
      <div className="two-fields">
        <Field label="Account colour" error={errors.color}>
          <Select value={values.color} onValueChange={(value) => update('color', value)}>
            <SelectTrigger className="w-full" data-field-control>
              <SelectValue placeholder="Choose colour" />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_COLORS.map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Account icon" error={errors.icon}>
          <Select value={values.icon} onValueChange={(value) => update('icon', value)}>
            <SelectTrigger className="w-full" data-field-control>
              <SelectValue placeholder="Choose icon" />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_ICONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Notes" error={errors.notes}>
        <textarea
          maxLength={500}
          value={values.notes}
          onChange={(event) => update('notes', event.target.value)}
          placeholder="Optional notes about this account"
        />
      </Field>
      <Field
        label="Visibility"
        error={errors.privacy}
        hint="Private accounts are visible only to you."
      >
        <Select value={values.privacy} onValueChange={(value) => update('privacy', value as AccountPrivacy)}>
          <SelectTrigger className="w-full" data-field-control>
            <SelectValue placeholder="Choose visibility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="workspace">Workspace</SelectItem>
            <SelectItem value="private">Private</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="finance-write-toggle">
        <Checkbox
          checked={values.excludeFromTotal}
          onCheckedChange={(checked) => update('excludeFromTotal', checked)}
          aria-label="Exclude from workspace totals"
        />
        <span>
          <strong>Exclude from workspace totals</strong>
          <small>
            Useful for credit limits, pass-through funds, or balances you do
            not want included in the dashboard total.
          </small>
        </span>
      </div>
    </>
  )
}

export function AccountCreateDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { demoMode, preferredCurrency, workspace } = useApp()
  const [values, setValues] = useState(() => defaultAccountValues(preferredCurrency))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setValues(defaultAccountValues(preferredCurrency))
    setErrors({})
  }, [open, preferredCurrency, workspace.id])

  const flow = useWriteFlow<AccountRequest>({
    open,
    onClose,
    request: (body) => api.post<unknown, AccountRequest>(`/workspaces/${workspace.id}/accounts`, body),
    invalidate: ['accounts', 'vaults', 'transactions', 'dashboard', 'insights'],
    successMessage: 'Account created.',
    onServerFields: (fields) => setErrors(mapServerFields(fields, { openingMinor: 'opening' })),
  })

  const currentBalance = useMemo(() => {
    const parsed = moneyInputSchema({ allowNegative: true, allowZero: true }).safeParse(values.opening)
    return {
      amountMinor: parsed.success ? toMinor(parsed.data) : 0,
      currency: values.currency,
    }
  }, [values.currency, values.opening])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const form = event.currentTarget
    const nextErrors = errorsForAccount(values)
    setErrors(nextErrors)
    flow.setFeedback(null)
    if (Object.keys(nextErrors).length) {
      focusFirstInvalidField(form)
      return
    }
    const body = toAccountRequest(values)
    if (!body) return

    if (demoMode) {
      flow.completeDemo(
        () => addDemoSessionItem<Account>(workspace.id, 'accounts', {
          id: createDemoId('account'),
          name: body.name,
          kind: friendlyFinanceLabel(body.type),
          bankName: body.bankName || undefined,
          balance: { amountMinor: body.openingMinor, currency: body.currency },
          maskedNumber: body.maskedIdentifier || 'Demo · session only',
          color: body.color,
          icon: body.icon || undefined,
          notes: body.notes || undefined,
          status: body.status,
          openingMinor: body.openingMinor,
          excludeFromTotal: body.excludeFromTotal,
          privacy: body.privacy,
        }),
        'Account added to this demo session only. No server data changed.',
      )
      return
    }

    flow.submitLive(body)
  }

  return (
    <Dialog
      open={open}
      title="Add account"
      description={demoMode
        ? 'Create a session-only account using the same fields as the live service.'
        : 'Add a bank, card, cash, or investment account to this workspace.'}
      onClose={flow.busy ? () => undefined : onClose}
    >
      <form className="dialog-form finance-write-form" onSubmit={submit} aria-busy={flow.busy || undefined}>
        {demoMode ? <DemoWriteNotice /> : null}
        <AccountFields
          values={values}
          setValues={setValues}
          errors={errors}
          setErrors={setErrors}
          currentBalance={currentBalance}
          currentBalanceHint="Current balance starts at the opening balance."
        />
        {flow.feedback ? <WriteFeedback feedback={flow.feedback} /> : null}
        <DialogActions busy={flow.busy} demoMode={demoMode} onCancel={onClose} submitLabel="Create account" />
      </form>
    </Dialog>
  )
}

export function AccountEditDialog({
  account,
  open,
  onClose,
}: {
  account: Account | null
  open: boolean
  onClose: () => void
}) {
  const { demoMode, workspace } = useApp()
  const [values, setValues] = useState<AccountFormValues>(() => defaultAccountValues('INR'))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || !account) return
    setValues({
      name: account.name,
      bankName: account.bankName ?? '',
      type: account.kind,
      maskedIdentifier: account.maskedNumber === 'Manual account' ? '' : account.maskedNumber,
      opening: majorFromMinor(account.openingMinor ?? account.balance.amountMinor),
      currency: account.balance.currency,
      color: account.color || '#2d7d5a',
      icon: account.icon || 'landmark',
      notes: account.notes ?? '',
      status: account.status === 'inactive' ? 'inactive' : 'active',
      excludeFromTotal: account.excludeFromTotal === true,
      privacy: account.privacy === 'private' ? 'private' : 'workspace',
    })
    setErrors({})
  }, [account, open])

  const flow = useWriteFlow<AccountRequest>({
    open,
    onClose,
    request: (body) => api.patch(`/workspaces/${workspace.id}/accounts/${account?.id ?? ''}`, body),
    invalidate: ['accounts', 'vaults', 'transactions', 'dashboard', 'insights'],
    successMessage: 'Account updated.',
    onServerFields: (fields) => setErrors(mapServerFields(fields, { openingMinor: 'opening' })),
  })

  const currentBalance = useMemo(
    () => projectedBalance(account ?? undefined, values.opening),
    [account, values.opening],
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!account) return
    const nextErrors = errorsForAccount(values)
    setErrors(nextErrors)
    flow.setFeedback(null)
    if (Object.keys(nextErrors).length) {
      focusFirstInvalidField(form)
      return
    }
    const body = toAccountRequest(values)
    if (!body) return

    if (demoMode) {
      flow.completeDemo(
        () => addDemoSessionItem(workspace.id, 'accounts', {
          ...account,
          name: body.name,
          kind: friendlyFinanceLabel(body.type),
          bankName: body.bankName || undefined,
          maskedNumber: body.maskedIdentifier || 'Manual account',
          openingMinor: body.openingMinor,
          balance: currentBalance,
          color: body.color,
          icon: body.icon || undefined,
          notes: body.notes || undefined,
          status: body.status,
          excludeFromTotal: body.excludeFromTotal,
          privacy: body.privacy,
        }),
        'Account updated in this demo session only.',
      )
      return
    }

    flow.submitLive(body)
  }

  return (
    <Dialog
      open={open}
      title="Edit account"
      description="Update account details while preserving associated transactions and history. Currency is locked after creation."
      onClose={flow.busy ? () => undefined : onClose}
    >
      <form className="dialog-form finance-write-form" onSubmit={submit} aria-busy={flow.busy || undefined}>
        <AccountFields
          values={values}
          setValues={setValues}
          errors={errors}
          setErrors={setErrors}
          currentBalance={currentBalance}
          currentBalanceHint="Derived from the opening balance and existing transactions."
          currencyReadOnly
        />
        {flow.feedback ? <WriteFeedback feedback={flow.feedback} /> : null}
        <DialogActions busy={flow.busy} demoMode={demoMode} onCancel={onClose} submitLabel="Save account" />
      </form>
    </Dialog>
  )
}
