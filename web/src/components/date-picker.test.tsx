import { useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatePicker } from './date-picker'

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function DatePickerHarness({
  initialValue = '2026-08-04',
  min,
  max,
  error,
}: {
  initialValue?: string
  min?: string
  max?: string
  error?: string
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <>
      <DatePicker
        value={value}
        onValueChange={setValue}
        label="From date"
        min={min}
        max={max}
        error={error}
      />
      <output aria-label="Selected date">{value}</output>
    </>
  )
}

describe('DatePicker', () => {
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
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('announces its label and returns an ISO date-only value when a day is chosen', async () => {
    const user = userEvent.setup()
    render(
      <MotionConfig reducedMotion="always">
        <DatePickerHarness />
      </MotionConfig>,
    )

    const trigger = screen.getByRole('button', { name: /from date/i })
    expect(trigger).toHaveTextContent('Aug 4, 2026')
    expect(trigger.querySelector('span')).toHaveClass('min-w-0', 'truncate')
    expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument()

    await user.click(trigger)
    await user.click(
      screen.getByRole('gridcell', { name: 'Choose August 17, 2026' }),
    )

    expect(screen.getByRole('status', { name: 'Selected date' })).toHaveTextContent(
      '2026-08-17',
    )
  })

  it('moves the focused calendar day with the keyboard before choosing it', async () => {
    const user = userEvent.setup()
    render(
      <MotionConfig reducedMotion="always">
        <DatePickerHarness />
      </MotionConfig>,
    )

    await user.click(screen.getByRole('button', { name: /from date/i }))
    const selectedDay = screen.getByRole('gridcell', {
      name: 'Choose August 4, 2026',
    })
    await waitFor(() => expect(selectedDay).toHaveFocus())

    await user.keyboard('{ArrowRight}{Enter}')

    expect(screen.getByRole('status', { name: 'Selected date' })).toHaveTextContent(
      '2026-08-05',
    )
  })

  it('surfaces validation errors and prevents selection outside its allowed range', async () => {
    const user = userEvent.setup()
    render(
      <MotionConfig reducedMotion="always">
        <DatePickerHarness
          min="2026-08-04"
          max="2026-08-10"
          error="Choose a valid date."
        />
      </MotionConfig>,
    )

    const trigger = screen.getByRole('button', { name: /from date/i })
    expect(trigger).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a valid date.')

    await user.click(trigger)
    expect(
      screen.getByRole('gridcell', { name: 'Choose August 3, 2026' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('gridcell', { name: 'Choose August 11, 2026' }),
    ).toBeDisabled()
  })

  it('uses a dialog surface on small screens so the calendar stays in view', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
    render(<DatePickerHarness />)

    await user.click(screen.getByRole('button', { name: /from date/i }))

    expect(
      await screen.findByRole('dialog', { name: 'Choose From date' }),
    ).toBeInTheDocument()

    expect(
      screen.getByRole('grid', { name: 'August 2026' }).closest('.date-picker-calendar'),
    ).toHaveClass('mx-auto')
  })
})
