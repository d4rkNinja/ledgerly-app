import { beforeEach, describe, expect, it, vi } from 'vitest'

const coreMocks = vi.hoisted(() => ({
  getPlatform: vi.fn(),
  isNativePlatform: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: coreMocks.getPlatform,
    isNativePlatform: coreMocks.isNativePlatform,
  },
}))

import { isNativeAndroid, isNativePlatform } from './runtime'

describe('runtime detection', () => {
  beforeEach(() => {
    coreMocks.getPlatform.mockReturnValue('web')
    coreMocks.isNativePlatform.mockReturnValue(false)
  })

  it('reports Capacitor native runtime state', () => {
    coreMocks.isNativePlatform.mockReturnValue(true)

    expect(isNativePlatform()).toBe(true)
  })

  it('reports Android only for a native Android runtime', () => {
    coreMocks.isNativePlatform.mockReturnValue(true)
    coreMocks.getPlatform.mockReturnValue('android')

    expect(isNativeAndroid()).toBe(true)

    coreMocks.getPlatform.mockReturnValue('ios')
    expect(isNativeAndroid()).toBe(false)

    coreMocks.isNativePlatform.mockReturnValue(false)
    coreMocks.getPlatform.mockReturnValue('android')
    expect(isNativeAndroid()).toBe(false)
  })
})
