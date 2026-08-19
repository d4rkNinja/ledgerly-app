import { Eye, EyeOff } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { BrandLogo } from '@/components/brand-logo'
import {
  MOTION_DISTANCE,
  SPRING_SWAP,
  TRANSITION_FADE,
} from '@/lib/app-motion'

export function AnimatedFormAlert({
  id,
  message,
  reducedMotion,
  role = 'alert',
}: {
  id: string
  message: string
  reducedMotion: boolean
  role?: 'alert' | 'status'
}) {
  return (
    <AnimatePresence initial={false}>
      {message ? (
        <motion.div
          key={message}
          id={id}
          className="form-alert"
          role={role}
          aria-live={role === 'alert' ? 'assertive' : 'polite'}
          aria-atomic="true"
          initial={
            reducedMotion
              ? false
              : { opacity: 0, y: -MOTION_DISTANCE.content }
          }
          animate={{ opacity: 1, y: 0 }}
          exit={
            reducedMotion
              ? undefined
              : { opacity: 0, y: -MOTION_DISTANCE.content }
          }
          transition={reducedMotion ? { duration: 0 } : TRANSITION_FADE}
        >
          {message}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export function PasswordVisibilityButton({
  inputId,
  visible,
  onToggle,
  reducedMotion,
}: {
  inputId: string
  visible: boolean
  onToggle: () => void
  reducedMotion: boolean
}) {
  return (
    <button
      type="button"
      className="input-action"
      onClick={onToggle}
      aria-label={visible ? 'Hide password' : 'Show password'}
      aria-controls={inputId}
      aria-pressed={visible}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={visible ? 'password-visible' : 'password-hidden'}
          aria-hidden="true"
          initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0, scale: 0.9 }}
          transition={reducedMotion ? { duration: 0 } : SPRING_SWAP}
          style={{ display: 'grid' }}
        >
          {visible ? <EyeOff /> : <Eye />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

export function BrandMark() {
  return (
    <div className="auth-brand">
      <span>
        <BrandLogo />
      </span>
      <strong>Ledgerly</strong>
    </div>
  )
}
