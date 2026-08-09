import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  useQuery,
} from '@tanstack/react-query'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { PluginListenerHandle } from '@capacitor/core'
import { NativeAppBridge } from './native-app-bridge'
import {
  getNativeAppState,
  publishNativeKeyboardState,
  publishNetworkState,
} from './native-app-state'
import { registerBackLayer } from './back-layer-stack'

const appMocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  exitApp: vi.fn(),
  getLaunchUrl: vi.fn(),
  removeAllListeners: vi.fn(),
}))

const runtimeMocks = vi.hoisted(() => ({
  isNativeAndroid: vi.fn(),
}))

const systemUiMocks = vi.hoisted(() => ({
  syncSystemBars: vi.fn(),
}))

const networkMocks = vi.hoisted(() => ({
  subscribeNetwork: vi.fn(),
  refreshNetworkState: vi.fn(),
}))

const keyboardMocks = vi.hoisted(() => ({
  subscribeKeyboard: vi.fn(),
  resetNativeKeyboardState: vi.fn(),
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: appMocks.addListener,
    exitApp: appMocks.exitApp,
    getLaunchUrl: appMocks.getLaunchUrl,
    removeAllListeners: appMocks.removeAllListeners,
  },
}))

vi.mock('./runtime', () => ({
  isNativeAndroid: runtimeMocks.isNativeAndroid,
}))

vi.mock('./system-ui', () => ({
  syncSystemBars: systemUiMocks.syncSystemBars,
}))

vi.mock('./network', () => ({
  subscribeNetwork: networkMocks.subscribeNetwork,
  refreshNetworkState: networkMocks.refreshNetworkState,
}))

vi.mock('./keyboard', () => ({
  subscribeKeyboard: keyboardMocks.subscribeKeyboard,
  resetNativeKeyboardState: keyboardMocks.resetNativeKeyboardState,
}))

type AppListener = (event: { isActive?: boolean; canGoBack?: boolean }) => void

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function LocationProbe() {
  const location = useLocation()
  return (
    <>
      <output aria-label="location">
        {location.pathname}
        {location.search}
        {location.hash}
      </output>
      <output aria-label="state">{JSON.stringify(location.state)}</output>
    </>
  )
}

function ActiveQuery({ request }: { request: () => Promise<string> }) {
  const query = useQuery({
    queryKey: ['active-live-query'],
    queryFn: request,
  })
  return <output aria-label="query">{query.data ?? 'loading'}</output>
}

function NativeStateConsumer() {
  useEffect(() => undefined, [])
  return <output aria-label="consumer">{getNativeAppState().network.connectionType}</output>
}

function renderBridge({
  initialEntries = ['/app/home'],
  initialIndex,
  isAuthenticated = true,
  demoMode = false,
  resolvedTheme = 'light' as const,
  queryClient,
  children,
}: {
  initialEntries?: Array<
    | string
    | {
        pathname: string
        search?: string
        hash?: string
        state?: unknown
      }
  >
  initialIndex?: number
  isAuthenticated?: boolean
  demoMode?: boolean
  resolvedTheme?: 'light' | 'dark'
  queryClient?: QueryClient
  children?: React.ReactNode
} = {}) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnReconnect: false,
        },
        mutations: { retry: false },
      },
    })

  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
        <NativeAppBridge
          resolvedTheme={resolvedTheme}
          demoMode={demoMode}
          isAuthenticated={isAuthenticated}
        />
        <LocationProbe />
        {children}
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { ...view, queryClient: client }
}

describe('NativeAppBridge', () => {
  let appListeners: Map<string, AppListener[]>
  let networkListener: ((state: { connected: boolean; connectionType: 'wifi' | 'none' }) => void) | undefined
  let keyboardListener: ((state: { open: boolean; height: number }) => void) | undefined
  let appRemovals: ReturnType<typeof vi.fn>[]
  let networkCleanup: ReturnType<typeof vi.fn>
  let keyboardCleanup: ReturnType<typeof vi.fn>

  beforeEach(() => {
    appListeners = new Map()
    appRemovals = []
    networkListener = undefined
    keyboardListener = undefined
    networkCleanup = vi.fn().mockResolvedValue(undefined)
    keyboardCleanup = vi.fn().mockResolvedValue(undefined)
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    systemUiMocks.syncSystemBars.mockResolvedValue(undefined)
    networkMocks.refreshNetworkState.mockResolvedValue({
      connected: true,
      connectionType: 'wifi',
    })
    networkMocks.subscribeNetwork.mockImplementation(
      async (listener: typeof networkListener) => {
        networkListener = listener
        listener?.({ connected: true, connectionType: 'wifi' })
        return networkCleanup
      },
    )
    keyboardMocks.subscribeKeyboard.mockImplementation(
      async (listener: typeof keyboardListener) => {
        keyboardListener = listener
        listener?.({ open: false, height: 0 })
        return keyboardCleanup
      },
    )
    appMocks.exitApp.mockResolvedValue(undefined)
    appMocks.addListener.mockImplementation(
      async (eventName: string, listener: AppListener) => {
        const listeners = appListeners.get(eventName) ?? []
        listeners.push(listener)
        appListeners.set(eventName, listeners)
        const remove = vi.fn().mockResolvedValue(undefined)
        appRemovals.push(remove)
        return { remove } satisfies PluginListenerHandle
      },
    )
    publishNetworkState({ connected: true, connectionType: 'unknown' })
    publishNativeKeyboardState(null)
    Object.defineProperty(window.history, 'state', {
      configurable: true,
      value: { idx: 0 },
    })
  })

  afterEach(() => {
    cleanup()
    focusManager.setFocused(undefined)
  })

  it('is the sole App, Network, and Keyboard subscription owner without deep links', async () => {
    renderBridge({
      children: (
        <>
          <NativeStateConsumer />
          <NativeStateConsumer />
        </>
      ),
    })

    await waitFor(() => {
      expect(appMocks.addListener).toHaveBeenCalledTimes(2)
      expect(networkMocks.subscribeNetwork).toHaveBeenCalledOnce()
      expect(keyboardMocks.subscribeKeyboard).toHaveBeenCalledOnce()
    })

    expect(appMocks.addListener.mock.calls.map(([name]) => name)).toEqual([
      'appStateChange',
      'backButton',
    ])
    expect(appMocks.getLaunchUrl).not.toHaveBeenCalled()
    expect(appMocks.removeAllListeners).not.toHaveBeenCalled()
    expect(getNativeAppState()).toMatchObject({
      network: { connected: true, connectionType: 'wifi' },
      nativeKeyboard: { open: false, height: 0 },
    })
  })

  it('adopts late listener registrations independently and removes each handle after unmount', async () => {
    const appStateRegistration = deferred<PluginListenerHandle>()
    const backRegistration = deferred<PluginListenerHandle>()
    const lateNetwork = deferred<() => Promise<void>>()
    const lateKeyboard = deferred<() => Promise<void>>()
    const removeAppState = vi.fn().mockResolvedValue(undefined)
    const removeBack = vi.fn().mockResolvedValue(undefined)
    const removeNetwork = vi.fn().mockResolvedValue(undefined)
    const removeKeyboard = vi.fn().mockResolvedValue(undefined)

    appMocks.addListener.mockImplementation((eventName: string) =>
      eventName === 'appStateChange'
        ? appStateRegistration.promise
        : backRegistration.promise,
    )
    networkMocks.subscribeNetwork.mockReturnValue(lateNetwork.promise)
    keyboardMocks.subscribeKeyboard.mockReturnValue(lateKeyboard.promise)

    const view = renderBridge()
    view.unmount()

    appStateRegistration.resolve({ remove: removeAppState })
    await waitFor(() => expect(removeAppState).toHaveBeenCalledOnce())
    expect(removeBack).not.toHaveBeenCalled()

    backRegistration.resolve({ remove: removeBack })
    lateNetwork.resolve(removeNetwork)
    lateKeyboard.resolve(removeKeyboard)
    await waitFor(() => {
      expect(removeBack).toHaveBeenCalledOnce()
      expect(removeNetwork).toHaveBeenCalledOnce()
      expect(removeKeyboard).toHaveBeenCalledOnce()
    })
  })

  it('ignores captured callbacks and post-await resume work after cleanup', async () => {
    const refresh = deferred<{ connected: boolean; connectionType: 'wifi' }>()
    networkMocks.refreshNetworkState.mockReturnValue(refresh.promise)
    const view = renderBridge()
    await waitFor(() => expect(appMocks.addListener).toHaveBeenCalledTimes(2))
    const appStateListener = appListeners.get('appStateChange')?.[0]

    act(() => appStateListener?.({ isActive: true }))
    await waitFor(() =>
      expect(networkMocks.refreshNetworkState).toHaveBeenCalledOnce(),
    )
    const refreshSignal =
      networkMocks.refreshNetworkState.mock.calls[0]?.[0]?.signal
    expect(refreshSignal?.aborted).toBe(false)
    view.unmount()
    expect(refreshSignal?.aborted).toBe(true)
    refresh.resolve({ connected: true, connectionType: 'wifi' })
    await act(async () => undefined)

    act(() => {
      appStateListener?.({ isActive: false })
      networkListener?.({ connected: false, connectionType: 'none' })
      keyboardListener?.({ open: true, height: 300 })
    })

    expect(focusManager.isFocused()).toBe(true)
    expect(getNativeAppState().network.connected).toBe(true)
    expect(getNativeAppState().nativeKeyboard).toBeNull()
  })

  it('removes every Strict Mode registration without broad listener cleanup', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, refetchOnReconnect: false },
        mutations: { retry: false },
      },
    })
    const view = render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <NativeAppBridge
              resolvedTheme="light"
              demoMode={false}
              isAuthenticated
            />
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>,
    )

    await waitFor(() => expect(appMocks.addListener).toHaveBeenCalledTimes(4))
    const firstNetworkSignal =
      networkMocks.subscribeNetwork.mock.calls[0]?.[1]?.signal
    const secondNetworkSignal =
      networkMocks.subscribeNetwork.mock.calls[1]?.[1]?.signal
    const firstKeyboardSignal =
      keyboardMocks.subscribeKeyboard.mock.calls[0]?.[1]?.signal
    const secondKeyboardSignal =
      keyboardMocks.subscribeKeyboard.mock.calls[1]?.[1]?.signal
    expect(firstNetworkSignal).toBe(firstKeyboardSignal)
    expect(secondNetworkSignal).toBe(secondKeyboardSignal)
    expect(firstNetworkSignal?.aborted).toBe(true)
    expect(secondNetworkSignal?.aborted).toBe(false)

    view.unmount()
    await waitFor(() => {
      expect(appRemovals).toHaveLength(4)
      expect(appRemovals.every((remove) => remove.mock.calls.length === 1)).toBe(true)
      expect(networkCleanup).toHaveBeenCalledTimes(2)
      expect(keyboardCleanup).toHaveBeenCalledTimes(2)
    })
    expect(secondNetworkSignal?.aborted).toBe(true)
    expect(secondKeyboardSignal?.aborted).toBe(true)
    expect(appMocks.removeAllListeners).not.toHaveBeenCalled()
  })

  it('owns pause/resume focus and reapplies the latest theme with explicit state refresh', async () => {
    const view = renderBridge({ resolvedTheme: 'light' })
    await waitFor(() => expect(appMocks.addListener).toHaveBeenCalledTimes(2))
    const appStateListener = appListeners.get('appStateChange')?.[0]

    act(() => appStateListener?.({ isActive: false }))
    expect(focusManager.isFocused()).toBe(false)

    view.rerender(
      <QueryClientProvider client={view.queryClient}>
        <MemoryRouter>
          <NativeAppBridge
            resolvedTheme="dark"
            demoMode={false}
            isAuthenticated
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    act(() => keyboardListener?.({ open: true, height: 300 }))
    expect(getNativeAppState().nativeKeyboard).toEqual({
      open: true,
      height: 300,
    })
    act(() => appStateListener?.({ isActive: true }))

    await waitFor(() => {
      expect(systemUiMocks.syncSystemBars).toHaveBeenCalledWith('dark')
      expect(networkMocks.refreshNetworkState).toHaveBeenCalledOnce()
      expect(keyboardMocks.resetNativeKeyboardState).toHaveBeenCalledOnce()
      expect(focusManager.isFocused()).toBe(true)
      expect(getNativeAppState().nativeKeyboard).toEqual({
        open: false,
        height: 0,
      })
    })
    expect(networkMocks.subscribeNetwork).toHaveBeenCalledOnce()
  })

  it('makes one actual active-query request for one offline-to-online transition', async () => {
    const request = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('initial')
      .mockResolvedValue('refreshed')
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Number.POSITIVE_INFINITY,
          refetchOnReconnect: false,
        },
        mutations: { retry: false },
      },
    })
    renderBridge({
      queryClient,
      isAuthenticated: true,
      demoMode: false,
      children: <ActiveQuery request={request} />,
    })
    expect(await screen.findByText('initial')).toHaveAttribute(
      'aria-label',
      'query',
    )

    act(() => networkListener?.({ connected: false, connectionType: 'none' }))
    act(() => networkListener?.({ connected: true, connectionType: 'wifi' }))

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    act(() => networkListener?.({ connected: true, connectionType: 'wifi' }))
    await act(async () => undefined)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it.each([
    { isAuthenticated: false, demoMode: false },
    { isAuthenticated: true, demoMode: true },
  ])('does not reconnect live queries when ineligible: %o', async (props) => {
    const request = vi.fn<() => Promise<string>>().mockResolvedValue('data')
    renderBridge({
      ...props,
      children: <ActiveQuery request={request} />,
    })
    await screen.findByText('data')

    act(() => networkListener?.({ connected: false, connectionType: 'none' }))
    act(() => networkListener?.({ connected: true, connectionType: 'wifi' }))
    await act(async () => undefined)

    expect(request).toHaveBeenCalledOnce()
  })

  it('dismisses the top registered layer before URL or history navigation', async () => {
    const dismiss = vi.fn()
    const unregister = registerBackLayer(dismiss)
    renderBridge({
      initialEntries: [
        '/app/home',
        {
          pathname: '/app/transactions',
          search: '?add=expense',
        },
      ],
      initialIndex: 1,
    })
    await waitFor(() => expect(appMocks.addListener).toHaveBeenCalledTimes(2))

    act(() => appListeners.get('backButton')?.[0]?.({ canGoBack: true }))

    expect(dismiss).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('location')).toHaveTextContent(
      '/app/transactions?add=expense',
    )
    unregister()
  })

  it('replaces URL modal state while preserving unrelated URL and location state', async () => {
    renderBridge({
      initialEntries: [
        {
          pathname: '/app/transactions',
          search: '?tag=one&add=expense&tag=two&claim=request',
          hash: '#review',
          state: { source: 'native-back' },
        },
      ],
    })
    await waitFor(() => expect(appMocks.addListener).toHaveBeenCalledTimes(2))

    act(() => appListeners.get('backButton')?.[0]?.({ canGoBack: false }))

    expect(screen.getByLabelText('location')).toHaveTextContent(
      '/app/transactions?tag=one&tag=two#review',
    )
    expect(screen.getByLabelText('state')).toHaveTextContent(
      '{"source":"native-back"}',
    )
    expect(appMocks.exitApp).not.toHaveBeenCalled()
  })

  it('uses history, canonical fallback, and approved-root exit without deep links', async () => {
    const historyView = renderBridge({
      initialEntries: ['/app/home', '/app/transactions'],
      initialIndex: 1,
    })
    await waitFor(() => expect(appMocks.addListener).toHaveBeenCalledTimes(2))
    act(() => appListeners.get('backButton')?.[0]?.({ canGoBack: true }))
    expect(screen.getByLabelText('location')).toHaveTextContent('/app/home')
    expect(appMocks.exitApp).not.toHaveBeenCalled()
    historyView.unmount()

    appMocks.addListener.mockClear()
    appListeners.clear()
    const fallbackView = renderBridge({
      initialEntries: ['/app/transactions'],
      isAuthenticated: true,
    })
    await waitFor(() => expect(appMocks.addListener).toHaveBeenCalledTimes(2))
    act(() => appListeners.get('backButton')?.[0]?.({ canGoBack: false }))
    expect(screen.getByLabelText('location')).toHaveTextContent('/app/home')
    expect(appMocks.exitApp).not.toHaveBeenCalled()
    fallbackView.unmount()

    appMocks.addListener.mockClear()
    appListeners.clear()
    renderBridge({ initialEntries: ['/'], isAuthenticated: false })
    await waitFor(() => expect(appMocks.addListener).toHaveBeenCalledTimes(2))
    act(() => appListeners.get('backButton')?.[0]?.({ canGoBack: false }))
    expect(appMocks.exitApp).toHaveBeenCalledOnce()
    expect(appMocks.getLaunchUrl).not.toHaveBeenCalled()
  })

  it('serializes resume work so only the latest generation publishes and invalidates', async () => {
    const firstRefresh = deferred<{
      connected: boolean
      connectionType: 'none'
    }>()
    const latestRefresh = deferred<{
      connected: boolean
      connectionType: 'wifi'
    }>()
    networkMocks.refreshNetworkState
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(latestRefresh.promise)
    const view = renderBridge({ resolvedTheme: 'light' })
    const invalidateQueries = vi.spyOn(
      view.queryClient,
      'invalidateQueries',
    )
    await waitFor(() => expect(appMocks.addListener).toHaveBeenCalledTimes(2))
    const appStateListener = appListeners.get('appStateChange')?.[0]

    act(() => {
      networkListener?.({ connected: false, connectionType: 'none' })
      appStateListener?.({ isActive: true })
    })
    await waitFor(() =>
      expect(networkMocks.refreshNetworkState).toHaveBeenCalledOnce(),
    )
    const firstRefreshSignal =
      networkMocks.refreshNetworkState.mock.calls[0]?.[0]?.signal
    expect(firstRefreshSignal?.aborted).toBe(false)

    view.rerender(
      <QueryClientProvider client={view.queryClient}>
        <MemoryRouter>
          <NativeAppBridge
            resolvedTheme="dark"
            demoMode={false}
            isAuthenticated
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    act(() => appStateListener?.({ isActive: true }))
    await act(async () => undefined)
    expect(firstRefreshSignal?.aborted).toBe(true)
    expect(networkMocks.refreshNetworkState).toHaveBeenCalledOnce()


    firstRefresh.resolve({
      connected: false,
      connectionType: 'none',
    })
    await waitFor(() =>
      expect(networkMocks.refreshNetworkState).toHaveBeenCalledTimes(2),
    )
    const latestRefreshSignal =
      networkMocks.refreshNetworkState.mock.calls[1]?.[0]?.signal
    expect(latestRefreshSignal?.aborted).toBe(false)
    expect(latestRefreshSignal).not.toBe(firstRefreshSignal)
    expect(getNativeAppState().network.connected).toBe(false)
    expect(invalidateQueries).not.toHaveBeenCalled()

    latestRefresh.resolve({
      connected: true,
      connectionType: 'wifi',
    })
    await waitFor(() => {
      expect(getNativeAppState().network.connected).toBe(true)
      expect(invalidateQueries).toHaveBeenCalledOnce()
    })
    expect(systemUiMocks.syncSystemBars).toHaveBeenLastCalledWith('dark')
    expect(networkMocks.subscribeNetwork).toHaveBeenCalledOnce()
  })
})
