import { describe, expect, it } from 'vitest'
import {
  hashDevicePin,
  validateDevicePin,
  verifyDevicePin,
} from './device-pin'

describe('device PIN', () => {
  it.each(['2468', '12345', '1234567', '12a456', ''])(
    'rejects invalid PIN %s',
    (pin) => {
      expect(validateDevicePin(pin)).toBe('Use a 6 digit app PIN.')
    },
  )

  it('accepts an exact six digit PIN', () => {
    expect(validateDevicePin('123456')).toBeNull()
  })

  it('hashes and verifies the PIN without storing plaintext', async () => {
    const digest = await hashDevicePin('123456')

    expect(digest).toMatch(/^[0-9a-f]{64}$/u)
    expect(digest).not.toContain('123456')
    await expect(verifyDevicePin('123456', digest)).resolves.toBe(true)
    await expect(verifyDevicePin('123457', digest)).resolves.toBe(false)
  })
})
