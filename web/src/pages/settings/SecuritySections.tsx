import {
  ChevronRight,
  KeyRound,
  LockKeyhole,
  LogOut,
  Smartphone,
  Trash2,
} from 'lucide-react'
import { Badge, Button, Section } from '@/components/ui'
import { SettingToggle } from './SettingToggle'

export function SecuritySection({
  privacyMode,
  onPrivacyModeChange,
  onOpenSessions,
}: {
  privacyMode: boolean
  onPrivacyModeChange: (checked: boolean) => void
  onOpenSessions: () => void
}) {
  return (
    <Section id="settings-2" aria-labelledby="settings-2-title">
      <div className="settings-section-heading">
        <h2 id="settings-2-title">Privacy and security</h2>
        <p>Control what appears on screen and where you are signed in.</p>
      </div>
      <SettingToggle
        icon={<LockKeyhole aria-hidden="true" />}
        title="Privacy mode"
        description="Hide financial amounts across the app."
        checked={privacyMode}
        onChange={onPrivacyModeChange}
      />
      <button
        type="button"
        className="settings-row-button"
        onClick={onOpenSessions}
        aria-haspopup="dialog"
      >
        <Smartphone aria-hidden="true" />
        <span>
          <strong>Devices and sessions</strong>
          <small>Review where your account is signed in</small>
        </span>
        <ChevronRight aria-hidden="true" />
      </button>
      <div className="settings-row-button">
        <KeyRound aria-hidden="true" />
        <span>
          <strong>Application PIN</strong>
          <small>Use your application PIN to unlock this remembered device</small>
        </span>
        <Badge>Available</Badge>
      </div>
    </Section>
  )
}

export function AccountActionsSection({
  logoutPending,
  logoutBusy,
  onLogout,
  onOpenDelete,
}: {
  logoutPending: boolean
  logoutBusy: boolean
  onLogout: () => void
  onOpenDelete: () => void
}) {
  return (
    <Section
      id="settings-account-actions"
      className="danger-zone"
      aria-labelledby="settings-account-actions-title"
    >
      <div className="settings-section-heading">
        <h2 id="settings-account-actions-title">Account actions</h2>
        <p>
          You can sign out now. Account deletion is not connected in this
          client.
        </p>
      </div>
      <div className="danger-actions">
        <Button
          variant="secondary"
          onClick={onLogout}
          loading={logoutPending}
          disabled={logoutBusy}
        >
          <LogOut aria-hidden="true" />
          {logoutPending ? 'Signing out…' : 'Sign out'}
        </Button>
        <Button
          variant="danger"
          onClick={onOpenDelete}
          aria-haspopup="dialog"
          disabled={logoutBusy}
        >
          <Trash2 aria-hidden="true" />
          Delete account
        </Button>
      </div>
    </Section>
  )
}
