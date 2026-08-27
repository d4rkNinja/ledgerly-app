import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppContext, type AppContextValue } from '@/app/app-state'
import { InsightsPage } from './bills-insights'

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
      id: 'workspace-insights',
      name: 'Personal',
      type: 'personal',
      role: 'owner',
      memberCount: 1,
      permissions: ['view_transactions', 'export_data'],
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

function renderInsights(context: AppContextValue = appValue()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MotionConfig reducedMotion="always">
          <AppContext.Provider value={context}>
            <InsightsPage />
          </AppContext.Provider>
        </MotionConfig>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

type ReportFixture = {
  incomeMinor: number
  spendingMinor: number
  netMinor: number
  byCategory: Record<string, number>
  summary: string
  disclaimer: string
}

const currentReport: ReportFixture = {
  incomeMinor: 180_000,
  spendingMinor: 120_000,
  netMinor: 60_000,
  byCategory: { groceries: 50_000, transport: 70_000 },
  summary: 'Income was 180000 INR minor units.',
  disclaimer: 'Factual summary only; not financial advice.',
}

const previousReport: ReportFixture = {
  incomeMinor: 190_000,
  spendingMinor: 150_000,
  netMinor: 40_000,
  byCategory: { groceries: 60_000, dining: 30_000 },
  summary: '',
  disclaimer: '',
}

describe('live insights period comparison', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('compares totals and categories with the previous equivalent period', async () => {
    const now = new Date()
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString()
    apiMocks.get.mockImplementation((path: string) => {
      const url = new URL(`https://ledgerly.test${String(path)}`)
      // The live page always reports on a range starting at this month's start;
      // any other range is the previous equivalent period.
      if (url.searchParams.get('from') === monthStart) {
        return Promise.resolve(currentReport)
      }
      return Promise.resolve(previousReport)
    })

    renderInsights()

    expect(await screen.findByText('Income down 5% vs previous period')).toBeInTheDocument()
    expect(screen.getByText('Spending down 20% vs previous period')).toBeInTheDocument()
    expect(screen.getByText('Net cash flow up 50% vs previous period')).toBeInTheDocument()
    expect(screen.getByText('Down 17% from the previous period')).toBeInTheDocument()
    expect(screen.getByText('New category this period')).toBeInTheDocument()
  })

  it('renders the report without comparisons when the previous request fails', async () => {
    let calls = 0
    apiMocks.get.mockImplementation(() => {
      calls += 1
      if (calls === 1) return Promise.resolve(currentReport)
      return Promise.reject(new Error('previous range unavailable'))
    })

    renderInsights()

    expect(
      await screen.findByText('Net cash flow for the selected period'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/vs previous period/)).not.toBeInTheDocument()
    const fallbackSubtitles = screen.getAllByText('Current report period')
    expect(fallbackSubtitles.length).toBeGreaterThan(0)
  })

  it('re-queries current and previous ranges after navigating to another month', async () => {
    const augustStart = '2026-08-01T00:00:00.000Z'
    apiMocks.get.mockImplementation((path: string) => {
      const url = new URL(`https://ledgerly.test${String(path)}`)
      if (url.searchParams.get('from') === augustStart) {
        return Promise.resolve(currentReport)
      }
      return Promise.resolve(previousReport)
    })

    const user = userEvent.setup()
    renderInsights()

    expect(
      await screen.findByText('Net cash flow for the selected period'),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Previous month from August 2026' }),
    )

    await vi.waitFor(() => {
      const paths = apiMocks.get.mock.calls.map((call) => String(call[0]))
      expect(paths.some((path) => path.includes('from=2026-07-01T00%3A00%3A00.000Z'))).toBe(true)
      expect(paths.some((path) => path.includes('from=2026-05-31T00%3A00%3A00.000Z'))).toBe(true)
    })
  })
})
