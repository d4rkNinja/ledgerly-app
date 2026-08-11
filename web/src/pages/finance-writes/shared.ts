import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { useSearchParams } from 'react-router'
import { z } from 'zod'
import { useApp } from '@/app/app-state'
import type { Money } from '@/domain/types'
import { ApiError } from '@/lib/api-client'
import { invalidatePeriodReviewQueries } from '@/lib/period-review-query'
import { successHaptic } from '@/platform/haptics'

export type FinanceFeedback = {
  tone: 'success' | 'error' | 'info'
  message: string
}

export type FinanceClaim = {
  id: string
  person: string
  purpose: string
  amount: Money
  status: string
  rawStatus: 'pending' | 'approved' | 'rejected' | 'correction_requested'
  reimbursementStatus: string
  submittedBy?: string
  approvalComment?: string
}

export function focusFirstInvalidField(form: Element) {
  requestAnimationFrame(() => {
    const control = form.querySelector<HTMLElement>(
      'input[aria-invalid="true"]:not([disabled]), select[aria-invalid="true"]:not([disabled]), textarea[aria-invalid="true"]:not([disabled]), button[data-field-control][aria-invalid="true"]:not([disabled])',
    )
    if (!control) return
    control.focus({ preventScroll: true })
    control.scrollIntoView({ block: 'nearest' })
  })
}

type Identifiable = {
  id: string
}

const demoSessionRecords = new Map<string, Identifiable[]>()
const demoSessionDeletedIds = new Map<string, Set<string>>()
const demoSessionListeners = new Set<() => void>()
let demoSessionVersion = 0
const DIALOG_FOCUS_RESTORE_DELAY_MS = 520

function demoCollectionKey(workspaceId: string, collection: string) {
  return `${workspaceId}:${collection}`
}

function publishDemoSessionChange() {
  demoSessionVersion += 1
  demoSessionListeners.forEach((listener) => listener())
}

function subscribeToDemoSession(listener: () => void) {
  demoSessionListeners.add(listener)
  return () => demoSessionListeners.delete(listener)
}

export function createDemoId(collection: string) {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `demo-${collection}-${suffix}`
}

export function addDemoSessionItem<T extends Identifiable>(
  workspaceId: string,
  collection: string,
  item: T,
) {
  const key = demoCollectionKey(workspaceId, collection)
  demoSessionDeletedIds.get(key)?.delete(item.id)
  const current = (demoSessionRecords.get(key) ?? []) as T[]
  demoSessionRecords.set(key, [
    item,
    ...current.filter((record) => record.id !== item.id),
  ])
  publishDemoSessionChange()
}

export function updateDemoSessionItem<T extends Identifiable>(
  workspaceId: string,
  collection: string,
  itemId: string,
  update: (item: T) => T,
) {
  const key = demoCollectionKey(workspaceId, collection)
  const current = (demoSessionRecords.get(key) ?? []) as T[]
  if (!current.some((item) => item.id === itemId)) return
  demoSessionRecords.set(
    key,
    current.map((item) => (item.id === itemId ? update(item) : item)),
  )
  publishDemoSessionChange()
}

export function removeDemoSessionItem(
  workspaceId: string,
  collection: string,
  itemId: string,
) {
  const key = demoCollectionKey(workspaceId, collection)
  const current = demoSessionRecords.get(key) ?? []
  const next = current.filter((item) => item.id !== itemId)
  const deleted = demoSessionDeletedIds.get(key) ?? new Set<string>()
  deleted.add(itemId)
  demoSessionDeletedIds.set(key, deleted)
  if (next.length) demoSessionRecords.set(key, next)
  else demoSessionRecords.delete(key)
  publishDemoSessionChange()
}

export function useDemoSessionCollection<T extends Identifiable>(
  enabled: boolean,
  workspaceId: string,
  collection: string,
  baseItems: T[],
) {
  useSyncExternalStore(
    subscribeToDemoSession,
    () => demoSessionVersion,
    () => 0,
  )

  if (!enabled) return baseItems
  const additions = (demoSessionRecords.get(
    demoCollectionKey(workspaceId, collection),
  ) ?? []) as T[]
  const deleted = demoSessionDeletedIds.get(
    demoCollectionKey(workspaceId, collection),
  )
  if (!additions.length && !deleted?.size) return baseItems
  const addedIds = new Set(additions.map((item) => item.id))
  return [
    ...additions,
    ...baseItems.filter(
      (item) => !addedIds.has(item.id) && !deleted?.has(item.id),
    ),
  ]
}

export function useQueryDialog(parameter: string, allowed: boolean) {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get(parameter) === '1'
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const restoreTimerRef = useRef<number | null>(null)
  const previouslyRequestedRef = useRef(requested)

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        if (restoreTimerRef.current !== null) {
          window.clearTimeout(restoreTimerRef.current)
          restoreTimerRef.current = null
        }
        returnFocusRef.current =
          document.activeElement instanceof HTMLElement &&
          document.activeElement !== document.body
            ? document.activeElement
            : null
      }
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (nextOpen) {
            next.set(parameter, '1')
          } else {
            next.delete(parameter)
          }
          return next
        },
        { replace: true },
      )
    },
    [parameter, setSearchParams],
  )

  useEffect(() => {
    const wasRequested = previouslyRequestedRef.current
    previouslyRequestedRef.current = requested
    if (!wasRequested || requested) return

    const returnTarget = returnFocusRef.current
    returnFocusRef.current = null
    if (!returnTarget) return

    restoreTimerRef.current = window.setTimeout(() => {
      restoreTimerRef.current = null
      if (
        returnTarget.isConnected &&
        !returnTarget.closest('[inert]')
      ) {
        returnTarget.focus({ preventScroll: true })
      }
    }, DIALOG_FOCUS_RESTORE_DELAY_MS)
  }, [requested])

  useEffect(
    () => () => {
      if (restoreTimerRef.current !== null) {
        window.clearTimeout(restoreTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (requested && !allowed) setOpen(false)
  }, [allowed, requested, setOpen])

  return [requested && allowed, setOpen] as const
}

type WriteFlowOptions<TVariables> = {
  open: boolean
  onClose: () => void
  request: (variables: TVariables) => Promise<unknown>
  invalidate: string[]
  invalidatePeriodReviews?: boolean
  successMessage: string
  onServerFields?: (fields: Record<string, string>) => void
}

export function useWriteFlow<TVariables>({
  open,
  onClose,
  request,
  invalidate,
  invalidatePeriodReviews = false,
  successMessage,
  onServerFields,
}: WriteFlowOptions<TVariables>) {
  const { workspace } = useApp()
  const queryClient = useQueryClient()
  const [feedback, setFeedback] = useState<FinanceFeedback | null>(null)
  const [locked, setLocked] = useState(false)
  const lockRef = useRef(false)
  const closeTimerRef = useRef<number | null>(null)
  const onCloseRef = useRef(onClose)
  const onServerFieldsRef = useRef(onServerFields)

  useEffect(() => {
    onCloseRef.current = onClose
    onServerFieldsRef.current = onServerFields
  }, [onClose, onServerFields])

  useEffect(() => {
    if (open) {
      lockRef.current = false
      setLocked(false)
      setFeedback(null)
    } else if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [open])

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
    },
    [],
  )

  const finish = useCallback((message: string) => {
    setFeedback({ tone: 'success', message })
    void successHaptic()
    closeTimerRef.current = window.setTimeout(() => {
      onCloseRef.current()
    }, 850)
  }, [])

  const mutation = useMutation({
    mutationFn: request,
    onSuccess: () => {
      invalidate.forEach((key) => {
        void queryClient.invalidateQueries({
          queryKey:
            key === 'notifications'
              ? ['notifications']
              : [key, workspace.id],
        })
      })
      if (invalidatePeriodReviews) {
        void invalidatePeriodReviewQueries(queryClient, workspace.id)
      }
      finish(successMessage)
    },
    onError: (error) => {
      lockRef.current = false
      setLocked(false)
      if (error instanceof ApiError && error.fields) {
        onServerFieldsRef.current?.(error.fields)
      }
      setFeedback({
        tone: 'error',
        message:
          error instanceof ApiError
            ? error.fields
              ? 'Check the highlighted fields and try again.'
              : error.message
            : 'The server could not save this change. No data was changed.',
      })
    },
  })

  const begin = useCallback(() => {
    if (lockRef.current || mutation.isPending) return false
    lockRef.current = true
    setLocked(true)
    setFeedback(null)
    return true
  }, [mutation.isPending])

  const submitLive = useCallback(
    (variables: TVariables) => {
      if (!begin()) return false
      mutation.mutate(variables)
      return true
    },
    [begin, mutation],
  )

  const completeDemo = useCallback(
    (write: () => void, message: string) => {
      if (!begin()) return false
      write()
      finish(message)
      return true
    },
    [begin, finish],
  )

  return {
    busy: locked || mutation.isPending,
    completeDemo,
    feedback,
    setFeedback,
    submitLive,
  }
}

const MAX_MAJOR_AMOUNT = 90_000_000_000_000
const MONEY_PATTERN = /^-?\d+(?:\.\d{1,2})?$/

export function moneyInputSchema({
  allowNegative = false,
  allowZero = false,
}: {
  allowNegative?: boolean
  allowZero?: boolean
} = {}) {
  return z
    .string()
    .trim()
    .min(1, 'Enter an amount')
    .refine(
      (value) => MONEY_PATTERN.test(value),
      'Use a number with no more than two decimal places',
    )
    .refine((value) => {
      const amount = Number(value)
      if (!Number.isFinite(amount) || Math.abs(amount) > MAX_MAJOR_AMOUNT) {
        return false
      }
      if (!allowNegative && amount < 0) return false
      if (!allowZero && amount === 0) return false
      return true
    }, allowZero ? 'Enter a supported amount' : 'Enter an amount above zero')
    .transform(Number)
}

export const currencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => /^[A-Z]{3}$/.test(value),
    'Use a three-letter currency code',
  )

export const dateInputSchema = z
  .string()
  .trim()
  .refine((value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    )
  }, 'Choose a valid date')

export function toFieldErrors(error: z.ZodError) {
  return error.issues.reduce<Record<string, string>>((fields, issue) => {
    const field = String(issue.path[0] ?? 'form')
    if (!fields[field]) fields[field] = issue.message
    return fields
  }, {})
}

export function mapServerFields(
  fields: Record<string, string>,
  aliases: Record<string, string> = {},
) {
  return Object.fromEntries(
    Object.entries(fields).map(([field, message]) => [
      aliases[field] ?? field,
      message,
    ]),
  )
}

export function clearFieldError(
  setErrors: Dispatch<SetStateAction<Record<string, string>>>,
  field: string,
) {
  setErrors((current) => {
    if (!current[field]) return current
    const next = { ...current }
    delete next[field]
    return next
  })
}

export function toMinor(amount: number) {
  return Math.round(amount * 100)
}

export function toInputDate(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function currentMonthRange() {
  const now = new Date()
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  )
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  )
  return {
    startAt: toInputDate(start),
    endAt: toInputDate(end),
  }
}

export function toUtcDate(value: string, endOfDay = false) {
  return `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
}

export function friendlyFinanceLabel(value: string) {
  const normalized = value.trim().replaceAll('_', ' ')
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : 'Custom'
}
