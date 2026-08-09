import {
  Check,
  Copy,
  Link2,
  MessageCircle,
  Share2,
  ShieldCheck,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import {
  AnimatedToastStack,
  useAnimatedToastStack,
} from '@/components/motion/animated-toast-stack'
import { BottomSheet } from '@/components/motion/bottom-sheet'
import { Button } from '@/components/ui'
import {
  canShareNatively,
  copyShareText,
  createWhatsAppShareLink,
  shareNative,
  shareToWhatsApp,
  type SharePayload,
} from '@/lib/share'

export function ShareSheet({
  open,
  onOpenChange,
  payload,
  privacyNote = 'Only the preview below is shared. Account numbers, internal IDs, and private notes stay out.',
  caution,
  extraAction,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  payload: SharePayload | null
  privacyNote?: string
  caution?: string
  extraAction?: ReactNode
}) {
  const reduce = useReducedMotion()
  const [manualText, setManualText] = useState('')
  const { toasts, showToast, dismissToast } = useAnimatedToastStack({
    limit: 2,
    defaultDuration: 3600,
  })
  const nativeAvailable = useMemo(
    () => (payload ? canShareNatively(payload) : false),
    [payload],
  )

  const updateOpen = (next: boolean) => {
    if (!next) setManualText('')
    onOpenChange(next)
  }

  const showManualFallback = (text: string) => {
    setManualText(text)
    showToast({
      title: 'Copy needs a little help',
      description: 'Select the prepared summary and copy it manually.',
      status: 'error',
    })
  }

  if (!payload) return null

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={updateOpen}
        snapPoints={['auto', 0.86]}
        title="Share safely"
        description="Choose how to send this private, prepared summary."
        className="app-bottom-sheet share-sheet"
      >
        <div className="share-sheet-content">
          <motion.div
            className="share-preview"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.24, ease: [0.16, 1, 0.3, 1] }
            }
          >
            <div className="share-preview-heading">
              <span>
                <Check aria-hidden="true" />
              </span>
              <div>
                <small>Ready to share</small>
                <strong>{payload.title}</strong>
              </div>
              {payload.url ? (
                <span className="share-link-badge">
                  <Link2 aria-hidden="true" />
                  Secure link
                </span>
              ) : null}
            </div>
            <p>{payload.text}</p>
          </motion.div>

          <div className="share-privacy-note">
            <ShieldCheck aria-hidden="true" />
            <p>{privacyNote}</p>
          </div>
          {caution ? (
            <div className="share-caution" role="note">
              {caution}
            </div>
          ) : null}

          <div className="share-actions" aria-label="Sharing options">
            <Button
              type="button"
              className="share-action-whatsapp"
              onClick={() => {
                const fallbackText = createWhatsAppShareLink(payload).text
                void shareToWhatsApp(payload)
                  .then(() => {
                    showToast({
                      title: 'Opening WhatsApp',
                      description: 'Choose a trusted contact before sending.',
                      status: 'success',
                    })
                  })
                  .catch(() => {
                    showManualFallback(fallbackText)
                  })
              }}
            >
              <MessageCircle aria-hidden="true" />
              WhatsApp
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void shareNative(payload).then((result) => {
                  if (result.status === 'cancelled') return
                  if (result.status === 'manual') {
                    showManualFallback(result.text)
                    return
                  }
                  showToast({
                    title:
                      result.status === 'shared'
                        ? 'Shared'
                        : 'Summary copied',
                    description:
                      result.status === 'copied' && result.fallbackFrom
                        ? 'The device share menu was unavailable, so the summary was copied instead.'
                        : 'Your prepared summary is ready.',
                    status: 'success',
                  })
                  if (result.status === 'shared') updateOpen(false)
                })
              }}
            >
              <Share2 aria-hidden="true" />
              {nativeAvailable ? 'Device share' : 'Quick share'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void copyShareText(payload).then((result) => {
                  if (result.status === 'manual') {
                    showManualFallback(result.text)
                    return
                  }
                  showToast({
                    title: 'Summary copied',
                    description: 'Paste it only into a conversation you trust.',
                    status: 'success',
                  })
                })
              }}
            >
              <Copy aria-hidden="true" />
              Copy
            </Button>
          </div>

          {extraAction ? <div className="share-extra-action">{extraAction}</div> : null}

          {manualText ? (
            <label className="share-manual-copy">
              <span>Prepared summary</span>
              <textarea
                value={manualText}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
                rows={6}
              />
            </label>
          ) : null}
        </div>
      </BottomSheet>
      <AnimatedToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        position="bottom-center"
        placement="fixed"
        portal
        className="share-toast-stack"
      />
    </>
  )
}
