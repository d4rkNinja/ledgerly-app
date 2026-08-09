import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppContext, type AppContextValue } from '@/app/app-state'
import type { Contact, Permission, SavedTransactionName } from '@/domain/types'
import { ContactsPage, SavedTransactionNamesPage } from './contacts'

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

const contact: Contact = {
  id: 'contact-1',
  name: 'Priya Shah',
  phone: '+91 98765 43210',
  email: 'priya@example.com',
  notes: 'Monthly rent',
  createdBy: 'user-1',
  createdAt: '2026-08-05T10:00:00.000Z',
  updatedAt: '2026-08-05T10:00:00.000Z',
}

const savedName: SavedTransactionName = {
  id: 'name-1',
  name: 'Monthly rent',
  createdBy: 'user-1',
  createdAt: '2026-08-05T10:00:00.000Z',
  updatedAt: '2026-08-05T10:00:00.000Z',
}

const permissions: Permission[] = [
  'view_transactions',
  'create_transactions',
  'edit_all_transactions',
]

const appValue: AppContextValue = {
  demoMode: false,
  isAuthenticated: true,
  userId: 'user-1',
  userName: 'Asha Rao',
  workspace: {
    id: 'workspace-directory',
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
  resolvedTheme: 'dark',
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

describe('contact and saved-name directories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith('/contacts')) return Promise.resolve([contact])
      if (path.endsWith('/saved-transaction-names')) return Promise.resolve([savedName])
      return Promise.resolve([])
    })
    apiMocks.post.mockResolvedValue({ id: 'contact-2' })
    apiMocks.patch.mockResolvedValue(contact)
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

  it('renders Contacts as a standalone management page and creates a contact', async () => {
    const user = userEvent.setup()
    renderWithApp(<ContactsPage />)

    expect(screen.getByRole('heading', { name: 'Contacts' })).toBeInTheDocument()
    await screen.findByRole('button', { name: /view details for priya shah/i })

    await user.click(screen.getByRole('button', { name: 'Add contact' }))
    await user.type(screen.getByLabelText('Name'), 'Mohan Kumar')
    await user.type(screen.getByLabelText('Phone'), '+91 90000 00000')
    await user.click(screen.getByRole('button', { name: 'Save contact' }))

    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith(
        '/workspaces/workspace-directory/contacts',
        {
          name: 'Mohan Kumar',
          phone: '+91 90000 00000',
          email: '',
          notes: '',
        },
      )
    })
  })

  it('uses a confirmed deletion flow that keeps historical transactions', async () => {
    const user = userEvent.setup()
    renderWithApp(<ContactsPage />)

    await user.click(await screen.findByRole('button', { name: /view details for priya shah/i }))
    await user.click(screen.getByRole('button', { name: 'Delete contact' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Existing transactions remain unchanged',
    )
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(apiMocks.delete).not.toHaveBeenCalled()
  })

  it('renders Saved names as its own account-style page', async () => {
    renderWithApp(<SavedTransactionNamesPage />)

    expect(screen.getByRole('heading', { name: 'Saved names' })).toBeInTheDocument()
    await screen.findByRole('button', { name: /view details for monthly rent/i })
    expect(apiMocks.get).toHaveBeenCalledWith(
      '/workspaces/workspace-directory/saved-transaction-names',
    )
  })
})
