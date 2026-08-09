import { LogOut, ShieldAlert, Smartphone } from 'lucide-react'
import {
  Badge,
  Button,
  Dialog,
  ErrorState,
  ListRow,
  Skeleton,
} from '@/components/ui'
import {
  formatSessionDate,
  getDeviceLabel,
  getSessionErrorMessage,
  getSessionState,
  type AuthSession,
} from './settings-model'

export function SessionsDialog({
  open,
  demoMode,
  sessions,
  sessionsLoading,
  sessionsError,
  sessionActionError,
  activeSessionCount,
  logoutBusy,
  allSessionsLogoutPending,
  onClose,
  onRetry,
  onLogout,
  onLogoutAllSessions,
}: {
  open: boolean
  demoMode: boolean
  sessions: AuthSession[]
  sessionsLoading: boolean
  sessionsError: unknown
  sessionActionError: string | null
  activeSessionCount: number
  logoutBusy: boolean
  allSessionsLogoutPending: boolean
  onClose: () => void
  onRetry: () => void
  onLogout: () => void
  onLogoutAllSessions: () => void
}) {
  return (
    <Dialog
      open={open}
      title="Devices and sessions"
      description={
        demoMode
          ? 'Demo mode is stored only in this browser and has no server sessions.'
          : 'Review active and historical sessions, then revoke access when needed.'
      }
      onClose={onClose}
    >
      {demoMode ? (
        <div className="session-list">
          <ListRow
            leading={<Smartphone aria-hidden="true" />}
            title="Local demo session"
            subtitle="Stored only on this device · no account session was created"
            trailing={<Badge>Demo only</Badge>}
          />
        </div>
      ) : sessionsLoading ? (
        <div
          className="session-list data-skeleton"
          role="status"
          aria-live="polite"
        >
          <span className="visually-hidden">Loading devices and sessions</span>
          <Skeleton className="skeleton-row" />
          <Skeleton className="skeleton-row" />
        </div>
      ) : sessionsError ? (
        <div className="session-list">
          <ErrorState
            message={getSessionErrorMessage(
              sessionsError,
              'Devices and sessions could not be loaded. Try again.',
            )}
            retry={onRetry}
          />
        </div>
      ) : sessions.length === 0 ? (
        <div
          className="session-list inline-state"
          role="status"
          aria-live="polite"
        >
          <Smartphone aria-hidden="true" />
          <div>
            <strong>No sessions found</strong>
            <p>
              The service did not return a session for this account. Refresh
              before making security decisions.
            </p>
          </div>
        </div>
      ) : (
        <div className="session-list" aria-live="polite">
          {sessions.map((session) => {
            const state = getSessionState(session)
            const location =
              session.ipAddress.trim() && session.ipAddress !== 'unknown'
                ? `IP ${session.ipAddress}`
                : 'Location unavailable'
            return (
              <ListRow
                key={session.id}
                leading={<Smartphone aria-hidden="true" />}
                title={getDeviceLabel(session.userAgent)}
                subtitle={`Started ${formatSessionDate(session.createdAt)} · ${location}`}
                trailing={<Badge tone={state.tone}>{state.label}</Badge>}
              />
            )
          })}
        </div>
      )}
      {sessionActionError ? (
        <div
          className="form-alert"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          {sessionActionError}
        </div>
      ) : null}
      {demoMode ? (
        <Button
          variant="secondary"
          onClick={onLogout}
          loading={logoutBusy}
        >
          <LogOut aria-hidden="true" />
          End demo session
        </Button>
      ) : (
        <Button
          variant="danger"
          onClick={onLogoutAllSessions}
          loading={allSessionsLogoutPending}
          disabled={logoutBusy}
        >
          <LogOut aria-hidden="true" />
          {activeSessionCount > 0
            ? `Sign out all devices (${activeSessionCount} active)`
            : 'Sign out all devices'}
        </Button>
      )}
    </Dialog>
  )
}

export function DeleteAccountDialog({
  open,
  demoMode,
  onClose,
}: {
  open: boolean
  demoMode: boolean
  onClose: () => void
}) {
  return (
    <Dialog
      open={open}
      title={
        demoMode
          ? 'Demo account deletion unavailable'
          : 'Account deletion unavailable'
      }
      description={
        demoMode
          ? 'Demo profiles cannot be deleted from this local experience.'
          : 'A verified deletion workflow is not connected in this client.'
      }
      onClose={onClose}
    >
      <div className="delete-warning">
        <ShieldAlert aria-hidden="true" />
        <p>
          No deletion request will be submitted from this screen, and no
          account data will be removed.
        </p>
      </div>
      <div className="dialog-actions">
        <Button variant="secondary" onClick={onClose}>
          Keep account
        </Button>
        <Button variant="danger" disabled>
          {demoMode ? 'Unavailable in demo' : 'Deletion unavailable'}
        </Button>
      </div>
    </Dialog>
  )
}
