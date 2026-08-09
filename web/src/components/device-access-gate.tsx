import { LockKeyhole, LogOut } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { OTPInput } from '@/components/motion/otp-input'
import { Button } from '@/components/ui'
import {
  hashDevicePin,
  validateDevicePin,
  verifyDevicePin,
} from '@/platform/device-pin'

type DeviceAccessMode = 'setup' | 'unlock'

export function DeviceAccessGate({
  mode,
  pinDigest,
  onConfigured,
  onUnlocked,
  onSignOut,
}: {
  mode: DeviceAccessMode
  pinDigest?: string
  onConfigured: (digest: string) => void | Promise<void>
  onUnlocked: () => void
  onSignOut: () => void
}) {
  const isSetup = mode === 'setup'
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return

    const validationError = validateDevicePin(pin)
    if (validationError) {
      setError(validationError)
      return
    }
    if (!isSetup && !pinDigest) {
      setError('This device PIN is unavailable. Sign in again to continue.')
      return
    }

    setError('')
    setIsSubmitting(true)
    try {
      if (isSetup) {
        await onConfigured(await hashDevicePin(pin))
      } else if (await verifyDevicePin(pin, pinDigest ?? '')) {
        onUnlocked()
      } else {
        setError('That PIN is not correct.')
      }
    } catch {
      setError(
        isSetup
          ? 'The app PIN could not be saved. Try again.'
          : 'The app PIN could not be verified. Try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const updatePin = (value: string) => {
    setPin(value.replace(/\D/gu, '').slice(0, 6))
    setError('')
  }

  return (
    <main
      className="standalone-state device-access-gate"
      aria-labelledby="device-access-title"
    >
      <section className="device-access-card">
        <div className="device-access-header">
          <div className="device-access-icon" aria-hidden="true">
            <LockKeyhole />
          </div>
          <p className="eyebrow">Remembered device</p>
          <h1 id="device-access-title">
            {isSetup ? 'Create your app PIN' : 'Welcome back'}
          </h1>
          <p className="device-access-description">
            {isSetup
              ? 'Choose six digits to protect Ledgerly on this device. You will use this PIN next time you return.'
              : 'Enter your six-digit app PIN to unlock Ledgerly on this device.'}
          </p>
        </div>

        <form
          className="device-access-form"
          onSubmit={submit}
          noValidate
          aria-describedby={error ? 'device-access-error' : undefined}
        >
          <div
            id={error ? 'device-access-error' : undefined}
            className="device-pin-field"
            role={error ? 'alert' : undefined}
          >
            <OTPInput
              className="device-pin-otp"
              length={6}
              value={pin}
              onChange={updatePin}
              label="App PIN"
              hint={
                isSetup
                  ? 'Enter it once. You can change it later in Security.'
                  : 'Your account password is not required.'
              }
              errorMessage={error}
              status={error ? 'error' : 'idle'}
              mask
              disabled={isSubmitting}
              autoFocus
              aria-label="App PIN"
            />
          </div>

          <div className="device-access-actions">
            <Button
              type="submit"
              loading={isSubmitting}
              disabled={pin.length !== 6 || isSubmitting}
            >
              {isSetup ? 'Save app PIN' : 'Unlock Ledgerly'}
            </Button>
            <Button
              type="button"
              variant="quiet"
              onClick={onSignOut}
              disabled={isSubmitting}
            >
              <LogOut aria-hidden="true" />
              Use another account
            </Button>
          </div>
        </form>

        <p className="device-access-security-note">
          Your PIN stays on this device and is stored as a secure digest.
        </p>
      </section>
    </main>
  )
}
