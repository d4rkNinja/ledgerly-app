import { beforeEach, describe, expect, it, vi } from 'vitest'

const hapticMocks = vi.hoisted(() => ({
  notification: vi.fn(),
  selectionChanged: vi.fn(),
}))

const runtimeMocks = vi.hoisted(() => ({
  isNativeAndroid: vi.fn(),
}))

vi.mock('@capacitor/haptics', () => ({
  Haptics: hapticMocks,
  NotificationType: {
    Success: 'SUCCESS',
  },
}))

vi.mock('./runtime', () => ({
  isNativeAndroid: runtimeMocks.isNativeAndroid,
}))

import { selectionHaptic, successHaptic } from './haptics'

describe('haptic feedback', () => {
  beforeEach(() => {
    runtimeMocks.isNativeAndroid.mockReturnValue(false)
    hapticMocks.notification.mockResolvedValue(undefined)
    hapticMocks.selectionChanged.mockResolvedValue(undefined)
  })

  it('is a no-op outside native Android', async () => {
    await selectionHaptic()
    await successHaptic()

    expect(hapticMocks.selectionChanged).not.toHaveBeenCalled()
    expect(hapticMocks.notification).not.toHaveBeenCalled()
  })

  it('uses selection and success feedback on native Android', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)

    await selectionHaptic()
    await successHaptic()

    expect(hapticMocks.selectionChanged).toHaveBeenCalledOnce()
    expect(hapticMocks.notification).toHaveBeenCalledWith({ type: 'SUCCESS' })
  })

  it('contains unsupported haptic plugin failures', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    hapticMocks.selectionChanged.mockRejectedValue(new Error('unsupported'))
    hapticMocks.notification.mockRejectedValue(new Error('unsupported'))

    await expect(selectionHaptic()).resolves.toBeUndefined()
    await expect(successHaptic()).resolves.toBeUndefined()
  })
})
