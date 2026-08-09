import { act, cleanup, render, screen } from '@testing-library/react'
import { createElement, StrictMode } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getNativeAppState,
  getNativeAppStateServerSnapshot,
  publishNativeKeyboardState,
  publishNetworkState,
  subscribeNativeAppState,
  useNativeAppState,
} from './native-app-state'

function StateProbe() {
  const state = useNativeAppState()
  return createElement(
    'output',
    { 'aria-label': 'native state' },
    `${state.network.connected}:${state.nativeKeyboard?.height ?? 'browser'}`,
  )
}

describe('native app state store', () => {
  afterEach(() => {
    cleanup()
    publishNetworkState({ connected: true, connectionType: 'unknown' })
    publishNativeKeyboardState(null)
  })

  it('publishes deeply frozen snapshots only when values change', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeNativeAppState(listener)
    const initial = getNativeAppState()

    expect(Object.isFrozen(initial)).toBe(true)
    expect(Object.isFrozen(initial.network)).toBe(true)
    expect(initial.nativeKeyboard).toBeNull()

    publishNetworkState({ connected: false, connectionType: 'none' })
    const offline = getNativeAppState()
    expect(offline).not.toBe(initial)
    expect(offline.network).toEqual({
      connected: false,
      connectionType: 'none',
    })
    expect(listener).toHaveBeenCalledOnce()

    publishNetworkState({ connected: false, connectionType: 'none' })
    expect(getNativeAppState()).toBe(offline)
    expect(listener).toHaveBeenCalledOnce()

    publishNativeKeyboardState({ open: true, height: 240 })
    const keyboardOpen = getNativeAppState()
    expect(keyboardOpen.nativeKeyboard).toEqual({ open: true, height: 240 })
    expect(Object.isFrozen(keyboardOpen.nativeKeyboard)).toBe(true)
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    publishNativeKeyboardState(null)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('returns one stable deeply frozen server snapshot with nullable keyboard', () => {
    const first = getNativeAppStateServerSnapshot()
    const second = getNativeAppStateServerSnapshot()

    expect(first).toBe(second)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.network)).toBe(true)
    expect(first.nativeKeyboard).toBeNull()
  })

  it('uses the stable server snapshot during SSR and the live snapshot in jsdom', () => {
    publishNetworkState({ connected: false, connectionType: 'none' })

    expect(renderToString(createElement(StateProbe))).toContain('true:browser')

    render(createElement(StateProbe))
    expect(screen.getByLabelText('native state')).toHaveTextContent(
      'false:browser',
    )
  })

  it('subscribes cleanly through Strict Mode mount and unmount', () => {
    const view = render(
      createElement(StrictMode, null, createElement(StateProbe)),
    )

    act(() => publishNativeKeyboardState({ open: false, height: 0 }))
    expect(screen.getByLabelText('native state')).toHaveTextContent('true:0')

    view.unmount()
    expect(() =>
      publishNativeKeyboardState({ open: true, height: 100 }),
    ).not.toThrow()
  })
})
