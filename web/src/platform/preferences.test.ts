import { beforeEach, describe, expect, it, vi } from 'vitest'

const preferenceMocks = vi.hoisted(() => ({
  clear: vi.fn(),
  get: vi.fn(),
  keys: vi.fn(),
  migrate: vi.fn(),
  remove: vi.fn(),
  removeOld: vi.fn(),
  set: vi.fn(),
}))

const runtimeMocks = vi.hoisted(() => ({
  isNativeAndroid: vi.fn(),
}))

vi.mock('@capacitor/preferences', () => ({
  Preferences: preferenceMocks,
}))

vi.mock('./runtime', () => ({
  isNativeAndroid: runtimeMocks.isNativeAndroid,
}))

import {
  hydrateNativePreferences,
  persistNativePreference,
  removeNativePreference,
  type NativePreferenceKey,
} from './preferences'

const NATIVE_KEYS = [
  'mt-demo',
  'mt-user-name',
  'mt-user-profile',
  'mt-user-id',
  'mt-auth-token',
  'mt-remember',
  'mt-app-pin-hash',
  'mt-workspace',
  'mt-default-workspace-id',
  'mt-privacy',
  'mt-theme',
  'mt-preferred-currency',
] as const

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('native preferences', () => {
  beforeEach(() => {
    localStorage.clear()
    runtimeMocks.isNativeAndroid.mockReturnValue(false)
    preferenceMocks.clear.mockResolvedValue(undefined)
    preferenceMocks.get.mockResolvedValue({ value: null })
    preferenceMocks.keys.mockResolvedValue({ keys: [] })
    preferenceMocks.migrate.mockResolvedValue({
      existing: [],
      migrated: [],
    })
    preferenceMocks.remove.mockResolvedValue(undefined)
    preferenceMocks.removeOld.mockResolvedValue(undefined)
    preferenceMocks.set.mockResolvedValue(undefined)
  })

  it('updates browser localStorage synchronously with exact raw values', async () => {
    const rawWorkspace = '{"id":"workspace-1","name":"Primary"}'

    const persistence = persistNativePreference('mt-workspace', rawWorkspace)
    expect(localStorage.getItem('mt-workspace')).toBe(rawWorkspace)
    await persistence

    const removal = removeNativePreference('mt-workspace')
    expect(localStorage.getItem('mt-workspace')).toBeNull()
    await removal

    expect(preferenceMocks.set).not.toHaveBeenCalled()
    expect(preferenceMocks.remove).not.toHaveBeenCalled()
  })

  it('mirrors native persistence and removal after synchronous local updates', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    const rawTheme = '"dark"'

    const persistence = persistNativePreference('mt-theme', rawTheme)
    expect(localStorage.getItem('mt-theme')).toBe(rawTheme)
    await persistence
    expect(preferenceMocks.set).toHaveBeenCalledWith({
      key: 'mt-theme',
      value: rawTheme,
    })

    const removal = removeNativePreference('mt-theme')
    expect(localStorage.getItem('mt-theme')).toBeNull()
    await removal
    expect(preferenceMocks.remove).toHaveBeenCalledWith({ key: 'mt-theme' })
  })

  it('mirrors and removes the remembered device PIN digest', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    const digest = 'a'.repeat(64)

    await persistNativePreference('mt-app-pin-hash', digest)
    expect(preferenceMocks.set).toHaveBeenCalledWith({
      key: 'mt-app-pin-hash',
      value: digest,
    })

    await removeNativePreference('mt-app-pin-hash')
    expect(preferenceMocks.remove).toHaveBeenCalledWith({
      key: 'mt-app-pin-hash',
    })
  })

  it('keeps local changes when native persistence and removal fail', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    preferenceMocks.set.mockRejectedValue(new Error('unavailable'))
    preferenceMocks.remove.mockRejectedValue(new Error('unavailable'))

    await expect(
      persistNativePreference('mt-demo', 'true'),
    ).resolves.toBeUndefined()
    expect(localStorage.getItem('mt-demo')).toBe('true')

    await expect(removeNativePreference('mt-demo')).resolves.toBeUndefined()
    expect(localStorage.getItem('mt-demo')).toBeNull()
  })

  it.each(['access-token', 'mt-token', 'bearer-token'])(
    'rejects non-allowlisted key %s before any storage access',
    async (key) => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem')
      const setItem = vi.spyOn(Storage.prototype, 'setItem')
      const removeItem = vi.spyOn(Storage.prototype, 'removeItem')

      await expect(
        persistNativePreference(key as NativePreferenceKey, 'secret'),
      ).rejects.toThrow('Unsupported native preference key')
      await expect(
        removeNativePreference(key as NativePreferenceKey),
      ).rejects.toThrow('Unsupported native preference key')

      expect(getItem).not.toHaveBeenCalled()
      expect(setItem).not.toHaveBeenCalled()
      expect(removeItem).not.toHaveBeenCalled()
      expect(preferenceMocks.get).not.toHaveBeenCalled()
      expect(preferenceMocks.set).not.toHaveBeenCalled()
      expect(preferenceMocks.remove).not.toHaveBeenCalled()
    },
  )

  it('hydrates each allowlisted key with native precedence and local migration', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    localStorage.setItem('mt-demo', 'true')
    localStorage.setItem('mt-user-name', '"Ada"')
    localStorage.setItem('mt-workspace', '{"id":"local"}')
    localStorage.setItem('access-token', 'must-stay-local-only')

    preferenceMocks.get.mockImplementation(
      async ({ key }: { key: string }) => {
        if (key === 'mt-demo') return { value: 'false' }
        if (key === 'mt-workspace') throw new Error('per-key failure')
        if (key === 'mt-theme') return { value: '"dark"' }
        return { value: null }
      },
    )

    await hydrateNativePreferences()

    expect(localStorage.getItem('mt-demo')).toBe('false')
    expect(localStorage.getItem('mt-user-name')).toBe('"Ada"')
    expect(localStorage.getItem('mt-workspace')).toBe('{"id":"local"}')
    expect(localStorage.getItem('mt-theme')).toBe('"dark"')
    expect(localStorage.getItem('access-token')).toBe('must-stay-local-only')
    expect(preferenceMocks.get.mock.calls.map(([options]) => options.key)).toEqual(
      NATIVE_KEYS,
    )
    expect(preferenceMocks.set).toHaveBeenCalledExactlyOnceWith({
      key: 'mt-user-name',
      value: '"Ada"',
    })
    expect(preferenceMocks.clear).not.toHaveBeenCalled()
    expect(preferenceMocks.keys).not.toHaveBeenCalled()
    expect(preferenceMocks.migrate).not.toHaveBeenCalled()
    expect(preferenceMocks.removeOld).not.toHaveBeenCalled()
    expect(preferenceMocks.remove).not.toHaveBeenCalled()
  })

  it('does not access the native plugin during browser hydration', async () => {
    localStorage.setItem('mt-theme', '"light"')

    await hydrateNativePreferences()

    expect(localStorage.getItem('mt-theme')).toBe('"light"')
    expect(preferenceMocks.get).not.toHaveBeenCalled()
    expect(preferenceMocks.set).not.toHaveBeenCalled()
  })

  it('stops hydration after an abort while a native read is pending', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    localStorage.setItem('mt-demo', 'local-value')
    let resolveNativeRead!: (result: { value: string | null }) => void
    const nativeRead = new Promise<{ value: string | null }>((resolve) => {
      resolveNativeRead = resolve
    })
    preferenceMocks.get.mockReturnValue(nativeRead)
    const controller = new AbortController()

    const hydration = hydrateNativePreferences({ signal: controller.signal })
    expect(preferenceMocks.get).toHaveBeenCalledExactlyOnceWith({
      key: 'mt-demo',
    })

    controller.abort()
    resolveNativeRead({ value: 'native-value' })
    await hydration

    expect(localStorage.getItem('mt-demo')).toBe('local-value')
    expect(preferenceMocks.get).toHaveBeenCalledOnce()
    expect(preferenceMocks.set).not.toHaveBeenCalled()
  })

  it('skips a queued hydration mutation when aborted before execution', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    const pendingWrite = createDeferred<void>()
    preferenceMocks.set
      .mockReturnValueOnce(pendingWrite.promise)
      .mockResolvedValueOnce(undefined)

    const blocker = persistNativePreference('mt-demo', 'true')
    await Promise.resolve()
    const controller = new AbortController()

    const hydration = hydrateNativePreferences({ signal: controller.signal })
    await Promise.resolve()
    await Promise.resolve()
    controller.abort()
    pendingWrite.resolve()
    await Promise.all([blocker, hydration])

    expect(preferenceMocks.set.mock.calls).toEqual([
      [{ key: 'mt-demo', value: 'true' }],
    ])
    expect(preferenceMocks.get).toHaveBeenCalledOnce()
  })

  it('serializes native sets for the same key while localStorage stays synchronous', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    const firstWrite = createDeferred<void>()
    preferenceMocks.set.mockImplementation(
      ({ value }: { value: string }) =>
        value === 'old-value' ? firstWrite.promise : Promise.resolve(),
    )

    const oldPersistence = persistNativePreference('mt-theme', 'old-value')
    const newPersistence = persistNativePreference('mt-theme', 'new-value')

    expect(localStorage.getItem('mt-theme')).toBe('new-value')
    await Promise.resolve()
    expect(preferenceMocks.set.mock.calls).toEqual([
      [{ key: 'mt-theme', value: 'old-value' }],
    ])

    firstWrite.resolve()
    await Promise.all([oldPersistence, newPersistence])

    expect(preferenceMocks.set.mock.calls).toEqual([
      [{ key: 'mt-theme', value: 'old-value' }],
      [{ key: 'mt-theme', value: 'new-value' }],
    ])
  })

  it('serializes native removal after a pending set for the same key', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    const firstWrite = createDeferred<void>()
    preferenceMocks.set.mockReturnValue(firstWrite.promise)

    const persistence = persistNativePreference('mt-theme', '"dark"')
    const removal = removeNativePreference('mt-theme')

    expect(localStorage.getItem('mt-theme')).toBeNull()
    await Promise.resolve()
    expect(preferenceMocks.set).toHaveBeenCalledOnce()
    expect(preferenceMocks.remove).not.toHaveBeenCalled()

    firstWrite.resolve()
    await Promise.all([persistence, removal])

    expect(preferenceMocks.remove).toHaveBeenCalledExactlyOnceWith({
      key: 'mt-theme',
    })
  })

  it('does not block a different preference key behind a pending mutation', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    const themeWrite = createDeferred<void>()
    preferenceMocks.set.mockImplementation(
      ({ key }: { key: string }) =>
        key === 'mt-theme' ? themeWrite.promise : Promise.resolve(),
    )

    const themePersistence = persistNativePreference('mt-theme', '"dark"')
    const demoPersistence = persistNativePreference('mt-demo', 'true')

    await Promise.resolve()
    expect(preferenceMocks.set).toHaveBeenCalledWith({
      key: 'mt-demo',
      value: 'true',
    })

    themeWrite.resolve()
    await Promise.all([themePersistence, demoPersistence])
  })

  it('continues a same-key queue after a rejected native mutation', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    preferenceMocks.set
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce(undefined)

    await Promise.all([
      persistNativePreference('mt-theme', '"light"'),
      persistNativePreference('mt-theme', '"dark"'),
    ])

    expect(preferenceMocks.set.mock.calls).toEqual([
      [{ key: 'mt-theme', value: '"light"' }],
      [{ key: 'mt-theme', value: '"dark"' }],
    ])
    expect(localStorage.getItem('mt-theme')).toBe('"dark"')
  })
})
