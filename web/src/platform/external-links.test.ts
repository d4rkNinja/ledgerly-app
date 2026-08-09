import { beforeEach, describe, expect, it, vi } from 'vitest'

const browserMocks = vi.hoisted(() => ({
  open: vi.fn(),
}))

const runtimeMocks = vi.hoisted(() => ({
  isNativeAndroid: vi.fn(),
}))

vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: browserMocks.open,
  },
}))

vi.mock('./runtime', () => ({
  isNativeAndroid: runtimeMocks.isNativeAndroid,
}))

import { openExternalUrl, parseExternalUrl } from './external-links'

describe('external URL validation', () => {
  beforeEach(() => {
    browserMocks.open.mockResolvedValue(undefined)
    runtimeMocks.isNativeAndroid.mockReturnValue(false)
  })

  it.each([
    ['https://example.com/path', 'https://example.com/path'],
    ['https://wa.me/919999999999', 'https://wa.me/919999999999'],
    ['https://EXAMPLE.com:443/a?b=1#c', 'https://example.com/a?b=1#c'],
  ])('returns a frozen normalized value for public HTTPS %s', (raw, href) => {
    const parsed = parseExternalUrl(raw)

    expect(parsed).toEqual({ href })
    expect(Object.isFrozen(parsed)).toBe(true)
  })

  it.each([
    'http://example.com',
    'https://user:secret@example.com',
    'not a URL',
    'javascript:alert(1)',
    'data:text/plain,hello',
    'file:///tmp/report',
    'mailto:hello@example.com',
    'tel:+919999999999',
    '//example.com/path',
    ' https://example.com',
    'https://example.com ',
    'https://exa mple.com',
    'https:\\example.com',
    'https://example.com\\path',
    'https://example.com/\u00a0path',
    "https://example.com/\u0000path",
    'https://localhost',
    'https://localhost.',
    'https://api.localhost',
    'https://127.0.0.1',
    'https://127.1',
    'https://2130706433',
    'https://0177.0.0.1',
    'https://0x7f000001',
    'https://10.0.0.1',
    'https://100.64.0.1',
    'https://169.254.1.1',
    'https://172.16.0.1',
    'https://192.168.0.1',
    'https://[::1]',
    'https://[fc00::1]',
    'https://[fe80::1]',
    'https://[::ffff:127.0.0.1]',
    'https://printer.local',
    'https://service.internal',
    'https://router.home.arpa',
    'https://home.arpa',
    'https://[64:ff9b::7f00:1]',
    'https://[64:ff9b::a00:1]',
    'https://[64:ff9b::a9fe:101]',
    'https://[64:ff9b::127.0.0.1]',
    'https://[0064:ff9b:0000:0000:0000:0000:7f00:0001]',
    'https://[64:ff9b:1::7f00:1]',
    'https://[0064:ff9b:0001:0000:0000:0000:7f00:0001]',
    'https://[2002:7f00:1::]',
    'https://evil.wa.me',
    'https://wa.me.evil.example',
  ])('rejects unsafe external URL %s', (raw) => {
    expect(() => parseExternalUrl(raw)).toThrow('Unsafe external URL')
  })

  it('accepts a normalized WhatsApp URL exactly 4096 characters long', () => {
    const prefix = 'https://wa.me/?text='
    const raw = `${prefix}${'a'.repeat(4_096 - prefix.length)}`

    const parsed = parseExternalUrl(raw)

    expect(parsed.href).toBe(raw)
    expect(parsed.href).toHaveLength(4_096)
  })

  it('rejects a URL over the 4096-character share ceiling', () => {
    const prefix = 'https://wa.me/?text='
    const raw = `${prefix}${'a'.repeat(4_097 - prefix.length)}`

    expect(() => parseExternalUrl(raw)).toThrow('Unsafe external URL')
  })
})

describe('external URL opening', () => {
  beforeEach(() => {
    browserMocks.open.mockResolvedValue(undefined)
    runtimeMocks.isNativeAndroid.mockReturnValue(false)
  })

  it('opens only the normalized URL with the native Browser plugin', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)

    await openExternalUrl('https://EXAMPLE.com:443/path')

    expect(browserMocks.open).toHaveBeenCalledWith({
      url: 'https://example.com/path',
    })
  })

  it('uses the exact hardened window.open browser fallback', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)

    await openExternalUrl('https://example.com/path')

    expect(open).toHaveBeenCalledWith(
      'https://example.com/path',
      '_blank',
      'noopener,noreferrer',
    )
    expect(browserMocks.open).not.toHaveBeenCalled()
  })

  it('contains a native Browser plugin failure', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    browserMocks.open.mockRejectedValue(new Error('unsupported'))

    await expect(
      openExternalUrl('https://example.com/path'),
    ).resolves.toBeUndefined()
  })

  it('does not suppress URL validation errors', async () => {
    await expect(openExternalUrl('javascript:alert(1)')).rejects.toThrow(
      'Unsafe external URL',
    )
    expect(browserMocks.open).not.toHaveBeenCalled()
  })
})
