import { render, screen } from '@testing-library/react'
import { MotionConfig } from 'motion/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ForgotPasswordPage } from './ForgotPasswordPage'

describe('ForgotPasswordPage', () => {
  it('does not collect an email when reset delivery is unavailable', () => {
    render(
      <MotionConfig reducedMotion="always">
        <MemoryRouter>
          <ForgotPasswordPage />
        </MemoryRouter>
      </MotionConfig>,
    )

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('No reset email can be sent')).toBeInTheDocument()
    expect(screen.getByText(/has not been collected or submitted/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /return to sign in/i })).toHaveAttribute(
      'href',
      '/login',
    )
  })
})
