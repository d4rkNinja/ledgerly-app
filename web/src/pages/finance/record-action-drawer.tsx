import { AlertTriangle, Edit3, Share2, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { ShareSheet } from '@/components/share-sheet'
import { Button, Dialog } from '@/components/ui'
import { ApiError, api } from '@/lib/api-client'
import { buildSafeTextSharePayload, type SharePayload } from '@/lib/share'

export type RecordDetail = {
  label: string
  value: string
}

type RecordActionDrawerProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  details: RecordDetail[]
  actionContent?: ReactNode
  onEdit?: () => void
  editLabel?: string
  canShare?: boolean
  sharePath?: string
  demoSharePayload?: SharePayload
  canDelete?: boolean
  deleteLabel?: string
  deleteDescription?: string
  onDelete?: () => Promise<void> | void
}

type ServerSharePayload = {
  title?: unknown
  text?: unknown
}

function messageForError(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

/**
 * A single detail surface for finance records. On a phone Dialog is a
 * draggable, focus-contained bottom sheet; on larger displays it becomes a
 * contained dialog. Destructive controls are deliberately here instead of in
 * dense list rows, and need an explicit second tap before they run.
 */
export function RecordActionDrawer({
  open,
  onClose,
  title,
  description,
  details,
  actionContent,
  onEdit,
  editLabel = 'Edit details',
  canShare = false,
  sharePath,
  demoSharePayload,
  canDelete = false,
  deleteLabel = 'Delete',
  deleteDescription = 'This action cannot be undone.',
  onDelete,
}: RecordActionDrawerProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState<'share' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    if (open) return
    setConfirmingDelete(false)
    setBusy(null)
    setError(null)
  }, [open])

  const share = async () => {
    if (busy || !canShare) return
    setBusy('share')
    setError(null)
    try {
      const response = sharePath
        ? await api.post<ServerSharePayload, Record<string, never>>(sharePath, {})
        : null
      const payload = demoSharePayload ?? (response
        ? buildSafeTextSharePayload({
            title: typeof response.title === 'string' ? response.title : 'Money update',
            text: typeof response.text === 'string' ? response.text : 'A prepared summary is ready to share.',
          })
        : null)
      if (!payload) {
        setError('A safe summary is unavailable for this record.')
        return
      }
      setSharePayload(payload)
      setShareOpen(true)
    } catch (shareError) {
      setError(messageForError(shareError, 'Unable to prepare a share summary.'))
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!confirmingDelete || busy || !onDelete) return
    setBusy('delete')
    setError(null)
    try {
      await onDelete()
      onClose()
    } catch (deleteError) {
      setError(messageForError(deleteError, `Unable to ${deleteLabel.toLowerCase()} this record.`))
      setBusy(null)
    }
  }

  return (
    <>
      <Dialog
        open={open}
        title={title}
        description={description}
        onClose={busy ? () => undefined : onClose}
      >
        <div className="record-action-panel">
          <dl className="record-detail-list">
            {details.map((detail) => (
              <div key={detail.label}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>

          {actionContent ? (
            <div className="record-action-extra">
              {actionContent}
            </div>
          ) : null}

          {error ? (
            <div className="record-action-error" role="alert">
              <AlertTriangle aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {confirmingDelete ? (
            <div className="record-delete-confirmation" role="alert">
              <div>
                <strong>{deleteLabel} this record?</strong>
                <p>{deleteDescription}</p>
              </div>
              <div className="record-delete-buttons">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy === 'delete'}
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep it
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  loading={busy === 'delete'}
                  onClick={() => void remove()}
                >
                  <Trash2 aria-hidden="true" />
                  {deleteLabel}
                </Button>
              </div>
            </div>
          ) : (
            <div className="record-action-buttons">
              {onEdit ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => {
                    onClose()
                    onEdit()
                  }}
                >
                  <Edit3 aria-hidden="true" />
                  {editLabel}
                </Button>
              ) : null}
              {canShare ? (
                <Button
                  type="button"
                  variant="secondary"
                  loading={busy === 'share'}
                  disabled={busy === 'delete'}
                  onClick={() => void share()}
                >
                  <Share2 aria-hidden="true" />
                  Share
                </Button>
              ) : null}
              {canDelete && onDelete ? (
                <Button
                  type="button"
                  variant="danger"
                  disabled={busy !== null}
                  onClick={() => {
                    setError(null)
                    setConfirmingDelete(true)
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  {deleteLabel}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </Dialog>
      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        payload={sharePayload}
      />
    </>
  )
}
