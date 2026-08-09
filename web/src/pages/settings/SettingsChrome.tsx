import { AnimatePresence, motion } from 'motion/react'
import { SuccessNotice } from '@/components/ui'
import { EASE_OUT } from '@/lib/ease'
import {
  SETTINGS_SECTIONS,
  type PreferenceFeedback,
  type SettingsSectionId,
} from './settings-model'

export function SettingsNavigation({
  activeSection,
  onNavigate,
}: {
  activeSection: SettingsSectionId
  onNavigate: (section: SettingsSectionId) => void
}) {
  return (
    <nav className="settings-nav" aria-label="Settings sections">
      {SETTINGS_SECTIONS.map(({ id, icon: Icon, label }) => (
        <a
          key={id}
          href={`#${id}`}
          aria-controls={id}
          aria-current={activeSection === id ? 'location' : undefined}
          onClick={() => onNavigate(id)}
        >
          <Icon aria-hidden="true" />
          {label}
        </a>
      ))}
    </nav>
  )
}

export function SettingsFeedback({
  feedback,
  reducedMotion,
}: {
  feedback: PreferenceFeedback | null
  reducedMotion: boolean
}) {
  return (
    <AnimatePresence initial={false} mode="wait">
      {feedback ? (
        <motion.div
          key={feedback.id}
          initial={reducedMotion ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={
            reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }
          }
          transition={{
            duration: reducedMotion ? 0 : 0.2,
            ease: EASE_OUT,
          }}
        >
          {feedback.tone === 'success' ? (
            <SuccessNotice>{feedback.message}</SuccessNotice>
          ) : (
            <div
              className="form-alert"
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
            >
              {feedback.message}
            </div>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
