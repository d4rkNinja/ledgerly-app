import { beforeEach, describe, expect, it, vi } from 'vitest'

const keyboardMocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  hideRemove: vi.fn(),
  showRemove: vi.fn(),
}))

const runtimeMocks = vi.hoisted(() => ({
  isNativeAndroid: vi.fn(),
}))

vi.mock('@capacitor/keyboard', () => ({
  Keyboard: {
    addListener: keyboardMocks.addListener,
  },
}))

vi.mock('./runtime', () => ({
  isNativeAndroid: runtimeMocks.isNativeAndroid,
}))

import type { KeyboardState } from './keyboard'
import { resetNativeKeyboardState, subscribeKeyboard } from './keyboard'
function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('keyboard subscription', () => {
  let showListener: ((info: { keyboardHeight: number }) => void) | undefined
  let hideListener: (() => void) | undefined

  beforeEach(() => {
    showListener = undefined
    hideListener = undefined
    runtimeMocks.isNativeAndroid.mockReturnValue(true)
    keyboardMocks.showRemove.mockResolvedValue(undefined)
    keyboardMocks.hideRemove.mockResolvedValue(undefined)
    keyboardMocks.addListener.mockImplementation(
      async (eventName: string, listener: (...args: never[]) => void) => {
        if (eventName === 'keyboardWillShow') {
          showListener = listener as (info: { keyboardHeight: number }) => void
          return { remove: keyboardMocks.showRemove }
        }
        hideListener = listener
        return { remove: keyboardMocks.hideRemove }
      },
    )
    document.documentElement.removeAttribute('data-keyboard-open')
    document.documentElement.style.removeProperty('--keyboard-height')
  })

  it('publishes native Android show and hide state to the listener and DOM', async () => {
    const states: KeyboardState[] = []
    const cleanup = await subscribeKeyboard((state) => states.push(state))

    expect(states).toEqual([{ open: false, height: 0 }])
    showListener?.({ keyboardHeight: 284.5 })
    expect(states.at(-1)).toEqual({ open: true, height: 284.5 })
    expect(document.documentElement).toHaveAttribute(
      'data-keyboard-open',
      'true',
    )
    expect(
      document.documentElement.style.getPropertyValue('--keyboard-height'),
    ).toBe('284.5px')

    hideListener?.()
    expect(states.at(-1)).toEqual({ open: false, height: 0 })
    expect(document.documentElement).toHaveAttribute(
      'data-keyboard-open',
      'false',
    )
    expect(
      document.documentElement.style.getPropertyValue('--keyboard-height'),
    ).toBe('0px')

    await cleanup()
  })

  it.each([-20, Number.NaN, Number.POSITIVE_INFINITY])(
    'sanitizes an invalid native keyboard height %s',
    async (keyboardHeight) => {
      await subscribeKeyboard(() => undefined)

      showListener?.({ keyboardHeight })

      expect(
        document.documentElement.style.getPropertyValue('--keyboard-height'),
      ).toBe('0px')
    },
  )

  it('leaves browser markers absent for the visualViewport fallback', async () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(false)
    const listener = vi.fn()

    const cleanup = await subscribeKeyboard(listener)

    expect(listener).not.toHaveBeenCalled()
    expect(keyboardMocks.addListener).not.toHaveBeenCalled()
    expect(document.documentElement).not.toHaveAttribute('data-keyboard-open')
    expect(
      document.documentElement.style.getPropertyValue('--keyboard-height'),
    ).toBe('')
    await cleanup()
  })

  it('removes both native handles and DOM markers with idempotent cleanup', async () => {
    keyboardMocks.showRemove.mockRejectedValue(new Error('already removed'))
    const cleanup = await subscribeKeyboard(() => undefined)
    showListener?.({ keyboardHeight: 200 })

    await expect(cleanup()).resolves.toBeUndefined()
    await expect(cleanup()).resolves.toBeUndefined()

    expect(keyboardMocks.showRemove).toHaveBeenCalledOnce()
    expect(keyboardMocks.hideRemove).toHaveBeenCalledOnce()
    expect(document.documentElement).not.toHaveAttribute('data-keyboard-open')
    expect(
      document.documentElement.style.getPropertyValue('--keyboard-height'),
    ).toBe('')
  })

  it('ignores plugin callbacks while handle removal is pending and afterward', async () => {
    const pendingRemoval = createDeferred<void>()
    keyboardMocks.showRemove.mockReturnValue(pendingRemoval.promise)
    const states: KeyboardState[] = []
    const cleanup = await subscribeKeyboard((state) => states.push(state))

    const cleaning = cleanup()
    showListener?.({ keyboardHeight: 240 })

    expect(states).toEqual([{ open: false, height: 0 }])
    expect(document.documentElement).not.toHaveAttribute('data-keyboard-open')
    expect(
      document.documentElement.style.getPropertyValue('--keyboard-height'),
    ).toBe('')

    pendingRemoval.resolve()
    await cleaning
    hideListener?.()

    expect(states).toEqual([{ open: false, height: 0 }])
    expect(document.documentElement).not.toHaveAttribute('data-keyboard-open')
    expect(
      document.documentElement.style.getPropertyValue('--keyboard-height'),
    ).toBe('')
  })

  it('cleans partial listeners and markers when plugin setup fails', async () => {
    keyboardMocks.addListener.mockImplementation(
      async (eventName: string) => {
        if (eventName === 'keyboardWillShow') {
          return { remove: keyboardMocks.showRemove }
        }
        throw new Error('unsupported')
      },
    )

    const cleanup = await subscribeKeyboard(() => undefined)

    expect(keyboardMocks.showRemove).toHaveBeenCalledOnce()
    expect(document.documentElement).not.toHaveAttribute('data-keyboard-open')
    expect(
      document.documentElement.style.getPropertyValue('--keyboard-height'),
    ).toBe('')
    await expect(cleanup()).resolves.toBeUndefined()
  })

  it('resets native Android DOM state without registering listeners', () => {
    document.documentElement.dataset.keyboardOpen = 'true'
    document.documentElement.style.setProperty('--keyboard-height', '200px')

    resetNativeKeyboardState()

    expect(document.documentElement).toHaveAttribute(
      'data-keyboard-open',
      'false',
    )
    expect(
      document.documentElement.style.getPropertyValue('--keyboard-height'),
    ).toBe('0px')
    expect(keyboardMocks.addListener).not.toHaveBeenCalled()
  })

  it('keeps browser keyboard markers absent without registering listeners', () => {
    runtimeMocks.isNativeAndroid.mockReturnValue(false)
    document.documentElement.dataset.keyboardOpen = 'true'
    document.documentElement.style.setProperty('--keyboard-height', '200px')

    resetNativeKeyboardState()

    expect(document.documentElement).not.toHaveAttribute('data-keyboard-open')
    expect(
      document.documentElement.style.getPropertyValue('--keyboard-height'),
    ).toBe('')
    expect(keyboardMocks.addListener).not.toHaveBeenCalled()
  })

  it('aborts partial native registration and removes handles that resolve later', async () => {
    const showRegistration = createDeferred<{
      remove: typeof keyboardMocks.showRemove
    }>()
    const hideRegistration = createDeferred<{
      remove: typeof keyboardMocks.hideRemove
    }>()
    keyboardMocks.addListener.mockImplementation(
      (eventName: string, listener: (...args: never[]) => void) => {
        if (eventName === 'keyboardWillShow') {
          showListener = listener as (
            info: { keyboardHeight: number },
          ) => void
          return showRegistration.promise
        }
        hideListener = listener
        return hideRegistration.promise
      },
    )
    const controller = new AbortController()
    const states: KeyboardState[] = []
    const subscription = subscribeKeyboard(
      (state) => states.push(state),
      { signal: controller.signal },
    )

    showRegistration.resolve({ remove: keyboardMocks.showRemove })
    await Promise.resolve()
    await Promise.resolve()
    showListener?.({ keyboardHeight: 220 })
    expect(document.documentElement).toHaveAttribute(
      'data-keyboard-open',
      'true',
    )

    controller.abort()
    expect(keyboardMocks.showRemove).toHaveBeenCalledOnce()
    expect(document.documentElement).not.toHaveAttribute(
      'data-keyboard-open',
    )
    expect(
      document.documentElement.style.getPropertyValue('--keyboard-height'),
    ).toBe('')
    const stateCountAfterAbort = states.length

    showListener?.({ keyboardHeight: 300 })
    hideListener?.()
    expect(states).toHaveLength(stateCountAfterAbort)
    expect(document.documentElement).not.toHaveAttribute(
      'data-keyboard-open',
    )

    hideRegistration.resolve({ remove: keyboardMocks.hideRemove })
    const cleanup = await subscription

    expect(keyboardMocks.hideRemove).toHaveBeenCalledOnce()
    await cleanup()
    expect(keyboardMocks.showRemove).toHaveBeenCalledOnce()
    expect(keyboardMocks.hideRemove).toHaveBeenCalledOnce()
  })
})
