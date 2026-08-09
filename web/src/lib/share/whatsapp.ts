import { composeShareText } from './delivery'
import { truncateUnicode, unicodeLength } from './text'
import type { SharePayload } from './types'
import { openExternalUrl, parseExternalUrl } from '@/platform/external-links'

const WHATSAPP_BASE_URL = 'https://wa.me/?text='

export const MAX_WHATSAPP_TEXT_CODE_POINTS = 1_600
export const MAX_WHATSAPP_URL_LENGTH = 4_096

export interface WhatsAppShareLink {
  url: string
  text: string
  truncated: boolean
}

export interface WhatsAppShareOptions {
  maxTextCodePoints?: number
  maxUrlLength?: number
}

export interface WhatsAppShareResult extends WhatsAppShareLink {
  launchAttempted: boolean
}

function boundedLimit(
  requested: number | undefined,
  maximum: number,
  minimum: number,
): number {
  if (!Number.isFinite(requested)) return maximum
  return Math.min(maximum, Math.max(minimum, Math.floor(requested ?? maximum)))
}

function fitEncodedText(
  source: string,
  maxTextCodePoints: number,
  maxEncodedLength: number,
): string {
  const capped = truncateUnicode(source, maxTextCodePoints)
  if (encodeURIComponent(capped).length <= maxEncodedLength) return capped

  const codePoints = Array.from(capped)
  let low = 0
  let high = codePoints.length
  let best = ''

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const prefix = codePoints.slice(0, middle).join('').trimEnd()
    const candidate = prefix ? `${prefix}…` : ''

    if (encodeURIComponent(candidate).length <= maxEncodedLength) {
      best = candidate
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  return best
}

function fitWhatsAppText(
  payload: SharePayload,
  maxTextCodePoints: number,
  maxEncodedLength: number,
): string {
  const body = [payload.title, payload.text].filter(Boolean).join('\n\n')
  if (!payload.url) {
    return fitEncodedText(body, maxTextCodePoints, maxEncodedLength)
  }

  // A public URL is kept whole or omitted; it is never cut into a broken,
  // potentially misleading partial link.
  const urlSuffix = `\n\n${payload.url}`
  const suffixCodePoints = unicodeLength(urlSuffix)
  const suffixEncodedLength = encodeURIComponent(urlSuffix).length

  if (
    suffixCodePoints <= maxTextCodePoints &&
    suffixEncodedLength <= maxEncodedLength
  ) {
    const fittedBody = fitEncodedText(
      body,
      maxTextCodePoints - suffixCodePoints,
      maxEncodedLength - suffixEncodedLength,
    )
    return fittedBody ? `${fittedBody}${urlSuffix}` : payload.url
  }

  return fitEncodedText(body, maxTextCodePoints, maxEncodedLength)
}

export function createWhatsAppShareLink(
  payload: SharePayload,
  options: WhatsAppShareOptions = {},
): WhatsAppShareLink {
  const maxTextCodePoints = boundedLimit(
    options.maxTextCodePoints,
    MAX_WHATSAPP_TEXT_CODE_POINTS,
    1,
  )
  const maxUrlLength = boundedLimit(
    options.maxUrlLength,
    MAX_WHATSAPP_URL_LENGTH,
    WHATSAPP_BASE_URL.length,
  )
  const source = composeShareText(payload)
  const text = fitWhatsAppText(
    payload,
    maxTextCodePoints,
    Math.max(0, maxUrlLength - WHATSAPP_BASE_URL.length),
  )
  const url = `${WHATSAPP_BASE_URL}${encodeURIComponent(text)}`

  return {
    url,
    text,
    truncated: text !== source || unicodeLength(source) > maxTextCodePoints,
  }
}

export function buildWhatsAppShareUrl(
  payload: SharePayload,
  options: WhatsAppShareOptions = {},
): string {
  return createWhatsAppShareLink(payload, options).url
}

/**
 * Opens WhatsApp's universal deep link and returns the exact bounded link/text
 * for observability and deterministic tests.
 */
export async function deliverWhatsAppUrl(
  raw: string,
  open: (url: string) => Promise<void> = openExternalUrl,
): Promise<void> {
  const { href } = parseExternalUrl(raw)
  const parsed = new URL(href)
  if (parsed.hostname !== 'wa.me' || parsed.protocol !== 'https:') {
    throw new Error('Unsafe WhatsApp URL')
  }
  await open(href)
}

export async function shareToWhatsApp(
  payload: SharePayload,
  options: WhatsAppShareOptions = {},
): Promise<WhatsAppShareResult> {
  const link = createWhatsAppShareLink(payload, options)
  await deliverWhatsAppUrl(link.url)
  return { ...link, launchAttempted: true }
}
