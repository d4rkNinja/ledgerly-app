import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildMonthlySummarySharePayload,
  createSafePublicUrl,
} from '@/lib/share'

const externalLinkMocks = vi.hoisted(() => ({
  openExternalUrl: vi.fn(),
}))

vi.mock('@/platform/external-links', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/platform/external-links')>()
  return {
    ...original,
    openExternalUrl: externalLinkMocks.openExternalUrl,
  }
})

import {
  createWhatsAppShareLink,
  deliverWhatsAppUrl,
  shareToWhatsApp,
} from './whatsapp'

describe('WhatsApp sharing', () => {
  beforeEach(() => {
    externalLinkMocks.openExternalUrl.mockResolvedValue(undefined)
  })

  it('keeps Unicode intact and bounds the encoded URL at 4096 characters', () => {
    const base = buildMonthlySummarySharePayload({
      period: { year: 2026, month: 7 },
      income: { amountMinor: 10_000, currency: 'INR' },
      spending: { amountMinor: 5_000, currency: 'INR' },
    })
    const result = createWhatsAppShareLink({
      ...base,
      title: 'Quarterly summary ðŸŒ±',
      text: 'ðŸ’¸'.repeat(3_000),
      url: createSafePublicUrl('https://ledgerly.example/share/one')!,
    })

    expect(result.url.length).toBeLessThanOrEqual(4_096)
    expect(Array.from(result.text).at(-1)).not.toBe('\ud83d')
    expect(result.text.includes('https://ledgerly.example/share/one')).toBe(
      true,
    )
  })

  it('awaits opening the exact validated wa.me URL', async () => {
    let release!: () => void
    externalLinkMocks.openExternalUrl.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )

    let settled = false
    const payload = buildMonthlySummarySharePayload({
      period: { year: 2026, month: 7 },
      income: { amountMinor: 10_000, currency: 'INR' },
      spending: { amountMinor: 5_000, currency: 'INR' },
    })
    const link = createWhatsAppShareLink(payload)
    const delivery = shareToWhatsApp(payload).then((result) => {
      settled = true
      return result
    })

    expect(externalLinkMocks.openExternalUrl).toHaveBeenCalledExactlyOnceWith(
      link.url,
    )
    await Promise.resolve()
    expect(settled).toBe(false)

    release()
    const result = await delivery
    expect(result.launchAttempted).toBe(true)
  })

  it('rejects an altered WhatsApp host before invoking an injected delivery seam', async () => {
    const open = vi.fn().mockResolvedValue(undefined)

    await expect(
      deliverWhatsAppUrl('https://evil.wa.me/?text=hello', open),
    ).rejects.toThrow('Unsafe')
    expect(open).not.toHaveBeenCalled()
  })
})
