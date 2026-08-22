import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import {
  ArrowRight,
  CheckCircle2,
  CircleSlash,
  FileSpreadsheet,
  Link2,
  Search,
  TriangleAlert,
} from 'lucide-react'
import { useApp } from '@/app/app-state'
import type { Transaction } from '@/domain/types'
import type {
  ImportColumnMapping,
  ImportResult,
  ImportRow,
  ImportSession,
} from '@/domain/intelligence'
import { api, ApiError } from '@/lib/api-client'
import { formatDate, formatMoney } from '@/lib/format'
import { Badge, Button, Dialog, EmptyState, ErrorState, Field, PageHeader, Section } from '@/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/beui/select'
import { DataSkeleton, InfoNotice, PageFrame } from './shared'
import { hasWorkspacePermission, useFinanceData } from './data'

function InfoNoticeLike({ children }: { children: ReactNode }) {
  return <InfoNotice>{children}</InfoNotice>
}

const PAGE_SIZE = 25

function defaultMapping(): ImportColumnMapping {
  return {
    hasHeader: true,
    dateColumn: 0,
    descriptionColumn: 1,
    amountColumn: 2,
    debitColumn: -1,
    creditColumn: -1,
    notesColumn: -1,
    referenceColumn: -1,
    dateFormat: 'auto',
    amountMode: '',
  }
}

function splitCsvHint(csv: string): string[][] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '')
  return lines.slice(0, 4).map((line) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')))
}

const CSV_MEMORY_PREFIX = 'ledgerly:import-csv:'

function rememberSessionCsv(sessionId: string, csv: string) {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(`${CSV_MEMORY_PREFIX}${sessionId}`, csv)
  } catch {
    // Storage is optional; mapping edits then need a fresh upload.
  }
}

function recalledSessionCsv(sessionId: string): string | undefined {
  if (typeof sessionStorage === 'undefined') return undefined
  try {
    const value = sessionStorage.getItem(`${CSV_MEMORY_PREFIX}${sessionId}`)
    return value === null || value === '' ? undefined : value
  } catch {
    return undefined
  }
}

export function ImportPage() {
  const { demoMode, workspace } = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const sessionId = searchParams.get('session')
  const canImport = hasWorkspacePermission(demoMode, workspace.permissions, 'create_transactions')

  const openSession = (id: string) => {
    setSearchParams({ session: id }, { replace: false })
  }
  const closeSession = () => {
    setSearchParams({}, { replace: true })
  }

  return (
    <PageFrame className="imports-page">
      <PageHeader
        title="Statement import"
        description="Bring bank or card statements into your ledger, review every line, then commit."
      />
      {!canImport || demoMode ? (
        <InfoNoticeLike>
          Statement import needs a live workspace with permission to create
          transactions.
        </InfoNoticeLike>
      ) : sessionId ? (
        <ImportWizard sessionId={sessionId} onClose={closeSession} />
      ) : (
        <>
          <UploadCard onCreated={openSession} />
          <DraftSessionsList onOpen={openSession} />
        </>
      )}
    </PageFrame>
  )
}

function UploadCard({ onCreated }: { onCreated: (id: string) => void }) {
  const { workspace } = useApp()
  const queryClient = useQueryClient()
  const accountsQuery = useFinanceData<{ id: string; name: string; currency: string; status?: string }[]>(
    'accounts',
    '/accounts',
    [],
  )
  const accounts = (accountsQuery.data ?? []).filter((account) => account.status !== 'inactive')
  const [accountId, setAccountId] = useState('')
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!accountId && accounts.length > 0) setAccountId(accounts[0].id)
  }, [accounts, accountId])

  const createMutation = useMutation({
    mutationFn: async () =>
      api.post<unknown, { accountId: string; sourceName: string; csv: string; mapping: ImportColumnMapping }>(
        `/workspaces/${workspace.id}/imports`,
        {
          accountId,
          sourceName: fileName || 'Statement',
          csv: csvText,
          mapping: defaultMapping(),
        },
      ) as Promise<ImportSession>,
    onSuccess: (session) => {
      rememberSessionCsv(session.id, csvText)
      void queryClient.invalidateQueries({ queryKey: ['imports', workspace.id] })
      void queryClient.invalidateQueries({ queryKey: ['attention', workspace.id] })
      onCreated(session.id)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) {
        setErrors(error.fields)
      } else {
        setErrors({ form: 'The statement could not be uploaded. Try again.' })
      }
    },
  })

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const text = await file.text()
      setCsvText(text)
      setFileName(file.name)
      clearFieldError(setErrors, 'csv')
    } catch {
      setErrors({ csv: 'That file could not be read as text.' })
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (!accountId) nextErrors.accountId = 'Choose an account'
    if (!csvText.trim()) nextErrors.csv = 'Choose a CSV file to import'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) createMutation.mutate()
  }

  return (
    <Section>
      <div className="section-heading-row">
        <div>
          <h2>Upload a statement</h2>
          <p>CSV files up to about 500 rows</p>
        </div>
      </div>
      <form className="dialog-form finance-write-form" onSubmit={submit} aria-busy={createMutation.isPending}>
        <Field label="Account" error={errors.accountId}>
          <Select value={accountId} onValueChange={(value) => { clearFieldError(setErrors, 'accountId'); setAccountId(value) }}>
            <SelectTrigger aria-label="Import into account" className="w-full" data-field-control>
              <SelectValue placeholder="Choose account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Statement file" error={errors.csv} hint="Exported CSV from your bank. Nothing is committed until you review it.">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(event) => void handleFile(event.target.files?.[0])}
            aria-label="Choose statement CSV file"
          />
        </Field>
        {fileName ? (
          <p className="import-file-summary">
            <FileSpreadsheet aria-hidden="true" size={16} /> {fileName} ·{' '}
            {splitCsvHint(csvText).length > 0 ? `${countDataRows(csvText)} rows detected` : 'empty file'}
          </p>
        ) : null}
        {errors.form ? <p className="field-error" role="alert">{errors.form}</p> : null}
        <Button variant="primary" type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Parsing…' : 'Parse statement'}
        </Button>
      </form>
    </Section>
  )
}

function countDataRows(csv: string) {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '')
  return Math.max(lines.length - 1, 0)
}

function DraftSessionsList({ onOpen }: { onOpen: (id: string) => void }) {
  const { workspace } = useApp()
  const queryClient = useQueryClient()
  const sessionsQuery = useQuery({
    queryKey: ['imports', workspace.id],
    queryFn: () =>
      api.get<unknown>(`/workspaces/${workspace.id}/imports?status=draft`) as Promise<ImportSession[]>,
  })
  const sessions = sessionsQuery.data ?? []
  const discardMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/workspaces/${workspace.id}/imports/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['imports', workspace.id] })
      void queryClient.invalidateQueries({ queryKey: ['attention', workspace.id] })
    },
  })
  if (sessionsQuery.isLoading) return null
  if (!sessions.length) return null
  return (
    <Section>
      <div className="section-heading-row">
        <div>
          <h2>Waiting for review</h2>
          <p>Draft imports are kept until you commit or discard them</p>
        </div>
      </div>
      <ul className="import-draft-list">
        {sessions.map((session) => (
          <li key={session.id} className="import-draft-row">
            <button type="button" onClick={() => onOpen(session.id)}>
              <strong>{session.sourceName}</strong>
              <span>
                {session.summary.totalRows} rows · {describePending(session)}
              </span>
            </button>
            <Button
              variant="quiet"
              onClick={() => discardMutation.mutate(session.id)}
              disabled={discardMutation.isPending}
              aria-label={`Discard draft ${session.sourceName}`}
            >
              Discard
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function describePending(session: ImportSession) {
  const parts: string[] = []
  if (session.summary.createCount) parts.push(`${session.summary.createCount} to add`)
  if (session.summary.linkCount) parts.push(`${session.summary.linkCount} to link`)
  if (session.summary.errorRows) parts.push(`${session.summary.errorRows} invalid`)
  return parts.join(' · ') || 'not reviewed yet'
}

function ImportWizard({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { workspace } = useApp()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<'review' | 'done'>('review')
  const [result, setResult] = useState<ImportResult | null>(null)
  const sessionQuery = useQuery({
    queryKey: ['import-session', workspace.id, sessionId],
    queryFn: () => api.get<unknown>(`/workspaces/${workspace.id}/imports/${sessionId}`) as Promise<ImportSession>,
    retry: false,
  })
  const cancelMutation = useMutation({
    mutationFn: () => api.delete(`/workspaces/${workspace.id}/imports/${sessionId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['imports', workspace.id] })
      void queryClient.invalidateQueries({ queryKey: ['attention', workspace.id] })
      onClose()
    },
  })

  if (sessionQuery.isLoading) return <DataSkeleton />
  if (sessionQuery.isError) {
    return (
      <ErrorState message="This import could not be loaded." retry={() => sessionQuery.refetch()} />
    )
  }
  const session = sessionQuery.data
  if (!session) return null

  if (session.status === 'completed') {
    return <CompletedPanel session={session} onClose={onClose} />
  }

  if (step === 'done' && result) {
    return (
      <Section>
        <EmptyState
          icon={<CheckCircle2 />}
          title="Import finished"
          message={`${result.createdCount} added · ${result.linkedCount} linked · ${result.ignoredCount} ignored`}
          action={
            <div className="import-done-actions">
              <Link className="button button-primary" to="/app/transactions">
                View transactions
              </Link>
              <Button variant="secondary" onClick={onClose}>Back to imports</Button>
            </div>
          }
        />
      </Section>
    )
  }

  return (
    <>
      <MappingStep session={session} />
      <ReviewStep
        session={session}
        onCommitted={(commitResult) => {
          const committedSession = commitResult as unknown as ImportSession
          setResult(
            committedSession?.result ?? {
              createdCount: Number((commitResult as { createdCount?: number }).createdCount ?? 0),
              linkedCount: Number((commitResult as { linkedCount?: number }).linkedCount ?? 0),
              ignoredCount: Number((commitResult as { ignoredCount?: number }).ignoredCount ?? 0),
              committedAt: new Date().toISOString(),
            },
          )
          setStep('done')
        }}
      />
      <Section>
        <Button
          variant="quiet"
          onClick={() => {
            if (window.confirm('Discard this import? Reviewed decisions will be lost.')) {
              cancelMutation.mutate()
            }
          }}
          disabled={cancelMutation.isPending}
        >
          Discard import
        </Button>
      </Section>
    </>
  )
}

function CompletedPanel({ session, onClose }: { session: ImportSession; onClose: () => void }) {
  return (
    <Section>
      <EmptyState
        icon={<CheckCircle2 />}
        title="This statement was already imported"
        message={
          session.result
            ? `${session.result.createdCount} added · ${session.result.linkedCount} linked · ${session.result.ignoredCount} ignored`
            : 'The evidence for this import is retained in your audit history.'
        }
        action={<Button variant="secondary" onClick={onClose}>Back to imports</Button>}
      />
    </Section>
  )
}

const DATE_FORMATS: { value: string; label: string }[] = [
  { value: 'auto', label: 'Detect automatically' },
  { value: 'iso', label: '2026-08-22' },
  { value: 'dmy', label: '22/08/2026' },
  { value: 'mdy', label: '08/22/2026' },
  { value: 'ymd_slash', label: '2026/08/22' },
  { value: 'dmy_dash', label: '22-08-2026' },
  { value: 'dmy_month', label: '22-Aug-2026' },
]

const AMOUNT_MODES: { value: string; label: string }[] = [
  { value: 'signed', label: 'One amount column (+ in, − out)' },
  { value: 'expense_positive', label: 'One amount column (spending positive)' },
  { value: 'two_column', label: 'Separate debit and credit columns' },
]

function MappingStep({ session }: { session: ImportSession }) {
  const { workspace } = useApp()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const csv = recalledSessionCsv(session.id)
  const [mapping, setMapping] = useState<ImportColumnMapping>(session.mapping)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const previewRows = useMemo(() => (csv ? splitCsvHint(csv).slice(0, 4) : []), [csv])
  const columnCount = Math.max(
    ...previewRows.map((row) => row.length),
    mapping.dateColumn + 1,
    mapping.descriptionColumn + 1,
    mapping.amountColumn + 1,
    mapping.debitColumn + 1,
    mapping.creditColumn + 1,
    1,
  )

  const reparseMutation = useMutation({
    mutationFn: () => {
      if (!csv) throw new Error('missing-csv')
      return api.patch<unknown, { accountId?: string; sourceName?: string; csv: string; mapping: ImportColumnMapping }>(
        `/workspaces/${workspace.id}/imports/${session.id}`,
        {
          accountId: session.accountId,
          sourceName: session.sourceName,
          csv,
          mapping,
        },
      ) as Promise<ImportSession>
    },
    onSuccess: () => {
      setErrors({})
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['import-session', workspace.id, session.id] })
      void queryClient.invalidateQueries({ queryKey: ['imports', workspace.id] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) setErrors(error.fields)
      else setErrors({ form: error instanceof Error && error.message === 'missing-csv'
        ? 'Choose the statement file again to adjust its columns.'
        : 'The statement could not be re-parsed with these columns.' })
    },
  })

  const update = (patch: Partial<ImportColumnMapping>) =>
    setMapping((current) => ({ ...current, ...patch }))
  const amountMode = mapping.amountMode || 'signed'

  const columnSelect = (
    label: string,
    value: number,
    onChange: (value: number) => void,
    optional = false,
  ) => (
    <Field label={label}>
      <Select
        value={String(value)}
        onValueChange={(next) => onChange(Number(next))}
      >
        <SelectTrigger aria-label={label} className="w-full" data-field-control>
          <SelectValue placeholder="Column…" />
        </SelectTrigger>
        <SelectContent>
          {optional ? <SelectItem value="-1">Not used</SelectItem> : null}
          {Array.from({ length: columnCount }, (_, index) => (
            <SelectItem key={index} value={String(index)}>
              {columnLabel(index, previewRows)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )

  const summaryParts = [
    `Date: ${shortColumnLabel(session.mapping.dateColumn)}`,
    `Description: ${shortColumnLabel(session.mapping.descriptionColumn)}`,
    session.mapping.amountMode === 'two_column'
      ? `Debit/Credit: ${shortColumnLabel(session.mapping.debitColumn)}/${shortColumnLabel(session.mapping.creditColumn)}`
      : `Amount: ${shortColumnLabel(session.mapping.amountColumn)}`,
  ]

  return (
    <Section className="import-mapping-section">
      <div className="section-heading-row">
        <div>
          <h2>Column mapping</h2>
          <p>{summaryParts.join(' · ')}</p>
        </div>
        <Button
          variant="secondary"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? 'Close' : csv ? 'Adjust columns' : 'Adjust (re-upload needed)'}
        </Button>
      </div>
      {open ? (
        !csv ? (
          <InfoNotice>
            The statement file stays on this device only for a short while. Choose
            the file again from the import list to adjust its column mapping.
          </InfoNotice>
        ) : (
          <form
            className="dialog-form finance-write-form import-mapping-form"
            onSubmit={(event) => {
              event.preventDefault()
              reparseMutation.mutate()
            }}
            aria-busy={reparseMutation.isPending}
          >
            <label className="forecast-toggle">
              <input
                type="checkbox"
                checked={mapping.hasHeader}
                onChange={(event) => update({ hasHeader: event.target.checked })}
              />
              First row is a header
            </label>
            <div className="import-mapping-grid">
              {columnSelect('Date column', mapping.dateColumn, (value) => update({ dateColumn: value }))}
              {columnSelect('Description column', mapping.descriptionColumn, (value) => update({ descriptionColumn: value }))}
            </div>
            <Field label="How amounts are stored">
              <Select
                value={amountMode}
                onValueChange={(next) => update({
                  amountMode: next,
                  ...(next === 'two_column'
                    ? { debitColumn: Math.max(mapping.debitColumn, 0), creditColumn: Math.max(mapping.creditColumn, 1), amountColumn: -1 }
                    : { amountColumn: Math.max(mapping.amountColumn, 0), debitColumn: -1, creditColumn: -1 }),
                })}
              >
                <SelectTrigger aria-label="Amount layout" className="w-full" data-field-control>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AMOUNT_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="import-mapping-grid">
              {amountMode === 'two_column' ? (
                <>
                  {columnSelect('Debit (out) column', mapping.debitColumn, (value) => update({ debitColumn: value }))}
                  {columnSelect('Credit (in) column', mapping.creditColumn, (value) => update({ creditColumn: value }))}
                </>
              ) : (
                columnSelect('Amount column', mapping.amountColumn, (value) => update({ amountColumn: value }))
              )}
            </div>
            <div className="import-mapping-grid">
              {columnSelect('Notes column (optional)', mapping.notesColumn, (value) => update({ notesColumn: value }), true)}
              {columnSelect('Reference column (optional)', mapping.referenceColumn, (value) => update({ referenceColumn: value }), true)}
            </div>
            <Field label="Date format" hint="Auto-detection samples your rows when unsure." error={errors.dateFormat}>
              <Select
                value={mapping.dateFormat || 'auto'}
                onValueChange={(next) => update({ dateFormat: next })}
              >
                <SelectTrigger aria-label="Date format" className="w-full" data-field-control>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FORMATS.map((format) => (
                    <SelectItem key={format.value} value={format.value}>
                      {format.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {previewRows.length > 0 ? (
              <div className="import-mapping-preview" aria-label="First statement rows">
                {previewRows.map((row, rowIndex) => (
                  <div className="import-mapping-preview-row" key={rowIndex} data-header={mapping.hasHeader && rowIndex === 0 || undefined}>
                    {row.map((cell, cellIndex) => (
                      <span
                        key={cellIndex}
                        data-selected={
                          cellIndex === mapping.dateColumn ||
                          cellIndex === mapping.descriptionColumn ||
                          cellIndex === mapping.amountColumn ||
                          cellIndex === mapping.debitColumn ||
                          cellIndex === mapping.creditColumn ||
                          undefined
                        }
                      >
                        {cell || '·'}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
            {errors.csv || errors.form || errors.accountId ? (
              <p className="field-error" role="alert">{errors.csv ?? errors.form ?? errors.accountId}</p>
            ) : null}
            <Button type="submit" variant="primary" disabled={reparseMutation.isPending}>
              {reparseMutation.isPending ? 'Re-parsing…' : 'Re-parse with these columns'}
            </Button>
          </form>
        )
      ) : null}
    </Section>
  )
}

function columnLabel(index: number, previewRows: string[][]) {
  const headerRow = previewRows[0]
  if (headerRow && headerRow[index]) {
    const name = headerRow[index].slice(0, 18)
    return `${String.fromCharCode(65 + index)} · ${name}`
  }
  return String.fromCharCode(65 + index)
}

function shortColumnLabel(index: number) {
  if (index < 0) return '—'
  return String.fromCharCode(65 + index)
}

function ReviewStep({
  session,
  onCommitted,
}: {
  session: ImportSession
  onCommitted: (result: ImportResult) => void
}) {
  const { workspace } = useApp()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const summary = session.summary

  const resolveMutation = useMutation({
    mutationFn: (resolutions: { index: number; action: string; transactionId?: string }[]) =>
      api.post<unknown, { resolutions: typeof resolutions }>(
        `/workspaces/${workspace.id}/imports/${session.id}/resolve`,
        { resolutions },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['import-session', workspace.id, session.id] })
      void queryClient.invalidateQueries({ queryKey: ['imports', workspace.id] })
    },
  })

  const bulkResolve = (filter: (row: ImportRow) => boolean, action: string) => {
    const targets = session.rows.filter(filter)
    if (!targets.length) return
    resolveMutation.mutate(targets.map((row) => ({ index: row.index, action })))
  }

  const blockingErrors = session.rows.filter(
    (row) => row.state === 'invalid' && row.action !== 'ignore',
  ).length
  const pendingDecisions = session.rows.filter((row) => !row.action).length
  const readyToCommit =
    !resolveMutation.isPending && blockingErrors === 0 && pendingDecisions === 0 &&
    (summary.createCount > 0 || summary.linkCount > 0)

  return (
    <>
      <Section>
        <div className="section-heading-row">
          <div>
            <h2>{session.sourceName}</h2>
            <p>{summary.totalRows} rows · review each decision</p>
          </div>
          <Badge tone={blockingErrors ? 'danger' : pendingDecisions ? 'warning' : 'positive'}>
            {blockingErrors ? `${blockingErrors} invalid` : pendingDecisions ? `${pendingDecisions} undecided` : 'Ready'}
          </Badge>
        </div>
        <div className="import-summary-grid" role="list">
          <SummaryChip tone="neutral" label="New" count={countByAction(session, 'new')} />
          <SummaryChip tone="warning" label="Duplicates found" count={summary.duplicateRows} />
          <SummaryChip tone="neutral" label="Possible matches" count={summary.possibleMatches} />
          <SummaryChip tone="danger" label="Invalid" count={blockingErrors} />
          <SummaryChip tone="positive" label="Will add" count={summary.createCount} />
          <SummaryChip tone="neutral" label="Will link" count={summary.linkCount} />
        </div>
        <div className="import-bulk-actions">
          <Button variant="secondary" onClick={() => bulkResolve((row) => row.state === 'duplicate', 'ignore')}>
            Ignore all duplicates
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              bulkResolve(
                (row) => row.state === 'possible_match' && Boolean(row.match),
                'link',
              )
            }
          >
            Accept suggested matches
          </Button>
          <Button variant="secondary" onClick={() => bulkResolve((row) => row.state === 'new', 'create')}>
            Add all new rows
          </Button>
        </div>
      </Section>
      <RowsEditor session={session} onResolve={(resolution) => resolveMutation.mutate([resolution])} busy={resolveMutation.isPending} />
      <div className="import-commit-bar">
        <span>
          Adds {summary.createCount} · Links {summary.linkCount} · Ignores {summary.ignoredRows}
        </span>
        <Button variant="primary" onClick={() => setConfirming(true)} disabled={!readyToCommit}>
          Import <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </div>
      {blockingErrors > 0 ? (
        <InfoNoticeLike>
          Fix or ignore invalid rows before importing. Their dates or amounts could
          not be read from the file.
        </InfoNoticeLike>
      ) : null}
      <CommitDialog
        open={confirming}
        session={session}
        busy={false}
        onCancel={() => setConfirming(false)}
        onCommitted={(result) => {
          setConfirming(false)
          void queryClient.invalidateQueries({ queryKey: ['transactions', workspace.id] })
          void queryClient.invalidateQueries({ queryKey: ['accounts', workspace.id] })
          void queryClient.invalidateQueries({ queryKey: ['dashboard', workspace.id] })
          void queryClient.invalidateQueries({ queryKey: ['attention', workspace.id] })
          void queryClient.invalidateQueries({ queryKey: ['imports', workspace.id] })
          onCommitted(result)
        }}
      />
    </>
  )
}

function countByAction(session: ImportSession, state: ImportRow['state']) {
  return session.rows.filter((row) => row.state === state).length
}

function SummaryChip({ tone, label, count }: { tone: 'neutral' | 'positive' | 'warning' | 'danger' | 'info'; label: string; count: number }) {
  return (
    <div className={`import-chip import-chip-${tone}`} role="listitem">
      <strong>{count}</strong>
      <span>{label}</span>
    </div>
  )
}

function RowsEditor({
  session,
  onResolve,
  busy,
}: {
  session: ImportSession
  onResolve: (resolution: { index: number; action: string; transactionId?: string }) => void
  busy: boolean
}) {
  const [pageIndex, setPageIndex] = useState(0)
  const pageCount = Math.max(Math.ceil(session.rows.length / PAGE_SIZE), 1)
  const safePage = Math.min(pageIndex, pageCount - 1)
  const visible = session.rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  return (
    <Section>
      <ul className="import-rows">
        {visible.map((row) => (
          <RowCard key={row.index} row={row} currency={session.currency} onResolve={onResolve} busy={busy} />
        ))}
      </ul>
      {pageCount > 1 ? (
        <nav className="import-pagination" aria-label="Import rows pages">
          <Button variant="secondary" disabled={safePage === 0} onClick={() => setPageIndex(safePage - 1)}>
            Previous
          </Button>
          <span>Page {safePage + 1} of {pageCount}</span>
          <Button variant="secondary" disabled={safePage >= pageCount - 1} onClick={() => setPageIndex(safePage + 1)}>
            Next
          </Button>
        </nav>
      ) : null}
    </Section>
  )
}

function RowCard({
  row,
  currency,
  onResolve,
  busy,
}: {
  row: ImportRow
  currency: string
  onResolve: (resolution: { index: number; action: string; transactionId?: string }) => void
  busy: boolean
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const amount = formatMoney({ amountMinor: row.amountMinor, currency })
  const stateBadge = rowBadge(row)

  const setAction = (action: string) => {
    if (action === 'link' && !row.match) {
      setPickerOpen(true)
      return
    }
    onResolve({ index: row.index, action })
  }

  return (
    <li className={`import-row import-row-${row.state}`} data-action={row.action || undefined}>
      <div className="import-row-main">
        <div className="import-row-copy">
          <span className="import-row-date">{formatDate(row.occurredAt)}</span>
          <strong>{row.description || 'Unnamed line'}</strong>
          <span className={`import-row-amount import-amount-${row.direction}`}>
            {row.direction === 'credit' ? '+' : '−'} {amount}
          </span>
        </div>
        <div className="import-row-controls">
          {stateBadge}
          <Select value={row.action || 'undecided'} onValueChange={setAction}>
            <SelectTrigger
              aria-label={`Decision for row ${row.index + 1}`}
              className="w-full"
              data-field-control
              aria-disabled={busy || undefined}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="undecided" disabled={row.state !== 'invalid'}>
                Choose…
              </SelectItem>
              {row.state === 'invalid' ? null : (
                <SelectItem value="create">Add to ledger</SelectItem>
              )}
              <SelectItem value="ignore">Ignore row</SelectItem>
              {row.state !== 'invalid' && row.match ? (
                <SelectItem value="link">Link to match</SelectItem>
              ) : null}
              {row.state !== 'invalid' && !row.match ? (
                <SelectItem value="pick">Find a match…</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>
      </div>
      {row.error ? (
        <p className="import-row-error" role="alert">
          <TriangleAlert size={14} aria-hidden="true" /> {row.error}
        </p>
      ) : null}
      {row.match && row.action !== 'ignore' ? (
        <p className="import-row-match">
          <Link2 size={14} aria-hidden="true" /> Suggested:{' '}
          <strong>{row.match.label ?? 'Ledgerly entry'}</strong>
          {row.match.occurredAt ? ` · ${formatDate(row.match.occurredAt)}` : ''}
        </p>
      ) : null}
      {pickerOpen ? (
        <LinkPicker
          rowDescription={row.description}
          onPick={(transactionId, label) => {
            setPickerOpen(false)
            onResolve({ index: row.index, action: 'link', transactionId })
            void label
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </li>
  )
}

function rowBadge(row: ImportRow) {
  switch (row.state) {
    case 'duplicate':
      return <Badge tone="warning">Duplicate</Badge>
    case 'possible_match':
      return <Badge tone="neutral">Match?</Badge>
    case 'invalid':
      return <Badge tone="danger">Invalid</Badge>
    default:
      return <Badge tone="neutral">New</Badge>
  }
}

function LinkPicker({
  rowDescription,
  onPick,
  onClose,
}: {
  rowDescription: string
  onPick: (transactionId: string, label?: string) => void
  onClose: () => void
}) {
  const { workspace } = useApp()
  const [term, setTerm] = useState(rowDescription.slice(0, 40))
  const trimmed = term.trim()
  const resultsQuery = useQuery({
    queryKey: ['import-link-search', workspace.id, trimmed.toLowerCase()],
    queryFn: () =>
      api.get<Transaction[]>(
        `/workspaces/${workspace.id}/transactions?search=${encodeURIComponent(trimmed)}&limit=5`,
      ),
    enabled: trimmed.length >= 2,
    staleTime: 15_000,
  })
  const results = useMemo(
    () => (resultsQuery.data ?? []).filter((transaction) => !transaction.cleared),
    [resultsQuery.data],
  )
  return (
    <div className="import-link-picker" role="group" aria-label="Find a ledger entry to link">
      <Field label="Search your ledger" hint="Only entries that are not already reconciled are shown.">
        <div className="import-link-search">
          <Search size={16} aria-hidden="true" />
          <input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Type an amount, name, or note"
            aria-label="Search ledger entries"
          />
        </div>
      </Field>
      {resultsQuery.isLoading ? <p className="import-picker-status">Searching…</p> : null}
      {results.length > 0 ? (
        <ul className="import-picker-results">
          {results.map((transaction) => (
            <li key={transaction.id}>
              <button type="button" onClick={() => onPick(transaction.id, transaction.merchant)}>
                <strong>{transaction.merchant}</strong>
                <span>
                  {formatDate(transaction.occurredAt)} ·{' '}
                  {formatMoney(transaction.amount)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : trimmed.length >= 2 && !resultsQuery.isLoading ? (
        <p className="import-picker-status">
          <CircleSlash size={14} aria-hidden="true" /> Nothing matched. You can still add this row instead.
        </p>
      ) : null}
      <Button variant="quiet" onClick={onClose}>Close search</Button>
    </div>
  )
}

function CommitDialog({
  open,
  session,
  busy,
  onCancel,
  onCommitted,
}: {
  open: boolean
  session: ImportSession
  busy: boolean
  onCancel: () => void
  onCommitted: (result: ImportResult) => void
}) {
  const { workspace } = useApp()
  const commitMutation = useMutation({
    mutationFn: () =>
      api.post<ImportResult, Record<string, never>>(
        `/workspaces/${workspace.id}/imports/${session.id}/commit`,
        {},
        { 'Idempotency-Key': crypto.randomUUID() },
      ),
    onSuccess: onCommitted,
  })
  return (
    <Dialog
      open={open}
      title="Import these rows?"
      description="Committing is final; every created entry keeps its import provenance."
      onClose={busy ? () => undefined : onCancel}
    >
      <p className="import-confirm-copy">
        This adds <strong>{session.summary.createCount}</strong> transactions and links{' '}
        <strong>{session.summary.linkCount}</strong> existing ones. Rows you marked
        ignore are skipped. You cannot undo a completed import, but every created
        entry keeps its import provenance.
      </p>
      {commitMutation.isError ? (
        <p className="field-error" role="alert">
          The import could not be committed. Nothing was changed — try again.
        </p>
      ) : null}
      <div className="dialog-actions">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={() => commitMutation.mutate()} disabled={commitMutation.isPending}>
          {commitMutation.isPending ? 'Importing…' : 'Import now'}
        </Button>
      </div>
    </Dialog>
  )
}

function clearFieldError(setErrors: (updater: (current: Record<string, string>) => Record<string, string>) => void, field: string) {
  setErrors((current) => {
    const next = { ...current }
    delete next[field]
    return next
  })
}
