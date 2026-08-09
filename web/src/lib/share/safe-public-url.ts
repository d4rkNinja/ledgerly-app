import type { SafePublicUrl } from './types'

export const MAX_SAFE_PUBLIC_URL_LENGTH = 2_048

function isNonPublicIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)) return false

  const octets = hostname.split('.').map(Number)
  if (octets.some((octet) => octet < 0 || octet > 255)) return true

  const [first, second, third] = octets
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && third === 0) ||
    (first === 192 && second === 0 && third === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113)
  )
}
function isNonPublicIpv6(hostname: string): boolean {
  const address = hostname.replace(/^\[|\]$/gu, '').toLowerCase()
  if (!address.includes(':')) return false

  if (
    address === '::' ||
    address === '::1' ||
    address.startsWith('fc') ||
    address.startsWith('fd') ||
    /^fe[89ab]/u.test(address) ||
    address.startsWith('2001:db8:')
  ) {
    return true
  }

  const mappedIpv4 = address.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u)
  return mappedIpv4 ? isNonPublicIpv4(mappedIpv4[1]) : false
}

function hasPublicHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/gu, '').toLowerCase()

  if (
    !normalized ||
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.test') ||
    normalized.endsWith('.invalid') ||
    isNonPublicIpv4(normalized) ||
    isNonPublicIpv6(normalized)
  ) {
    return false
  }

  return normalized.includes('.') || normalized.includes(':')
}

/**
 * Validates and brands a caller-supplied public URL. Only HTTPS URLs without
 * embedded credentials or local/private hosts are accepted.
 */
export function createSafePublicUrl(value: string): SafePublicUrl | null {
  const candidate = value.trim()
  if (!candidate || candidate.length > MAX_SAFE_PUBLIC_URL_LENGTH) return null

  try {
    const parsed = new URL(candidate)
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      !hasPublicHostname(parsed.hostname)
    ) {
      return null
    }

    const normalized = parsed.toString()
    return normalized.length <= MAX_SAFE_PUBLIC_URL_LENGTH
      ? (normalized as SafePublicUrl)
      : null
  } catch {
    return null
  }
}
