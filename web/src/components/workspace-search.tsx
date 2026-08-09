import { useQuery } from '@tanstack/react-query'
import {
  LoaderCircle,
  ReceiptText,
  Search,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { BottomSheet } from '@/components/motion/bottom-sheet'
import { api } from '@/lib/api-client'
import { EASE_OUT } from '@/lib/ease'
import { formatMoney } from '@/lib/format'
import { isolateBodySiblings } from '@/lib/modal-isolation'
import { registerBackLayer } from '@/platform/back-layer-stack'
import './workspace-search.css'

const SEARCH_DEBOUNCE_MS = 250
const SEARCH_MIN_CHARACTERS = 2
const SEARCH_MAX_CHARACTERS = 100

type SearchRecord = Record<string, unknown>

type WorkspaceSearchResponse = {
  transactions: SearchRecord[]
  accounts: SearchRecord[]
}

type SearchOption = {
  id: string
  label: string
  description?: string
  trailing?: string
  icon?: LucideIcon
  onSelect: () => void
}

type SearchGroup = {
  label: string
  options: SearchOption[]
}

export type WorkspaceSearchPage = {
  id: string
  label: string
  group: string
  keywords?: string[]
  icon?: LucideIcon
  onSelect: () => void
}

type WorkspaceSearchProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mobile: boolean
  workspaceId: string
  workspaceName: string
  workspaceSearchAvailable: boolean
  demoMode: boolean
  concealAmounts: boolean
  canViewBalances: boolean
  pages: WorkspaceSearchPage[]
  onNavigate: (to: string) => void
}

const emptySearchResponse = (): WorkspaceSearchResponse => ({
  transactions: [],
  accounts: [],
})

function recordArray(value: unknown): SearchRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is SearchRecord =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : []
}

function normalizeSearchResponse(value: unknown): WorkspaceSearchResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return emptySearchResponse()
  }
  const result = value as Record<string, unknown>
  return {
    transactions: recordArray(result.transactions),
    accounts: recordArray(result.accounts),
  }
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function friendlyLabel(value: unknown, fallback: string) {
  const label = stringValue(value)
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\s+/g, ' ')
  if (!label) return fallback
  return label
    .split(' ')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function safeDateLabel(value: unknown) {
  if (typeof value !== 'string' || !value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(navigator.language || 'en-IN', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function moneyLabel(item: SearchRecord, concealed: boolean) {
  const amountMinor = item.amountMinor ?? item.balanceMinor
  const currency = stringValue(item.currency)
  if (typeof amountMinor !== 'number' || !Number.isFinite(amountMinor) || !currency) {
    return ''
  }
  try {
    return formatMoney({ amountMinor, currency }, undefined, concealed)
  } catch {
    return concealed
      ? '••••••'
      : `${currency} ${(amountMinor / 100).toLocaleString()}`
  }
}

function fuzzyMatch(needle: string, haystack: string) {
  if (!needle) return true
  const normalizedNeedle = needle.toLocaleLowerCase()
  const normalizedHaystack = haystack.toLocaleLowerCase()
  let index = 0
  for (const character of normalizedHaystack) {
    if (character === normalizedNeedle[index]) index += 1
    if (index === normalizedNeedle.length) return true
  }
  return false
}

function runeLength(value: string) {
  return Array.from(value).length
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [delay, value])

  return debounced
}

function transactionOption(
  item: SearchRecord,
  index: number,
  concealed: boolean,
  onNavigate: (to: string) => void,
): SearchOption {
  const type = friendlyLabel(item.type, 'Transaction')
  const category = friendlyLabel(item.category, '')
  const label = stringValue(
    item.merchant,
    item.notes,
    item.category,
    type,
  )
  const date = safeDateLabel(item.occurredAt)
  const description = [category || type, date].filter(Boolean).join(' · ')
  return {
    id: `transaction-${stringValue(item.id) || index}`,
    label: label || 'Transaction',
    description,
    trailing: moneyLabel(item, concealed),
    icon: ReceiptText,
    onSelect: () => onNavigate('/app/transactions'),
  }
}

function accountOption(
  item: SearchRecord,
  index: number,
  concealed: boolean,
  showBalance: boolean,
  onNavigate: (to: string) => void,
): SearchOption {
  const status = item.archived === true ? 'Archived' : 'Active'
  return {
    id: `account-${stringValue(item.id) || index}`,
    label: stringValue(item.name) || 'Account',
    description: `${friendlyLabel(item.type, 'Account')} · ${status}`,
    ...(showBalance ? { trailing: moneyLabel(item, concealed) } : {}),
    icon: WalletCards,
    onSelect: () => onNavigate('/app/accounts'),
  }
}

export function WorkspaceSearch({
  open,
  onOpenChange,
  mobile,
  workspaceId,
  workspaceName,
  workspaceSearchAvailable,
  demoMode,
  concealAmounts,
  canViewBalances,
  pages,
  onNavigate,
}: WorkspaceSearchProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onOpenChangeRef = useRef(onOpenChange)
  const listId = useId()
  const reduce = useReducedMotion()
  const normalizedQuery = query.trim()
  const queryLength = runeLength(normalizedQuery)
  const debouncedQuery = useDebouncedValue(
    normalizedQuery,
    SEARCH_DEBOUNCE_MS,
  )
  const debouncedLength = runeLength(debouncedQuery)
  const validSearchLength =
    debouncedLength >= SEARCH_MIN_CHARACTERS &&
    debouncedLength <= SEARCH_MAX_CHARACTERS
  const currentDebouncedQuery = debouncedQuery === normalizedQuery
  const searchEnabled =
    open &&
    workspaceSearchAvailable &&
    validSearchLength &&
    currentDebouncedQuery

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  }, [onOpenChange])

  useEffect(() => {
    if (!open || mobile) return
    return registerBackLayer(() => onOpenChangeRef.current(false))
  }, [mobile, open])


  useEffect(() => {
    setQuery('')
    setActiveIndex(0)
  }, [workspaceId])

  useEffect(() => {
    if (!open) return
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setQuery('')
    setActiveIndex(0)
  }, [open])

  useEffect(() => {
    if (!open) return
    const focusFrame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(focusFrame)
  }, [mobile, open])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLocaleLowerCase() === 'k'
      ) {
        event.preventDefault()
        if (
          !open &&
          document.querySelector(
            '[role="dialog"]:not([aria-hidden="true"]):not([inert])',
          )
        ) {
          return
        }
        onOpenChange(!open)
        return
      }
      if (event.key === 'Escape' && open && !mobile) {
        event.preventDefault()
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [mobile, onOpenChange, open])

  useEffect(() => {
    if (!open || mobile) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobile, open])

  useEffect(() => {
    if (!mounted || !open || mobile) return
    let restoreIsolation = () => {}
    const isolationFrame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      if (overlayRef.current) {
        restoreIsolation = isolateBodySiblings(overlayRef.current)
      }
    })
    return () => {
      cancelAnimationFrame(isolationFrame)
      restoreIsolation()
      previousFocusRef.current?.focus()
    }
  }, [mobile, mounted, open])

  const searchQuery = useQuery({
    queryKey: ['workspace-search', workspaceId, debouncedQuery],
    queryFn: async ({ signal }) =>
      normalizeSearchResponse(
        await api.get<unknown>(
          `/workspaces/${workspaceId}/search?q=${encodeURIComponent(debouncedQuery)}`,
          { signal },
        ),
      ),
    enabled: searchEnabled,
    retry: 1,
    staleTime: 30_000,
  })

  const pageGroups = useMemo<SearchGroup[]>(() => {
    const matchingPages = pages.filter((page) => {
      const fields = [page.label, page.group, ...(page.keywords ?? [])]
      return fields.some((field) => fuzzyMatch(normalizedQuery, field))
    })
    const groups = new Map<string, SearchOption[]>()
    for (const page of matchingPages) {
      const options = groups.get(page.group) ?? []
      options.push({
        id: `page-${page.id}`,
        label: page.label,
        icon: page.icon,
        onSelect: page.onSelect,
      })
      groups.set(page.group, options)
    }
    return Array.from(groups, ([label, options]) => ({ label, options }))
  }, [normalizedQuery, pages])

  const response =
    currentDebouncedQuery && searchQuery.data
      ? searchQuery.data
      : emptySearchResponse()
  const resultCount =
    response.transactions.length +
    (canViewBalances ? response.accounts.length : 0)

  const workspaceGroups = useMemo<SearchGroup[]>(() => {
    if (!currentDebouncedQuery || !searchQuery.data) return []
    const groups: SearchGroup[] = [
      {
        label: 'Transactions',
        options: searchQuery.data.transactions.map((item, index) =>
          transactionOption(item, index, concealAmounts, onNavigate),
        ),
      },
      ...(canViewBalances
        ? [
            {
              label: 'Accounts',
              options: searchQuery.data.accounts.map((item, index) =>
                accountOption(
                  item,
                  index,
                  concealAmounts,
                  canViewBalances,
                  onNavigate,
                ),
              ),
            },
          ]
        : []),
    ]
    return groups.filter((group) => group.options.length > 0)
  }, [
    canViewBalances,
    concealAmounts,
    currentDebouncedQuery,
    onNavigate,
    searchQuery.data,
  ])

  const groups = useMemo(
    () => [...workspaceGroups, ...pageGroups],
    [pageGroups, workspaceGroups],
  )
  const renderedOptions = useMemo(
    () => groups.flatMap((group) => group.options),
    [groups],
  )

  useEffect(() => {
    setActiveIndex((current) =>
      Math.min(current, Math.max(0, renderedOptions.length - 1)),
    )
  }, [renderedOptions.length])

  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-search-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  const updateQuery = useCallback((value: string) => {
    setQuery(value)
    setActiveIndex(0)
  }, [])

  const selectOption = useCallback(
    (option: SearchOption) => {
      onOpenChange(false)
      option.onSelect()
    },
    [onOpenChange],
  )

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) =>
        Math.min(Math.max(0, renderedOptions.length - 1), current + 1),
      )
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(0, current - 1))
      return
    }
    if (event.key === 'Enter') {
      if (
        event.target instanceof HTMLButtonElement &&
        event.target.tabIndex !== -1
      ) {
        return
      }
      event.preventDefault()
      const option = renderedOptions[activeIndex]
      if (option) selectOption(option)
      return
    }
    if (event.key !== 'Tab' || mobile) return

    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    )
    if (!focusable.length) {
      event.preventDefault()
      inputRef.current?.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  const waitingForDebounce =
    workspaceSearchAvailable &&
    queryLength >= SEARCH_MIN_CHARACTERS &&
    queryLength <= SEARCH_MAX_CHARACTERS &&
    !currentDebouncedQuery
  const loadingWorkspaceResults =
    waitingForDebounce ||
    (searchEnabled && searchQuery.isFetching && !searchQuery.data)
  const workspaceSearchFailed =
    searchEnabled && searchQuery.isError && !searchQuery.data
  const workspaceSearchComplete =
    searchEnabled && searchQuery.isSuccess && currentDebouncedQuery
  const showNoMatches =
    Boolean(normalizedQuery) &&
    queryLength >= SEARCH_MIN_CHARACTERS &&
    pageGroups.length === 0 &&
    !workspaceSearchFailed &&
    (workspaceSearchAvailable
      ? workspaceSearchComplete && resultCount === 0
      : true)

  const liveMessage = loadingWorkspaceResults
    ? `Searching ${workspaceName}`
    : workspaceSearchFailed
      ? 'Workspace search failed. Page shortcuts remain available.'
      : workspaceSearchComplete
        ? `${resultCount} workspace ${resultCount === 1 ? 'result' : 'results'} found.`
        : ''

  let optionCursor = 0
  const surface = (
    <div
      className="workspace-search-surface"
      onKeyDown={handleKeyDown}
      aria-busy={loadingWorkspaceResults || undefined}
    >
      <div className="workspace-search-input-row">
        <Search aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          maxLength={SEARCH_MAX_CHARACTERS}
          placeholder="Search transactions, accounts, or pages"
          aria-label="Search workspace and pages"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            renderedOptions.length > 0
              ? `${listId}-option-${activeIndex}`
              : undefined
          }
        />
        {!mobile ? (
          <button
            type="button"
            className="workspace-search-close"
            aria-label="Close workspace search"
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <span className="visually-hidden" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </span>

      <div ref={listRef} className="workspace-search-results">
        {queryLength > SEARCH_MAX_CHARACTERS ? (
          <div className="workspace-search-status is-error" role="alert">
            Keep the search to 100 characters or fewer.
          </div>
        ) : demoMode && normalizedQuery ? (
          <div className="workspace-search-status">
            Demo mode keeps workspace records local. Page shortcuts are still
            available below.
          </div>
        ) : !workspaceSearchAvailable && normalizedQuery ? (
          <div className="workspace-search-status">
            Workspace search is unavailable for this role. Page shortcuts are
            still available below.
          </div>
        ) : queryLength === 1 ? (
          <div className="workspace-search-status">
            Type one more character to search this workspace.
          </div>
        ) : loadingWorkspaceResults ? (
          <div className="workspace-search-status" role="status">
            <LoaderCircle className="workspace-search-spinner" aria-hidden="true" />
            Searching {workspaceName}…
          </div>
        ) : workspaceSearchFailed ? (
          <div className="workspace-search-status is-error" role="alert">
            <span>Workspace results could not be loaded.</span>
            <button type="button" onClick={() => void searchQuery.refetch()}>
              Try again
            </button>
          </div>
        ) : workspaceSearchComplete && resultCount === 0 ? (
          <div className="workspace-search-status">
            No workspace records found. Matching page shortcuts remain
            available below.
          </div>
        ) : workspaceSearchComplete ? (
          <div className="workspace-search-summary">
            {resultCount} workspace {resultCount === 1 ? 'result' : 'results'}
          </div>
        ) : null}

        <div
          id={listId}
          role="listbox"
          aria-label="Workspace search results and page shortcuts"
        >
          {groups.map((group) => (
            <div
              key={group.label}
              className="workspace-search-group"
              role="group"
              aria-label={group.label}
            >
              <div className="workspace-search-group-label" aria-hidden="true">
                <span>{group.label}</span>
                <span>{group.options.length}</span>
              </div>
              {group.options.map((option) => {
                const index = optionCursor
                optionCursor += 1
                const selected = activeIndex === index
                const Icon = option.icon
                return (
                  <button
                    key={option.id}
                    id={`${listId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    tabIndex={-1}
                    data-search-index={index}
                    className="workspace-search-option"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectOption(option)}
                  >
                    {Icon ? (
                      <span className="workspace-search-option-icon">
                        <Icon aria-hidden="true" />
                      </span>
                    ) : null}
                    <span className="workspace-search-option-copy">
                      <strong>{option.label}</strong>
                      {option.description ? (
                        <small>{option.description}</small>
                      ) : null}
                    </span>
                    {option.trailing ? (
                      <span className="workspace-search-option-trailing">
                        {option.trailing}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {showNoMatches ? (
          <div className="workspace-search-empty">
            <Search aria-hidden="true" />
            <strong>
              {workspaceSearchAvailable
                ? 'No matching pages or records'
                : 'No matching page shortcuts'}
            </strong>
            <span>
              {workspaceSearchAvailable
                ? 'Try a merchant, category, account, or page name.'
                : 'Try a different page name.'}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )

  const desktopPalette =
    mounted && !mobile
      ? createPortal(
          <AnimatePresence>
            {open ? (
              <div ref={overlayRef} className="workspace-search-overlay">
                <motion.div
                  className="workspace-search-backdrop"
                  aria-hidden="true"
                  onClick={() => onOpenChange(false)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { duration: 0.18, ease: EASE_OUT }
                  }
                />
                <motion.div
                  ref={panelRef}
                  className="workspace-search-panel"
                  role="dialog"
                  aria-modal="true"
                  aria-label={`Search ${workspaceName}`}
                  initial={
                    reduce
                      ? { opacity: 0 }
                      : { opacity: 0, y: -8, scale: 0.98 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={
                    reduce
                      ? { opacity: 0 }
                      : { opacity: 0, y: -5, scale: 0.985 }
                  }
                  transition={
                    reduce
                      ? { duration: 0 }
                      : {
                          type: 'spring',
                          stiffness: 520,
                          damping: 40,
                          mass: 0.55,
                        }
                  }
                >
                  {surface}
                </motion.div>
              </div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )
      : null

  return (
    <>
      {desktopPalette}
      {mobile ? (
        <BottomSheet
          open={open}
          onOpenChange={onOpenChange}
          snapPoints={[0.88]}
          title="Search workspace"
          description={`Find permitted records in ${workspaceName}, or jump to a page.`}
          className="workspace-search-sheet"
        >
          {surface}
        </BottomSheet>
      ) : null}
    </>
  )
}
