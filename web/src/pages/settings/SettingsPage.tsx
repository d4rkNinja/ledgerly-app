import { useMutation, useQuery } from '@tanstack/react-query'
import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useApp, type Theme } from '@/app/app-state'
import { PageHeader } from '@/components/ui'
import { api, ApiError } from '@/lib/api-client'
import {
  AppearanceSection,
  MoneyPreferencesSection,
  NotificationsSection,
  ProfileSection,
} from './PreferenceSections'
import {
  AccountActionsSection,
  SecuritySection,
} from './SecuritySections'
import {
  DeleteAccountDialog,
  SessionsDialog,
} from './SettingsDialogs'
import {
  SettingsFeedback,
  SettingsNavigation,
} from './SettingsChrome'
import {
  getSessionErrorMessage,
  getSessionState,
  getSettingsSectionFromHash,
  REMOTE_LOGOUT_WARNING_DELAY_MS,
  type AuthSession,
  type FeedbackTone,
  type PreferenceFeedback,
  type SettingsSectionId,
} from './settings-model'
import { downloadWorkspaceExport } from '@/lib/export'
import { TransactionSettingsSection } from './TransactionSettingsSection'

export function SettingsPage() {
  const {
    demoMode,
    preferredCurrency,
    privacyMode,
    setPrivacyMode,
    setPreferredCurrency,
    signOut,
    theme,
    setTheme,
    userName,
    workspace,
    currentUser,
    setCurrentUser,
  } = useApp()
  const navigate = useNavigate()
  const reducedMotion = Boolean(useReducedMotion())
  const [sessionOpen, setSessionOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>(getSettingsSectionFromHash)
  const [feedback, setFeedback] = useState<PreferenceFeedback | null>(null)
  const [sessionActionError, setSessionActionError] = useState<string | null>(
    null,
  )
  const logoutInFlightRef = useRef(false)
  const exportMutation = useMutation({
    mutationFn: () => downloadWorkspaceExport(workspace.id),
  })

  const sessionsQuery = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => api.get<AuthSession[]>('/auth/sessions'),
    enabled: sessionOpen && !demoMode,
    retry: 1,
  })

  const currentLogout = useMutation({
    mutationFn: async () => {
      if (demoMode) return
      await api.post<void, Record<string, never>>('/auth/logout', {})
    },
  })

  const allSessionsLogout = useMutation({
    mutationFn: () =>
      api.post<void, Record<string, never>>('/auth/logout-all', {}),
  })

  const sessions = sessionsQuery.data ?? []
  const activeSessionCount = sessions.filter(
    (session) => getSessionState(session).label === 'Active',
  ).length
  const logoutBusy = currentLogout.isPending || allSessionsLogout.isPending

  const announcePreference = (
    message: string,
    tone: FeedbackTone = 'success',
  ) => {
    setFeedback((current) => ({
      id: (current?.id ?? 0) + 1,
      message,
      tone,
    }))
  }

  const currencyMutation = useMutation({
    mutationFn: async (currency: string) => {
      if (!demoMode) {
        await api.patch<unknown, { preferredCurrency: string }>('/me', {
          preferredCurrency: currency,
        })
      }
      return currency
    },
    onSuccess: (currency) => {
      setPreferredCurrency(currency)
      if (currentUser && setCurrentUser) {
        setCurrentUser({
          ...currentUser,
          preferredCurrency: currency,
        })
      }
      announcePreference(`${currency} will be used for new money entries.`)
    },
    onError: (error) => {
      announcePreference(
        error instanceof ApiError
          ? error.message
          : 'Currency preference could not be saved. Try again.',
        'error',
      )
    },
  })

  const logOut = async () => {
    if (logoutBusy || logoutInFlightRef.current) return
    logoutInFlightRef.current = true

    let remoteLogoutFailed = false
    try {
      await currentLogout.mutateAsync()
    } catch (error) {
      remoteLogoutFailed = true
      announcePreference(
        getSessionErrorMessage(
          error,
          'Server sign-out could not be confirmed. This browser will still be signed out locally; use “Sign out all devices” after signing in again if needed.',
        ),
        'error',
      )
    }

    if (remoteLogoutFailed) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, REMOTE_LOGOUT_WARNING_DELAY_MS)
      })
    }
    signOut()
    navigate('/login', { replace: true })
  }

  const logOutAllSessions = async () => {
    if (logoutBusy || logoutInFlightRef.current || demoMode) return
    logoutInFlightRef.current = true

    setSessionActionError(null)
    try {
      await allSessionsLogout.mutateAsync()
      signOut()
      navigate('/login', { replace: true })
    } catch (error) {
      setSessionActionError(
        getSessionErrorMessage(
          error,
          'We could not sign out the other sessions. Your current session remains active; try again.',
        ),
      )
      logoutInFlightRef.current = false
    }
  }

  const selectTheme = (value: Theme, label: string) => {
    setTheme(value)
    announcePreference(`${label} theme selected.`)
  }

  const updatePrivacyMode = (checked: boolean) => {
    setPrivacyMode(checked)
    announcePreference(
      `Privacy mode ${checked ? 'enabled' : 'disabled'} across the app.`,
    )
  }

  const updateNotifications = (checked: boolean) => {
    setNotifications(checked)
    announcePreference(
      `Important activity notifications ${checked ? 'enabled' : 'disabled'} for this session.`,
    )
  }

  useEffect(() => {
    const syncActiveSection = () => {
      setActiveSection(getSettingsSectionFromHash())
    }

    window.addEventListener('hashchange', syncActiveSection)
    return () => window.removeEventListener('hashchange', syncActiveSection)
  }, [])

  return (
    <div className="page-stack settings-page">
      <PageHeader
        title="Settings"
        description="Privacy and preferences, in one place."
      />
      <SettingsFeedback
        feedback={feedback}
        reducedMotion={reducedMotion}
      />
      <div className="settings-layout">
        <SettingsNavigation
          activeSection={activeSection}
          onNavigate={setActiveSection}
        />
        <div className="settings-content">
          <ProfileSection
            userName={userName}
            demoMode={demoMode}
            currentUser={currentUser}
            onUpdated={setCurrentUser}
          />
          <AppearanceSection
            theme={theme}
            reducedMotion={reducedMotion}
            onSelectTheme={selectTheme}
          />
          <SecuritySection
            privacyMode={privacyMode}
            onPrivacyModeChange={updatePrivacyMode}
            onOpenSessions={() => {
              setSessionActionError(null)
              setSessionOpen(true)
            }}
          />
          <NotificationsSection
            notifications={notifications}
            onChange={updateNotifications}
          />
          <MoneyPreferencesSection
            preferredCurrency={preferredCurrency}
            saving={currencyMutation.isPending}
            onChange={(currency) => currencyMutation.mutate(currency)}
            error={
              currencyMutation.error instanceof ApiError
                ? currencyMutation.error.message
                : currencyMutation.error
                ? 'Currency preference could not be saved. Try again.'
                  : null
            }
            canExport={
              !demoMode &&
              workspace.permissions?.includes('export_data') === true
            }
            exporting={exportMutation.isPending}
            exportError={
              exportMutation.error
                ? exportMutation.error instanceof ApiError
                  ? exportMutation.error.message
                  : 'Workspace export could not be downloaded. Try again.'
                : null
            }
            exportSuccess={
              exportMutation.data
                ? 'Workspace export downloaded successfully.'
                : null
            }
            onExport={() => exportMutation.mutate()}
          />
          <TransactionSettingsSection />
          <AccountActionsSection
            logoutPending={currentLogout.isPending}
            logoutBusy={logoutBusy}
            onLogout={() => {
              void logOut()
            }}
            onOpenDelete={() => setDeleteOpen(true)}
          />
        </div>
      </div>

      <SessionsDialog
        open={sessionOpen}
        demoMode={demoMode}
        sessions={sessions}
        sessionsLoading={sessionsQuery.isLoading}
        sessionsError={sessionsQuery.error}
        sessionActionError={sessionActionError}
        activeSessionCount={activeSessionCount}
        logoutBusy={logoutBusy}
        allSessionsLogoutPending={allSessionsLogout.isPending}
        onClose={() => {
          setSessionOpen(false)
          setSessionActionError(null)
        }}
        onRetry={() => {
          void sessionsQuery.refetch()
        }}
        onLogout={() => {
          void logOut()
        }}
        onLogoutAllSessions={() => {
          void logOutAllSessions()
        }}
      />
      <DeleteAccountDialog
        open={deleteOpen}
        demoMode={demoMode}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  )
}
