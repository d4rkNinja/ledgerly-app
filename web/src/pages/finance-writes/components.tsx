import { CircleHelp } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, SuccessNotice } from '@/components/ui'
import type { FinanceFeedback } from './shared'

export function WriteFeedback({
  feedback,
}: {
  feedback: FinanceFeedback
}) {
  if (feedback.tone === 'success') {
    return <SuccessNotice>{feedback.message}</SuccessNotice>
  }

  return (
    <div
      className={
        feedback.tone === 'error'
          ? 'form-alert'
          : 'finance-write-info'
      }
      role={feedback.tone === 'error' ? 'alert' : 'status'}
    >
      {feedback.tone === 'info' ? <CircleHelp aria-hidden="true" /> : null}
      <span>{feedback.message}</span>
    </div>
  )
}

export function DialogActions({
  busy,
  demoMode,
  disabled = false,
  demoSubmitLabel = 'Add to demo',
  onCancel,
  submitLabel,
}: {
  busy: boolean
  demoMode: boolean
  disabled?: boolean
  demoSubmitLabel?: string
  onCancel: () => void
  submitLabel: string
}) {
  return (
    <div className="dialog-actions">
      <Button
        type="button"
        variant="secondary"
        onClick={onCancel}
        disabled={busy}
      >
        Cancel
      </Button>
      <Button type="submit" loading={busy} disabled={disabled || busy}>
        {demoMode ? demoSubmitLabel : submitLabel}
      </Button>
    </div>
  )
}

export function DemoWriteNotice({ children }: { children?: ReactNode }) {
  return (
    <div className="finance-write-demo-note" role="note">
      <CircleHelp aria-hidden="true" />
      <p>
        {children ??
          'Demo changes stay in memory until you refresh. No server data is created.'}
      </p>
    </div>
  )
}
