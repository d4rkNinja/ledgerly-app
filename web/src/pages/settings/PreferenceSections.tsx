import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  Download,
  Globe2,
  Moon,
  Smartphone,
  Sun,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { Theme } from '@/app/app-state'
import { CurrencySelect } from '@/components/currency-select'
import { Badge, Button, ListRow, Section } from '@/components/ui'
import type { CurrentUser } from '@/domain/types'
import { api, ApiError } from '@/lib/api-client'
import { EASE_OUT } from '@/lib/ease'
import { SettingToggle } from './SettingToggle'

const THEME_OPTIONS = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Smartphone, label: 'System' },
] as const

function profileInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return initials || '—'
}

export function ProfileSection({
  userName,
  demoMode,
  currentUser,
  onUpdated,
}: {
  userName: string
  demoMode: boolean
  currentUser?: CurrentUser
  onUpdated?: (user: CurrentUser) => void
}) {
  const queryClient = useQueryClient()
  const fallback: CurrentUser = {
    email: '',
    name: userName,
    locale: 'en-IN',
    preferredCurrency: 'INR',
    emailVerified: false,
  }
  const profileQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<CurrentUser>('/me'),
    enabled: !demoMode,
    retry: 1,
  })
  const profile = profileQuery.data ?? currentUser ?? fallback
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState({
    name: profile.name,
    email: profile.email,
    phoneNumber: profile.phoneNumber ?? '',
    profileImageUrl: profile.profileImageUrl ?? '',
  })
  const [validationError, setValidationError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  useEffect(() => {
    setValues({
      name: profile.name,
      email: profile.email,
      phoneNumber: profile.phoneNumber ?? '',
      profileImageUrl: profile.profileImageUrl ?? '',
    })
  }, [profile.email, profile.name, profile.phoneNumber, profile.profileImageUrl])
  const mutation = useMutation({
    mutationFn: (input: typeof values) =>
      api.patch<CurrentUser, typeof input>('/me', {
        name: input.name.trim(),
        email: input.email.trim(),
        phoneNumber: input.phoneNumber.trim(),
        profileImageUrl: input.profileImageUrl.trim(),
      }),
    onSuccess: (user) => {
      queryClient.setQueryData(['auth', 'me'], user)
      onUpdated?.(user)
      setSuccess('Profile saved successfully.')
      setValidationError(null)
      setEditing(false)
    },
  })
  const save = () => {
    const name = values.name.trim()
    const email = values.email.trim()
    if (name.length < 2 || name.length > 80) {
      setValidationError('Name must contain 2 to 80 characters.')
      return
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setValidationError('Enter a valid email address.')
      return
    }
    if (values.phoneNumber.trim() && values.phoneNumber.replace(/\D/g, '').length < 7) {
      setValidationError('Phone number must contain at least 7 digits.')
      return
    }
    if (
      values.profileImageUrl.trim() &&
      !/^https:\/\/.+/i.test(values.profileImageUrl.trim())
    ) {
      setValidationError('Profile image URL must use HTTPS.')
      return
    }
    setValidationError(null)
    setSuccess(null)
    mutation.mutate(values)
  }
  return (
    <Section id="settings-0" aria-labelledby="settings-0-title">
      <div className="settings-section-heading">
        <h2 id="settings-0-title">Profile</h2>
        <p>Used across all your workspaces.</p>
      </div>
      <ListRow
        leading={
          <span className="avatar avatar-large" aria-hidden="true">
            {profile.profileImageUrl ? (
              <img src={profile.profileImageUrl} alt="" />
            ) : (
              profileInitials(profile.name)
            )}
          </span>
        }
        title={profile.name}
        subtitle={
          demoMode
            ? 'Local demo profile'
            : profile.email
              ? profile.email +
                ' · ' +
                (profile.emailVerified ? 'Email verified' : 'Email verification required')
              : 'Loading authenticated profile'
        }
        trailing={
          demoMode ? (
            <Badge>Demo profile</Badge>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSuccess(null)
                setEditing((value) => !value)
              }}
            >
              {editing ? 'Close' : 'Edit profile'}
            </Button>
          )
        }
      />
      {profileQuery.isLoading ? (
        <p className="settings-inline-status" role="status">
          Loading profile…
        </p>
      ) : null}
      {profileQuery.isError ? (
        <p className="field-error" role="alert">
          Your profile could not be loaded. Try again.
        </p>
      ) : null}
      {editing ? (
        <div className="settings-profile-form">
          <label>
            <span>Full name</span>
            <input
              value={values.name}
              onChange={(event) => setValues({ ...values, name: event.target.value })}
              autoComplete="name"
            />
          </label>
          <label>
            <span>Email address</span>
            <input
              value={values.email}
              onChange={(event) => setValues({ ...values, email: event.target.value })}
              autoComplete="email"
              type="email"
            />
          </label>
          <label>
            <span>Phone number</span>
            <input
              value={values.phoneNumber}
              onChange={(event) => setValues({ ...values, phoneNumber: event.target.value })}
              autoComplete="tel"
              inputMode="tel"
            />
          </label>
          <label>
            <span>Profile image URL</span>
            <input
              value={values.profileImageUrl}
              onChange={(event) => setValues({ ...values, profileImageUrl: event.target.value })}
              placeholder="https://…"
              inputMode="url"
            />
          </label>
          {validationError ? (
            <p className="field-error" role="alert">
              {validationError}
            </p>
          ) : null}
          {mutation.error ? (
            <p className="field-error" role="alert">
              {mutation.error instanceof ApiError
                ? mutation.error.message
                : 'Profile could not be saved. Try again.'}
            </p>
          ) : null}
          <div className="settings-form-actions">
            <Button
              type="button"
              onClick={save}
              loading={mutation.isPending}
            >
              Save profile
            </Button>
          </div>
        </div>
      ) : null}
      {success ? (
        <p className="settings-success" role="status">
          {success}
        </p>
      ) : null}
    </Section>
  )
}

export function AppearanceSection({
  theme,
  reducedMotion,
  onSelectTheme,
}: {
  theme: Theme
  reducedMotion: boolean
  onSelectTheme: (value: Theme, label: string) => void
}) {
  return (
    <Section id="settings-1" aria-labelledby="settings-1-title">
      <div className="settings-section-heading">
        <h2 id="settings-1-title">Appearance</h2>
        <p>Choose a theme that is comfortable in your environment.</p>
      </div>
      <div className="theme-options">
        {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
          <motion.button
            key={value}
            type="button"
            className={theme === value ? 'selected' : ''}
            initial={false}
            animate={{
              scale: reducedMotion || theme === value ? 1 : 0.985,
            }}
            transition={{
              duration: reducedMotion ? 0 : 0.18,
              ease: EASE_OUT,
            }}
            onClick={() => onSelectTheme(value, label)}
            aria-pressed={theme === value}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </motion.button>
        ))}
      </div>
    </Section>
  )
}

export function NotificationsSection({
  notifications,
  onChange,
}: {
  notifications: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Section id="settings-3" aria-labelledby="settings-3-title">
      <div className="settings-section-heading">
        <h2 id="settings-3-title">Notifications</h2>
        <p>Financial values are hidden from previews by default.</p>
      </div>
      <SettingToggle
        icon={<Bell aria-hidden="true" />}
        title="Important activity"
        description="Bill reminders, budget warnings, invitations, and approvals."
        checked={notifications}
        onChange={onChange}
      />
    </Section>
  )
}

export function MoneyPreferencesSection({
  preferredCurrency,
  onChange,
  saving = false,
  error,
  canExport,
  exporting = false,
  exportError,
  exportSuccess,
  onExport,
}: {
  preferredCurrency: string
  onChange: (currency: string) => void
  saving?: boolean
  error?: string | null
  canExport: boolean
  exporting?: boolean
  exportError?: string | null
  exportSuccess?: string | null
  onExport: () => void
}) {
  return (
    <Section id="settings-4" aria-labelledby="settings-4-title">
      <div className="settings-section-heading">
        <h2 id="settings-4-title">Money preferences</h2>
        <p>Formatting does not combine values from different currencies.</p>
      </div>
      <div className="settings-currency-control">
        <div className="settings-currency-copy">
          <Globe2 aria-hidden="true" />
          <div>
            <strong>Preferred currency</strong>
            <span>Used as the default when you add a new money value.</span>
          </div>
        </div>
        <CurrencySelect
          value={preferredCurrency}
          onChange={onChange}
          disabled={saving}
          ariaLabel="Preferred currency"
          className="settings-currency-select"
        />
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="settings-row-button">
        <Download aria-hidden="true" />
        <span>
          <strong>Export your data</strong>
          <small>
            {canExport
              ? 'Download all workspace data you can access as CSV'
              : 'Workspace export is available to members with export access'}
          </small>
        </span>
        <Button
          type="button"
          variant="secondary"
          onClick={onExport}
          loading={exporting}
          disabled={!canExport || exporting}
        >
          {exporting ? 'Preparing…' : 'Download CSV'}
        </Button>
      </div>
      {exportError ? (
        <p className="field-error" role="alert">
          {exportError}
        </p>
      ) : null}
      {exportSuccess ? (
        <p className="settings-success" role="status">
          {exportSuccess}
        </p>
      ) : null}
    </Section>
  )
}
