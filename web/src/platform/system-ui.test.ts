import { beforeEach, describe, expect, it, vi } from 'vitest'

const coreMocks = vi.hoisted(() => ({
  getPlatform: vi.fn(),
  isNativePlatform: vi.fn(),
  setStyle: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: coreMocks.getPlatform,
    isNativePlatform: coreMocks.isNativePlatform,
  },
  SystemBars: {
    setStyle: coreMocks.setStyle,
  },
  SystemBarType: {
    NavigationBar: 'NavigationBar',
    StatusBar: 'StatusBar',
  },
  SystemBarsStyle: {
    Dark: 'DARK',
    Light: 'LIGHT',
  },
}))

import { syncSystemBars } from './system-ui'

describe('system bar synchronization', () => {
  beforeEach(() => {
    coreMocks.getPlatform.mockReturnValue('android')
    coreMocks.isNativePlatform.mockReturnValue(true)
    coreMocks.setStyle.mockResolvedValue(undefined)
  })

  it.each([
    ['light', 'LIGHT'],
    ['dark', 'DARK'],
  ] as const)('maps the %s theme to both Android system bars', async (theme, style) => {
    await syncSystemBars(theme)

    expect(coreMocks.setStyle).toHaveBeenCalledTimes(2)
    expect(coreMocks.setStyle).toHaveBeenCalledWith({
      bar: 'StatusBar',
      style,
    })
    expect(coreMocks.setStyle).toHaveBeenCalledWith({
      bar: 'NavigationBar',
      style,
    })
  })

  it('does not call SystemBars in a browser runtime', async () => {
    coreMocks.isNativePlatform.mockReturnValue(false)
    coreMocks.getPlatform.mockReturnValue('web')

    await syncSystemBars('dark')

    expect(coreMocks.setStyle).not.toHaveBeenCalled()
  })

  it('contains aggregate SystemBars failure after attempting both bars', async () => {
    coreMocks.setStyle.mockImplementation(({ bar }: { bar: string }) =>
      bar === 'StatusBar'
        ? Promise.reject(new Error('unsupported'))
        : Promise.resolve(),
    )

    await expect(syncSystemBars('light')).resolves.toBeUndefined()
    expect(coreMocks.setStyle).toHaveBeenCalledTimes(2)
  })
})
