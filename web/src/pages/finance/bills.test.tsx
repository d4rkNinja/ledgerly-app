import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppContext, type AppContextValue } from '@/app/app-state'
import type { Bill } from '@/domain/types'
import type { RecurringSuggestion } from '@/domain/intelligence'
import { BillsPage } from './bills-insights'

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {},
  api: apiMocks,
}))

class IntersectionObserverStub implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '0px'
  readonly thresholds = [0]
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function appValue(overrides: Partial<AppContextValue> = {}): AppContextValue {
  return {
    demoMode: false,
    isAuthenticated: true,
    userId: 'user-1',
    userName: 'Asha Rao',
    workspace: {
      id: 'workspace-bills',
      name: 'Personal',
      type: 'personal',
      role: 'owner',
      memberCount: 1,
      permissions: ['view_transactions', 'export_data', 'manage_bills'],
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
    ...overrides,
  }
}

function renderWithApp(context: AppContextValue = appValue()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MotionConfig reducedMotion="always">
          <AppContext.Provider value={context}>
            <BillsPage />
          </AppContext.Provider>
        </MotionConfig>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const bill: Bill = {
  id: 'bill-1',
  name: 'Apartment rent',
  dueDate: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  amount: { amountMinor: 2_500_00, currency: 'INR' },
  autopay: true,
  frequency: 'monthly',
}

const suggestion: RecurringSuggestion = {
  signature: 'sig-1',
  label: 'Netflix',
  category: 'Entertainment',
  direction: 'debit',
  amountMinor: 64_900,
  currency: 'INR',
  frequency: 'monthly',
  occurrences: 4,
  lastOccurredAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
  nextDueEstimate: new Date(Date.now() + 20 * 86_400_000).toISOString(),
}

describe('bills page management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.get.mockResolvedValue([])
    apiMocks.post.mockResolvedValue({})
    apiMocks.patch.mockResolvedValue({})
    apiMocks.delete.mockResolvedValue(undefined)
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows detected recurring payments with approval and dismissal actions', async () => {
    apiMocks.get.mockImplementation((path: string) => {
      if (String(path).includes('/bills')) return Promise.resolve([bill])
      if (String(path).includes('/recurring-suggestions')) {
        return Promise.resolve([suggestion])
      }
      return Promise.resolve([])
    })
    const user = userEvent.setup()
    renderWithApp()

    expect(await screen.findByText('Apartment rent')).toBeInTheDocument()
    expect(await screen.findByText('Detected recurring payments')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /add as bill/i }))
    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith(
        '/workspaces/workspace-bills/recurring-suggestions/accept',
        { signature: 'sig-1' },
      )
    })

    await user.click(screen.getByRole('button', { name: /dismiss netflix suggestion/i }))
    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith(
        '/workspaces/workspace-bills/recurring-suggestions/dismiss',
        { signature: 'sig-1' },
      )
    })
  })

  it('creates a bill through the dialog using the real POST contract', async () => {
    apiMocks.get.mockResolvedValue([])
    const user = userEvent.setup()
    renderWithApp()

    await user.click(await screen.findByRole('button', { name: /add bill/i }))
    await user.type(screen.getByLabelText('Bill name'), 'Gym membership')
    const amountInput = screen.getByLabelText(/amount \(inr\)/i)
    await user.clear(amountInput)
    await user.type(amountInput, '1999.00')
    await user.click(screen.getByRole('button', { name: 'Add bill' }))

    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledTimes(1)
    })
    const [path, body] = apiMocks.post.mock.calls[0]
    expect(path).toBe('/workspaces/workspace-bills/bills')
    expect(body).toMatchObject({
      name: 'Gym membership',
      amountMinor: 199_900,
      currency: 'INR',
      frequency: 'monthly',
      autopay: false,
    })
  })

  it('hides management actions for viewers without the manage permission', async () => {
    apiMocks.get.mockResolvedValue([bill])
    renderWithApp(appValue({
      workspace: {
        id: 'workspace-bills',
        name: 'Family',
        type: 'family',
        role: 'viewer',
        memberCount: 3,
        permissions: ['view_transactions'],
      },
    }))
    expect(await screen.findByText('Apartment rent')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add bill/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit apartment rent/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete apartment rent/i })).not.toBeInTheDocument()
  })
})
