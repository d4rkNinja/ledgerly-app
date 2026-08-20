import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field } from './ui'

describe('Field accessibility wiring', () => {
  it('wires a nested input to its label and error message', () => {
    render(
      <Field label="Amount" error="Enter an amount">
        <div>
          <button type="button">Change currency</button>
          <input aria-label="Amount" />
        </div>
      </Field>,
    )

    const input = screen.getByRole('textbox', { name: 'Amount' })
    const alert = screen.getByRole('alert')

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', alert.id)
    expect(screen.getByRole('button', { name: 'Change currency' })).not.toHaveAttribute(
      'aria-invalid',
    )
  })

  it('preserves an explicit accessible name while connecting field errors', () => {
    const { container } = render(
      <Field label="Limit" error="Enter a limit">
        <div>
          <input aria-label="Budget limit" />
          <button type="button" aria-label="Change currency">
            INR
          </button>
        </div>
      </Field>,
    )

    const input = screen.getByRole('textbox', { name: 'Budget limit' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Enter a limit')
    expect(
      container.querySelector('button[aria-label="Change currency"]'),
    ).not.toHaveAttribute(
      'aria-invalid',
    )
  })
})
