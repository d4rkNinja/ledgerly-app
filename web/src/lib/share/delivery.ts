import { truncateUnicode } from './text'
import type {
  ShareDeliveryResult,
  ShareNavigator,
  SharePayload,
} from './types'

const MAX_COMPOSED_TEXT_CODE_POINTS = 3_500
const CLIPBOARD_TIMEOUT_MS = 1_500

function runtimeNavigator(): ShareNavigator | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator
}

function nativeShareData(payload: SharePayload): ShareData {
  return {
    title: payload.title,
    text: payload.text,
    ...(payload.url ? { url: payload.url } : {}),
  }
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  )
}

export function composeShareText(payload: SharePayload): string {
  const content = truncateUnicode(
    [payload.title, payload.text].filter(Boolean).join('\n\n'),
    MAX_COMPOSED_TEXT_CODE_POINTS,
  )

  return payload.url ? `${content}\n\n${payload.url}` : content
}

export function canShareNatively(
  payload: SharePayload,
  shareNavigator: ShareNavigator | undefined = runtimeNavigator(),
): boolean {
  if (typeof shareNavigator?.share !== 'function') return false
  if (typeof shareNavigator.canShare !== 'function') return true

  try {
    return shareNavigator.canShare(nativeShareData(payload))
  } catch {
    return false
  }
}

export async function copyShareText(
  payload: SharePayload,
  shareNavigator: ShareNavigator | undefined = runtimeNavigator(),
): Promise<ShareDeliveryResult> {
  const text = composeShareText(payload)
  if (typeof shareNavigator?.clipboard?.writeText !== 'function') {
    return {
      status: 'manual',
      method: 'manual',
      text,
      reason: 'clipboard-unavailable',
    }
  }

  try {
    let timeout: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      shareNavigator.clipboard.writeText(text),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Clipboard write timed out')),
          CLIPBOARD_TIMEOUT_MS,
        )
      }),
    ]).finally(() => {
      if (timeout) clearTimeout(timeout)
    })
    return { status: 'copied', method: 'clipboard', text }
  } catch {
    return {
      status: 'manual',
      method: 'manual',
      text,
      reason: 'clipboard-rejected',
    }
  }
}

/**
 * Uses the native Web Share API when available. Unsupported or failed native
 * shares fall back to clipboard copy. User cancellation never triggers a
 * surprise copy.
 */
export async function shareNative(
  payload: SharePayload,
  shareNavigator: ShareNavigator | undefined = runtimeNavigator(),
): Promise<ShareDeliveryResult> {
  if (!canShareNatively(payload, shareNavigator)) {
    const result = await copyShareText(payload, shareNavigator)
    return {
      ...result,
      ...(result.status === 'copied' || result.status === 'manual'
        ? { fallbackFrom: 'native-unavailable' as const }
        : {}),
    }
  }

  try {
    await shareNavigator?.share?.(nativeShareData(payload))
    return { status: 'shared', method: 'native' }
  } catch (error) {
    if (isAbort(error)) return { status: 'cancelled', method: 'native' }

    const result = await copyShareText(payload, shareNavigator)
    return {
      ...result,
      ...(result.status === 'copied' || result.status === 'manual'
        ? { fallbackFrom: 'native-rejected' as const }
        : {}),
    }
  }
}
