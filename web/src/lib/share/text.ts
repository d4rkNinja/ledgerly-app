const ELLIPSIS = '…'

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/giu
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu
const OBJECT_ID_PATTERN = /\b[0-9a-f]{24}\b/giu
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu
const LONG_SECRET_PATTERN = /\b[A-Za-z0-9_-]{36,}\b/gu
const ACCOUNT_NUMBER_PATTERN = /\b(?:\d[ -]?){8,19}\b/gu

function removeUnsafeControls(value: string): string {
  let result = ''

  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    const isControl =
      codePoint <= 8 ||
      codePoint === 11 ||
      codePoint === 12 ||
      (codePoint >= 14 && codePoint <= 31) ||
      (codePoint >= 127 && codePoint <= 159)
    const isBidiOverride =
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)

    if (!isControl && !isBidiOverride) result += character
  }

  return result
}

/**
 * Replaces malformed UTF-16 with U+FFFD so URI encoding never throws on a
 * lone surrogate. Valid surrogate pairs and emoji ZWJ sequences are retained.
 */
export function toWellFormedUnicode(value: string): string {
  let result = ''

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += value[index] + value[index + 1]
        index += 1
      } else {
        result += '\ufffd'
      }
      continue
    }

    result +=
      codeUnit >= 0xdc00 && codeUnit <= 0xdfff ? '\ufffd' : value[index]
  }

  return result
}

export function unicodeLength(value: string): number {
  return Array.from(value).length
}

export function truncateUnicode(value: string, maxCodePoints: number): string {
  if (maxCodePoints <= 0) return ''

  const normalized = toWellFormedUnicode(value)
  const codePoints = Array.from(normalized)
  if (codePoints.length <= maxCodePoints) return normalized
  if (maxCodePoints === 1) return ELLIPSIS

  return `${codePoints.slice(0, maxCodePoints - 1).join('').trimEnd()}${ELLIPSIS}`
}

/**
 * Cleans user-visible labels before they enter a share payload. URLs and
 * common opaque identifier/token/account-number shapes are removed even if a
 * caller accidentally places one in a display label.
 */
export function cleanShareLabel(
  value: string | undefined,
  maxCodePoints: number,
  fallback = '',
): string {
  const processingLimit = Math.max(maxCodePoints * 8, maxCodePoints)
  const bounded = (value ?? '').slice(0, processingLimit)
  const cleaned = removeUnsafeControls(toWellFormedUnicode(bounded).normalize('NFC'))
    .replace(URL_PATTERN, '[link removed]')
    .replace(JWT_PATTERN, '[private value removed]')
    .replace(UUID_PATTERN, '[private value removed]')
    .replace(OBJECT_ID_PATTERN, '[private value removed]')
    .replace(LONG_SECRET_PATTERN, '[private value removed]')
    .replace(ACCOUNT_NUMBER_PATTERN, '[private value removed]')
    .replace(/\s+/gu, ' ')
    .trim()

  return truncateUnicode(cleaned || fallback, maxCodePoints)
}

export function humanizeShareLabel(
  value: string | undefined,
  fallback: string,
  maxCodePoints = 60,
): string {
  const cleaned = cleanShareLabel(value?.replaceAll('_', ' '), maxCodePoints)
  if (!cleaned) return fallback

  return cleaned.charAt(0).toLocaleUpperCase('en') + cleaned.slice(1)
}
