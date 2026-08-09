import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { workspaces as demoWorkspaces } from '@/domain/demo-data'
import { DeviceAccessGate } from '@/components/device-access-gate'
import {
  DEFAULT_CURRENCY,
  normalizeCurrency,
} from '@/domain/currencies'
import type { CurrentUser, Workspace } from '@/domain/types'
import { api, clearApiToken, setApiToken } from '@/lib/api-client'
import { hashDevicePin } from '@/platform/device-pin'
import {
  persistNativePreference,
  removeNativePreference,
} from '@/platform/preferences'
import {
  AppContext,
  type ResolvedTheme,
  type Theme,
} from './app-state'
const DEMO_USER_NAME = 'Aarav Sharma'
const DEMO_USER_ID = 'demo-current-user'
const DEMO_CURRENT_USER: CurrentUser = {
  email: 'aarav@example.test',
  name: DEMO_USER_NAME,
  locale: 'en-IN',
  preferredCurrency: 'INR',
  emailVerified: true,
}
const DEFAULT_DEMO_WORKSPACE = demoWorkspaces[0]

const readStored = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key)
    return stored ? (JSON.parse(stored) as T) : fallback
  } catch {
    return fallback
  }
}

const storedWorkspace = () =>
  readStored<Workspace | null>('mt-workspace', null)
const storedDefaultWorkspaceId = () =>
  readStored<string>('mt-default-workspace-id', '')

const storedTheme = (): Theme => {
  const value = readStored<unknown>('mt-theme', 'system')
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : 'system'
}

const selectAvailableWorkspace = (
  available: Workspace[],
  preferred: Workspace | null,
  defaultWorkspaceId = storedDefaultWorkspaceId(),
) =>
  available.find((item) => item.id === defaultWorkspaceId) ??
  available.find((item) => item.id === preferred?.id) ??
  available[0]

const storedRemember = () => readStored<boolean>('mt-remember', false)
const storedAuthToken = () => readStored<string | null>('mt-auth-token', null)
const storedUserId = () => readStored<string>('mt-user-id', '')
const storedPreferredCurrency = () =>
  normalizeCurrency(readStored('mt-preferred-currency', DEFAULT_CURRENCY))

const storedAppPinHash = () => {
  const value = readStored<string | null>('mt-app-pin-hash', null)
  return value && /^[0-9a-f]{64}$/iu.test(value) ? value : null
}

type DeviceAccessState = 'unlocked' | 'setup' | 'locked'

export function AppProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const initialDemoMode = readStored('mt-demo', false)
  const initialRememberedSession = Boolean(
    !initialDemoMode && storedRemember() && storedAuthToken(),
  )
  const initialIsAuth = Boolean(
    initialDemoMode || initialRememberedSession,
  )
  const initialUserId = initialDemoMode
    ? DEMO_USER_ID
    : storedRemember()
      ? storedUserId()
      : ''

  const [demoMode, setDemoMode] = useState(initialDemoMode)
  const [isAuthenticated, setIsAuthenticated] = useState(() => initialIsAuth)
  const [userName, setUserName] = useState(() =>
    readStored('mt-user-name', DEMO_USER_NAME),
  )
  const [currentUser, setCurrentUserState] = useState<CurrentUser>(() =>
    initialDemoMode
      ? DEMO_CURRENT_USER
      : readStored<CurrentUser>('mt-user-profile', {
          email: '',
          name: readStored('mt-user-name', ''),
          locale: 'en-IN',
          preferredCurrency: storedPreferredCurrency(),
          emailVerified: false,
        }),
  )
  const [userId, setUserId] = useState(() => initialUserId)
  const [workspace, setWorkspaceState] = useState<Workspace>(() => {
    const stored = storedWorkspace()
    if (readStored('mt-demo', false)) {
      return selectAvailableWorkspace(demoWorkspaces, stored)
    }
    return stored ?? demoWorkspaces[0]
  })
  const [availableWorkspaces, setAvailableWorkspaces] = useState<Workspace[]>(
    () => {
      if (readStored('mt-demo', false)) return demoWorkspaces
      const restored = storedWorkspace()
      return restored ? [restored] : []
    },
  )
  const [defaultWorkspaceId, setDefaultWorkspaceId] = useState(
    storedDefaultWorkspaceId,
  )
  const [preferredCurrency, setPreferredCurrencyState] = useState(
    storedPreferredCurrency,
  )
  const [privacyMode, setPrivacyModeState] = useState(() =>
    readStored('mt-privacy', false),
  )
  const [theme, setThemeState] = useState<Theme>(storedTheme)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (typeof document !== 'undefined') {
      const prepainted = document.documentElement.dataset.theme
      if (prepainted === 'dark' || prepainted === 'light') return prepainted
    }
    if (typeof matchMedia === 'undefined') return 'light'
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [appPinDigest, setAppPinDigest] = useState<string | null>(() =>
    initialRememberedSession ? storedAppPinHash() : null,
  )
  const [deviceAccess, setDeviceAccess] = useState<DeviceAccessState>(() =>
    initialDemoMode
      ? 'unlocked'
      : initialRememberedSession
        ? storedAppPinHash()
          ? 'locked'
          : 'setup'
        : 'unlocked',
  )
  const restoredSessionNeedsRefreshRef = useRef(initialRememberedSession)

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const updateTheme = () => {
      const nextResolved =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      setResolvedTheme(nextResolved)
      document.documentElement.dataset.theme = nextResolved
      document.documentElement.style.colorScheme = nextResolved
      document
        .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
        ?.setAttribute(
          'content',
          nextResolved === 'dark' ? '#0b120e' : '#f1f5f2',
        )
    }
    updateTheme()
    if (theme !== 'system') return
    media.addEventListener('change', updateTheme)
    return () => media.removeEventListener('change', updateTheme)
  }, [theme])

  const enterDemo = useCallback(() => {
    queryClient.clear()
    clearApiToken()
    const nextWorkspace = selectAvailableWorkspace(
      demoWorkspaces,
      storedWorkspace(),
    )
    setAvailableWorkspaces(demoWorkspaces)
    setWorkspaceState(nextWorkspace)
    setUserId(DEMO_USER_ID)
    setUserName(DEMO_USER_NAME)
    setCurrentUserState(DEMO_CURRENT_USER)
    setDemoMode(true)
    setIsAuthenticated(true)
    setAppPinDigest(null)
    setDeviceAccess('unlocked')
    const nextCurrency = normalizeCurrency(
      readStored('mt-preferred-currency', nextWorkspace.currency ?? DEFAULT_CURRENCY),
      normalizeCurrency(nextWorkspace.currency, DEFAULT_CURRENCY),
    )
    setPreferredCurrencyState(nextCurrency)
    void persistNativePreference('mt-user-name', JSON.stringify(DEMO_USER_NAME))
    void persistNativePreference('mt-workspace', JSON.stringify(nextWorkspace))
    void persistNativePreference('mt-demo', 'true')
    void persistNativePreference(
      'mt-preferred-currency',
      JSON.stringify(nextCurrency),
    )
  }, [queryClient])

  const completeLogin = useCallback(
    async (
      nextUserId: string,
      name: string,
      token: string,
      rememberDevice = true,
      nextPreferredCurrency?: string,
      appPin?: string,
    ) => {
      queryClient.clear()
      setApiToken(token)
      let realWorkspaces: Workspace[]
      try {
        realWorkspaces = await api.get<Workspace[]>('/workspaces')
      } catch (error) {
        clearApiToken()
        throw error
      }
      if (realWorkspaces.length === 0) {
        clearApiToken()
        throw new Error('No accessible workspace was returned for this account')
      }
      const previousUserId = storedUserId()
      const previousPinDigest = storedAppPinHash()
      let nextPinDigest: string | null = null
      if (rememberDevice && appPin) {
        try {
          nextPinDigest = await hashDevicePin(appPin)
        } catch (error) {
          clearApiToken()
          throw error
        }
      } else if (
        rememberDevice &&
        previousUserId === nextUserId &&
        previousPinDigest
      ) {
        nextPinDigest = previousPinDigest
      }
      const nextWorkspace = selectAvailableWorkspace(
        realWorkspaces,
        storedWorkspace(),
      )
      setUserId(nextUserId)
      setUserName(name)
      setAvailableWorkspaces(realWorkspaces)
      setWorkspaceState(nextWorkspace)
      setDemoMode(false)
      setIsAuthenticated(true)
      setAppPinDigest(nextPinDigest)
      setDeviceAccess(rememberDevice && !nextPinDigest ? 'setup' : 'unlocked')
      const currency = normalizeCurrency(
        nextPreferredCurrency,
        normalizeCurrency(nextWorkspace.currency, DEFAULT_CURRENCY),
      )
      const nextProfile: CurrentUser = {
        email: '',
        name,
        locale: 'en-IN',
        preferredCurrency: currency,
        emailVerified: false,
      }
      setCurrentUserState(nextProfile)
      setPreferredCurrencyState(currency)
      void removeNativePreference('mt-demo')
      void persistNativePreference('mt-user-name', JSON.stringify(name))
      void persistNativePreference(
        'mt-user-profile',
        JSON.stringify(nextProfile),
      )
      void persistNativePreference('mt-workspace', JSON.stringify(nextWorkspace))
      void persistNativePreference(
        'mt-preferred-currency',
        JSON.stringify(currency),
      )

      if (rememberDevice) {
        void persistNativePreference('mt-auth-token', JSON.stringify(token))
        void persistNativePreference('mt-user-id', JSON.stringify(nextUserId))
        void persistNativePreference('mt-remember', 'true')
        if (nextPinDigest) {
          void persistNativePreference(
            'mt-app-pin-hash',
            JSON.stringify(nextPinDigest),
          )
        } else {
          void removeNativePreference('mt-app-pin-hash')
        }
      } else {
        void removeNativePreference('mt-auth-token')
        void removeNativePreference('mt-user-id')
        void removeNativePreference('mt-remember')
        void removeNativePreference('mt-app-pin-hash')
      }
    },
    [queryClient],
  )

  const configureDevicePin = useCallback(async (digest: string) => {
    await persistNativePreference('mt-app-pin-hash', JSON.stringify(digest))
    setAppPinDigest(digest)
    setDeviceAccess('unlocked')
  }, [])

  const unlockDevice = useCallback(() => {
    setDeviceAccess('unlocked')
  }, [])

  const refreshWorkspaces = useCallback(
    async (preferredWorkspaceId?: string) => {
      const realWorkspaces = await api.get<Workspace[]>('/workspaces')
      if (realWorkspaces.length === 0) {
        throw new Error('No accessible workspace was returned for this account')
      }
      const preferred =
        realWorkspaces.find((item) => item.id === preferredWorkspaceId) ??
        storedWorkspace()
      const nextWorkspace = preferredWorkspaceId
        ? selectAvailableWorkspace(
            realWorkspaces,
            preferred,
            preferredWorkspaceId,
          )
        : selectAvailableWorkspace(realWorkspaces, preferred)
      queryClient.clear()
      setAvailableWorkspaces(realWorkspaces)
      setWorkspaceState(nextWorkspace)
      void persistNativePreference('mt-workspace', JSON.stringify(nextWorkspace))
      return realWorkspaces
    },
    [queryClient],
  )

  useEffect(() => {
    if (
      demoMode ||
      !isAuthenticated ||
      deviceAccess !== 'unlocked' ||
      !restoredSessionNeedsRefreshRef.current
    ) {
      return
    }

    restoredSessionNeedsRefreshRef.current = false
    void refreshWorkspaces().catch(() => {
      // Keep the cached current workspace available when refresh is offline.
    })
  }, [demoMode, deviceAccess, isAuthenticated, refreshWorkspaces])

  const signOut = useCallback(() => {
    queryClient.clear()
    setIsAuthenticated(false)
    setDemoMode(false)
    setUserId('')
    setUserName(DEMO_USER_NAME)
    setCurrentUserState(DEMO_CURRENT_USER)
    setWorkspaceState(DEFAULT_DEMO_WORKSPACE)
    setAvailableWorkspaces([])
    setDefaultWorkspaceId('')
    setPreferredCurrencyState(DEFAULT_CURRENCY)
    setAppPinDigest(null)
    setDeviceAccess('unlocked')
    clearApiToken()
    void removeNativePreference('mt-demo')
    void removeNativePreference('mt-user-name')
    void removeNativePreference('mt-user-profile')
    void removeNativePreference('mt-workspace')
    void removeNativePreference('mt-auth-token')
    void removeNativePreference('mt-user-id')
    void removeNativePreference('mt-remember')
    void removeNativePreference('mt-default-workspace-id')
    void removeNativePreference('mt-app-pin-hash')
    void removeNativePreference('mt-preferred-currency')
  }, [queryClient])

  const deleteWorkspace = useCallback(
    async (workspaceId: string) => {
      if (demoMode) return
      await api.delete<void>(`/workspaces/${workspaceId}`)
      const realWorkspaces = await api.get<Workspace[]>('/workspaces')
      queryClient.clear()
      if (realWorkspaces.length === 0) {
        signOut()
        return
      }
      const nextDefaultWorkspaceId = realWorkspaces.some(
        (item) => item.id === defaultWorkspaceId,
      )
        ? defaultWorkspaceId
        : realWorkspaces[0].id
      const nextWorkspace = selectAvailableWorkspace(
        realWorkspaces,
        workspaceId === workspace.id ? null : workspace,
        nextDefaultWorkspaceId,
      )
      setAvailableWorkspaces(realWorkspaces)
      setDefaultWorkspaceId(nextDefaultWorkspaceId)
      setWorkspaceState(nextWorkspace)
      void persistNativePreference(
        'mt-default-workspace-id',
        JSON.stringify(nextDefaultWorkspaceId),
      )
      void persistNativePreference('mt-workspace', JSON.stringify(nextWorkspace))
    },
    [defaultWorkspaceId, demoMode, queryClient, signOut, workspace],
  )

  const setWorkspace = useCallback(
    (next: Workspace) => {
      const available = availableWorkspaces.find(
        (item) => item.id === next.id,
      )
      if (!available) return
      setWorkspaceState(available)
      void persistNativePreference('mt-workspace', JSON.stringify(available))
    },
    [availableWorkspaces],
  )

  const setDefaultWorkspace = useCallback(
    (next: Workspace) => {
      const available = availableWorkspaces.find(
        (item) => item.id === next.id,
      )
      if (!available) return
      setDefaultWorkspaceId(available.id)
      setWorkspaceState(available)
      void persistNativePreference(
        'mt-default-workspace-id',
        JSON.stringify(available.id),
      )
      void persistNativePreference('mt-workspace', JSON.stringify(available))
    },
    [availableWorkspaces],
  )

  const setPrivacyMode = useCallback((enabled: boolean) => {
    setPrivacyModeState(enabled)
    void persistNativePreference('mt-privacy', JSON.stringify(enabled))
  }, [])

  const setPreferredCurrency = useCallback((next: string) => {
    const currency = normalizeCurrency(next)
    setPreferredCurrencyState(currency)
    void persistNativePreference(
      'mt-preferred-currency',
      JSON.stringify(currency),
    )
  }, [])

  const setCurrentUser = useCallback((next: CurrentUser) => {
    setCurrentUserState(next)
    setUserName(next.name)
    const currency = normalizeCurrency(next.preferredCurrency)
    setPreferredCurrencyState(currency)
    void persistNativePreference('mt-user-name', JSON.stringify(next.name))
    void persistNativePreference(
      'mt-user-profile',
      JSON.stringify({ ...next, preferredCurrency: currency }),
    )
    void persistNativePreference(
      'mt-preferred-currency',
      JSON.stringify(currency),
    )
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    void persistNativePreference('mt-theme', JSON.stringify(next))
  }, [])

  const value = useMemo(
    () => ({
      demoMode,
      isAuthenticated,
      userId,
      userName,
      currentUser,
      workspace,
      availableWorkspaces,
      defaultWorkspaceId,
      preferredCurrency,
      privacyMode,
      theme,
      resolvedTheme,
      enterDemo,
      completeLogin,
      refreshWorkspaces,
      deleteWorkspace,
      signOut,
      setWorkspace,
      setDefaultWorkspace,
      setPrivacyMode,
      setPreferredCurrency,
      setTheme,
      setCurrentUser,
    }),
    [
      demoMode,
      isAuthenticated,
      userId,
      userName,
      currentUser,
      workspace,
      availableWorkspaces,
      defaultWorkspaceId,
      preferredCurrency,
      privacyMode,
      theme,
      resolvedTheme,
      enterDemo,
      completeLogin,
      refreshWorkspaces,
      deleteWorkspace,
      signOut,
      setWorkspace,
      setDefaultWorkspace,
      setPrivacyMode,
      setPreferredCurrency,
      setTheme,
      setCurrentUser,
    ],
  )

  const shouldGateDeviceAccess =
    !demoMode && isAuthenticated && deviceAccess !== 'unlocked'

  return (
    <AppContext.Provider value={value}>
      {shouldGateDeviceAccess ? (
        <DeviceAccessGate
          mode={deviceAccess === 'setup' ? 'setup' : 'unlock'}
          pinDigest={appPinDigest ?? undefined}
          onConfigured={configureDevicePin}
          onUnlocked={unlockDevice}
          onSignOut={signOut}
        />
      ) : (
        children
      )}
    </AppContext.Provider>
  )
}
