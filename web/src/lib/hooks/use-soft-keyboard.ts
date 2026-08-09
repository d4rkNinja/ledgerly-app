import { useEffect, useState } from 'react'
import type { KeyboardState } from '@/platform/keyboard'

const MIN_KEYBOARD_HEIGHT = 120
const KEYBOARD_VIEWPORT_RATIO = 0.18
const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

function hasEditableFocus() {
  const active = document.activeElement
  if (active instanceof HTMLTextAreaElement) {
    return !active.disabled && !active.readOnly
  }
  if (active instanceof HTMLSelectElement) return !active.disabled
  if (active instanceof HTMLInputElement) {
    return (
      !active.disabled &&
      !active.readOnly &&
      !NON_TEXT_INPUT_TYPES.has(active.type)
    )
  }
  return active instanceof HTMLElement && active.isContentEditable
}

/**
 * Tracks a visual-viewport contraction caused by a focused text control.
 * Browser chrome and orientation changes are ignored unless an editable
 * control owns focus, which keeps fixed navigation stable during normal scroll.
 */
export function useSoftKeyboard(
  nativeKeyboard: Readonly<KeyboardState> | null,
) {
  const [fallbackOpen, setFallbackOpen] = useState(false)

  useEffect(() => {
    if (nativeKeyboard !== null) {
      setFallbackOpen(false)
      return
    }
    const viewport = window.visualViewport
    if (!viewport) return

    let animationFrame = 0
    let stableViewportHeight = viewport.height + viewport.offsetTop

    const update = () => {
      animationFrame = 0
      const visibleHeight = viewport.height + viewport.offsetTop

      if (!hasEditableFocus()) {
        stableViewportHeight = Math.max(stableViewportHeight, visibleHeight)
        setFallbackOpen(false)
        return
      }

      const layoutHeight = Math.max(
        stableViewportHeight,
        window.innerHeight,
        document.documentElement.clientHeight,
      )
      const threshold = Math.max(
        MIN_KEYBOARD_HEIGHT,
        layoutHeight * KEYBOARD_VIEWPORT_RATIO,
      )
      setFallbackOpen(layoutHeight - visibleHeight >= threshold)
    }

    const scheduleUpdate = () => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(update)
    }

    const resetForOrientation = () => {
      stableViewportHeight = viewport.height + viewport.offsetTop
      setFallbackOpen(false)
      scheduleUpdate()
    }

    viewport.addEventListener('resize', scheduleUpdate)
    viewport.addEventListener('scroll', scheduleUpdate)
    document.addEventListener('focusin', scheduleUpdate)
    document.addEventListener('focusout', scheduleUpdate)
    window.addEventListener('orientationchange', resetForOrientation)
    scheduleUpdate()

    return () => {
      cancelAnimationFrame(animationFrame)
      viewport.removeEventListener('resize', scheduleUpdate)
      viewport.removeEventListener('scroll', scheduleUpdate)
      document.removeEventListener('focusin', scheduleUpdate)
      document.removeEventListener('focusout', scheduleUpdate)
      window.removeEventListener('orientationchange', resetForOrientation)
    }
  }, [nativeKeyboard])

  return nativeKeyboard?.open ?? fallbackOpen
}
