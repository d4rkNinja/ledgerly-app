import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppContext, type AppContextValue } from '@/app/app-state'
import type { Budget, Transaction } from '@/domain/types'
import { BudgetEditDialog, TransactionEditDialog } from './record-edit-dialogs'

const apiMocks = vi.hoisted(() => ({
  patch: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {},
  api: apiMocks,
}))

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const workspace = {
  id: 'workspace-a',
  name: 'Shared books',
  type: 'family' as const,
  role: 'owner' as const,
  memberCount: 1,
  permissions: [],
}

const transaction: Transaction = {
  id: 'transaction-a',
  merchant: 'Groceries',
  category: 'Food',
  occurredAt: '2026-08-04T23:30:00.000Z',
  amount: { amountMinor: 1250, currency: 'INR' },
  direction: 'debit',
  status: 'cleared',
  accountId: 'account-a',
  rawType: 'expense',
  privacy: 'workspace',
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

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <MotionConfig reducedMotion="always">
      <QueryClientProvider client={client}>
        <AppContext.Provider value={appValue()}>
          <TransactionEditDialog
            transaction={transaction}
            open
            onClose={vi.fn()}
          />
        </AppContext.Provider>
      </QueryClientProvider>
    </MotionConfig>,
  )
}

function renderBudgetDialog() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const budget = {
    id: 'budget-a',
    name: 'Food',
    period: 'monthly',
    limit: { amountMinor: 50000, currency: 'INR' },
    categories: ['Food'],
    rollover: false,
    startAt: '2026-08-01T00:00:00.000Z',
    endAt: '2026-09-01T00:00:00.000Z',
  } as Budget

  return render(
    <MotionConfig reducedMotion="always">
      <QueryClientProvider client={client}>
        <AppContext.Provider value={appValue()}>
          <BudgetEditDialog budget={budget} open onClose={vi.fn()} />
        </AppContext.Provider>
      </QueryClientProvider>
    </MotionConfig>,
  )
}

describe('TransactionEditDialog date selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.patch.mockResolvedValue({})
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
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
    delete (HTMLElement.prototype as { scrollIntoView?: () => void })
      .scrollIntoView
  })

  it('serializes a selected transaction date at UTC midnight without a timezone shift', async () => {
    const user = userEvent.setup()
    renderDialog()

    const date = screen.getByRole('button', { name: /^transaction date/i })
    expect(date).toHaveTextContent('Aug 4, 2026')
    expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument()

    await user.click(date)
    await user.click(
      screen.getByRole('gridcell', { name: 'Choose August 17, 2026' }),
    )
    await user.click(screen.getByRole('button', { name: 'Save transaction' }))

    await waitFor(() => {
      expect(apiMocks.patch).toHaveBeenCalledWith(
        '/workspaces/workspace-a/transactions/transaction-a',
        expect.objectContaining({
          occurredAt: '2026-08-17T00:00:00.000Z',
        }),
      )
    })
  })

  it('rejects a cleared transaction date before sending the update', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(
      screen.getByRole('button', { name: 'Clear Transaction date' }),
    )
    await user.click(screen.getByRole('button', { name: 'Save transaction' }))

    expect(await screen.findByText('Choose a valid date.')).toBeInTheDocument()
    expect(apiMocks.patch).not.toHaveBeenCalled()
  })

  it('uses the BeUI checkbox for the budget rollover preference', async () => {
    const user = userEvent.setup()
    renderBudgetDialog()

    const rollover = screen.getByRole('checkbox', {
      name: /roll unused amount forward/i,
    })
    expect(rollover).toHaveAttribute('data-state', 'unchecked')

    await user.click(rollover)
    expect(rollover).toHaveAttribute('aria-checked', 'true')
  })
})
