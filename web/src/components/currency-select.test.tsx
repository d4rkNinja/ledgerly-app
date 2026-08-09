import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CurrencySelect } from './currency-select'

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('CurrencySelect', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders an accessible icon-only trigger when requested', async () => {
    const user = userEvent.setup()
    render(
      <MotionConfig reducedMotion="always">
        <CurrencySelect
          iconOnly
          value="INR"
          onChange={vi.fn()}
          ariaLabel="Change currency"
        />
      </MotionConfig>,
    )

    const trigger = screen.getByRole('button', { name: 'Change currency' })
    expect(trigger).not.toHaveTextContent('Indian rupee (INR)')
    expect(trigger.querySelector('svg')).toBeInTheDocument()

    await user.click(trigger)
    expect(screen.getByRole('option', { name: 'US dollar (USD)' })).toBeInTheDocument()
  })
})
