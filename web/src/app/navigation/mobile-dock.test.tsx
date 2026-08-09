import { fireEvent, render, screen } from '@testing-library/react'
import { MotionConfig } from 'motion/react'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileNavigationDock } from './mobile-dock'

const hapticMocks = vi.hoisted(() => ({ selectionHaptic: vi.fn() }))
vi.mock('@/platform/haptics', () => hapticMocks)

function LocationProbe() {
  return <output aria-label="location">{useLocation().pathname}</output>
}

function renderDock(canQuickAdd = true) {
  const onQuickAddOpen = vi.fn()
  render(
    <MemoryRouter initialEntries={['/app/transactions']}>
      <MotionConfig reducedMotion="always">
        <MobileNavigationDock
          keyboardOpen={false}
          pathname="/app/transactions"
          reduceMotion
          quickAddOpen={false}
          creationDialogOpen={false}
          canQuickAdd={canQuickAdd}
          unreadNotifications={0}
          onQuickAddOpen={onQuickAddOpen}
        />
        <LocationProbe />
      </MotionConfig>
    </MemoryRouter>,
  )
  return onQuickAddOpen
}

describe('MobileNavigationDock haptics', () => {
  beforeEach(() => {
    hapticMocks.selectionHaptic.mockReturnValue(new Promise(() => undefined))
  })

  it('does not let haptic latency gate an accepted destination or quick add', () => {
    const onQuickAddOpen = renderDock()

    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    expect(screen.getByLabelText('location')).toHaveTextContent('/app/home')
    fireEvent.click(screen.getByRole('button', { name: 'Open quick add' }))
    expect(onQuickAddOpen).toHaveBeenCalledOnce()
    expect(hapticMocks.selectionHaptic).toHaveBeenCalledTimes(2)
  })

  it('does not signal an unavailable quick add', () => {
    const onQuickAddOpen = renderDock(false)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Quick add unavailable for this role',
      }),
    )
    expect(onQuickAddOpen).not.toHaveBeenCalled()
    expect(hapticMocks.selectionHaptic).not.toHaveBeenCalled()
  })
})
