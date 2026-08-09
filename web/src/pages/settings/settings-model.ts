import {
  Bell,
  LockKeyhole,
  Palette,
  UserRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'
import { ApiError } from '@/lib/api-client'

export const SETTINGS_SECTIONS = [
  { id: 'settings-0', icon: UserRound, label: 'Profile' },
  { id: 'settings-1', icon: Palette, label: 'Appearance' },
  { id: 'settings-2', icon: LockKeyhole, label: 'Privacy and security' },
  { id: 'settings-3', icon: Bell, label: 'Notifications' },
  { id: 'settings-4', icon: WalletCards, label: 'Money preferences' },
] as const satisfies ReadonlyArray<{
  id: string
  icon: LucideIcon
  label: string
}>

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']
export type FeedbackTone = 'success' | 'error'

export type PreferenceFeedback = {
  id: number
  message: string
  tone: FeedbackTone
}

export type AuthSession = {
  id: string
  userId: string
  userAgent: string
  ipAddress: string
  createdAt: string
  expiresAt: string
  revokedAt?: string | null
}

export const REMOTE_LOGOUT_WARNING_DELAY_MS = 1200

export function getSessionState(session: AuthSession) {
  if (session.revokedAt) {
    return { label: 'Signed out', tone: 'neutral' as const }
  }

  const expiresAt = new Date(session.expiresAt).getTime()
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { label: 'Expired', tone: 'warning' as const }
  }

  return { label: 'Active', tone: 'positive' as const }
}

export function getDeviceLabel(userAgent: string) {
  if (!userAgent.trim()) return 'Unknown device'

  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /CriOS|Chrome\//.test(userAgent)
      ? 'Chrome'
      : /FxiOS|Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser'
  const device = /iPad/.test(userAgent)
    ? 'iPad'
    : /iPhone/.test(userAgent)
      ? 'iPhone'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Macintosh|Mac OS X/.test(userAgent)
          ? 'Mac'
          : /Windows/.test(userAgent)
            ? 'Windows'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : 'device'

  return `${browser} on ${device}`
}

export function formatSessionDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Unknown date'

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function getSessionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.status === 401) {
    return 'Your session has expired. Sign in again to manage devices.'
  }
  if (error instanceof TypeError) {
    return 'The service could not be reached. Check your connection and try again.'
  }
  return fallback
}

export function getSettingsSectionFromHash(): SettingsSectionId {
  if (typeof window === 'undefined') return 'settings-0'

  const hash = window.location.hash.slice(1)
  return (
    SETTINGS_SECTIONS.find(({ id }) => id === hash)?.id ?? 'settings-0'
  )
}
