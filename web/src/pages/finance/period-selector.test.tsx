import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MotionConfig } from 'motion/react'
import { PeriodSelector, type DashboardPeriodValue } from './period-selector'

const value: DashboardPeriodValue = {
  mode: 'custom-month',
  month: '2026-07-01',
  from: '2026-07-01',
  to: '2026-07-31',
}

describe('PeriodSelector', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('offers civil month navigation, a month/year picker, and all period modes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <MotionConfig reducedMotion="always">
        <PeriodSelector value={value} onChange={onChange} onClear={vi.fn()} />
      </MotionConfig>,
    )

    await user.click(screen.getByRole('button', { name: 'Previous month from July 2026' }))
    expect(onChange).toHaveBeenCalledWith({ mode: 'custom-month', month: '2026-06-01' })
    await user.click(screen.getByRole('button', { name: 'Next month from July 2026' }))
    expect(onChange).toHaveBeenCalledWith({ mode: 'custom-month', month: '2026-08-01' })
    await user.click(screen.getByRole('button', { name: 'Current month' }))
    expect(onChange).toHaveBeenCalledWith({ mode: 'this-month' })
    expect(screen.getByRole('button', { name: 'Choose month' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose year' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Choose reporting period' }))
    expect(screen.getByRole('option', { name: 'Last 7 days' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'All time' })).toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'All time' }))
    expect(onChange).toHaveBeenCalledWith({ mode: 'all-time' })
  })
})
