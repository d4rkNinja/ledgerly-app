import { Preferences } from '@capacitor/preferences'
import { isNativeAndroid } from './runtime'

const NATIVE_PREFERENCE_KEYS = [
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

export type NativePreferenceKey = (typeof NATIVE_PREFERENCE_KEYS)[number]

const nativePreferenceKeySet = new Set<string>(NATIVE_PREFERENCE_KEYS)
const nativePreferenceMutationQueues = new Map<
  NativePreferenceKey,
  Promise<void>
>()

function assertNativePreferenceKey(
  key: string,
): asserts key is NativePreferenceKey {
  if (!nativePreferenceKeySet.has(key)) {
    throw new Error('Unsupported native preference key')
  }
}

function enqueueNativePreferenceMutation(
  key: NativePreferenceKey,
  mutation: () => Promise<void>,
): Promise<void> {
  const previous = nativePreferenceMutationQueues.get(key) ?? Promise.resolve()
  const result = previous.then(mutation)
  const settledTail = result.catch(() => undefined)

  nativePreferenceMutationQueues.set(key, settledTail)
  void settledTail.then(() => {
    if (nativePreferenceMutationQueues.get(key) === settledTail) {
      nativePreferenceMutationQueues.delete(key)
    }
  })

  return result
}

export interface HydrateNativePreferencesOptions {
  signal?: AbortSignal
}

export async function hydrateNativePreferences(
  options: HydrateNativePreferencesOptions = {},
): Promise<void> {
  const { signal } = options
  if (signal?.aborted || !isNativeAndroid()) return

  for (const key of NATIVE_PREFERENCE_KEYS) {
    if (signal?.aborted) return
    try {
      const { value: nativeValue } = await Preferences.get({ key })
      if (signal?.aborted) return

      if (nativeValue !== null) {
        if (signal?.aborted) return
        localStorage.setItem(key, nativeValue)
        continue
      }

      if (signal?.aborted) return
      const localValue = localStorage.getItem(key)
      if (localValue !== null) {
        if (signal?.aborted) return
        await enqueueNativePreferenceMutation(key, () =>
          signal?.aborted
            ? Promise.resolve()
            : Preferences.set({ key, value: localValue }),
        )
        if (signal?.aborted) return
      }
    } catch {
      if (signal?.aborted) return
      // Isolate native and local storage failures to the affected key.
    }
  }
}

export async function persistNativePreference(
  key: NativePreferenceKey,
  value: string,
): Promise<void> {
  assertNativePreferenceKey(key)
  localStorage.setItem(key, value)

  if (!isNativeAndroid()) return

  try {
    await enqueueNativePreferenceMutation(key, () =>
      Preferences.set({ key, value }),
    )
  } catch {
    // localStorage remains the synchronous source when native mirroring fails.
  }
}

export async function removeNativePreference(
  key: NativePreferenceKey,
): Promise<void> {
  assertNativePreferenceKey(key)
  localStorage.removeItem(key)

  if (!isNativeAndroid()) return

  try {
    await enqueueNativePreferenceMutation(key, () =>
      Preferences.remove({ key }),
    )
  } catch {
    // The local removal is authoritative for the current session.
  }
}
