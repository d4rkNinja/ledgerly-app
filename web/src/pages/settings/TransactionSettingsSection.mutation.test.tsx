import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppContext, type AppContextValue } from '@/app/app-state'
import type { TransactionCategory } from '@/domain/transaction-categories'
import { TransactionSettingsSection } from './TransactionSettingsSection'

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
  id: 'workspace-settings',
  name: 'Shared books',
  type: 'family' as const,
  role: 'owner' as const,
  memberCount: 2,
  permissions: [],
}

const categories: TransactionCategory[] = [
  {
    id: 'category-client-meals',
    transactionType: 'expense',
    name: 'Client meals',
    description: 'Meals with clients',
    icon: 'utensils',
    color: '#536d52',
    sortOrder: 0,
    isActive: true,
    usageCount: 0,
  },
  {
    id: 'category-travel',
    transactionType: 'expense',
    name: 'Travel',
    sortOrder: 1,
    isActive: true,
    usageCount: 0,
  },
]

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

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <AppContext.Provider value={appValue()}>
        <MotionConfig reducedMotion="always">
          <TransactionSettingsSection />
        </MotionConfig>
      </AppContext.Provider>
    </QueryClientProvider>,
  )
  return { client, ...view }
}

describe('transaction category period-review invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith('/transaction-sequences')) return Promise.resolve([])
      if (path.includes('/transaction-categories?transactionType=expense')) {
        return Promise.resolve(categories)
      }
      return Promise.resolve([])
    })
    apiMocks.patch.mockImplementation(
      (_path: string, body: Record<string, unknown>) =>
        Promise.resolve({ ...categories[0], ...body }),
    )
    apiMocks.delete.mockResolvedValue(undefined)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        readonly root = null
        readonly rootMargin = '0px'
        readonly thresholds = [0]

        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return []
        }
      },
    )
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

  it('invalidates period reviews after a live category rename and delete', async () => {
    const user = userEvent.setup()
    const { client } = renderSettings()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const periodReviewInvalidations = () =>
      invalidate.mock.calls.filter(
        ([filters]) =>
          JSON.stringify(filters?.queryKey) ===
          JSON.stringify(['period-reviews', 'workspace-settings']),
      )

    await user.click(screen.getByRole('tab', { name: 'Categories' }))
    await user.click(
      await screen.findByRole('button', { name: 'Edit Client meals' }),
    )
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Business meals')
    await user.click(screen.getByRole('button', { name: 'Save category' }))

    await waitFor(() => {
      expect(apiMocks.patch).toHaveBeenCalledWith(
        '/workspaces/workspace-settings/transaction-categories/category-client-meals',
        expect.objectContaining({ name: 'Business meals' }),
      )
      expect(periodReviewInvalidations()).toHaveLength(1)
    })

    await user.click(screen.getByRole('button', { name: 'Delete Client meals' }))
    const confirmation = screen.getByRole('dialog', { name: 'Delete category' })
    await user.click(
      within(confirmation).getByRole('button', { name: 'Delete category' }),
    )

    await waitFor(() => {
      expect(apiMocks.delete).toHaveBeenCalledWith(
        '/workspaces/workspace-settings/transaction-categories/category-client-meals',
      )
      expect(periodReviewInvalidations()).toHaveLength(2)
    })
  })
})
