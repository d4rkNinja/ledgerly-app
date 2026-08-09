import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MotionConfig } from 'motion/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './bottom-sheet'

function SwitchingSheets() {
  const [accountOpen, setAccountOpen] = useState(true)
  const [homeOpen, setHomeOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setHomeOpen(true)}>
        Open home sheet
      </button>
      <button type="button" onClick={() => setAccountOpen(false)}>
        Close account sheet
      </button>
      <button type="button" onClick={() => setHomeOpen(false)}>
        Close home sheet
      </button>
      <BottomSheet
        open={accountOpen}
        onOpenChange={setAccountOpen}
        title="Account"
      >
        Account form
      </BottomSheet>
      {homeOpen ? (
        <BottomSheet open onOpenChange={setHomeOpen} title="Home">
          Home content
        </BottomSheet>
      ) : null}
    </>
  )
}

describe('BottomSheet scroll locking', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', (handle: number) =>
      window.clearTimeout(handle),
    )
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  })

  afterEach(() => {
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.left = ''
    document.body.style.right = ''
    document.body.style.overflow = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('restores page scrolling after handing off from one sheet to another', async () => {
    render(
      <MotionConfig reducedMotion="always">
        <SwitchingSheets />
      </MotionConfig>,
    )

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Account' })).toBeInTheDocument()
    })

    fireEvent.click(document.querySelectorAll('button')[0])
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Home' })).toBeInTheDocument()
    })

    fireEvent.click(document.querySelectorAll('button')[1])
    fireEvent.click(document.querySelectorAll('button')[2])
    await waitFor(() => {
      expect(document.body.style.position).toBe('')
      expect(document.body.style.top).toBe('')
      expect(document.body.style.left).toBe('')
      expect(document.body.style.right).toBe('')
      expect(document.body.style.overflow).toBe('')
    })
  })
})
