import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { AppContext, type AppContextValue } from '@/app/app-state'
import type { AutomationRule } from '@/domain/intelligence'
import type { AttentionResult } from '@/domain/intelligence'
import { RulesPage } from './rules'
import { AttentionStrip } from '@/components/attention-strip'

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

function appValue(overrides: Partial<AppContextValue> = {}): AppContextValue {
  return {
    demoMode: false,
    isAuthenticated: true,
    userId: 'user-1',
    userName: 'Asha Rao',
    workspace: {
      id: 'workspace-rules',
      name: 'Personal',
      type: 'personal',
      role: 'owner',
      memberCount: 1,
      permissions: ['view_transactions', 'edit_all_transactions'],
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

function renderWithApp(ui: React.ReactNode, context: AppContextValue = appValue()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppContext.Provider value={context}>{ui}</AppContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('automation rules page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
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
    apiMocks.get.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('describes a rule in plain language and offers management actions', async () => {
    const rule: AutomationRule = {
      id: 'rule-1',
      name: 'Uber rides',
      priority: 3,
      enabled: true,
      conditions: [
        { field: 'description', operator: 'contains', value: 'uber' },
        { field: 'type', operator: 'equals', value: 'expense' },
      ],
      actions: [
        { type: 'set_category', value: 'Transportation' },
        { type: 'rename', value: 'Uber' },
      ],
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z',
    }
    apiMocks.get.mockResolvedValue([rule])
    renderWithApp(<RulesPage />)
    expect(await screen.findByText('Uber rides')).toBeInTheDocument()
    expect(
      screen.getByText(/Description contains "uber" AND Entry type is "expense"/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Set category: Transportation/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument()
  })

  it('hides editing controls for members who cannot manage every transaction', async () => {
    apiMocks.get.mockResolvedValue([])
    renderWithApp(
      <RulesPage />,
      appValue({
        workspace: {
          id: 'workspace-rules',
          name: 'Family',
          type: 'family',
          role: 'member',
          memberCount: 2,
          permissions: ['view_transactions'],
        },
      }),
    )
    expect(await screen.findByText('No rules yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /new rule/i })).not.toBeInTheDocument()
  })
})

describe('attention strip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
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

  it('renders actionable items with links and severity styling', async () => {
    const attention: AttentionResult = {
      generatedAt: '2026-07-03T10:00:00Z',
      items: [
        {
          kind: 'overdue_bill',
          severity: 'critical',
          title: '1 overdue bill',
          detail: 'Oldest is 4 days past due.',
          count: 1,
          amountMinor: 120000,
          currency: 'INR',
          href: '/app/bills',
        },
      ],
    }
    apiMocks.get.mockResolvedValue(attention)
    const { container } = renderWithApp(<AttentionStrip />)
    expect(await screen.findByRole('link', { name: /1 overdue bill/i })).toBeInTheDocument()
    expect(container.querySelector('[data-severity="critical"]')).not.toBeNull()
    expect(apiMocks.get).toHaveBeenCalledWith('/workspaces/workspace-rules/attention')
  })

  it('renders nothing when the workspace is quiet or unavailable', async () => {
    apiMocks.get.mockRejectedValue(new Error('offline'))
    const { container } = renderWithApp(<AttentionStrip />)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(container).toBeEmptyDOMElement()
  })
})
