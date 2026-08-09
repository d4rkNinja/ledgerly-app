import type { PluginListenerHandle } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { isNativeAndroid } from './runtime'

export interface KeyboardState {
  readonly open: boolean
  readonly height: number
}

export type Cleanup = () => Promise<void>
export interface KeyboardSubscriptionOptions {
  readonly signal?: AbortSignal
}


const root = () => document.documentElement

function clearKeyboardMarkers(): void {
  root().removeAttribute('data-keyboard-open')
  root().style.removeProperty('--keyboard-height')
}

export function resetNativeKeyboardState(): void {
  if (!isNativeAndroid()) {
    clearKeyboardMarkers()
    return
  }
  root().dataset.keyboardOpen = 'false'
  root().style.setProperty('--keyboard-height', '0px')
}

function sanitizeKeyboardHeight(height: number): number {
  return Number.isFinite(height) ? Math.max(0, height) : 0
}

function publishKeyboardState(
  listener: (state: KeyboardState) => void,
  state: KeyboardState,
): void {
  root().dataset.keyboardOpen = String(state.open)
  root().style.setProperty('--keyboard-height', `${state.height}px`)
  listener(state)
}

async function removeHandle(handle: PluginListenerHandle): Promise<void> {
  try {
    await handle.remove()
  } catch {
    // Listener removal is idempotent best-effort across plugin versions.
  }
}

export async function subscribeKeyboard(
  listener: (state: KeyboardState) => void,
  options: KeyboardSubscriptionOptions = {},
): Promise<Cleanup> {
  clearKeyboardMarkers()
  if (!isNativeAndroid()) return async () => undefined
  const { signal } = options
  let active = !signal?.aborted
  let cleaned = false
  const handles = new Set<PluginListenerHandle>()
  const pendingRemovals = new Set<Promise<void>>()

  const startHandleRemoval = (handle: PluginListenerHandle) => {
    handles.delete(handle)
    const removal = removeHandle(handle)
    pendingRemovals.add(removal)
    void removal.finally(() => pendingRemovals.delete(removal))
  }
  const deactivate = () => {
    if (!active) return
    active = false
    clearKeyboardMarkers()
    handles.forEach(startHandleRemoval)
  }
  const onAbort = () => deactivate()
  signal?.addEventListener('abort', onAbort, { once: true })

  const cleanup: Cleanup = async () => {
    if (cleaned) return
    cleaned = true
    deactivate()
    clearKeyboardMarkers()
    signal?.removeEventListener('abort', onAbort)
    await Promise.allSettled([...pendingRemovals])
  }

  if (!active) return cleanup

  const adoptHandle = async (
    registration: Promise<PluginListenerHandle>,
  ): Promise<void> => {
    const handle = await registration
    if (active) {
      handles.add(handle)
    } else {
      await removeHandle(handle)
    }
  }

  const results = await Promise.allSettled([
    adoptHandle(
      Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) => {
        if (!active) return
        publishKeyboardState(listener, {
          open: true,
          height: sanitizeKeyboardHeight(keyboardHeight),
        })
      }),
    ),
    adoptHandle(
      Keyboard.addListener('keyboardWillHide', () => {
        if (!active) return
        resetNativeKeyboardState()
        listener({ open: false, height: 0 })
      }),
    ),
  ])

  if (
    active &&
    results.some((result) => result.status === 'rejected')
  ) {
    deactivate()
  }

  if (!active) {
    clearKeyboardMarkers()
    return cleanup
  }

  resetNativeKeyboardState()
  listener({ open: false, height: 0 })

  return cleanup
}
