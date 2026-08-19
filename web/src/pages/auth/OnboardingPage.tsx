import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { useApp } from '@/app/app-state'
import { Button } from '@/components/ui'
import { ApiError, api } from '@/lib/api-client'
import {
  MOTION_DISTANCE,
  TRANSITION_CONTENT,
} from '@/lib/app-motion'
import {
  AnimatedFormAlert,
  BrandMark,
} from './AuthPrimitives'
import { entrance } from './auth-motion'
import {
  AboutYouStep,
  RegistrationPreferencesStep,
} from './OnboardingSteps'
import type { AuthResponse, RegisterRequest } from './auth-contracts'

const onboardingSteps = [
  {
    title: 'About you',
    description: 'Create the credentials for your Ledgerly account.',
  },
  {
    title: 'Your preferences',
    description: 'Choose your currency and confirm your consent.',
  },
] as const

const NAME_ERROR = 'Enter the name you want to use.'
const EMAIL_ERROR = 'Enter a valid email address.'
const PASSWORD_ERROR = 'Use at least 12 characters for your password.'
const TERMS_ERROR =
  'Confirm the Terms and Privacy Policy to create your account.'

export function OnboardingPage() {
  const navigate = useNavigate()
  const { completeLogin, signOut } = useApp()
  const reducedMotion = Boolean(useReducedMotion())
  const [step, setStep] = useState(0)
  const [stepDirection, setStepDirection] = useState(1)
  const [isStepTransitioning, setIsStepTransitioning] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [error, setError] = useState('')
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)
  const previousStepRef = useRef(step)
  const transitionInFlightRef = useRef(false)
  const registrationInFlightRef = useRef(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const termsRef = useRef<HTMLButtonElement>(null)

  const progress = useMemo(
    () => ((step + 1) / onboardingSteps.length) * 100,
    [step],
  )
  const formAlertMessage =
    error === NAME_ERROR ||
    error === EMAIL_ERROR ||
    error === PASSWORD_ERROR
      ? ''
      : error

  useEffect(() => {
    if (previousStepRef.current === step) return
    previousStepRef.current = step

    const focusFrame = window.requestAnimationFrame(() => {
      stepHeadingRef.current?.focus()
      if (reducedMotion) transitionInFlightRef.current = false
    })
    return () => window.cancelAnimationFrame(focusFrame)
  }, [reducedMotion, step])

  const registerAccount = useMutation({
    mutationFn: (request: RegisterRequest) =>
      api.post<AuthResponse, RegisterRequest>('/auth/register', request),
    onSuccess: async (result) => {
      try {
          await completeLogin(
            result.user.id,
            result.user.name,
            result.token,
            true,
            result.user.preferredCurrency,
          )
        navigate('/app/home')
      } catch {
        signOut()
        setError(
          'Your account was created, but its workspace could not be loaded. Sign in again to continue.',
        )
      }
    },
    onError: (requestError) => {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'The service is unavailable. No account was created.',
      )
    },
    onSettled: () => {
      registrationInFlightRef.current = false
    },
  })

  const moveToStep = (direction: -1 | 1) => {
    if (transitionInFlightRef.current) return
    transitionInFlightRef.current = true
    if (!reducedMotion) setIsStepTransitioning(true)
    setError('')
    setStepDirection(direction)
    setStep((current) => current + direction)
  }

  const next = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (
      registerAccount.isPending ||
      registrationInFlightRef.current ||
      transitionInFlightRef.current
    ) {
      return
    }

    setError('')
    if (step === 0 && name.trim().length < 2) {
      setError(NAME_ERROR)
      nameRef.current?.focus()
      return
    }
    if (step === 0 && !z.string().email().safeParse(email.trim()).success) {
      setError(EMAIL_ERROR)
      emailRef.current?.focus()
      return
    }
    if (step === 0 && password.length < 12) {
      setError(PASSWORD_ERROR)
      passwordRef.current?.focus()
      return
    }
    if (step < onboardingSteps.length - 1) {
      moveToStep(1)
      return
    }
    if (!termsAccepted) {
      setError(TERMS_ERROR)
      termsRef.current?.focus()
      return
    }

    registrationInFlightRef.current = true
    registerAccount.mutate({
      name: name.trim(),
      email: email.trim(),
      password,
      locale: 'en-IN',
      preferredCurrency: currency,
      termsAccepted,
    })
  }

  return (
    <motion.main
      className="onboarding-layout"
      aria-labelledby={`onboarding-step-title-${step}`}
      {...entrance(reducedMotion)}
    >
      <header>
        <BrandMark />
        <span aria-live="polite" aria-atomic="true">
          Step {step + 1} of {onboardingSteps.length}:{' '}
          {onboardingSteps[step].title}
        </span>
      </header>
      <div
        className="onboarding-progress"
        role="progressbar"
        aria-label="Account setup progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        aria-valuetext={`${Math.round(progress)}% complete: ${
          onboardingSteps[step].title
        }`}
      >
        <motion.span
          initial={false}
          animate={{ scaleX: progress / 100 }}
          transition={reducedMotion ? { duration: 0 } : TRANSITION_CONTENT}
        />
      </div>
      <form
        onSubmit={next}
        noValidate
        aria-busy={registerAccount.isPending}
        aria-describedby={
          formAlertMessage ? 'onboarding-form-status' : undefined
        }
      >
        <AnimatePresence
          initial={false}
          mode="popLayout"
          onExitComplete={() => {
            transitionInFlightRef.current = false
            setIsStepTransitioning(false)
          }}
        >
          <motion.div
            key={step}
            initial={
              reducedMotion
                ? false
                : {
                    opacity: 0,
                    x:
                      stepDirection > 0
                        ? MOTION_DISTANCE.panel
                        : -MOTION_DISTANCE.panel,
                  }
            }
            animate={{ opacity: 1, x: 0 }}
            exit={
              reducedMotion
                ? undefined
                : {
                    opacity: 0,
                    x:
                      stepDirection > 0
                        ? -MOTION_DISTANCE.content
                        : MOTION_DISTANCE.content,
                  }
            }
            transition={reducedMotion ? { duration: 0 } : TRANSITION_CONTENT}
          >
            <div className="onboarding-copy">
              <h1
                id={`onboarding-step-title-${step}`}
                ref={stepHeadingRef}
                tabIndex={-1}
              >
                {onboardingSteps[step].title}
              </h1>
              <p>{onboardingSteps[step].description}</p>
            </div>
            {step === 0 ? (
              <AboutYouStep
                name={name}
                email={email}
                password={password}
                showPassword={showPassword}
                nameError={error === NAME_ERROR ? error : undefined}
                emailError={error === EMAIL_ERROR ? error : undefined}
                passwordError={
                  error === PASSWORD_ERROR ? error : undefined
                }
                nameRef={nameRef}
                emailRef={emailRef}
                passwordRef={passwordRef}
                reducedMotion={reducedMotion}
                onNameChange={(value) => {
                  setName(value)
                  setError('')
                }}
                onEmailChange={(value) => {
                  setEmail(value)
                  setError('')
                }}
                onPasswordChange={(value) => {
                  setPassword(value)
                  setError('')
                }}
                onTogglePassword={() =>
                  setShowPassword((visible) => !visible)
                }
              />
            ) : null}
            {step === 1 ? (
              <RegistrationPreferencesStep
                currency={currency}
                termsAccepted={termsAccepted}
                termsError={error === TERMS_ERROR ? error : undefined}
                termsRef={termsRef}
                onCurrencyChange={setCurrency}
                onTermsChange={(checked) => {
                  setTermsAccepted(checked)
                  setError('')
                }}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
        <AnimatedFormAlert
          id="onboarding-form-status"
          message={formAlertMessage}
          reducedMotion={reducedMotion}
        />
        <footer>
          {step > 0 ? (
            <Button
              type="button"
              variant="quiet"
              disabled={registerAccount.isPending || isStepTransitioning}
              aria-label={`Back to ${onboardingSteps[step - 1].title}`}
              onClick={() => moveToStep(-1)}
            >
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="submit"
            loading={registerAccount.isPending}
            disabled={registerAccount.isPending || isStepTransitioning}
          >
            {step === onboardingSteps.length - 1
              ? 'Finish setup'
              : 'Continue'}
            <ArrowRight aria-hidden="true" />
          </Button>
        </footer>
      </form>
    </motion.main>
  )
}
