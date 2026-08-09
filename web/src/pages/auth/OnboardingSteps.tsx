import {
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import type { RefObject } from 'react'
import { CurrencySelect } from '@/components/currency-select'
import { Checkbox } from '@/components/motion/checkbox'
import { Field } from '@/components/ui'
import { PasswordVisibilityButton } from './AuthPrimitives'

export function AboutYouStep({
  name,
  email,
  password,
  showPassword,
  nameError,
  emailError,
  passwordError,
  nameRef,
  emailRef,
  passwordRef,
  reducedMotion,
  onNameChange,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
}: {
  name: string
  email: string
  password: string
  showPassword: boolean
  nameError?: string
  emailError?: string
  passwordError?: string
  nameRef: RefObject<HTMLInputElement | null>
  emailRef: RefObject<HTMLInputElement | null>
  passwordRef: RefObject<HTMLInputElement | null>
  reducedMotion: boolean
  onNameChange: (value: string) => void
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onTogglePassword: () => void
}) {
  return (
    <div className="form-stack">
      <Field label="Your name" error={nameError}>
        <div className="input-with-icon">
          <UserRound aria-hidden="true" />
          <input
            ref={nameRef}
            id="onboarding-name"
            name="name"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            autoComplete="name"
            enterKeyHint="next"
            placeholder="How should we address you?"
            aria-invalid={Boolean(nameError)}
          />
        </div>
      </Field>
      <Field label="Email" error={emailError}>
        <input
          ref={emailRef}
          id="onboarding-email"
          name="email"
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          autoComplete="email"
          autoCapitalize="none"
          enterKeyHint="next"
          placeholder="you@example.com"
          aria-invalid={Boolean(emailError)}
        />
      </Field>
      <Field
        label="Password"
        hint="Use at least 12 characters. Your password is never stored by this browser."
        error={passwordError}
      >
        <div className="input-with-icon">
          <LockKeyhole aria-hidden="true" />
          <input
            ref={passwordRef}
            id="onboarding-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            autoComplete="new-password"
            enterKeyHint="next"
            placeholder="Create a strong password"
            aria-invalid={Boolean(passwordError)}
          />
          <PasswordVisibilityButton
            inputId="onboarding-password"
            visible={showPassword}
            onToggle={onTogglePassword}
            reducedMotion={reducedMotion}
          />
        </div>
      </Field>
      <div className="privacy-callout">
        <ShieldCheck aria-hidden="true" />
        <p>
          Financial values are only shown where your workspace permissions
          allow. You can hide amounts instantly from any screen.
        </p>
      </div>
    </div>
  )
}

export function RegistrationPreferencesStep({
  currency,
  termsAccepted,
  termsError,
  termsRef,
  onCurrencyChange,
  onTermsChange,
}: {
  currency: string
  termsAccepted: boolean
  termsError?: string
  termsRef: RefObject<HTMLButtonElement | null>
  onCurrencyChange: (value: string) => void
  onTermsChange: (checked: boolean) => void
}) {
  return (
  <div className="form-stack">
      <Field label="Preferred currency">
        <CurrencySelect
          value={currency}
          onChange={onCurrencyChange}
          ariaLabel="Preferred currency"
        />
      </Field>
      <div className="check-card">
        <Checkbox
          buttonRef={termsRef}
          checked={termsAccepted}
          onCheckedChange={onTermsChange}
          aria-label="I accept the Terms and Privacy Policy"
          aria-required
          aria-invalid={Boolean(termsError)}
          aria-describedby={termsError ? 'onboarding-form-status' : undefined}
        />
        <span>
          <strong>I accept the Terms and Privacy Policy</strong>
          <small>Required to create your Ledgerly account.</small>
        </span>
      </div>
    </div>
  )
}
