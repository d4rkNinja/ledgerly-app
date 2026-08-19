import { ArrowLeft, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { useApp } from '@/app/app-state'
import { Button, Field } from '@/components/ui'
import { Checkbox } from '@/components/beui/checkbox'
import { ApiError, api } from '@/lib/api-client'
import {
  AnimatedFormAlert,
  BrandMark,
  PasswordVisibilityButton,
} from './AuthPrimitives'
import { entrance } from './auth-motion'
import {
  loginSchema,
  type AuthResponse,
  type LoginRequest,
} from './auth-contracts'

type LoginNavigationState = {
  returnTo?: string
  invitationToken?: string
}

export function LoginPage() {
  const { completeLogin, signOut } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const reducedMotion = Boolean(useReducedMotion())
  const loginInFlightRef = useRef(false)
  const [rememberDevice, setRememberDevice] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const {
    register,
    handleSubmit,
    clearErrors,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<LoginRequest>({
    defaultValues: { email: '', password: '' },
  })

  const login = useMutation({
    mutationFn: (values: LoginRequest) =>
      api.post<AuthResponse, LoginRequest>('/auth/login', values),
    onSuccess: async (result) => {
      try {
        await completeLogin(
            result.user.id,
            result.user.name,
            result.token,
            rememberDevice,
            result.user.preferredCurrency,
          )
        const navigationState =
          location.state as LoginNavigationState | null
        const acceptingInvitation =
          navigationState?.returnTo === '/invite' &&
          Boolean(navigationState.invitationToken)
        navigate(acceptingInvitation ? '/invite' : '/app/home', {
          replace: true,
          state: acceptingInvitation
            ? { invitationToken: navigationState?.invitationToken }
            : undefined,
        })
      } catch {
        signOut()
        setFormError(
          'You signed in, but your workspaces could not be loaded. Please try again.',
        )
      }
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'The service is unavailable. Please check your connection and try again.',
      )
    },
    onSettled: () => {
      loginInFlightRef.current = false
    },
  })

  const submit = handleSubmit((values) => {
    if (login.isPending || loginInFlightRef.current) return
    setFormError('')
    const parsed = loginSchema.safeParse(values)
    if (!parsed.success) {
      let firstInvalidField: keyof LoginRequest | undefined
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0]
        if (field === 'email' || field === 'password') {
          firstInvalidField ??= field
          setError(field, { message: issue.message })
        }
      })
      if (firstInvalidField) setFocus(firstInvalidField)
      return
    }
    loginInFlightRef.current = true
    login.mutate(parsed.data)
  })

  return (
    <motion.main
      className="auth-layout sign-in-layout"
      aria-labelledby="login-title"
      {...entrance(reducedMotion)}
    >
      <motion.section
        className="auth-card"
        aria-labelledby="login-title"
        {...entrance(reducedMotion, 0.04)}
      >
        <BrandMark />
        <Link className="back-link" to="/">
          <ArrowLeft aria-hidden="true" />
          Back
        </Link>
        <div className="auth-heading">
          <h1 id="login-title">Welcome back</h1>
          <p>Sign in to continue to your workspaces.</p>
        </div>
        <form
          onSubmit={submit}
          noValidate
          aria-busy={login.isPending}
          aria-describedby={formError ? 'login-form-status' : undefined}
        >
          <Field label="Email" error={errors.email?.message}>
            <div className="input-with-icon">
              <Mail aria-hidden="true" />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                enterKeyHint="next"
                placeholder="you@example.com"
                {...register('email', {
                  onChange: () => {
                    clearErrors('email')
                    setFormError('')
                  },
                })}
                aria-invalid={Boolean(errors.email)}
              />
            </div>
          </Field>
          <Field label="Password" error={errors.password?.message}>
            <div className="input-with-icon">
              <LockKeyhole aria-hidden="true" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                enterKeyHint="go"
                placeholder="At least 8 characters"
                {...register('password', {
                  onChange: () => {
                    clearErrors('password')
                    setFormError('')
                  },
                })}
                aria-invalid={Boolean(errors.password)}
              />
              <PasswordVisibilityButton
                inputId="login-password"
                visible={showPassword}
                onToggle={() => setShowPassword((visible) => !visible)}
                reducedMotion={reducedMotion}
              />
            </div>
          </Field>
          <div className="form-between">
            <Checkbox
              className="check-label"
              checked={rememberDevice}
              onCheckedChange={setRememberDevice}
              label="Remember this device"
              aria-describedby="remember-device-note"
            />
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
          <small id="remember-device-note">
            Keeps your session active securely across restarts on this device.
          </small>
          <AnimatedFormAlert
            id="login-form-status"
            message={formError}
            reducedMotion={reducedMotion}
          />
          <Button
            type="submit"
            loading={login.isPending}
            disabled={login.isPending}
          >
            Sign in
          </Button>
        </form>
      </motion.section>
      <motion.aside
        className="auth-aside"
        aria-labelledby="login-aside-title"
        {...entrance(reducedMotion, 0.1)}
      >
        <div>
          <ShieldCheck aria-hidden="true" />
          <h2 id="login-aside-title">
            One private place for shared financial decisions.
          </h2>
          <p>
            Personal balances stay private while shared budgets, claims, and
            goals remain visible to the right people.
          </p>
        </div>
      </motion.aside>
    </motion.main>
  )
}
