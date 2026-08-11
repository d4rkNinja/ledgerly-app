import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppContext, type AppContextValue } from '@/app/app-state'
import type { Account, Permission } from '@/domain/types'
import { AccountCreateDialog } from '../finance-writes/AccountDialogs'
import { AccountsPage } from './accounts'
import { AccountEditDialog } from '../finance-writes/AccountDialogs'

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

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const account: Account = {
  id: 'account-1',
  name: 'Household savings',
  kind: 'savings',
  bankName: 'Example Bank',
  maskedNumber: '•••• 1842',
  openingMinor: 125000,
  balance: { amountMinor: 175000, currency: 'INR' },
  color: '#2d7d5a',
  icon: 'landmark',
  notes: 'Emergency fund',
  status: 'active',
  privacy: 'workspace',
  excludeFromTotal: false,
}

const permissions: Permission[] = [
  'view_balances',
  'edit_vault',
  'archive_vault',
  'export_data',
]

const appValue: AppContextValue = {
  demoMode: false,
  isAuthenticated: true,
  userId: 'user-1',
  userName: 'Asha Rao',
  workspace: {
    id: 'workspace-accounts',
    name: 'Household',
    type: 'family',
    role: 'owner',
    memberCount: 2,
    permissions,
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

function renderWithApp(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AppContext.Provider value={appValue}>
            <MotionConfig reducedMotion="always">{ui}</MotionConfig>
          </AppContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

function chooseAccountFromList() {
  return screen.findByRole('button', {
    name: /view details for household savings/i,
  })
}

describe('bank account management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.get.mockResolvedValue([
      {
        id: account.id,
        name: account.name,
        type: account.kind,
        bankName: account.bankName,
        maskedIdentifier: account.maskedNumber,
        openingMinor: account.openingMinor,
        balanceMinor: account.balance.amountMinor,
        currency: account.balance.currency,
        color: account.color,
        icon: account.icon,
        notes: account.notes,
        status: account.status,
        privacy: account.privacy,
        excludeFromTotal: account.excludeFromTotal,
      },
    ])
    apiMocks.post.mockResolvedValue({ id: 'account-new' })
    apiMocks.patch.mockResolvedValue({ id: account.id })
    apiMocks.delete.mockResolvedValue(undefined)
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
  })

  it('submits supported bank account metadata when creating an account', async () => {
    const user = userEvent.setup()
    renderWithApp(<AccountCreateDialog open onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Account name'), {
      target: { value: 'Travel savings' },
    })
    fireEvent.change(screen.getByLabelText('Bank name'), {
      target: { value: 'Example Bank' },
    })
    fireEvent.change(screen.getByLabelText('Account identifier'), {
      target: { value: '•••• 9012' },
    })
    fireEvent.change(screen.getByLabelText('Opening balance'), {
      target: { value: '1250' },
    })
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Trip fund' },
    })
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith(
        '/workspaces/workspace-accounts/accounts',
        {
          name: 'Travel savings',
          bankName: 'Example Bank',
          type: 'savings',
          maskedIdentifier: '•••• 9012',
          openingMinor: 125000,
          currency: 'INR',
          color: '#2d7d5a',
          icon: 'landmark',
          notes: 'Trip fund',
          status: 'active',
          privacy: 'workspace',
          excludeFromTotal: false,
        },
      )
    })
  })

  it('shows a derived read-only current balance and submits editable account metadata', async () => {
    const user = userEvent.setup()
    renderWithApp(<AccountEditDialog account={account} open onClose={vi.fn()} />)

    expect(screen.getByLabelText('Current balance')).toHaveTextContent('1,750')
    expect(screen.getByLabelText('Bank name')).toHaveValue('Example Bank')
    expect(screen.getByLabelText('Account identifier')).toHaveValue('•••• 1842')
    fireEvent.change(screen.getByLabelText('Bank name'), {
      target: { value: 'Updated Bank' },
    })
    await user.click(screen.getByRole('button', { name: 'Save account' }))

    await waitFor(() => {
      expect(apiMocks.patch).toHaveBeenCalledWith(
        '/workspaces/workspace-accounts/accounts/account-1',
        {
          name: 'Household savings',
          bankName: 'Updated Bank',
          type: 'savings',
          maskedIdentifier: '•••• 1842',
          openingMinor: 125000,
          currency: 'INR',
          color: '#2d7d5a',
          icon: 'landmark',
          notes: 'Emergency fund',
          status: 'active',
          privacy: 'workspace',
          excludeFromTotal: false,
        },
      )
    })
  })

  it('does not archive an account when the user keeps it', async () => {
    const user = userEvent.setup()
    renderWithApp(<AccountsPage />)

    await user.click(await chooseAccountFromList())
    await user.click(screen.getByRole('button', { name: 'Archive account' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'does not delete, reassign, or alter associated transactions',
    )
    await user.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(apiMocks.delete).not.toHaveBeenCalled()
  })

  it('archives only after confirmation and invalidates dependent account data', async () => {
    const user = userEvent.setup()
    const { client } = renderWithApp(<AccountsPage />)
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    await user.click(await chooseAccountFromList())
    await user.click(screen.getByRole('button', { name: 'Archive account' }))
    await user.click(screen.getByRole('button', { name: 'Archive account' }))

    await waitFor(() => {
      expect(apiMocks.delete).toHaveBeenCalledWith(
        '/workspaces/workspace-accounts/accounts/account-1',
      )
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['transactions', 'workspace-accounts'],
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['accounts', 'workspace-accounts'],
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['dashboard', 'workspace-accounts'],
    })
  })
})
