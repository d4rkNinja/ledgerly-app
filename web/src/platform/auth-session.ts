import { clearApiToken, setApiToken } from '@/lib/api-client'

function readStored<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return stored ? (JSON.parse(stored) as T) : fallback
  } catch {
    return fallback
  }
}

export function restoreRememberedApiToken(): boolean {
  if (typeof window === 'undefined') return false

  const token = readStored<string | null>('mt-auth-token', null)
  const rememberDevice = readStored<boolean>('mt-remember', false)
  const demoMode = readStored<boolean>('mt-demo', false)
  if (token && rememberDevice && !demoMode) {
    setApiToken(token)
    return true
  }

  clearApiToken()
  return false
}
