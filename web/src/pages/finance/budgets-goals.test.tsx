import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router'
import { AppContext, type AppContextValue } from '@/app/app-state'
import type { Permission } from '@/domain/types'
import { GoalsPage } from './budgets-goals'

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

const workspace = {
  id: 'workspace-goals',
  name: 'Shared goals',
  type: 'family' as const,
  role: 'owner' as const,
  memberCount: 2,
  permissions: ['manage_goals', 'create_transactions', 'export_data'] as Permission[],
}

const account = {
  id: 'account-goals',
  name: 'Everyday account',
  type: 'Cash',
  balanceMinor: 250000,
  currency: 'INR',
}

function goalPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'goal-a',
    name: 'Emergency reserve',
    description: 'A buffer for unexpected costs.',
    type: 'emergency_fund',
    direction: 'save',
    targetMinor: 100000,
    currentMinor: 40000,
    remainingMinor: 60000,
    currency: 'INR',
    startDate: '2026-01-01T00:00:00.000Z',
    dueDate: '2000-01-01T00:00:00.000Z',
    targetDate: '2000-01-01T00:00:00.000Z',
    status: 'overdue',
    visibility: 'workspace',
    contactId: 'contact-a',
    contactName: 'Alex Morgan',
    contact: { id: 'contact-a', name: 'Alex Morgan', phone: '+91 90000 00000', email: 'alex@example.test' },
    accountId: 'account-goals',
    category: 'Safety',
    notes: 'Build this gradually.',
    completionDate: undefined,
    linkedTransactionIds: ['transaction-linked'],
    createdBySummary: { name: 'Asha Rao', initials: 'AR', status: 'active', isCurrentUser: true },
    history: [
      {
        action: 'progress',
        actorId: 'member-a',
        amountMinor: 40000,
        date: '2026-07-15T00:00:00.000Z',
        createdAt: '2026-07-15T12:00:00.000Z',
      },
    ],
    ...overrides,
  }
}

function appValue(): AppContextValue {
  return {
    demoMode: false,
    isAuthenticated: true,
    userId: 'owner-a',
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
    refreshWorkspaces: vi.fn().mockResolvedValue([workspace]),
    deleteWorkspace: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn(),
    setWorkspace: vi.fn(),
    setDefaultWorkspace: vi.fn(),
    setPrivacyMode: vi.fn(),
    setPreferredCurrency: vi.fn(),
    setTheme: vi.fn(),
  }
}

function LocationProbe() {
  const location = useLocation()
  return <><output data-testid="location-search">{location.search}</output><output data-testid="location-path">{location.pathname}</output></>
}

function renderGoals(initialEntry = '/app/goals?goal=goal-a') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AppContext.Provider value={appValue()}>
            <MotionConfig reducedMotion="always">
              <GoalsPage />
              <LocationProbe />
            </MotionConfig>
          </AppContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

describe('goal details and actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith('/accounts')) return Promise.resolve([account])
      if (path.endsWith('/goals')) return Promise.resolve([goalPayload()])
      if (path.endsWith('/goals/goal-a')) return Promise.resolve(goalPayload())
      return Promise.resolve([])
    })
    apiMocks.post.mockResolvedValue({})
    apiMocks.patch.mockResolvedValue({})
    apiMocks.delete.mockResolvedValue(undefined)
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('opens the URL-selected authorized goal and renders complete detail history', async () => {
    const user = userEvent.setup()
    renderGoals()

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Alex Morgan · +91 90000 00000 · alex@example.test')).toBeInTheDocument()
    expect(screen.getByText('Asha Rao')).toBeInTheDocument()
    expect(screen.getByText(/Overdue by \d+ days/)).toBeInTheDocument()
    const historyItem = screen.getAllByRole('listitem').find((item) => item.textContent?.includes('progress'))
    expect(historyItem).toBeDefined()
    expect(within(historyItem as HTMLElement).getByText('progress')).toBeInTheDocument()
    expect(within(historyItem as HTMLElement).getByText(/₹400/)).toBeInTheDocument()
    expect(historyItem).toHaveTextContent('Actor member-a')
    expect(screen.getByRole('link', { name: 'Open transaction transaction-linked' })).toHaveAttribute(
      'href',
      '/app/transactions?transaction=transaction-linked',
    )

    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    await waitFor(() => expect(screen.getByTestId('location-search')).toBeEmptyDOMElement())
  })

  it('selects a goal with the keyboard and safely clears a missing goal URL', async () => {
    const user = userEvent.setup()
    renderGoals('/app/goals')
    const card = await screen.findByRole('button', { name: 'View details for Emergency reserve goal' })
    card.focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))

    cleanup()
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith('/accounts')) return Promise.resolve([account])
      if (path.endsWith('/goals')) return Promise.resolve([])
      if (path.endsWith('/goals/missing')) return Promise.reject(new Error('not found'))
      return Promise.resolve([])
    })
    renderGoals('/app/goals?goal=missing')
    await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/workspaces/workspace-goals/goals/missing'))
    await waitFor(() => expect(screen.getByTestId('location-search')).toBeEmptyDOMElement())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('navigates a linked transaction to the transaction detail URL', async () => {
    const user = userEvent.setup()
    renderGoals()
    await user.click(await screen.findByRole('link', { name: 'Open transaction transaction-linked' }))
    expect(screen.getByTestId('location-path')).toHaveTextContent('/app/transactions')
    expect(screen.getByTestId('location-search')).toHaveTextContent('?transaction=transaction-linked')
  })

  it('posts progress with the declared date, prevents duplicate clicks, and reuses its idempotency key', async () => {
    const user = userEvent.setup()
    let resolveRequest: (() => void) | undefined
    apiMocks.post.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveRequest = resolve }))
    renderGoals('/app/goals?goal=goal-a')
    await user.click(await screen.findByRole('button', { name: 'Record progress' }))
    await user.type(screen.getByLabelText('Goal action amount'), '12.34')
    const save = screen.getByRole('button', { name: 'Save progress' })
    await user.click(save)
    await user.click(save)
    expect(apiMocks.post).toHaveBeenCalledTimes(1)
    const firstCall = apiMocks.post.mock.calls[0]
    expect(firstCall[0]).toBe('/workspaces/workspace-goals/goals/goal-a/progress')
    expect(firstCall[1]).toEqual({ amountMinor: 1234, occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/) })
    expect(firstCall[2]).toEqual({ 'Idempotency-Key': expect.any(String) })
    resolveRequest?.()
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Record goal progress' })).not.toBeInTheDocument())
  })

  it('confirms a real transaction before submission and sends one stable idempotency key', async () => {
    const user = userEvent.setup()
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith('/accounts')) return Promise.resolve([account])
      if (path.endsWith('/goals')) return Promise.resolve([goalPayload({ direction: 'receive' })])
      return Promise.resolve([])
    })
    const { client } = renderGoals('/app/goals?goal=goal-a')
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await user.click(await screen.findByRole('button', { name: 'Record transaction' }))
    await user.type(screen.getByLabelText('Goal action amount'), '25')
    await user.click(screen.getByRole('button', { name: 'Goal transaction account' }))
    await user.click(screen.getByRole('option', { name: /Everyday account/ }))
    await user.click(screen.getByRole('button', { name: 'Review transaction' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Record this real transaction?')
    await user.click(screen.getByRole('button', { name: 'Confirm and record' }))
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith(
      '/workspaces/workspace-goals/goals/goal-a/transactions',
      expect.objectContaining({ amountMinor: 2500, occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/) }),
      { 'Idempotency-Key': expect.any(String) },
    ))
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['period-reviews', 'workspace-goals'],
      })
    })
  })

  it('reuses the same idempotency key when retrying an unchanged progress request', async () => {
    const user = userEvent.setup()
    apiMocks.post.mockRejectedValueOnce(new Error('temporary network failure')).mockResolvedValueOnce({})
    renderGoals('/app/goals?goal=goal-a')
    await user.click(await screen.findByRole('button', { name: 'Record progress' }))
    await user.type(screen.getByLabelText('Goal action amount'), '12.34')
    await user.click(screen.getByRole('button', { name: 'Save progress' }))
    await screen.findAllByText('The goal action could not be saved. No changes were made.')
    await user.click(screen.getByRole('button', { name: 'Save progress' }))
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledTimes(2))
    expect(apiMocks.post.mock.calls[0][2]).toEqual(apiMocks.post.mock.calls[1][2])
  })

  it('posts link, reschedule, cancel, and reopen actions', async () => {
    const user = userEvent.setup()
    renderGoals('/app/goals?goal=goal-a')
    await user.click(await screen.findByRole('button', { name: 'Link transaction' }))
    await user.type(screen.getByPlaceholderText('Transaction ID'), 'transaction-existing')
    await user.click(screen.getByRole('button', { name: 'Link transaction' }))
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith(
      '/workspaces/workspace-goals/goals/goal-a/link-transaction',
      { transactionId: 'transaction-existing' },
      { 'Idempotency-Key': expect.any(String) },
    ))

    cleanup()
    vi.clearAllMocks()
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith('/accounts')) return Promise.resolve([account])
      if (path.endsWith('/goals')) return Promise.resolve([goalPayload({ status: 'in_progress', dueDate: '2099-12-31T00:00:00.000Z' })])
      return Promise.resolve([])
    })
    apiMocks.post.mockResolvedValue({})
    renderGoals('/app/goals?goal=goal-a')
    await user.click(await screen.findByRole('button', { name: 'Reschedule' }))
    await user.click(screen.getByRole('button', { name: 'Reschedule' }))
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith(
      '/workspaces/workspace-goals/goals/goal-a/reschedule',
      { dueDate: '2099-12-31T00:00:00.000Z' },
    ))

    cleanup()
    vi.clearAllMocks()
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith('/accounts')) return Promise.resolve([account])
      if (path.endsWith('/goals')) return Promise.resolve([goalPayload({ status: 'in_progress' })])
      return Promise.resolve([])
    })
    renderGoals('/app/goals?goal=goal-a')
    await user.click(await screen.findByRole('button', { name: 'Cancel goal' }))
    await user.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Cancel goal' }))
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/workspaces/workspace-goals/goals/goal-a/cancel', {}))

    cleanup()
    vi.clearAllMocks()
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith('/accounts')) return Promise.resolve([account])
      if (path.endsWith('/goals')) return Promise.resolve([goalPayload({ status: 'cancelled' })])
      return Promise.resolve([])
    })
    renderGoals('/app/goals?goal=goal-a')
    await user.click(await screen.findByRole('button', { name: 'Reopen' }))
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/workspaces/workspace-goals/goals/goal-a/reopen', {}))
  })
})
