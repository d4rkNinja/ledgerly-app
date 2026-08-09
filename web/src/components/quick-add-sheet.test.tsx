import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickAddSheet } from './quick-add-sheet'

const hapticMocks = vi.hoisted(() => ({ selectionHaptic: vi.fn() }))
vi.mock('@/platform/haptics', () => hapticMocks)
vi.mock('@/components/motion/bottom-sheet', () => ({
  BottomSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
}))

describe('QuickAddSheet', () => {
  beforeEach(() => {
    hapticMocks.selectionHaptic.mockRejectedValue(new Error('unavailable'))
  })

  it('closes and navigates before best-effort haptic feedback settles', () => {
    const onOpenChange = vi.fn()
    const onNavigate = vi.fn()
    render(
      <QuickAddSheet
        open
        demoMode={false}
        canCreateTransaction
        canCreateAccount={false}
        canCreateBudget={false}
        canCreateGoal={false}
        canSubmitClaim={false}
        onOpenChange={onOpenChange}
        onNavigate={onNavigate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Expense/ }))

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false)
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(
      '/app/transactions?add=expense',
    )
    expect(hapticMocks.selectionHaptic).toHaveBeenCalledOnce()
  })

  it('links Contacts and Saved names to their standalone pages', () => {
    const onOpenChange = vi.fn()
    const onNavigate = vi.fn()
    render(
      <QuickAddSheet
        open
        demoMode={false}
        canCreateTransaction={false}
        canCreateAccount={false}
        canCreateBudget={false}
        canCreateGoal
        canManageContacts
        canSubmitClaim={false}
        onOpenChange={onOpenChange}
        onNavigate={onNavigate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Contacts/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Saved names/ }))

    expect(onNavigate).toHaveBeenNthCalledWith(1, '/app/contacts')
    expect(onNavigate).toHaveBeenNthCalledWith(2, '/app/saved-names')
  })
})
