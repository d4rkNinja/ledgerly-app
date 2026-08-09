import { describe, expect, it } from 'vitest'
import {
  decideBackAction,
  type BackInput,
} from './back-navigation'

const baseInput: BackInput = {
  pathname: '/app/transactions',
  search: '',
  hash: '',
  state: null,
  isAuthenticated: true,
  canGoBack: false,
  browserHistoryIndex: 0,
}

describe('Android back policy', () => {
  it('removes every URL modal key while preserving ordered repeated parameters, hash, state, and replacement', () => {
    const state = { source: 'review', nested: { stable: true } }

    expect(
      decideBackAction({
        ...baseInput,
        search:
          '?tag=one&add=expense&filter=pending&tag=two&claim=abc&add=income&empty=',
        hash: '#review-anchor',
        state,
        canGoBack: true,
      }),
    ).toEqual({
      type: 'replace-location',
      location: {
        pathname: '/app/transactions',
        search: '?tag=one&filter=pending&tag=two&empty=',
        hash: '#review-anchor',
      },
      state,
      replace: true,
    })
  })

  it.each([
    ['?add=expense', '?'],
    ['?claim=request', '?'],
    ['?add=expense&claim=request', '?'],
  ])('strips modal search %s before usable history', (search) => {
    expect(
      decideBackAction({
        ...baseInput,
        search,
        canGoBack: true,
      }),
    ).toMatchObject({
      type: 'replace-location',
      location: { search: '' },
      replace: true,
    })
  })

  it('treats the native canGoBack value as authoritative', () => {
    expect(
      decideBackAction({
        ...baseInput,
        canGoBack: true,
        browserHistoryIndex: 0,
      }),
    ).toEqual({ type: 'history-back' })

    expect(
      decideBackAction({
        ...baseInput,
        canGoBack: false,
        browserHistoryIndex: 9,
      }),
    ).toEqual({
      type: 'replace-root',
      pathname: '/app/home',
      replace: true,
    })
  })

  it.each([1, 4])(
    'uses a guarded browser history index fallback when native history is unavailable',
    (browserHistoryIndex) => {
      expect(
        decideBackAction({
          ...baseInput,
          canGoBack: undefined,
          browserHistoryIndex,
        }),
      ).toEqual({ type: 'history-back' })
    },
  )

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 1.5, undefined])(
    'does not trust an unusable browser history index %s',
    (browserHistoryIndex) => {
      expect(
        decideBackAction({
          ...baseInput,
          canGoBack: undefined,
          browserHistoryIndex,
        }),
      ).toEqual({
        type: 'replace-root',
        pathname: '/app/home',
        replace: true,
      })
    },
  )

  it.each([
    ['/', false],
    ['/', true],
    ['/login', false],
    ['/login', true],
    ['/app/home', true],
  ] as const)('exits at approved no-history root %s', (pathname, isAuthenticated) => {
    expect(
      decideBackAction({
        ...baseInput,
        pathname,
        isAuthenticated,
      }),
    ).toEqual({ type: 'exit-app' })
  })

  it('does not treat unauthenticated app home as an exit root', () => {
    expect(
      decideBackAction({
        ...baseInput,
        pathname: '/app/home',
        isAuthenticated: false,
      }),
    ).toEqual({
      type: 'replace-root',
      pathname: '/',
      replace: true,
    })
  })

  it.each([
    ['/app/transactions', true, '/app/home'],
    ['/forgot-password', true, '/app/home'],
    ['/app/transactions', false, '/'],
    ['/forgot-password', false, '/'],
    ['/login/', false, '/'],
    ['/app/home/', true, '/app/home'],
  ] as const)(
    'replace-navigates non-root %s instead of exiting',
    (pathname, isAuthenticated, expectedRoot) => {
      const action = decideBackAction({
        ...baseInput,
        pathname,
        isAuthenticated,
      })

      expect(action).toEqual({
        type: 'replace-root',
        pathname: expectedRoot,
        replace: true,
      })
      expect(action.type).not.toBe('exit-app')
    },
  )

  it('navigates usable history before exiting even on an approved root', () => {
    expect(
      decideBackAction({
        ...baseInput,
        pathname: '/',
        isAuthenticated: false,
        canGoBack: true,
      }),
    ).toEqual({ type: 'history-back' })
  })
})
