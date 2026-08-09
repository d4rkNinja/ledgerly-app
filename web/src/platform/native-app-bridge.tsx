import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import {
  focusManager,
  type QueryClient,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import {
  useLocation,
  useNavigate,
  type Location,
  type NavigateFunction,
} from 'react-router'
import { useApp, type ResolvedTheme } from '@/app/app-state'
import { decideBackAction } from './back-navigation'
import { dismissTopBackLayer } from './back-layer-stack'
import {
  publishNativeKeyboardState,
  publishNetworkState,
} from './native-app-state'
import {
  refreshNetworkState,
  subscribeNetwork,
  type NetworkState,
} from './network'
import {
  resetNativeKeyboardState,
  subscribeKeyboard,
} from './keyboard'
import { isNativeAndroid } from './runtime'
import { syncSystemBars } from './system-ui'

export interface NativeAppBridgeProps {
  readonly resolvedTheme: ResolvedTheme
  readonly demoMode: boolean
  readonly isAuthenticated: boolean
}

interface LatestBridgeState extends NativeAppBridgeProps {
  readonly location: Location
  readonly navigate: NavigateFunction
}

function readBrowserHistoryIndex(): number | undefined {
  try {
    const state = window.history.state as { idx?: unknown } | null
    return typeof state?.idx === 'number' ? state.idx : undefined
  } catch {
    return undefined
  }
}

function removeHandle(handle: PluginListenerHandle): void {
  void Promise.resolve(handle.remove()).catch(() => undefined)
}

function executeBackAction(
  latest: LatestBridgeState,
  canGoBack: boolean | undefined,
): void {
  if (dismissTopBackLayer()) return

  const action = decideBackAction({
    pathname: latest.location.pathname,
    search: latest.location.search,
    hash: latest.location.hash,
    state: latest.location.state,
    isAuthenticated: latest.isAuthenticated,
    canGoBack,
    browserHistoryIndex: readBrowserHistoryIndex(),
  })

  switch (action.type) {
    case 'replace-location':
      latest.navigate(action.location, {
        replace: action.replace,
        state: action.state,
      })
      return
    case 'history-back':
      latest.navigate(-1)
      return
    case 'replace-root':
      latest.navigate(action.pathname, { replace: action.replace })
      return
    case 'exit-app':
      void App.exitApp().catch(() => undefined)
  }
}

function invalidateEligibleActiveQueries(
  queryClient: QueryClient,
  latest: LatestBridgeState,
): void {
  if (!latest.isAuthenticated || latest.demoMode) return
  void queryClient.invalidateQueries({ type: 'active' }).catch(() => undefined)
}

export function NativeAppBridge({
  resolvedTheme,
  demoMode,
  isAuthenticated,
}: NativeAppBridgeProps) {
  const queryClient = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const latestRef = useRef<LatestBridgeState>({
    resolvedTheme,
    demoMode,
    isAuthenticated,
    location,
    navigate,
  })
  latestRef.current = {
    resolvedTheme,
    demoMode,
    isAuthenticated,
    location,
    navigate,
  }

  useEffect(() => {
    void syncSystemBars(resolvedTheme)
  }, [resolvedTheme])

  useEffect(() => {
    let active = true
    let connected = true
    let resumeGeneration = 0
    let resumeQueue = Promise.resolve()
    let resumeController: AbortController | null = null
    const adapterController = new AbortController()
    const appHandles = new Set<PluginListenerHandle>()
    const adapterCleanups = new Set<() => Promise<void>>()

    const adoptAppHandle = (registration: Promise<PluginListenerHandle>) => {
      void registration.then(
        (handle) => {
          if (!active) {
            removeHandle(handle)
            return
          }
          appHandles.add(handle)
        },
        () => undefined,
      )
    }

    const adoptAdapterCleanup = (
      registration: Promise<() => Promise<void>>,
    ) => {
      void registration.then(
        (adapterCleanup) => {
          if (!active) {
            void adapterCleanup().catch(() => undefined)
            return
          }
          adapterCleanups.add(adapterCleanup)
        },
        () => undefined,
      )
    }

    const acceptNetworkState = (state: NetworkState) => {
      if (!active) return
      const reconnected = !connected && state.connected
      connected = state.connected
      publishNetworkState(state)
      if (reconnected) {
        invalidateEligibleActiveQueries(queryClient, latestRef.current)
      }
    }

    const resume = async (
      generation: number,
      signal: AbortSignal,
    ) => {
      if (!active || signal.aborted || generation !== resumeGeneration) {
        return
      }
      await syncSystemBars(latestRef.current.resolvedTheme)
      if (!active || signal.aborted || generation !== resumeGeneration) {
        return
      }
      resetNativeKeyboardState()
      publishNativeKeyboardState({ open: false, height: 0 })
      const refreshed = await refreshNetworkState({ signal })
      if (
        !active ||
        signal.aborted ||
        generation !== resumeGeneration ||
        refreshed === null
      ) {
        return
      }
      acceptNetworkState(refreshed)
    }

    const queueResume = () => {
      resumeController?.abort()
      const controller = new AbortController()
      resumeController = controller
      focusManager.setFocused(true)
      const generation = ++resumeGeneration
      const run = () => resume(generation, controller.signal)
      resumeQueue = resumeQueue.then(run, run)
    }

    publishNativeKeyboardState(null)
    adoptAdapterCleanup(
      subscribeNetwork(acceptNetworkState, {
        signal: adapterController.signal,
      }),
    )
    adoptAdapterCleanup(
      subscribeKeyboard(
        (state) => {
          if (!active) return
          publishNativeKeyboardState(state)
        },
        { signal: adapterController.signal },
      ),
    )

    if (isNativeAndroid()) {
      adoptAppHandle(
        App.addListener('appStateChange', ({ isActive }) => {
          if (!active) return
          if (!isActive) {
            resumeController?.abort()
            resumeController = null
            resumeGeneration += 1
            focusManager.setFocused(false)
            return
          }
          queueResume()
        }),
      )
      adoptAppHandle(
        App.addListener('backButton', ({ canGoBack }) => {
          if (!active) return
          executeBackAction(latestRef.current, canGoBack)
        }),
      )
    }

    return () => {
      adapterController.abort()
      resumeController?.abort()
      resumeController = null
      active = false
      resumeGeneration += 1
      publishNativeKeyboardState(null)
      focusManager.setFocused(undefined)
      appHandles.forEach(removeHandle)
      appHandles.clear()
      adapterCleanups.forEach((adapterCleanup) => {
        void adapterCleanup().catch(() => undefined)
      })
      adapterCleanups.clear()
    }
  }, [queryClient])

  return null
}

export function NativeAppBridgeOwner() {
  const { resolvedTheme, demoMode, isAuthenticated } = useApp()
  return (
    <NativeAppBridge
      resolvedTheme={resolvedTheme}
      demoMode={demoMode}
      isAuthenticated={isAuthenticated}
    />
  )
}
