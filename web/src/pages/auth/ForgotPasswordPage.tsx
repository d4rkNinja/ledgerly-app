import { ArrowLeft } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { z } from 'zod'
import { Button, Field } from '@/components/ui'
import {
  AnimatedFormAlert,
  BrandMark,
} from './AuthPrimitives'
import { entrance } from './auth-motion'

const INVALID_EMAIL_MESSAGE = 'Enter a valid email address.'
const RESET_BOUNDARY_MESSAGE =
  'Password reset is not connected yet. No reset email was sent.'

export function ForgotPasswordPage() {
  const reducedMotion = Boolean(useReducedMotion())
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = z.string().trim().email().safeParse(email)
    if (!parsed.success) {
      setMessage(INVALID_EMAIL_MESSAGE)
      emailRef.current?.focus()
      return
    }
    setMessage(RESET_BOUNDARY_MESSAGE)
  }

  return (
    <motion.main
      className="simple-auth-page"
      aria-labelledby="forgot-password-title"
      {...entrance(reducedMotion)}
    >
      <motion.section
        className="auth-card"
        aria-labelledby="forgot-password-title"
        {...entrance(reducedMotion, 0.04)}
      >
        <BrandMark />
        <Link className="back-link" to="/login">
          <ArrowLeft aria-hidden="true" />
          Back to sign in
        </Link>
        <div className="auth-heading">
          <h1 id="forgot-password-title">Reset your password</h1>
          <p>Password reset delivery is not connected in this client yet.</p>
        </div>
        <form
          onSubmit={submit}
          noValidate
          aria-describedby={
            message === RESET_BOUNDARY_MESSAGE
              ? 'forgot-password-status'
              : undefined
          }
        >
          <Field
            label="Email"
            error={
              message === INVALID_EMAIL_MESSAGE ? message : undefined
            }
          >
            <input
              ref={emailRef}
              id="forgot-password-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setMessage('')
              }}
              aria-invalid={message === INVALID_EMAIL_MESSAGE}
            />
          </Field>
          {message === RESET_BOUNDARY_MESSAGE ? (
            <AnimatedFormAlert
              id="forgot-password-status"
              message={message}
              reducedMotion={reducedMotion}
              role="status"
            />
          ) : null}
          <Button type="submit">Check reset availability</Button>
        </form>
      </motion.section>
    </motion.main>
  )
}
