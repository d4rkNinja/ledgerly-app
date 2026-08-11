import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  History,
  LockKeyhole,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge, Button, Dialog } from '@/components/ui'
import type {
  CreatePeriodReviewBody,
  PeriodReview,
  PeriodReviewChange,
  PeriodReviewFinancialValues,
  PeriodReviewTransactionVersion,
} from '@/domain/period-review'
import type { Workspace } from '@/domain/types'
import { api, ApiError } from '@/lib/api-client'
import {
  invalidatePeriodReviewQueries,
  periodReviewQueryPrefix,
} from '@/lib/period-review-query'

import type { DashboardPeriodValue } from './period-selector'
import './period-review.css'

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function displayLocale() {
  return typeof navigator === 'undefined' || !navigator.language
    ? 'en-US'
    : navigator.language
}

function periodReviewPath(
  workspaceId: string,
  from: string,
  to: string,
  timezone: string,
) {
  const query = new URLSearchParams({ from, to, timezone })
  return `/workspaces/${workspaceId}/period-reviews?${query.toString()}`
}

function latestReview(reviews: PeriodReview[]) {
  return reviews.reduce<PeriodReview | undefined>((latest, review) => {
    if (!latest) return review
    return Date.parse(review.createdAt) > Date.parse(latest.createdAt)
      ? review
      : latest
  }, undefined)
}

function decimalInteger(value: string) {
  return /^-?\d+$/.test(value) ? BigInt(value) : 0n
}

function formatMinor(amountMinor: string, currency: string) {
  const value = decimalInteger(amountMinor)
  const formatter = new Intl.NumberFormat(displayLocale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const digits = 2
  const scale = 100n
  const absolute = value < 0n ? -value : value
  const whole = absolute / scale
  const fraction = (absolute % scale).toString().padStart(digits, '0')
  const signedWhole: number | bigint = value < 0n && whole === 0n
    ? -0
    : value < 0n
      ? -whole
      : whole
  return formatter.formatToParts(signedWhole).map((part) =>
    part.type === 'fraction' ? fraction : part.value,
  ).join('')
}

function formatSignedMinor(amountMinor: string, currency: string) {
  const value = decimalInteger(amountMinor)
  const formatted = formatMinor((value < 0n ? -value : value).toString(), currency)
  if (value > 0n) return `+${formatted}`
  if (value < 0n) return `-${formatted}`
  return formatted
}

function formatCount(value: string) {
  return new Intl.NumberFormat(displayLocale()).format(decimalInteger(value))
}

function formatCivilDate(value: string | undefined) {
  if (!value) return 'Not recorded'
  const dateOnly = value.slice(0, 10)
  const parsed = new Date(`${dateOnly}T12:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(displayLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed)
}

function formatAuditTime(value: string | undefined, timezone: string) {
  if (!value) return 'Not recorded'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  try {
    const formatted = new Intl.DateTimeFormat(displayLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
      timeZoneName: 'short',
    }).format(parsed)
    return `${formatted} (${timezone})`
  } catch {
    return `${parsed.toISOString()} (UTC)`
  }
}

function changeLabel(action: PeriodReviewChange['action']) {
  if (action === 'added') return 'Added'
  if (action === 'edited') return 'Edited'
  return 'Deleted'
}

function statusLabel(value: string) {
  const normalized = value.replaceAll('_', ' ')
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function DeltaSummary({
  delta,
  currency,
  label = 'Cumulative change',
  signed = true,
}: {
  delta: PeriodReviewFinancialValues
  currency: string
  label?: string
  signed?: boolean
}) {
  return (
    <dl className="period-review-deltas" role="definition" aria-label={label}>
      <div>
        <dt>Income</dt>
        <dd>{signed ? formatSignedMinor(delta.incomeMinor, currency) : formatMinor(delta.incomeMinor, currency)}</dd>
      </div>
      <div>
        <dt>Spending</dt>
        <dd>{signed ? formatSignedMinor(delta.spendingMinor, currency) : formatMinor(delta.spendingMinor, currency)}</dd>
      </div>
      <div>
        <dt>Net</dt>
        <dd>{signed ? formatSignedMinor(delta.netMinor, currency) : formatMinor(delta.netMinor, currency)}</dd>
      </div>
      <div>
        <dt>Entries</dt>
        <dd>{formatCount(delta.transactionCount)}</dd>
      </div>
    </dl>
  )
}

function TransactionVersion({
  label,
  version,
  timezone,
  redacted,
}: {
  label: 'Before' | 'After'
  version?: PeriodReviewTransactionVersion
  timezone: string
  redacted: boolean
}) {
  if (redacted) {
    return (
      <section className="period-change-version period-change-version-redacted">
        <h4>{label}</h4>
        <p>Details hidden due to your current access.</p>
      </section>
    )
  }
  if (!version) {
    return (
      <section className="period-change-version period-change-version-empty">
        <h4>{label}</h4>
        <p>{label === 'Before' ? 'No earlier record.' : 'Record deleted.'}</p>
      </section>
    )
  }

  return (
    <section className="period-change-version">
      <h4>{label}</h4>
      <dl>
        <div>
          <dt>Amount</dt>
          <dd>{formatMinor(version.amountMinor, version.currency)}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{statusLabel(version.type)}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{version.category || 'Uncategorised'}</dd>
        </div>
        <div>
          <dt>Merchant</dt>
          <dd>{version.merchant || 'Not recorded'}</dd>
        </div>
        <div>
          <dt>Transaction ID</dt>
          <dd>{version.transactionId || version.id}</dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd>{version.accountId}</dd>
        </div>
        {version.destinationAccountId ? (
          <div>
            <dt>Destination account</dt>
            <dd>{version.destinationAccountId}</dd>
          </div>
        ) : null}
        {version.contactId ? (
          <div>
            <dt>Contact</dt>
            <dd>{version.contactId}</dd>
          </div>
        ) : null}
        {version.goalId ? (
          <div>
            <dt>Goal</dt>
            <dd>{version.goalId}</dd>
          </div>
        ) : null}
        <div>
          <dt>Occurrence date</dt>
          <dd>{formatCivilDate(version.occurredAt)}</dd>
        </div>
        <div>
          <dt>Entry time</dt>
          <dd>{formatAuditTime(version.enteredAt, timezone)}</dd>
        </div>
        <div>
          <dt>Created time</dt>
          <dd>{formatAuditTime(version.createdAt, timezone)}</dd>
        </div>
        <div>
          <dt>Edit time</dt>
          <dd>{formatAuditTime(version.editedAt ?? version.updatedAt, timezone)}</dd>
        </div>
        <div>
          <dt>Approval</dt>
          <dd>{statusLabel(version.approvalState)}</dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd>{statusLabel(version.revisionState)}</dd>
        </div>
        <div>
          <dt>Privacy</dt>
          <dd>{statusLabel(version.privacy)}</dd>
        </div>
        <div>
          <dt>Splits</dt>
          <dd>{version.hasSplits ? 'Yes' : 'No'}</dd>
        </div>
        {version.description ? (
          <div className="period-change-version-wide">
            <dt>Description</dt>
            <dd>{version.description}</dd>
          </div>
        ) : null}
        {version.notes ? (
          <div className="period-change-version-wide">
            <dt>Notes</dt>
            <dd>{version.notes}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  )
}

function PeriodChangeDrawer({
  open,
  onClose,
  review,
}: {
  open: boolean
  onClose: () => void
  review?: PeriodReview
}) {
  const changesQuery = useInfiniteQuery({
    queryKey: review
      ? [...periodReviewQueryPrefix(review.workspaceId), 'changes', review.id]
      : ['period-reviews', 'changes', 'disabled'],
    queryFn: ({ pageParam, signal }) =>
      api.get<PeriodReviewChange[]>(
        `/workspaces/${review!.workspaceId}/period-reviews/${review!.id}/changes?limit=100&skip=${pageParam}`,
        { signal },
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((total, page) => total + page.length, 0)
      return lastPage.length === 100 ? loaded : undefined
    },
    enabled: open && Boolean(review),
    retry: 1,
  })
  const changes = (changesQuery.data?.pages ?? []).flat()

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Changes after period review"
      description="Audit history preserves deleted entries and compares each financial version."
    >
      {changesQuery.isLoading ? (
        <p className="period-review-dialog-status" role="status">Loading changes…</p>
      ) : changesQuery.isError && !changes.length ? (
        <div className="form-alert" role="alert">
          <p>Changes could not be loaded.</p>
          <Button variant="secondary" onClick={() => void changesQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : changes.length ? (
        <>
        <ol className="period-change-list" aria-label="Period changes">
          {changes.map((change, index) => {
            const transaction = change.after ?? change.before
            const title = transaction?.merchant || transaction?.description || 'Transaction'
            return (
              <li
                className={`period-change-item period-change-item-${change.action}`}
                key={`${change.changedAt}-${transaction?.id ?? 'redacted'}-${index}`}
              >
                <header>
                  <div>
                    <Badge tone={change.action === 'deleted' ? 'danger' : change.action === 'edited' ? 'warning' : 'positive'}>
                      {changeLabel(change.action)}
                    </Badge>
                    <h3>{title}</h3>
                  </div>
                  <span className="period-change-version-number">Change {index + 1}</span>
                </header>
                <dl className="period-change-audit">
                  <div>
                    <dt>Occurrence date</dt>
                    <dd>{formatCivilDate(transaction?.occurredAt)}</dd>
                  </div>
                  <div>
                    <dt>Entry / created</dt>
                    <dd>{formatAuditTime(transaction?.enteredAt ?? transaction?.createdAt, review?.timezone ?? 'UTC')}</dd>
                  </div>
                  <div>
                    <dt>Changed</dt>
                    <dd>{formatAuditTime(change.changedAt, review?.timezone ?? 'UTC')}</dd>
                  </div>
                  <div>
                    <dt>Editor</dt>
                    <dd>{change.editor ? `${change.editor.name}${change.editor.status === 'former' ? ' · Former member' : ''}${change.editor.isCurrentUser ? ' · You' : ''}` : 'Editor unavailable'}</dd>
                  </div>
                  <div>
                    <dt>Approval</dt>
                    <dd>{statusLabel(change.approvalState)}</dd>
                  </div>
                  <div>
                    <dt>Revision</dt>
                    <dd>{statusLabel(change.revisionState)}</dd>
                  </div>
                </dl>
                <DeltaSummary
                  delta={change.delta}
                  currency={review?.currency ?? transaction?.currency ?? 'INR'}
                  label={`${changeLabel(change.action)} transaction delta`}
                />
                {change.changedFields.length ? (
                  <ul className="period-change-fields" aria-label="Changed fields">
                    {change.changedFields.map((field) => <li key={field}>{statusLabel(field)}</li>)}
                  </ul>
                ) : null}
                {change.splitAllocationChanged ? (
                  <p>Split allocation changed; participant details remain private.</p>
                ) : null}
                <div className="period-change-comparison">
                  <TransactionVersion label="Before" version={change.before} redacted={change.beforeRedacted} timezone={review?.timezone ?? 'UTC'} />
                  <TransactionVersion label="After" version={change.after} redacted={change.afterRedacted} timezone={review?.timezone ?? 'UTC'} />
                </div>
              </li>
            )
          })}
        </ol>
        {changesQuery.isFetchNextPageError ? (
          <div className="period-change-pagination form-alert" role="alert">
            <p>More changes could not be loaded. The changes already shown are still available.</p>
            <Button
              variant="secondary"
              loading={changesQuery.isFetchingNextPage}
              disabled={changesQuery.isFetchingNextPage}
              onClick={() => void changesQuery.fetchNextPage()}
            >
              Retry loading changes
            </Button>
          </div>
        ) : changesQuery.hasNextPage ? (
          <div className="period-change-pagination">
            <Button
              variant="secondary"
              loading={changesQuery.isFetchingNextPage}
              disabled={changesQuery.isFetchingNextPage}
              onClick={() => void changesQuery.fetchNextPage()}
            >
              Load more changes
            </Button>
          </div>
        ) : null}
        </>
      ) : (
        <p className="period-review-dialog-status">No detailed changes are available.</p>
      )}
    </Dialog>
  )
}

export function PeriodReviewCard({
  workspace,
  demoMode,
  period,
}: {
  workspace: Workspace
  demoMode: boolean
  period: DashboardPeriodValue
}) {
  const queryClient = useQueryClient()
  const workspaceId = workspace.id
  const timezone = browserTimeZone()
  const [changesReview, setChangesReview] = useState<PeriodReview>()
  const [savedMessage, setSavedMessage] = useState('')
  const finite = period.mode !== 'all-time'
  const canRead = workspace.permissions?.includes('view_balances') === true &&
    workspace.permissions.includes('view_transactions')
  const canCloseShared = workspace.type !== 'personal' &&
    workspace.permissions?.includes('approve_expenses') === true
  const displayScope = workspace.type !== 'personal' ? 'workspace_view' : 'member_view'
  const queryKey = [
    ...periodReviewQueryPrefix(workspaceId),
    period.from,
    period.to,
    timezone,
    displayScope,
  ] as const
  const reviewQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      api.get<PeriodReview[]>(
        periodReviewPath(workspaceId, period.from, period.to, timezone),
        { signal },
      ),
    enabled: finite && !demoMode && canRead,
    retry: 1,
  })
  const createReview = useMutation({
    mutationFn: (body: CreatePeriodReviewBody) =>
      api.post<PeriodReview, CreatePeriodReviewBody>(
        `/workspaces/${workspaceId}/period-reviews`,
        body,
      ),
    onSuccess: async (_review, body) => {
      setChangesReview(undefined)
      setSavedMessage(body.status === 'closed' ? 'Period close saved.' : 'Period marked reviewed.')
      await invalidatePeriodReviewQueries(queryClient, workspaceId)
    },
  })
  const resetCreateReview = createReview.reset

  const reviews = reviewQuery.data ?? []
  const sharedReview = latestReview(reviews.filter((item) => item.scope === 'workspace_view'))
  const memberReview = latestReview(reviews.filter((item) => item.scope === 'member_view'))
  const review = workspace.type !== 'personal' && sharedReview ? sharedReview : memberReview
  const changeCount = decimalInteger(review?.changeCount ?? '0')
  const changed = changeCount > 0n
  const memberChangeCount = decimalInteger(memberReview?.changeCount ?? '0')
  const memberChangeReview = workspace.type !== 'personal' &&
    memberReview?.id !== review?.id &&
    memberChangeCount > 0n
      ? memberReview
      : undefined
  const changedLabel = review?.status === 'closed'
    ? 'Changed after close'
    : 'Changed after review'
  const memberReviewBody: CreatePeriodReviewBody = {
    from: period.from,
    to: period.to,
    timezone,
    status: 'reviewed',
    scope: 'member_view',
  }
  const closeBody: CreatePeriodReviewBody = {
    from: period.from,
    to: period.to,
    timezone,
    status: 'closed',
    scope: canCloseShared ? 'workspace_view' : 'member_view',
  }
  const memberRefreshBody: CreatePeriodReviewBody = {
    ...memberReviewBody,
    status: memberChangeReview?.status ?? 'reviewed',
  }

  useEffect(() => {
    setChangesReview(undefined)
  }, [workspaceId, period.from, period.to, sharedReview?.id, memberReview?.id])

  useEffect(() => {
    setSavedMessage('')
    resetCreateReview()
  }, [workspaceId, period.from, period.to, timezone, resetCreateReview])

  if (!finite) return null

  if (demoMode) {
    return (
      <section className="period-review-card" aria-labelledby="period-review-heading">
        <div className="period-review-copy">
          <span className="period-review-icon"><History aria-hidden="true" /></span>
          <div>
            <h2 id="period-review-heading">Period review</h2>
            <p>Review and close markers are available in a live workspace. Demo mode does not persist period status.</p>
          </div>
        </div>
        <Badge>Open · Demo only</Badge>
      </section>
    )
  }

  if (!canRead) return null

  const scopeLabel = review?.scope === 'workspace_view'
    ? 'Shared workspace view'
    : 'Your visible member view'
  const closeLabel = canCloseShared
    ? 'Close workspace period'
    : workspace.type === 'personal'
      ? 'Close period'
      : 'Close my period'
  const reviewPending = createReview.isPending &&
    createReview.variables?.status === 'reviewed' &&
    createReview.variables.scope === memberReviewBody.scope
  const closePending = createReview.isPending &&
    createReview.variables?.status === 'closed' &&
    createReview.variables.scope === closeBody.scope
  const memberRefreshPending = createReview.isPending &&
    createReview.variables?.scope === 'member_view' &&
    createReview.variables.status === memberRefreshBody.status

  return (
    <>
      <section
        className={`period-review-card${changed ? ' period-review-card-changed' : ''}`}
        aria-labelledby="period-review-heading"
      >
        <div className="period-review-copy">
          <span className="period-review-icon">
            {changed ? <AlertTriangle aria-hidden="true" /> : review?.status === 'closed' ? <LockKeyhole aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          </span>
          <div>
            <div className="period-review-title-row">
              <h2 id="period-review-heading">{changed ? changedLabel : 'Period review'}</h2>
              {review ? (
                <Badge tone={changed ? 'warning' : 'positive'}>
                  {changed
                    ? `${formatCount(review.changeCount)} ${changeCount === 1n ? 'change' : 'changes'}`
                    : statusLabel(review.status)}
                </Badge>
              ) : null}
            </div>
            {reviewQuery.isLoading ? (
              <p role="status">Checking period status…</p>
            ) : reviewQuery.isError ? (
              <p role="alert">Period status could not be loaded.</p>
            ) : changed && review ? (
              <p>{formatCount(review.changeCount)} {changeCount === 1n ? 'entry has' : 'entries have'} changed since this period was {review.status}.</p>
            ) : review?.status === 'reviewed' ? (
              <p>This period was reviewed and has no later financial changes.</p>
            ) : review?.status === 'closed' ? (
              <p>This period is closed and has no later financial changes.</p>
            ) : (
              <p>Capture this exact date range and flag any financial changes made later.</p>
            )}
          </div>
        </div>

        {review ? (
          <div className="period-review-metadata" aria-label="Saved review scope">
            <span>{scopeLabel}</span>
            <span>{review.timezone}</span>
            <span>{review.scopeNote}</span>
            <span>{review.vaultCount} {review.vaultCount === 1 ? 'vault' : 'vaults'} · {review.accountCount} {review.accountCount === 1 ? 'account' : 'accounts'}</span>
            {review.reviewedBy ? (
              <span>Saved by {review.reviewedBy.name}{review.reviewedBy.isCurrentUser ? ' · You' : ''}{review.reviewedBy.status === 'former' ? ' · Former member' : ''}</span>
            ) : null}
          </div>
        ) : null}

        {review ? (
          <DeltaSummary
            delta={review.snapshot}
            currency={review.currency}
            label="Saved period snapshot"
            signed={false}
          />
        ) : null}

        {changed && review ? (
          <DeltaSummary delta={review.delta} currency={review.currency} />
        ) : null}

        {memberChangeReview ? (
          <section
            className="period-review-member-change"
            aria-labelledby="period-review-member-change-heading"
          >
            <div className="period-review-member-change-copy">
              <span className="period-review-member-change-icon">
                <AlertTriangle aria-hidden="true" />
              </span>
              <div>
                <div className="period-review-title-row">
                  <h3 id="period-review-member-change-heading">Your member view changed</h3>
                  <Badge tone="warning">
                    {formatCount(memberChangeReview.changeCount)} {memberChangeCount === 1n ? 'change' : 'changes'}
                  </Badge>
                </div>
                <p>
                  {formatCount(memberChangeReview.changeCount)} {memberChangeCount === 1n ? 'entry has' : 'entries have'} changed since your member view was {memberChangeReview.status}.
                </p>
              </div>
            </div>
            <div className="period-review-actions">
              <Button variant="secondary" onClick={() => setChangesReview(memberChangeReview)}>
                <History aria-hidden="true" />
                View my changes
              </Button>
              <Button
                variant="secondary"
                loading={memberRefreshPending}
                disabled={createReview.isPending}
                onClick={() => createReview.mutate(memberRefreshBody)}
              >
                {memberChangeReview.status === 'closed'
                  ? 'Close my view again'
                  : 'Review my view again'}
              </Button>
            </div>
          </section>
        ) : null}

        <div className="period-review-actions">
          {reviewQuery.isError ? (
            <Button
              variant="secondary"
              loading={reviewQuery.isFetching}
              disabled={reviewQuery.isFetching}
              onClick={() => void reviewQuery.refetch()}
            >
              Try again
            </Button>
          ) : !review && !reviewQuery.isLoading ? (
            <>
              <Button
                variant="secondary"
                loading={reviewPending}
                disabled={createReview.isPending}
                onClick={() => createReview.mutate(memberReviewBody)}
              >
                Mark reviewed
              </Button>
              <Button
                loading={closePending}
                disabled={createReview.isPending}
                onClick={() => createReview.mutate(closeBody)}
              >
                {closeLabel}
              </Button>
            </>
          ) : review ? (
            <>
              {changed ? (
                <Button variant="secondary" onClick={() => setChangesReview(review)}>
                  <History aria-hidden="true" />
                  View changes
                </Button>
              ) : null}
              {changed && review.status === 'reviewed' && review.scope === 'member_view' ? (
                <Button
                  variant="secondary"
                  loading={reviewPending}
                  disabled={createReview.isPending}
                  onClick={() => createReview.mutate(memberReviewBody)}
                >
                  Review again
                </Button>
              ) : null}
              {(
                review.status === 'reviewed' ||
                (changed && review.status === 'closed' &&
                  (review.scope === 'member_view' || canCloseShared))
              ) ? (
                <Button
                  loading={closePending}
                  disabled={createReview.isPending}
                  onClick={() => createReview.mutate(closeBody)}
                >
                  {changed && review.status === 'closed' ? 'Close again' : closeLabel}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>

        {savedMessage ? (
          <p className="period-review-success" role="status" aria-live="polite">
            {savedMessage}
          </p>
        ) : null}

        {createReview.error ? (
          <p className="period-review-error" role="alert">
            {createReview.error instanceof ApiError
              ? createReview.error.message
              : 'Period status could not be saved. No marker was created.'}
          </p>
        ) : null}
      </section>
      <PeriodChangeDrawer
        open={Boolean(changesReview)}
        onClose={() => setChangesReview(undefined)}
        review={changesReview}
      />
    </>
  )
}
