import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { AppContext, type AppContextValue } from '@/app/app-state'
import { InvitationPage } from './InvitationPage'

const apiMocks = vi.hoisted(() => {
  class MockApiError extends Error {
    readonly code: string
    readonly status: number

    constructor(code: string, message: string, status: number) {
      super(message)
      this.name = 'ApiError'
      this.code = code
      this.status = status
    }
  }

  return {
    post: vi.fn(),
    MockApiError,
  }
})

vi.mock('@/lib/api-client', () => ({
  ApiError: apiMocks.MockApiError,
  api: { post: apiMocks.post },
}))

const workspace = {
  id: 'workspace-current',
  name: 'Current space',
  type: 'personal' as const,
  role: 'owner' as const,
  memberCount: 1,
}

const invitedWorkspace = {
  ...workspace,
  id: 'workspace-invited',
  name: 'Invited space',
  role: 'member' as const,
}

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="Navigation state">{JSON.stringify(location.state)}</output>
}

function appValue(overrides: Partial<AppContextValue> = {}): AppContextValue {
  return {
    demoMode: false,
    isAuthenticated: true,
    userId: 'user-a',
    userName: 'Asha Rao',
    workspace,
    availableWorkspaces: [workspace],
    defaultWorkspaceId: workspace.id,
    preferredCurrency: 'INR',
    privacyMode: false,
    theme: 'system',
    resolvedTheme: 'light',
    enterDemo: vi.fn(),
    completeLogin: vi.fn().mockResolvedValue(undefined),
    refreshWorkspaces: vi.fn().mockResolvedValue([workspace, invitedWorkspace]),
    deleteWorkspace: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn(),
    setWorkspace: vi.fn(),
    setDefaultWorkspace: vi.fn(),
    setPrivacyMode: vi.fn(),
    setPreferredCurrency: vi.fn(),
    setTheme: vi.fn(),
    ...overrides,
  }
}

function renderPage(value = appValue()) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[
          { pathname: '/invite', state: { invitationToken: '  token-cross-device  ' } },
        ]}
      >
        <AppContext.Provider value={value}>
          <Routes>
            <Route
              path="/invite"
              element={
                <>
                  <InvitationPage />
                  <LocationProbe />
                </>
              }
            />
            <Route path="/login" element={<LocationProbe />} />
            <Route path="/app/home" element={<LocationProbe />} />
          </Routes>
        </AppContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('InvitationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
  })

  it('accepts the retained token and refreshes the returned workspace', async () => {
    const user = userEvent.setup()
    apiMocks.post.mockResolvedValue({
      workspaceId: invitedWorkspace.id,
      role: 'member',
      permissions: [],
    })
    const value = appValue()
    renderPage(value)

    await user.click(screen.getByRole('button', { name: /accept invitation/i }))

    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith('/invitations/accept', {
        token: 'token-cross-device',
      })
      expect(value.refreshWorkspaces).toHaveBeenCalledWith(invitedWorkspace.id)
    })
  })

  it('preserves the token when sending an unauthenticated user to sign in', async () => {
    const user = userEvent.setup()
    renderPage(appValue({ isAuthenticated: false }))

    await user.click(screen.getByRole('button', { name: /sign in to continue/i }))

    await waitFor(() => {
      expect(screen.getByLabelText('Navigation state')).toHaveTextContent(
        'invitationToken',
      )
      expect(screen.getByLabelText('Navigation state')).toHaveTextContent(
        'token-cross-device',
      )
    })
  })

  it('uses safe feedback for invalid, expired, and already-used invitations', async () => {
    const user = userEvent.setup()
    apiMocks.post.mockRejectedValue(
      new apiMocks.MockApiError(
        'not_found',
        'requested record was not found',
        404,
      ),
    )
    renderPage()

    await user.click(screen.getByRole('button', { name: /accept invitation/i }))

    expect(
      await screen.findByText(
        'This invitation is invalid, expired, or has already been used.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('requested record was not found')).not.toBeInTheDocument()
  })
})
