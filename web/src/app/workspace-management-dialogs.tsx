import { useState } from 'react'
import { Button, Dialog, Field } from '@/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/motion/select'
import { CURRENCY_OPTIONS } from '@/domain/currencies'
import type { Workspace, WorkspaceType } from '@/domain/types'
import { ApiError, api } from '@/lib/api-client'

type WorkspaceAccessResponse =
  | {
      workspaceName: string
      status: 'pending'
    }
  | {
      workspaceId: string
      workspaceName?: string
      status: 'joined'
      role: string
      permissions: string[]
    }

export function WorkspaceManagementDialogs({
  createOpen,
  joinOpen,
  deleteOpen,
  workspace,
  currency,
  onClose,
  onCreated,
  onDeleted,
  onJoined,
}: {
  createOpen: boolean
  joinOpen: boolean
  deleteOpen: boolean
  workspace: Workspace
  currency: string
  onClose: () => void
  onCreated: (workspace: Workspace) => Promise<void>
  onDeleted: (workspaceId: string) => Promise<void>
  onJoined: (workspaceId: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<WorkspaceType>('family')
  const [workspaceCurrency, setWorkspaceCurrency] = useState(currency)
  const [code, setCode] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  const messageFor = (error: unknown, fallback: string) => {
    if (!(error instanceof ApiError)) return fallback
    switch (error.code) {
      case 'not_found':
        return 'That workspace code is invalid or no longer available.'
      case 'conflict':
        return 'You already have access to this workspace or have a request pending.'
      case 'forbidden':
        return 'You do not have permission to request access to that workspace.'
      case 'service_unavailable':
        return 'The workspace service could not be reached. Check your connection and try again.'
      default:
        return error.status >= 500
          ? 'The workspace service could not be reached. Check your connection and try again.'
          : error.message || fallback
    }
  }

  return (
    <>
      <Dialog
        open={createOpen}
        title="Create workspace"
        description="New workspaces are private. You control who can join."
        onClose={busy ? () => undefined : onClose}
      >
        <form
          className="dialog-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (busy) return
            setBusy(true)
            setFeedback('')
            void api
              .post<Workspace, object>('/workspaces', {
                name: name.trim(),
                type,
                currency: workspaceCurrency,
                financialMonthStart: 1,
              })
              .then(onCreated)
              .then(() => {
                setName('')
                onClose()
              })
              .catch((error) =>
                setFeedback(
                  messageFor(error, 'Workspace could not be created.'),
                ),
              )
              .finally(() => setBusy(false))
          }}
        >
          <Field label="Workspace name">
            <input
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Workspace type">
            <Select value={type} onValueChange={(value) => setType(value as WorkspaceType)}>
              <SelectTrigger className="w-full" data-field-control>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="family">Family</SelectItem>
                <SelectItem value="office">Office</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Currency">
            <Select value={workspaceCurrency} onValueChange={setWorkspaceCurrency}>
              <SelectTrigger className="w-full" data-field-control>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {feedback ? <p className="form-alert" role="alert">{feedback}</p> : null}
          <Button type="submit" disabled={busy || name.trim().length < 2}>
            {busy ? 'Creating…' : 'Create private workspace'}
          </Button>
        </form>
      </Dialog>

      <Dialog
        open={joinOpen}
        title="Join workspace"
        description="Enter a workspace access code. Temporary codes stay valid for at least three minutes and create an approval request. Direct invitation codes join you immediately."
        onClose={busy ? () => undefined : onClose}
      >
        <form
          className="dialog-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (busy) return
            setBusy(true)
            setFeedback('')
            void api
              .post<WorkspaceAccessResponse, { code: string }>(
                '/workspace-join-requests',
                { code: code.trim() },
              )
              .then(async (request) => {
                if (request.status === 'joined') {
                  setCode('')
                  try {
                    await onJoined(request.workspaceId)
                    onClose()
                  } catch {
                    setFeedback(
                      'The workspace was joined, but your workspace list could not refresh. Sign in again to load it.',
                    )
                  }
                  return
                }
                setCode('')
                setFeedback(
                  `Request sent for ${request.workspaceName}. You can use the app while approval is pending.`,
                )
              })
              .catch((error) =>
                setFeedback(
                  messageFor(error, 'That workspace code could not be used.'),
                ),
              )
              .finally(() => setBusy(false))
          }}
        >
          <Field
            label="Workspace access code"
            hint="Paste either a temporary workspace code (approval required) or a direct invitation code (joins immediately)."
          >
            <input
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          {feedback ? <p className="form-alert" role="status">{feedback}</p> : null}
          <Button type="submit" disabled={busy || !code.trim()}>
            {busy ? 'Checking code…' : 'Continue'}
          </Button>
        </form>
      </Dialog>

      <Dialog
        open={deleteOpen}
        title="Delete workspace"
        description="This permanently removes the workspace, members, accounts, transactions, and all other workspace data."
        onClose={busy ? () => undefined : onClose}
      >
        <form
          className="dialog-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (
              busy ||
              deleteConfirmation.trim() !== workspace.name.trim()
            ) {
              return
            }
            setBusy(true)
            setFeedback('')
            void onDeleted(workspace.id)
              .then(() => {
                setDeleteConfirmation('')
                onClose()
              })
              .catch((error) =>
                setFeedback(
                  messageFor(error, 'Workspace could not be deleted.'),
                ),
              )
              .finally(() => setBusy(false))
          }}
        >
          <p className="form-alert" role="alert">
            This action cannot be undone. Type <strong>{workspace.name}</strong>{' '}
            to continue.
          </p>
          <Field label="Workspace name">
            <input
              required
              autoCapitalize="none"
              autoCorrect="off"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder={workspace.name}
            />
          </Field>
          {feedback ? <p className="form-alert" role="alert">{feedback}</p> : null}
          <div className="dialog-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={
                busy || deleteConfirmation.trim() !== workspace.name.trim()
              }
            >
              {busy ? 'Deleting…' : 'Delete workspace'}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
