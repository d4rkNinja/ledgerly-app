import { SplashScreen } from '@capacitor/splash-screen'
import { hydrateNativePreferences } from './preferences'
import { isNativeAndroid } from './runtime'

const SPLASH_DEADLINE_MS = 3_000

export interface ReleaseNativeSplashOptions {
  readonly deadlineAt?: number
}

export interface NativeStartupSession {
  hydratePreferences(): Promise<void>
  releaseSplash(): Promise<void>
  abort(): void
}

let splashReleasePromise: Promise<void> | null = null

function now(): number {
  return performance.now()
}

function waitForFonts(): Promise<void> {
  try {
    const fonts = (
      document as Document & {
        fonts?: { readonly ready?: PromiseLike<unknown> }
      }
    ).fonts
    return Promise.resolve(fonts?.ready).then(() => undefined, () => undefined)
  } catch {
    return Promise.resolve()
  }
}

function waitForStableFrame(): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (typeof requestAnimationFrame !== 'function') {
        resolve()
        return
      }
      requestAnimationFrame(() => resolve())
    } catch {
      resolve()
    }
  })
}

async function waitUntilReadyOrDeadline(deadlineAt: number): Promise<void> {
  const remaining = Math.max(0, deadlineAt - now())
  if (remaining === 0) return

  let timeout: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    Promise.all([waitForFonts(), waitForStableFrame()]).then(() => undefined),
    new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, remaining)
    }),
  ])
  if (timeout !== undefined) clearTimeout(timeout)
}

export function releaseNativeSplash(
  options: ReleaseNativeSplashOptions = {},
): Promise<void> {
  if (!isNativeAndroid()) return Promise.resolve()
  if (splashReleasePromise) return splashReleasePromise

  const deadlineAt = options.deadlineAt ?? now() + SPLASH_DEADLINE_MS
  splashReleasePromise = (async () => {
    await waitUntilReadyOrDeadline(deadlineAt)
    try {
      await SplashScreen.hide()
    } catch {
      // Splash release must never block application startup.
    }
  })()
  return splashReleasePromise
}

export function beginNativeStartup(): NativeStartupSession {
  const controller = new AbortController()
  const deadlineAt = now() + SPLASH_DEADLINE_MS
  const native = isNativeAndroid()
  let hydrationPromise: Promise<void> | null = null
  let hydrationTimer: ReturnType<typeof setTimeout> | undefined
  let settleHydration: (() => void) | null = null

  const hydratePreferences = () => {
    if (!native || controller.signal.aborted) return Promise.resolve()
    if (hydrationPromise) return hydrationPromise

    hydrationPromise = new Promise<void>((resolve) => {
      const remaining = Math.max(0, deadlineAt - now())
      if (remaining === 0) {
        controller.abort()
        resolve()
        return
      }

      let settled = false
      const settle = () => {
        if (settled) return
        settled = true
        settleHydration = null
        if (hydrationTimer !== undefined) {
          clearTimeout(hydrationTimer)
          hydrationTimer = undefined
        }
        resolve()
      }
      settleHydration = settle

      hydrationTimer = setTimeout(() => {
        controller.abort()
        settle()
      }, remaining)

      void hydrateNativePreferences({ signal: controller.signal }).then(
        settle,
        settle,
      )
    })
    return hydrationPromise
  }

  return {
    hydratePreferences,
    releaseSplash: () => releaseNativeSplash({ deadlineAt }),
    abort: () => {
      controller.abort()
      settleHydration?.()
    },
  }
}

export function reapplyHydratedTheme(): 'light' | 'dark' {
  let preference: unknown = 'system'
  try {
    preference = JSON.parse(localStorage.getItem('mt-theme') ?? '"system"')
  } catch {
    preference = 'system'
  }

  const resolved =
    preference === 'light' || preference === 'dark'
      ? preference
      : typeof matchMedia === 'function' &&
          matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'

  document.documentElement.dataset.theme = resolved
  document.documentElement.style.colorScheme = resolved
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#0b120e' : '#f1f5f2')
  return resolved
}
