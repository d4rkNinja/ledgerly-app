const DEVICE_PIN_PATTERN = /^\d{6}$/u

export function validateDevicePin(pin: string): string | null {
  return DEVICE_PIN_PATTERN.test(pin)
    ? null
    : 'Use a 6 digit app PIN.'
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function hashDevicePin(pin: string): Promise<string> {
  const validationError = validateDevicePin(pin)
  if (validationError) throw new Error(validationError)

  const bytes = new TextEncoder().encode(pin)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return toHex(digest)
}

export async function verifyDevicePin(
  pin: string,
  expectedDigest: string,
): Promise<boolean> {
  if (validateDevicePin(pin) || !/^[0-9a-f]{64}$/iu.test(expectedDigest)) {
    return false
  }

  const actualDigest = await hashDevicePin(pin)
  const expected = expectedDigest.toLowerCase()
  let difference = actualDigest.length === expected.length ? 0 : 1
  const length = Math.max(actualDigest.length, expected.length)
  for (let index = 0; index < length; index += 1) {
    difference |= (actualDigest.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0)
  }
  return difference === 0
}
