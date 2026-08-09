import { onlineManager } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const networkMocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  getStatus: vi.fn(),
  remove: vi.fn(),
}))

const runtimeMocks = vi.hoisted(() => ({
  isNativeAndroid: vi.fn(),
}))

vi.mock('@capacitor/network', () => ({
  Network: {
    addListener: networkMocks.addListener,
    getStatus: networkMocks.getStatus,
  },
}))

vi.mock('./runtime', () => ({
  isNativeAndroid: runtimeMocks.isNativeAndroid,
}))

import type { NetworkState } from './network'
import { refreshNetworkState, subscribeNetwork } from './network'
function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('network subscription', () => {
  let nativeListener:
    | ((state: { connected: boolean; connectionType: string }) => void)
    | undefined

  beforeEach(() => {
    nativeListener = undefined
    onlineManager.setOnline(true)
    runtimeMocks.isNativeAndroid.mockReturnValue(false)
    networkMocks.getStatus.mockResolvedValue({
      connected: true,
      connectionType: 'wifi',
    })
    networkMocks.remove.mockResolvedValue(undefined)
    networkMocks.addListener.mockImplementation(
      async (
        eventName: string,
        listener: (state: {
          connected: boolean
          connectionType: string
        }) => void,
      ) => {
        expect(eventName).toBe('networkStatusChange')
        nativeListener = listener
        return { remove: networkMocks.remove }
      },
    )
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    })
  })

  it('emits native initial and changed state while updating onlineManager', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    const states: NetworkState[] = []

    const cleanup = await subscribeNetwork((state) => states.push(state))

    expect(states).toEqual([{ connected: true, connectionType: 'wifi' }])
    nativeListener?.({ connected: false, connectionType: 'none' })
    expect(states).toEqual([
      { connected: true, connectionType: 'wifi' },
      { connected: false, connectionType: 'none' },
    ])
    expect(onlineManager.isOnline()).toBe(false)

    await cleanup()
    expect(networkMocks.remove).toHaveBeenCalledOnce()
  })

  it('uses browser online and offline events and stops after cleanup', async () => {
    const states: NetworkState[] = []
    const cleanup = await subscribeNetwork((state) => states.push(state))

    expect(states).toEqual([{ connected: true, connectionType: 'unknown' }])

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })
    window.dispatchEvent(new Event('offline'))
    expect(states.at(-1)).toEqual({
      connected: false,
      connectionType: 'none',
    })
    expect(onlineManager.isOnline()).toBe(false)

    await cleanup()
    await cleanup()
    window.dispatchEvent(new Event('online'))
    expect(states).toHaveLength(2)
    expect(networkMocks.addListener).not.toHaveBeenCalled()
  })

  it('uses idempotent native cleanup even when listener removal fails', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    networkMocks.remove.mockRejectedValue(new Error('already removed'))
    const cleanup = await subscribeNetwork(() => undefined)

    await expect(cleanup()).resolves.toBeUndefined()
    await expect(cleanup()).resolves.toBeUndefined()
    expect(networkMocks.remove).toHaveBeenCalledOnce()
  })

  it('ignores native callbacks while handle removal is pending and afterward', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    const pendingRemoval = createDeferred<void>()
    networkMocks.remove.mockReturnValue(pendingRemoval.promise)
    const states: NetworkState[] = []
    const cleanup = await subscribeNetwork((state) => states.push(state))

    const cleaning = cleanup()
    nativeListener?.({ connected: false, connectionType: 'none' })

    expect(states).toEqual([{ connected: true, connectionType: 'wifi' }])
    expect(onlineManager.isOnline()).toBe(true)

    pendingRemoval.resolve()
    await cleaning
    nativeListener?.({ connected: false, connectionType: 'none' })

    expect(states).toEqual([{ connected: true, connectionType: 'wifi' }])
    expect(onlineManager.isOnline()).toBe(true)
  })

  it('ignores a captured browser callback after cleanup starts', async () => {
    let capturedOfflineListener: EventListener | undefined
    const originalAddEventListener = window.addEventListener.bind(window)
    const addEventListener = vi
      .spyOn(window, 'addEventListener')
      .mockImplementation((type, listener, options) => {
        if (type === 'offline') {
          capturedOfflineListener = listener as EventListener
        }
        originalAddEventListener(type, listener, options)
      })
    const states: NetworkState[] = []
    const cleanup = await subscribeNetwork((state) => states.push(state))

    const cleaning = cleanup()
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })
    capturedOfflineListener?.(new Event('offline'))
    await cleaning

    expect(states).toEqual([{ connected: true, connectionType: 'unknown' }])
    expect(onlineManager.isOnline()).toBe(true)
    addEventListener.mockRestore()
  })

  it('refreshes native state once without registering a listener', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    networkMocks.getStatus.mockResolvedValue({
      connected: false,
      connectionType: 'wifi',
    })

    const state = await refreshNetworkState()

    expect(state).toEqual({ connected: false, connectionType: 'none' })
    expect(networkMocks.getStatus).toHaveBeenCalledOnce()
    expect(networkMocks.addListener).not.toHaveBeenCalled()
    expect(onlineManager.isOnline()).toBe(false)
  })

  it('returns no stale result or global mutation when a deferred native refresh is aborted', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    const status = createDeferred<{
      connected: boolean
      connectionType: 'none'
    }>()
    networkMocks.getStatus.mockReturnValue(status.promise)
    const controller = new AbortController()

    const refresh = refreshNetworkState({ signal: controller.signal })
    controller.abort()
    status.resolve({
      connected: false,
      connectionType: 'none',
    })

    await expect(refresh).resolves.toBeNull()
    expect(networkMocks.getStatus).toHaveBeenCalledOnce()
    expect(networkMocks.addListener).not.toHaveBeenCalled()
    expect(onlineManager.isOnline()).toBe(true)
  })

  it('refreshes normalized browser state without plugin listeners', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })

    const state = await refreshNetworkState()

    expect(state).toEqual({ connected: false, connectionType: 'none' })
    expect(networkMocks.getStatus).not.toHaveBeenCalled()
    expect(networkMocks.addListener).not.toHaveBeenCalled()
    expect(onlineManager.isOnline()).toBe(false)
  })

  it('returns null without changing online state when native refresh fails', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    networkMocks.getStatus.mockRejectedValue(new Error('unsupported'))

    await expect(refreshNetworkState()).resolves.toBeNull()

    expect(networkMocks.getStatus).toHaveBeenCalledOnce()
    expect(networkMocks.addListener).not.toHaveBeenCalled()
    expect(onlineManager.isOnline()).toBe(true)
  })

  it('aborts a deferred native registration before stale callbacks can mutate global state', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    const registration = createDeferred<{
      remove: typeof networkMocks.remove
    }>()
    networkMocks.addListener.mockImplementation(
      (
        eventName: string,
        listener: (state: {
          connected: boolean
          connectionType: string
        }) => void,
      ) => {
        expect(eventName).toBe('networkStatusChange')
        nativeListener = listener
        return registration.promise
      },
    )
    const controller = new AbortController()
    const states: NetworkState[] = []

    const subscription = subscribeNetwork(
      (state) => states.push(state),
      { signal: controller.signal },
    )
    controller.abort()
    nativeListener?.({ connected: false, connectionType: 'none' })

    expect(states).toEqual([])
    expect(onlineManager.isOnline()).toBe(true)

    registration.resolve({ remove: networkMocks.remove })
    const cleanup = await subscription

    expect(networkMocks.remove).toHaveBeenCalledOnce()
    expect(networkMocks.getStatus).not.toHaveBeenCalled()
    await cleanup()
    expect(networkMocks.remove).toHaveBeenCalledOnce()
  })

  it('removes browser listeners synchronously when its signal aborts', async () => {
    let capturedOfflineListener: EventListener | undefined
    const originalAddEventListener = window.addEventListener.bind(window)
    const addEventListener = vi
      .spyOn(window, 'addEventListener')
      .mockImplementation((type, listener, options) => {
        if (type === 'offline') {
          capturedOfflineListener = listener as EventListener
        }
        originalAddEventListener(type, listener, options)
      })
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    const controller = new AbortController()
    const states: NetworkState[] = []
    const subscription = subscribeNetwork(
      (state) => states.push(state),
      { signal: controller.signal },
    )

    controller.abort()
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })
    capturedOfflineListener?.(new Event('offline'))
    const cleanup = await subscription

    expect(states).toEqual([
      { connected: true, connectionType: 'unknown' },
    ])
    expect(onlineManager.isOnline()).toBe(true)
    expect(removeEventListener).toHaveBeenCalledWith(
      'offline',
      capturedOfflineListener,
    )
    await cleanup()
    addEventListener.mockRestore()
    removeEventListener.mockRestore()
  })
})
