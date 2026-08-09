import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppContext, type AppContextValue } from '@/app/app-state'
import { OnboardingPage } from './OnboardingPage'
import { RegistrationPreferencesStep } from './OnboardingSteps'

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {},
  api: { post: vi.fn() },
}))

const appValue: AppContextValue = {
  demoMode: false,
  isAuthenticated: false,
  userId: '',
  userName: '',
  workspace: {
    id: 'workspace-1',
    name: 'Workspace',
    type: 'personal',
    role: 'owner',
    memberCount: 1,
    permissions: [],
  },
      availableWorkspaces: [],
      defaultWorkspaceId: '',
  preferredCurrency: 'INR',
  privacyMode: false,
  theme: 'system',
  resolvedTheme: 'light',
  enterDemo: vi.fn(),
  completeLogin: vi.fn().mockResolvedValue(undefined),
  refreshWorkspaces: vi.fn().mockResolvedValue([]),
  deleteWorkspace: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn(),
      setWorkspace: vi.fn(),
      setDefaultWorkspace: vi.fn(),
  setPrivacyMode: vi.fn(),
  setPreferredCurrency: vi.fn(),
  setTheme: vi.fn(),
}

describe('OnboardingPage account setup', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('collects account credentials without asking for an app PIN', () => {
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AppContext.Provider value={appValue}>
            <OnboardingPage />
          </AppContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(
      screen.getByPlaceholderText('How should we address you?'),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Create a strong password'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('App PIN')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Confirm app PIN')).not.toBeInTheDocument()
  })

  it('uses the BeUI checkbox for consent and keeps the validation focus target', async () => {
    const user = userEvent.setup()
    const termsRef = createRef<HTMLButtonElement>()
    const onTermsChange = vi.fn()
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)

    render(
      <RegistrationPreferencesStep
        currency="INR"
        termsAccepted={false}
        termsRef={termsRef}
        onCurrencyChange={vi.fn()}
        onTermsChange={onTermsChange}
      />,
    )

    const terms = screen.getByRole('checkbox', {
      name: /i accept the terms and privacy policy/i,
    })
    expect(terms).toHaveAttribute('data-state', 'unchecked')
    expect(termsRef.current).toBe(terms)

    await user.click(terms)
    expect(onTermsChange).toHaveBeenCalledWith(true)
  })
})
