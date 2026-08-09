import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { AppContext, type AppContextValue } from '@/app/app-state'
import { LoginPage } from './LoginPage'

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

describe('LoginPage remember-device control', () => {
  it('uses the BeUI checkbox and toggles with the keyboard', async () => {
    const user = userEvent.setup()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <MotionConfig reducedMotion="always">
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <AppContext.Provider value={appValue}>
              <LoginPage />
            </AppContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>
      </MotionConfig>,
    )

    const remember = screen.getByRole('checkbox', {
      name: /remember this device/i,
    })
    expect(remember).toHaveAttribute('data-state', 'checked')

    await user.click(remember)
    expect(remember).toHaveAttribute('aria-checked', 'false')
  })
})
