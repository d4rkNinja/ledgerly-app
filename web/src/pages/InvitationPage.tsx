import { useMutation } from '@tanstack/react-query'
import {
  ArrowRight,
  Check,
  KeyRound,
  LockKeyhole,
  MailCheck,
  ShieldCheck,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useApp } from '@/app/app-state'
import { BrandLogo } from '@/components/brand-logo'
import { Button, Field } from '@/components/ui'
import { ApiError, api } from '@/lib/api-client'
import { MOTION_DISTANCE, TRANSITION_CONTENT } from '@/lib/app-motion'

type InvitationMembership = {
  workspaceId: string
  role: string
}

type InvitationLocationState = {
  invitationToken?: string
}

function invitationErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'not_found':
        return 'This invitation is invalid, expired, or has already been used.'
      case 'forbidden':
        return 'This invitation belongs to a different email address. Sign in with the invited account.'
      case 'conflict':
        return 'You already have access to this workspace, or this invitation was already accepted.'
      case 'service_unavailable':
        return 'The invitation service could not be reached. Check your connection and try again.'
      default:
        if (error.status >= 500) {
          return 'The invitation service could not be reached. Check your connection and try again.'
        }
        return 'This invitation could not be accepted. Check the token and try again.'
    }
  }
  return 'The invitation service could not be reached. Check your connection and try again.'
}

function tokenFromFragment() {
  const searchParams = new URLSearchParams(window.location.search)
  if (searchParams.get('code')) return searchParams.get('code')!.trim()
  if (searchParams.get('token')) return searchParams.get('token')!.trim()
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  return new URLSearchParams(hash).get('token')?.trim() ?? ''
}

export function InvitationPage() {
  const {
    demoMode,
    isAuthenticated,
    refreshWorkspaces,
    signOut,
  } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const locationState = location.state as InvitationLocationState | null
  const [token, setToken] = useState(
    () => locationState?.invitationToken?.trim() || tokenFromFragment(),
  )
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}`,
      )
    }
    if (location.state) {
      navigate('/invite', { replace: true, state: null })
    }
  }, [location.state, navigate])

  const acceptance = useMutation({
    mutationFn: () =>
      api.post<InvitationMembership, { token: string }>(
        '/invitations/accept',
        { token: token.trim() },
      ),
    onSuccess: async (membership) => {
      try {
        await refreshWorkspaces(membership.workspaceId)
        navigate('/app/home', { replace: true })
      } catch {
        setFeedback(
          'The invitation was accepted, but your workspace list could not refresh. Sign in again to load it.',
        )
      }
    },
    onError: (error) => {
      setFeedback(invitationErrorMessage(error))
    },
  })

  const continueToLogin = () => {
    if (demoMode) signOut()
    navigate('/login', {
      state: {
        returnTo: '/invite',
        invitationToken: token.trim(),
      },
    })
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!token.trim() || acceptance.isPending) return
    setFeedback('')
    acceptance.mutate()
  }

  return (
    <main className="invite-accept-layout" aria-labelledby="invite-title">
      <motion.section
        className="invite-accept-card"
        initial={reduce ? false : { opacity: 0, y: MOTION_DISTANCE.panel }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0 } : TRANSITION_CONTENT}
      >
        <Link className="auth-brand" to="/" aria-label="Ledgerly home">
          <span>
            <BrandLogo />
          </span>
          <strong>Ledgerly</strong>
        </Link>
        <div className="invite-accept-icon" aria-hidden="true">
          <MailCheck />
        </div>
        <div className="invite-accept-heading">
          <span>
            <ShieldCheck aria-hidden="true" />
            Secure workspace invitation
          </span>
          <h1 id="invite-title">Join a shared money space</h1>
          <p>
            Invitations are single-use, expire automatically, and only work
            for the email address chosen by the inviter.
          </p>
        </div>

        <form onSubmit={submit} className="invite-accept-form">
          <Field
            label="Invitation token"
            hint="Paste the token if you received it separately."
          >
            <div className="input-with-icon">
              <KeyRound aria-hidden="true" />
              <input
                type="password"
                value={token}
                onChange={(event) => {
                  setToken(event.target.value)
                  setFeedback('')
                }}
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                required
                placeholder="Paste invitation token"
              />
            </div>
          </Field>

          {feedback ? (
            <div className="form-alert" role="alert">
              {feedback}
            </div>
          ) : null}

          {!isAuthenticated || demoMode ? (
            <Button
              type="button"
              onClick={continueToLogin}
              disabled={!token.trim()}
            >
              <LockKeyhole aria-hidden="true" />
              Sign in to continue
              <ArrowRight aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="submit"
              loading={acceptance.isPending}
              disabled={!token.trim() || acceptance.isPending}
            >
              <Check aria-hidden="true" />
              Accept invitation
            </Button>
          )}
        </form>
        <p className="invite-security-note">
          Never forward an invitation you did not request. Ledgerly will not
          ask for your password through WhatsApp.
        </p>
      </motion.section>
    </main>
  )
}
