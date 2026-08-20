import { ArrowLeft, CircleAlert } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router'
import { BrandMark } from './AuthPrimitives'
import { entrance } from './auth-motion'

export function ForgotPasswordPage() {
  const reducedMotion = Boolean(useReducedMotion())

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
          <p>Password recovery is not available in this deployment.</p>
        </div>
        <div className="auth-boundary-notice" role="status">
          <CircleAlert aria-hidden="true" />
          <div>
            <strong>No reset email can be sent</strong>
            <p>
              Ask the administrator of this Ledgerly deployment to restore
              access. Your email address has not been collected or submitted.
            </p>
          </div>
        </div>
        <Link className="button button-primary" to="/login">
          Return to sign in
        </Link>
      </motion.section>
    </motion.main>
  )
}
