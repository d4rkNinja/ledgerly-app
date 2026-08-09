export interface BackInput {
  readonly pathname: string
  readonly search: string
  readonly hash: string
  readonly state: unknown
  readonly isAuthenticated: boolean
  readonly canGoBack?: boolean
  readonly browserHistoryIndex?: number
}

export type BackAction =
  | {
      readonly type: 'replace-location'
      readonly location: {
        readonly pathname: string
        readonly search: string
        readonly hash: string
      }
      readonly state: unknown
      readonly replace: true
    }
  | { readonly type: 'history-back' }
  | {
      readonly type: 'replace-root'
      readonly pathname: '/' | '/app/home'
      readonly replace: true
    }
  | { readonly type: 'exit-app' }

const MODAL_KEYS = new Set(['add', 'claim'])

function decodedQueryKey(segment: string): string {
  const separator = segment.indexOf('=')
  const rawKey = separator === -1 ? segment : segment.slice(0, separator)
  try {
    return decodeURIComponent(rawKey.replaceAll('+', ' '))
  } catch {
    return rawKey
  }
}

function removeModalSearch(search: string): string | null {
  const rawSearch = search.startsWith('?') ? search.slice(1) : search
  if (!rawSearch) return null

  let removed = false
  const preserved = rawSearch.split('&').filter((segment) => {
    if (!MODAL_KEYS.has(decodedQueryKey(segment))) return true
    removed = true
    return false
  })

  if (!removed) return null
  return preserved.length > 0 ? `?${preserved.join('&')}` : ''
}

function hasUsableHistory({
  canGoBack,
  browserHistoryIndex,
}: BackInput): boolean {
  if (typeof canGoBack === 'boolean') return canGoBack
  return (
    Number.isInteger(browserHistoryIndex) &&
    (browserHistoryIndex ?? 0) > 0
  )
}

export function decideBackAction(input: BackInput): BackAction {
  const modalFreeSearch = removeModalSearch(input.search)
  if (modalFreeSearch !== null) {
    return {
      type: 'replace-location',
      location: {
        pathname: input.pathname,
        search: modalFreeSearch,
        hash: input.hash,
      },
      state: input.state,
      replace: true,
    }
  }

  if (hasUsableHistory(input)) return { type: 'history-back' }

  const isExitRoot =
    input.pathname === '/' ||
    input.pathname === '/login' ||
    (input.pathname === '/app/home' && input.isAuthenticated)
  if (isExitRoot) return { type: 'exit-app' }

  return {
    type: 'replace-root',
    pathname: input.isAuthenticated ? '/app/home' : '/',
    replace: true,
  }
}
