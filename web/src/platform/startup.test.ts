import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const splashMocks = vi.hoisted(() => ({
  hide: vi.fn(),
}))

const preferenceMocks = vi.hoisted(() => ({
  hydrateNativePreferences: vi.fn(),
}))

const runtimeMocks = vi.hoisted(() => ({
  isNativeAndroid: vi.fn(),
}))

vi.mock('@capacitor/splash-screen', () => ({
  SplashScreen: { hide: splashMocks.hide },
}))

vi.mock('./preferences', () => ({
  hydrateNativePreferences: preferenceMocks.hydrateNativePreferences,
}))

vi.mock('./runtime', () => ({
  isNativeAndroid: runtimeMocks.isNativeAndroid,
}))

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function importStartup() {
  vi.resetModules()
  return import('./startup')
}

describe('native startup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    splashMocks.hide.mockResolvedValue(undefined)
    preferenceMocks.hydrateNativePreferences.mockResolvedValue(undefined)
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 16),
    )
    vi.stubGlobal('cancelAnimationFrame', (handle: number) =>
      window.clearTimeout(handle),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document, 'fonts')
  })

  it('waits for font readiness and one stable animation frame, then hides exactly once', async () => {
    const fonts = deferred<void>()
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: fonts.promise },
    })
    const { releaseNativeSplash } = await importStartup()

    const first = releaseNativeSplash()
    const second = releaseNativeSplash()
    await vi.advanceTimersByTimeAsync(16)
    expect(splashMocks.hide).not.toHaveBeenCalled()

    fonts.resolve()
    await Promise.all([first, second])

    expect(splashMocks.hide).toHaveBeenCalledOnce()
  })

  it('releases when fonts reject or fonts and requestAnimationFrame are unavailable', async () => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.reject(new Error('font failure')) },
    })
    vi.stubGlobal('requestAnimationFrame', undefined)
    const { releaseNativeSplash } = await importStartup()

    await releaseNativeSplash()

    expect(splashMocks.hide).toHaveBeenCalledOnce()
  })

  it('uses one absolute 3000ms ceiling beginning before hydration', async () => {
    const hydration = deferred<void>()
    const fonts = deferred<void>()
    preferenceMocks.hydrateNativePreferences.mockReturnValue(hydration.promise)
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: fonts.promise },
    })
    const { beginNativeStartup } = await importStartup()
    const session = beginNativeStartup()
    const hydrating = session.hydratePreferences()
    const [{ signal }] = preferenceMocks.hydrateNativePreferences.mock.calls[0]

    await vi.advanceTimersByTimeAsync(2_999)
    expect(signal.aborted).toBe(false)
    expect(splashMocks.hide).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await hydrating
    expect(signal.aborted).toBe(true)

    await session.releaseSplash()
    expect(splashMocks.hide).toHaveBeenCalledOnce()

    hydration.resolve()
    fonts.resolve()
  })

  it('clears the hydration timer on early settlement and aborts on disposal', async () => {
    const { beginNativeStartup } = await importStartup()
    const session = beginNativeStartup()

    await session.hydratePreferences()
    expect(vi.getTimerCount()).toBe(0)

    session.abort()
    const [{ signal }] = preferenceMocks.hydrateNativePreferences.mock.calls[0]
    expect(signal.aborted).toBe(true)
  })

  it('contains hydration failure and still allows splash release', async () => {
    preferenceMocks.hydrateNativePreferences.mockRejectedValue(
      new Error('native preferences unavailable'),
    )
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    })
    const { beginNativeStartup } = await importStartup()
    const session = beginNativeStartup()

    await expect(session.hydratePreferences()).resolves.toBeUndefined()
    const releasing = session.releaseSplash()
    await vi.advanceTimersByTimeAsync(16)
    await releasing

    expect(splashMocks.hide).toHaveBeenCalledOnce()
  })

  it('is a browser-safe no-op for hydration and splash', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(false)
    const { beginNativeStartup } = await importStartup()
    const session = beginNativeStartup()

    await session.hydratePreferences()
    await session.releaseSplash()

    expect(preferenceMocks.hydrateNativePreferences).not.toHaveBeenCalled()
    expect(splashMocks.hide).not.toHaveBeenCalled()
  })

  it('synchronously reapplies the hydrated mt-theme before rendering', async () => {
    localStorage.setItem('mt-theme', '"dark"')
    const { reapplyHydratedTheme } = await importStartup()

    expect(reapplyHydratedTheme()).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('settles pending hydration immediately when startup is aborted', async () => {
    const hydration = deferred<void>()
    preferenceMocks.hydrateNativePreferences.mockReturnValue(hydration.promise)
    const { beginNativeStartup } = await importStartup()
    const session = beginNativeStartup()
    const hydrating = session.hydratePreferences()
    let settled = false
    void hydrating.then(() => {
      settled = true
    })

    session.abort()
    await Promise.resolve()

    expect(settled).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    const [{ signal }] = preferenceMocks.hydrateNativePreferences.mock.calls[0]
    expect(signal.aborted).toBe(true)

    hydration.resolve()
  })
})
