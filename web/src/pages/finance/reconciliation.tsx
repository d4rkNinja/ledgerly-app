import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import { useApp } from '@/app/app-state'
import type {
  AccountReconciliation,
  ReconciliationPreviewResult,
} from '@/domain/intelligence'
import type { Account } from '@/domain/types'
import { api, ApiError } from '@/lib/api-client'
import { formatDate, formatMoney } from '@/lib/format'
import { Badge, Button, EmptyState, Field, Section } from '@/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/beui/select'
import { InfoNotice } from './shared'
import { hasWorkspacePermission } from './data'

function todayIso() {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    .toISOString()
    .slice(0, 10)
}

export function ReconciliationSection({ accounts }: { accounts: Account[] }) {
  const { demoMode, workspace } = useApp()
  const queryClient = useQueryClient()
  const activeAccounts = accounts.filter((account) => account.status !== 'inactive')
  const canComplete = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'edit_all_transactions',
  )
  const [accountId, setAccountId] = useState('')
  const [statementDate, setStatementDate] = useState(todayIso())
  const [statementBalance, setStatementBalance] = useState('')
  const [acknowledge, setAcknowledge] = useState(false)
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<ReconciliationPreviewResult | null>(null)

  useEffect(() => {
    if (!accountId && activeAccounts.length > 0) setAccountId(activeAccounts[0].id)
  }, [activeAccounts, accountId])

  const historyQuery = useQuery({
    queryKey: ['reconciliations', workspace.id, accountId],
    queryFn: () =>
      api.get<unknown>(
        `/workspaces/${workspace.id}/reconciliations?accountId=${encodeURIComponent(accountId)}&limit=5`,
      ) as Promise<AccountReconciliation[]>,
    enabled: Boolean(accountId) && !demoMode,
    staleTime: 30_000,
  })

  const previewMutation = useMutation({
    mutationFn: () => {
      const minor = Math.round(Number.parseFloat(statementBalance) * 100)
      return api.get<unknown>(
        `/workspaces/${workspace.id}/accounts/${accountId}/reconciliation-preview` +
          `?statementDate=${statementDate}&statementBalanceMinor=${minor}`,
      ) as Promise<ReconciliationPreviewResult>
    },
    onSuccess: (result) => {
      setPreview(result)
      setAcknowledge(false)
      setErrors({})
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) setErrors(error.fields)
      else setErrors({ form: 'The comparison could not be calculated.' })
    },
  })

  const completeMutation = useMutation({
    mutationFn: () => {
      const minor = Math.round(Number.parseFloat(statementBalance) * 100)
      return api.post<
        unknown,
        { statementDate: string; statementBalanceMinor: number; acknowledgeDifference: boolean; note: string }
      >(`/workspaces/${workspace.id}/accounts/${accountId}/reconciliations`, {
        statementDate,
        statementBalanceMinor: minor,
        acknowledgeDifference: acknowledge,
        note,
      })
    },
    onSuccess: () => {
      setPreview(null)
      setStatementBalance('')
      setNote('')
      void queryClient.invalidateQueries({ queryKey: ['reconciliations', workspace.id] })
      void queryClient.invalidateQueries({ queryKey: ['attention', workspace.id] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) {
        setErrors(error.fields)
        if (error.fields.acknowledgeDifference) setPreview((current) => current)
      } else {
        setErrors({ form: 'The reconciliation could not be recorded.' })
      }
    },
  })

  const history = historyQuery.data ?? []
  const differenceBadge = useMemo(() => {
    if (!preview || !preview.hasStatementBalance) return null
    const difference = preview.differenceMinor ?? 0
    if (difference === 0) return <Badge tone="positive">Matches</Badge>
    return (
      <Badge tone="danger">
        Off by {formatMoney({
          amountMinor: Math.abs(difference),
          currency: preview.currency,
        })}
      </Badge>
    )
  }, [preview])

  if (!activeAccounts.length || demoMode) return null

  return (
    <Section>
      <div className="section-heading-row">
        <div>
          <h2>Reconciliation</h2>
          <p>Compare a bank statement with your Ledgerly balance.</p>
        </div>
      </div>

      <div className="recon-form">
        <Field label="Account">
          <Select value={accountId} onValueChange={(value) => { setAccountId(value); setPreview(null) }}>
            <SelectTrigger aria-label="Account to reconcile" className="w-full" data-field-control>
              <SelectValue placeholder="Choose account" />
            </SelectTrigger>
            <SelectContent>
              {activeAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="two-fields">
          <Field label="Statement date" error={errors.statementDate}>
            <input
              type="date"
              value={statementDate}
              max={todayIso()}
              onChange={(event) => {
                setStatementDate(event.target.value)
                setPreview(null)
              }}
            />
          </Field>
          <Field label="Statement closing balance" error={errors.statementBalanceMinor}>
            <input
              inputMode="decimal"
              value={statementBalance}
              placeholder="0.00"
              onChange={(event) => {
                setStatementBalance(event.target.value)
                setPreview(null)
                clearError(setErrors, 'statementBalanceMinor')
              }}
            />
          </Field>
        </div>
        <Button
          variant="secondary"
          onClick={() => previewMutation.mutate()}
          disabled={previewMutation.isPending || !statementBalance.trim()}
        >
          {previewMutation.isPending ? 'Checking…' : 'Compare with ledger'}
        </Button>
        {errors.form ? <p className="field-error" role="alert">{errors.form}</p> : null}
      </div>

      {preview ? (
        <div className="recon-preview" role="status">
          <dl className="forecast-stats recon-stats">
            <div>
              <dt>Ledgerly balance</dt>
              <dd>{formatMoney({ amountMinor: preview.ledgerBalanceMinor, currency: preview.currency })}</dd>
            </div>
            <div>
              <dt>Statement says</dt>
              <dd>{formatMoney({ amountMinor: preview.statementBalanceMinor ?? 0, currency: preview.currency })}</dd>
            </div>
            <div>
              <dt>Cleared entries</dt>
              <dd>{preview.clearedCount}</dd>
            </div>
            <div>
              <dt>Not yet matched</dt>
              <dd>{preview.unclearedCount}</dd>
            </div>
          </dl>
          <p className="recon-difference">{differenceBadge}</p>
          {preview.differenceMinor !== 0 ? (
            <>
              <InfoNotice>
                Your ledger differs from the statement. Import missing statement rows or fix
                entries first — or record the reconciliation with the difference acknowledged so
                it is visible as unresolved.
              </InfoNotice>
              {canComplete ? (
                <label className="forecast-toggle">
                  <input
                    type="checkbox"
                    checked={acknowledge}
                    onChange={(event) => setAcknowledge(event.target.checked)}
                  />
                  Record anyway with this difference marked unresolved
                </label>
              ) : null}
            </>
          ) : null}
          {canComplete ? (
            <>
              <Field label="Note" hint="Optional context for future readers.">
                <input
                  value={note}
                  maxLength={500}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="e.g. July statement from HDFC"
                />
              </Field>
              <Button
                variant="primary"
                onClick={() => completeMutation.mutate()}
                disabled={
                  completeMutation.isPending ||
                  (preview.differenceMinor !== 0 && !acknowledge)
                }
              >
                {completeMutation.isPending ? 'Recording…' : 'Record reconciliation'}
              </Button>
              {errors.acknowledgeDifference ? (
                <p className="field-error" role="alert">{errors.acknowledgeDifference}</p>
              ) : null}
            </>
          ) : (
            <InfoNotice>Only workspace managers can record reconciliations.</InfoNotice>
          )}
        </div>
      ) : null}

      <div className="recon-history">
        <h3>Past reconciliations</h3>
        {historyQuery.isLoading ? null : !history.length ? (
          <EmptyState
            icon={<Link2 />}
            title="Nothing recorded yet"
            message="Completed reconciliations become permanent evidence of what your balance was."
          />
        ) : (
          <ul className="recon-history-list">
            {history.map((entry) => (
              <li key={entry.id}>
                <span>{formatDate(entry.statementDate)}</span>
                <strong>{formatMoney({ amountMinor: entry.statementBalanceMinor, currency: entry.currency })}</strong>
                {entry.differenceMinor === 0 ? (
                  <Badge tone="positive">Cleared</Badge>
                ) : (
                  <Badge tone="warning">
                    Unresolved · {formatMoney({
                      amountMinor: entry.differenceMinor,
                      currency: entry.currency,
                    })}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

function clearError(
  setErrors: (updater: (current: Record<string, string>) => Record<string, string>) => void,
  field: string,
) {
  setErrors((current) => {
    const next = { ...current }
    delete next[field]
    return next
  })
}
