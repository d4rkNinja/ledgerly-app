import {
  ArrowRight,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router'
import { BrandMark } from './AuthPrimitives'
import { entrance } from './auth-motion'

export function WelcomePage() {
  const reducedMotion = Boolean(useReducedMotion())

  return (
    <main
      className="auth-layout welcome-layout"
      aria-labelledby="welcome-title"
    >
      <motion.section
        className="welcome-story"
        aria-labelledby="welcome-title"
        {...entrance(reducedMotion)}
      >
        <BrandMark />
        <div>
          <span className="trust-mark">
            <ShieldCheck aria-hidden="true" />
            Private by design
          </span>
          <h1 id="welcome-title">Money clarity for every part of your life.</h1>
          <p>
            Track your own money, plan with family, and manage team expenses
            without mixing what should stay separate.
          </p>
        </div>
        <div className="welcome-proof">
          <div>
            <LockKeyhole aria-hidden="true" />
            <span>
              <strong>Your amounts stay yours</strong>
              <small>Workspace permissions protect sensitive details.</small>
            </span>
          </div>
          <div>
            <KeyRound aria-hidden="true" />
            <span>
              <strong>Built for secure access</strong>
              <small>Sessions and an application PIN protect remembered access.</small>
            </span>
          </div>
        </div>
      </motion.section>
      <motion.section
        className="welcome-actions"
        aria-labelledby="welcome-actions-title"
        {...entrance(reducedMotion, 0.05)}
      >
        <div className="welcome-panel">
          <h2 id="welcome-actions-title">Start with your money</h2>
          <p>Choose your profile, password, and preferred currency.</p>
          <Link className="button button-primary" to="/onboarding">
            Create an account
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link className="button button-secondary" to="/login">
            Sign in
          </Link>
          <p className="terms-copy">
            By continuing, you agree to the Terms and acknowledge the Privacy
            Policy.
          </p>
        </div>
      </motion.section>
    </main>
  )
}
