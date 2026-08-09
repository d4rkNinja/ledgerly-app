import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashDevicePin } from '@/platform/device-pin'
import { DeviceAccessGate } from './device-access-gate'

describe('DeviceAccessGate', () => {
  afterEach(() => {
    cleanup()
  })

  it('asks for one six-digit PIN and configures it once', async () => {
    const user = userEvent.setup()
    const onConfigured = vi.fn()

    render(
      <DeviceAccessGate
        mode="setup"
        onConfigured={onConfigured}
        onUnlocked={vi.fn()}
        onSignOut={vi.fn()}
      />,
    )

    const pinInput = screen.getByLabelText('App PIN')
    expect(screen.queryByLabelText('Confirm app PIN')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('App PIN')).toHaveLength(1)

    await user.type(pinInput, '12345')
    expect(
      screen.getByRole('button', { name: 'Save app PIN' }),
    ).toBeDisabled()
    expect(onConfigured).not.toHaveBeenCalled()

    await user.type(pinInput, '6')
    await user.click(screen.getByRole('button', { name: 'Save app PIN' }))

    await waitFor(() => expect(onConfigured).toHaveBeenCalledTimes(1))
    expect(onConfigured.mock.calls[0][0]).toMatch(/^[0-9a-f]{64}$/u)
  })

  it('keeps the session locked until the correct PIN is entered', async () => {
    const user = userEvent.setup()
    const onUnlocked = vi.fn()
    const pinDigest = await hashDevicePin('123456')

    render(
      <DeviceAccessGate
        mode="unlock"
        pinDigest={pinDigest}
        onConfigured={vi.fn()}
        onUnlocked={onUnlocked}
        onSignOut={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('App PIN'), '000000')
    await user.click(screen.getByRole('button', { name: 'Unlock Ledgerly' }))
    expect(screen.getByRole('alert')).toHaveTextContent('That PIN is not correct.')
    expect(onUnlocked).not.toHaveBeenCalled()
  })
})
