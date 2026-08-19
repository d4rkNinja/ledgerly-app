import { X } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import {
  BottomSheet as RegistryBottomSheet,
  type BottomSheetProps as RegistryBottomSheetProps,
} from '@/components/motion/bottom-sheet'
import { isolateBodySiblings } from '@/lib/modal-isolation'
import { registerBackLayer } from '@/platform/back-layer-stack'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements(root: HTMLElement | null) {
  if (!root) return []
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => element.tabIndex >= 0)
}

type BodyStyles = Pick<
  CSSStyleDeclaration,
  'position' | 'top' | 'left' | 'right' | 'overflow'
>

let activeSheetCount = 0
let originalBodyStyles: BodyStyles | null = null

function readBodyStyles(): BodyStyles {
  const { position, top, left, right, overflow } = document.body.style
  return { position, top, left, right, overflow }
}

function writeBodyStyles(styles: BodyStyles) {
  Object.assign(document.body.style, styles)
}

export interface BottomSheetProps extends RegistryBottomSheetProps {
  showCloseButton?: boolean
}

export function BottomSheet({
  open,
  onOpenChange,
  children,
  showCloseButton = true,
  ...props
}: BottomSheetProps) {
  const countedRef = useRef(false)
  const markerRef = useRef<HTMLSpanElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  if (open && !countedRef.current && activeSheetCount === 0) {
    originalBodyStyles = readBodyStyles()
  }
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  const handleOpenChange = useCallback(
    (next: boolean) => onOpenChangeRef.current(next),
    [],
  )

  useEffect(() => {
    if (!open) return
    return registerBackLayer(() => handleOpenChange(false))
  }, [handleOpenChange, open])

  useEffect(() => {
    if (!open) return
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    let restoreIsolation: () => void = () => undefined
    let sheet: HTMLElement | null = null

    const frame = requestAnimationFrame(() => {
      sheet = markerRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null
      if (!sheet) return
      sheet.dataset.bottomSheet = 'true'
      sheet.tabIndex = -1
      const modalRoot = sheet.parentElement
      if (modalRoot) restoreIsolation = isolateBodySiblings(modalRoot)
      const focusable = focusableElements(sheet)
      ;(
        focusable.find((element) => element.hasAttribute('autofocus')) ??
        focusable.find((element) => !element.hasAttribute('data-modal-close')) ??
        focusable[0] ??
        sheet
      ).focus()
    })

    const focusSheet = () => {
      const focusable = focusableElements(sheet)
      ;(
        focusable.find((element) => !element.hasAttribute('data-modal-close')) ??
        focusable[0] ??
        sheet
      )?.focus()
    }
    const isTopSheet = () => {
      const openSheets = document.querySelectorAll<HTMLElement>(
        '[data-bottom-sheet="true"]',
      )
      return openSheets.item(openSheets.length - 1) === sheet
    }
    const onFocusIn = (event: FocusEvent) => {
      if (!sheet || !isTopSheet()) return
      if (event.target instanceof Node && !sheet.contains(event.target)) {
        focusSheet()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !sheet || !isTopSheet()) return
      const focusable = focusableElements(sheet)
      if (!focusable.length) {
        event.preventDefault()
        sheet.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('keydown', onKeyDown)
      restoreIsolation()
      const previousFocus = previousFocusRef.current
      if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) {
        previousFocus.focus()
      }
    }
  }, [open])

  useEffect(() => {
    if (!open || countedRef.current) return
    countedRef.current = true
    activeSheetCount += 1

    return () => {
      if (!countedRef.current) return
      countedRef.current = false
      activeSheetCount = Math.max(0, activeSheetCount - 1)
      queueMicrotask(() => {
        if (activeSheetCount === 0 && originalBodyStyles) {
          writeBodyStyles(originalBodyStyles)
          originalBodyStyles = null
        } else if (activeSheetCount > 0) {
          Object.assign(document.body.style, {
            position: 'fixed',
            left: '0px',
            right: '0px',
            overflow: 'hidden',
          })
        }
      })
    }
  }, [open])

  return (
    <RegistryBottomSheet
      {...props}
      open={open}
      onOpenChange={handleOpenChange}
    >
      <span ref={markerRef} className="sr-only" aria-hidden="true" />
      {showCloseButton ? (
        <button
          type="button"
          data-modal-close=""
          aria-label="Close bottom sheet"
          onClick={() => handleOpenChange(false)}
          className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
      {children}
    </RegistryBottomSheet>
  )
}
