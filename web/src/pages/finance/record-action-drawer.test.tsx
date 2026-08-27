import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordActionDrawer } from './record-action-drawer'

const clipboardMocks = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(),
}))

vi.mock('@/lib/clipboard', () => clipboardMocks)

function renderDrawer(onDelete = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn()
  render(
    <MotionConfig reducedMotion="always">
      <RecordActionDrawer
        open
        title="Transaction details"
        details={[
          { label: 'Reference', value: 'TXN-2026-0001', copyable: true },
        ]}
        canDelete
        onDelete={onDelete}
        onClose={onClose}
      />
    </MotionConfig>,
  )
  return { onClose, onDelete }
}

describe('RecordActionDrawer motion states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clipboardMocks.copyTextToClipboard.mockResolvedValue(true)
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
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('turns copy success into an announced icon state', async () => {
    const user = userEvent.setup()
    renderDrawer()

    await user.click(
      await screen.findByRole('button', { name: 'Copy reference' }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Reference copied' }),
      ).toBeInTheDocument()
    })
    expect(screen.getByRole('status')).toHaveTextContent('Reference copied.')
    expect(clipboardMocks.copyTextToClipboard).toHaveBeenCalledWith(
      'TXN-2026-0001',
    )
  })

  it('moves focus through the animated destructive confirmation', async () => {
    const user = userEvent.setup()
    const { onClose, onDelete } = renderDrawer()

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    const confirmation = await screen.findByRole('alert')
    const keep = within(confirmation).getByRole('button', { name: 'Keep it' })
    await waitFor(() => expect(keep).toHaveFocus())

    await user.click(keep)
    const deleteTrigger = await screen.findByRole('button', { name: 'Delete' })
    await waitFor(() => expect(deleteTrigger).toHaveFocus())

    await user.click(deleteTrigger)
    const nextConfirmation = await screen.findByRole('alert')
    await user.click(
      within(nextConfirmation).getByRole('button', { name: 'Confirm delete' }),
    )

    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce())
    expect(onClose).toHaveBeenCalledOnce()
  })
})
