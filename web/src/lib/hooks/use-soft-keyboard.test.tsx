import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSoftKeyboard } from './use-soft-keyboard'

class VisualViewportStub extends EventTarget {
  height = 800
  offsetTop = 0
}

describe('useSoftKeyboard', () => {
  let viewport: VisualViewportStub

  beforeEach(() => {
    viewport = new VisualViewportStub()
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800,
    })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now())
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('treats a non-null native keyboard state as authoritative without fallback listeners', () => {
    const add = vi.spyOn(viewport, 'addEventListener')

    const { result } = renderHook(() =>
      useSoftKeyboard({ open: true, height: 280 }),
    )

    expect(result.current).toBe(true)
    expect(add).not.toHaveBeenCalled()
  })

  it('uses visualViewport only while native keyboard state is unavailable and cleans it on switch', () => {
    const add = vi.spyOn(viewport, 'addEventListener')
    const remove = vi.spyOn(viewport, 'removeEventListener')
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    viewport.height = 500

    const { result, rerender } = renderHook(
      ({ nativeKeyboard }) => useSoftKeyboard(nativeKeyboard),
      { initialProps: { nativeKeyboard: null as { open: boolean; height: number } | null } },
    )

    expect(result.current).toBe(true)
    expect(add).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(add).toHaveBeenCalledWith('scroll', expect.any(Function))

    act(() => rerender({ nativeKeyboard: { open: false, height: 0 } }))

    expect(result.current).toBe(false)
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
  })
})
