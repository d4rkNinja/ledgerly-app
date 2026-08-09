import { Browser } from '@capacitor/browser'
import { isNativeAndroid } from './runtime'

export interface SafeExternalUrl {
  readonly href: string
}

const MAX_EXTERNAL_URL_LENGTH = 4_096
function hasUnsafeRawCharacters(raw: string): boolean {
  return (
    raw.includes('\\') ||
    Array.from(raw).some((character) => {
      const codePoint = character.codePointAt(0)
      return (
        character.trim().length === 0 ||
        (codePoint !== undefined && (codePoint <= 0x20 || codePoint === 0x7f))
      )
    })
  )
}


function isNonPublicIpv4(address: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(address)) return false

  const [first, second, third, fourth] = address.split('.').map(Number)
  if (
    [first, second, third, fourth].some(
      (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
    )
  ) {
    return true
  }

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

function parseIpv6Bytes(hostname: string): number[] | null {
  const address = hostname.replace(/^\[|\]$/gu, '').toLowerCase()
  if (!address.includes(':') || address.includes('%')) return null

  const halves = address.split('::')
  if (halves.length > 2) return null

  const parseGroups = (part: string): number[] | null => {
    if (!part) return []
    const rawGroups = part.split(':')
    const groups: number[] = []

    for (const [index, group] of rawGroups.entries()) {
      if (group.includes('.')) {
        if (index !== rawGroups.length - 1 || isNonPublicIpv4(group)) {
          return null
        }
        const octets = group.split('.').map(Number)
        if (
          octets.length !== 4 ||
          octets.some((octet) => octet < 0 || octet > 255)
        ) {
          return null
        }
        groups.push((octets[0] << 8) | octets[1])
        groups.push((octets[2] << 8) | octets[3])
      } else {
        if (!/^[\da-f]{1,4}$/u.test(group)) return null
        groups.push(Number.parseInt(group, 16))
      }
    }

    return groups
  }

  const left = parseGroups(halves[0])
  const right = parseGroups(halves[1] ?? '')
  if (!left || !right) return null

  const omitted = 8 - left.length - right.length
  if (
    (halves.length === 1 && omitted !== 0) ||
    (halves.length === 2 && omitted < 1)
  ) {
    return null
  }

  const groups =
    halves.length === 2
      ? [...left, ...Array.from({ length: omitted }, () => 0), ...right]
      : left
  if (groups.length !== 8) return null

  return groups.flatMap((group) => [group >> 8, group & 0xff])
}

function isNonPublicIpv6(hostname: string): boolean {
  const bytes = parseIpv6Bytes(hostname)
  if (!bytes) return hostname.includes(':')

  const allZeroBeforeLast = bytes.slice(0, 15).every((byte) => byte === 0)
  if (allZeroBeforeLast && (bytes[15] === 0 || bytes[15] === 1)) return true

  if (
    bytes[0] === 0xff ||
    (bytes[0] & 0xfe) === 0xfc ||
    (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) ||
    (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0xc0) ||
    (bytes[0] === 0x20 &&
      bytes[1] === 0x01 &&
      bytes[2] === 0x0d &&
      bytes[3] === 0xb8) ||
    (bytes[0] === 0x20 &&
      bytes[1] === 0x01 &&
      bytes[2] === 0x00 &&
      (bytes[3] & 0xe0) === 0)
  ) {
    return true
  }

  const isIpv4Mapped =
    bytes.slice(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff
  const isIpv4Compatible = bytes.slice(0, 12).every((byte) => byte === 0)
  const isWellKnownNat64 =
    bytes[0] === 0 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes.slice(4, 12).every((byte) => byte === 0)
  const isLocalUseNat64 =
    bytes[0] === 0 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    bytes[4] === 0 &&
    bytes[5] === 1

  if (isLocalUseNat64) return true
  if (
    (isWellKnownNat64 && isNonPublicIpv4(bytes.slice(12).join('.'))) ||
    (bytes[0] === 0x20 &&
      bytes[1] === 0x02 &&
      isNonPublicIpv4(bytes.slice(2, 6).join('.')))
  ) {
    return true
  }

  if (isIpv4Mapped || isIpv4Compatible) {
    return isNonPublicIpv4(bytes.slice(12).join('.'))
  }

  return false
}

function isPublicHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/gu, '').toLowerCase()

  if (
    !normalized ||
    normalized.endsWith('.') ||
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    normalized === 'home.arpa' ||
    normalized.endsWith('.home.arpa') ||
    normalized.endsWith('.test') ||
    normalized.endsWith('.invalid') ||
    normalized.endsWith('.example') ||
    normalized.endsWith('.onion') ||
    isNonPublicIpv4(normalized) ||
    isNonPublicIpv6(normalized)
  ) {
    return false
  }

  if (
    normalized !== 'wa.me' &&
    (normalized.endsWith('.wa.me') || normalized.startsWith('wa.me.'))
  ) {
    return false
  }

  return normalized.includes('.') || normalized.includes(':')
}

export function parseExternalUrl(raw: string): SafeExternalUrl {
  if (
    !raw ||
    raw.length > MAX_EXTERNAL_URL_LENGTH ||
    hasUnsafeRawCharacters(raw) ||
    raw.startsWith('//')
  ) {
    throw new Error('Unsafe external URL')
  }

  try {
    const parsed = new URL(raw)
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      !isPublicHostname(parsed.hostname)
    ) {
      throw new Error('Unsafe external URL')
    }

    const href = parsed.href
    if (href.length > MAX_EXTERNAL_URL_LENGTH) {
      throw new Error('Unsafe external URL')
    }

    return Object.freeze({ href })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unsafe external URL') {
      throw error
    }
    throw new Error('Unsafe external URL')
  }
}

export async function openExternalUrl(raw: string): Promise<void> {
  const { href } = parseExternalUrl(raw)

  if (isNativeAndroid()) {
    try {
      await Browser.open({ url: href })
    } catch {
      // External navigation is best-effort on unsupported native devices.
    }
    return
  }

  window.open(href, '_blank', 'noopener,noreferrer')
}
