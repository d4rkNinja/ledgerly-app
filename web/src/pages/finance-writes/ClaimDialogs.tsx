import { useEffect, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { useApp } from '@/app/app-state'
import { CurrencySelect } from '@/components/currency-select'
import { Dialog, Field } from '@/components/ui'
import { api } from '@/lib/api-client'
import { formatMoney } from '@/lib/format'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/beui/select'
import {
  DemoWriteNotice,
  DialogActions,
  WriteFeedback,
} from './components'
import {
  addDemoSessionItem,
  clearFieldError,
  createDemoId,
  focusFirstInvalidField,
  friendlyFinanceLabel,
  mapServerFields,
  moneyInputSchema,
  toFieldErrors,
  toMinor,
  useWriteFlow,
  type FinanceClaim,
} from './shared'

type ClaimRequest = {
  amountMinor: number
  currency: string
  description: string
}

type ClaimReviewRequest = {
  status: 'approved' | 'rejected' | 'correction_requested'
  comment: string
}

const claimSchema = z.object({
  amount: moneyInputSchema(),
  description: z
    .string()
    .trim()
    .min(1, 'Describe what the expense was for')
    .max(500, 'Keep the description under 500 characters'),
})

const claimReviewSchema = z.object({
  status: z.enum(['approved', 'rejected', 'correction_requested']),
  comment: z
    .string()
    .trim()
    .max(500, 'Keep the comment under 500 characters'),
})

export function ClaimSubmitDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { demoMode, preferredCurrency, userName, workspace } = useApp()
  const [values, setValues] = useState({
    amount: '',
    description: '',
    currency: preferredCurrency,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setValues({
      amount: '',
      description: '',
      currency: preferredCurrency,
    })
    setErrors({})
  }, [open, preferredCurrency, workspace.id])

  const flow = useWriteFlow<ClaimRequest>({
    open,
    onClose,
    request: (body) =>
      api.post<unknown, ClaimRequest>(
        `/workspaces/${workspace.id}/expense-claims`,
        body,
      ),
    invalidate: ['claims', 'dashboard', 'notifications', 'insights'],
    successMessage: 'Expense claim submitted for review.',
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
    const result = claimSchema.safeParse(values)
    if (!result.success) {
      setErrors(toFieldErrors(result.error))
      focusFirstInvalidField(form)
      return
    }

    const body: ClaimRequest = {
      amountMinor: toMinor(result.data.amount),
      currency: values.currency,
      description: result.data.description,
    }

    if (demoMode) {
      flow.completeDemo(
        () =>
          addDemoSessionItem<FinanceClaim>(
            workspace.id,
            'claims',
            {
              id: createDemoId('claim'),
              person: userName,
              purpose: body.description,
              amount: {
                amountMinor: body.amountMinor,
                currency: body.currency,
              },
              status: 'Needs approval',
              rawStatus: 'pending',
              reimbursementStatus: 'not_reimbursed',
              submittedBy: 'demo-current-user',
            },
          ),
        'Claim added to this demo session only. No server data changed.',
      )
      return
    }

    flow.submitLive(body)
  }

  return (
    <Dialog
      open={open}
      title="Submit expense claim"
      description={
        demoMode
          ? 'Try the approval flow with a session-only claim.'
          : 'Submit a workspace expense for another member to review.'
      }
      onClose={flow.busy ? () => undefined : onClose}
    >
      <form
        className="dialog-form finance-write-form"
        onSubmit={submit}
        aria-busy={flow.busy || undefined}
      >
        {demoMode ? <DemoWriteNotice /> : null}
        <Field label="Amount" error={errors.amount}>
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
              aria-label="Claim amount"
            />
          </div>
        </Field>
        <Field
          label="Purpose"
          error={errors.description}
          hint="Explain the business expense clearly for the approver."
        >
          <textarea
            maxLength={500}
            value={values.description}
            onChange={(event) =>
              {
                clearFieldError(setErrors, 'description')
                setValues((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            }
            placeholder="Client travel from the airport to the workshop"
          />
        </Field>
        <div className="finance-write-info" role="note">
          Receipt upload is not part of the current claim API. This submission
          sends the amount, selected currency, and purpose.
        </div>
        {flow.feedback ? <WriteFeedback feedback={flow.feedback} /> : null}
        <DialogActions
          busy={flow.busy}
          demoMode={demoMode}
          onCancel={onClose}
          submitLabel="Submit claim"
        />
      </form>
    </Dialog>
  )
}

export function ClaimReviewDialog({
  claim,
  onClose,
}: {
  claim: FinanceClaim | null
  onClose: () => void
}) {
  const { demoMode, privacyMode, workspace } = useApp()
  const open = Boolean(claim)
  const [values, setValues] = useState({
    status: 'approved' as ClaimReviewRequest['status'],
    comment: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setValues({ status: 'approved', comment: '' })
    setErrors({})
  }, [claim?.id, open])

  const flow = useWriteFlow<ClaimReviewRequest>({
    open,
    onClose,
    request: (body) =>
      api.patch<unknown, ClaimReviewRequest>(
        `/workspaces/${workspace.id}/expense-claims/${encodeURIComponent(
          claim?.id ?? '',
        )}/review`,
        body,
      ),
    invalidate: ['claims', 'dashboard', 'notifications', 'insights'],
    successMessage: 'Claim review saved.',
    onServerFields: (fields) => setErrors(mapServerFields(fields)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!claim) return
    setErrors({})
    flow.setFeedback(null)
    const result = claimReviewSchema.safeParse(values)
    if (!result.success) {
      setErrors(toFieldErrors(result.error))
      focusFirstInvalidField(form)
      return
    }

    const body: ClaimReviewRequest = result.data
    if (demoMode) {
      flow.completeDemo(
        () =>
          addDemoSessionItem<FinanceClaim>(
            workspace.id,
            'claims',
            {
              ...claim,
              rawStatus: body.status,
              status: friendlyFinanceLabel(body.status),
              approvalComment: body.comment || undefined,
            },
          ),
        'Review saved in this demo session only. No server data changed.',
      )
      return
    }

    flow.submitLive(body)
  }

  return (
    <Dialog
      open={open}
      title="Review expense claim"
      description={
        claim
          ? `${claim.person} submitted â€œ${claim.purpose}â€.`
          : undefined
      }
      onClose={flow.busy ? () => undefined : onClose}
    >
      <form
        className="dialog-form finance-write-form"
        onSubmit={submit}
        aria-busy={flow.busy || undefined}
      >
        {demoMode ? (
          <DemoWriteNotice>
            This review changes only the visible demo record for this browser
            session. No approval is sent to the server.
          </DemoWriteNotice>
        ) : null}
        {claim ? (
          <div className="finance-claim-review-summary">
            <span>{claim.purpose}</span>
            <strong>
              {formatMoney(claim.amount, undefined, privacyMode)}
            </strong>
          </div>
        ) : null}
        <Field label="Decision" error={errors.status}>
          <Select
            value={values.status}
            onValueChange={(value) =>
              {
                clearFieldError(setErrors, 'status')
                setValues((current) => ({
                  ...current,
                  status: value as ClaimReviewRequest['status'],
                }))
              }
            }
          >
            <SelectTrigger className="w-full" data-field-control autoFocus>
              <SelectValue placeholder="Approve" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="approved">Approve</SelectItem>
              <SelectItem value="correction_requested">
                Request correction
              </SelectItem>
              <SelectItem value="rejected">Reject</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Comment"
          error={errors.comment}
          hint="Optional, but useful when rejecting or requesting a correction."
        >
          <textarea
            maxLength={500}
            value={values.comment}
            onChange={(event) =>
              {
                clearFieldError(setErrors, 'comment')
                setValues((current) => ({
                  ...current,
                  comment: event.target.value,
                }))
              }
            }
            placeholder="Add context for the submitter"
          />
        </Field>
        {flow.feedback ? <WriteFeedback feedback={flow.feedback} /> : null}
        <DialogActions
          busy={flow.busy}
          demoMode={demoMode}
          demoSubmitLabel="Save review"
          onCancel={onClose}
          submitLabel="Save review"
        />
      </form>
    </Dialog>
  )
}

