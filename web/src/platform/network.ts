import { Network, type ConnectionType } from '@capacitor/network'
import type { PluginListenerHandle } from '@capacitor/core'
import { onlineManager } from '@tanstack/react-query'
import { isNativeAndroid } from './runtime'

export interface NetworkState {
  readonly connected: boolean
  readonly connectionType: ConnectionType
}

export type Cleanup = () => Promise<void>
export interface NetworkRefreshOptions {
  readonly signal?: AbortSignal
}

export interface NetworkSubscriptionOptions {
  readonly signal?: AbortSignal
}


function normalizeNetworkState(state: NetworkState): NetworkState {
  const connected = state.connected === true
  return {
    connected,
    connectionType:
      connected && state.connectionType !== 'none'
        ? state.connectionType
        : connected
          ? 'unknown'
          : 'none',
  }
}

function setNetworkState(state: NetworkState): NetworkState {
  const normalized = normalizeNetworkState(state)
  onlineManager.setOnline(normalized.connected)
  return normalized
}

function publishNetworkState(
  listener: (state: NetworkState) => void,
  state: NetworkState,
): void {
  listener(setNetworkState(state))
}

async function removeHandle(handle: PluginListenerHandle): Promise<void> {
  try {
    await handle.remove()
  } catch {
    // Listener removal is idempotent best-effort across plugin versions.
  }
}

export async function refreshNetworkState(
  options: NetworkRefreshOptions = {},
): Promise<NetworkState | null> {
  const { signal } = options
  if (signal?.aborted) return null

  if (isNativeAndroid()) {
    try {
      const status = await Network.getStatus()
      if (signal?.aborted) return null
      return setNetworkState(status)
    } catch {
      return null
    }
  }

  if (signal?.aborted) return null
  const connected = navigator.onLine
  if (signal?.aborted) return null
  return setNetworkState({
    connected,
    connectionType: connected ? 'unknown' : 'none',
  })
}

export async function subscribeNetwork(
  listener: (state: NetworkState) => void,
  options: NetworkSubscriptionOptions = {},
): Promise<Cleanup> {
  const { signal } = options
  let active = !signal?.aborted
  if (isNativeAndroid()) {
    const handles = new Set<PluginListenerHandle>()
    const pendingRemovals = new Set<Promise<void>>()
    let cleaned = false

    const startHandleRemoval = (handle: PluginListenerHandle) => {
      handles.delete(handle)
      const removal = removeHandle(handle)
      pendingRemovals.add(removal)
      void removal.finally(() => pendingRemovals.delete(removal))
    }
    const deactivate = () => {
      if (!active) return
      active = false
      handles.forEach(startHandleRemoval)
    }
    const onAbort = () => deactivate()
    signal?.addEventListener('abort', onAbort, { once: true })

    const cleanup: Cleanup = async () => {
      if (cleaned) return
      cleaned = true
      deactivate()
      signal?.removeEventListener('abort', onAbort)
      await Promise.allSettled([...pendingRemovals])
    }

    if (!active) return cleanup

    try {
      const handle = await Network.addListener(
        'networkStatusChange',
        (state) => {
          if (!active) return
          publishNetworkState(listener, state)
        },
      )
      if (active) {
        handles.add(handle)
      } else {
        await removeHandle(handle)
      }
    } catch {
      // A status read can still provide useful state when listeners are absent.
    }

    if (active) {
      try {
        const initial = await Network.getStatus()
        if (active) publishNetworkState(listener, initial)
      } catch {
        // Unsupported native Network must not block application startup.
      }
    }

    return cleanup
  }

  let listenersAttached = false
  const publishBrowserState = () => {
    if (!active) return
    const connected = navigator.onLine
    publishNetworkState(listener, {
      connected,
      connectionType: connected ? 'unknown' : 'none',
    })
  }

  const removeBrowserListeners = () => {
    if (!listenersAttached) return
    listenersAttached = false
    window.removeEventListener('online', publishBrowserState)
    window.removeEventListener('offline', publishBrowserState)
  }
  const deactivate = () => {
    if (!active) return
    active = false
    removeBrowserListeners()
  }
  const onAbort = () => deactivate()
  signal?.addEventListener('abort', onAbort, { once: true })

  if (active) {
    window.addEventListener('online', publishBrowserState)
    window.addEventListener('offline', publishBrowserState)
    listenersAttached = true
    publishBrowserState()
  }

  let cleaned = false
  return async () => {
    if (cleaned) return
    cleaned = true
    deactivate()
    signal?.removeEventListener('abort', onAbort)
  }
}
