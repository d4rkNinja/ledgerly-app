import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppContext, type AppContextValue } from '@/app/app-state'
import type { ImportSession } from '@/domain/intelligence'
import { ImportPage } from './imports'

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>()
  return {
    ...actual,
    api: apiMocks,
  }
})

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

const appValue: AppContextValue = {
  demoMode: false,
  isAuthenticated: true,
  userId: 'user-1',
  userName: 'Asha Rao',
  workspace: {
    id: 'workspace-imports',
    name: 'Personal',
    type: 'personal',
    role: 'owner',
    memberCount: 1,
    permissions: [
      'view_workspace',
      'view_balances',
      'view_transactions',
      'create_transactions',
      'edit_all_transactions',
    ],
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

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppContext.Provider value={appValue}>
          <Routes>
            <Route path="/app/import" element={<ImportPage />} />
            <Route path="/app/transactions" element={<p>Transactions list</p>} />
          </Routes>
        </AppContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function draftSession(): ImportSession {
  return {
    id: 'session-1',
    accountId: 'account-1',
    status: 'draft',
    sourceName: 'july-statement.csv',
    currency: 'INR',
    mapping: {
      hasHeader: true,
      dateColumn: 0,
      descriptionColumn: 1,
      amountColumn: 2,
      debitColumn: -1,
      creditColumn: -1,
      notesColumn: -1,
      referenceColumn: -1,
      dateFormat: 'iso',
      amountMode: 'signed',
    },
    rows: [
      {
        index: 0,
        rawDate: '2026-07-01',
        occurredAt: '2026-07-01T00:00:00Z',
        description: 'Coffee shop',
        amountMinor: 12050,
        direction: 'debit',
        state: 'new',
        action: 'create',
      },
      {
        index: 1,
        rawDate: '2026-07-02',
        occurredAt: '2026-07-02T00:00:00Z',
        description: 'Mystery row',
        amountMinor: 500,
        direction: 'debit',
        state: 'invalid',
        error: 'date is not recognised (02/32/2026)',
        action: '',
      },
    ],
    summary: {
      totalRows: 2,
      validRows: 1,
      errorRows: 1,
      duplicateRows: 0,
      possibleMatches: 0,
      newRows: 1,
      ignoredRows: 0,
      createCount: 1,
      linkCount: 0,
    },
    createdAt: '2026-07-03T10:00:00Z',
    updatedAt: '2026-07-03T10:00:00Z',
  }
}

describe('statement import wizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.get.mockResolvedValue([])
    apiMocks.post.mockResolvedValue(draftSession())
    apiMocks.patch.mockResolvedValue(draftSession())
    apiMocks.delete.mockResolvedValue(undefined)
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows an upload form and lists drafts waiting for review', async () => {
    apiMocks.get.mockImplementation((_path: string) => {
      if (String(_path).includes('/imports')) {
        return Promise.resolve([draftSession()])
      }
      return Promise.resolve([])
    })
    renderAt('/app/import')
    expect(await screen.findByText('Upload a statement')).toBeInTheDocument()
    expect(await screen.findByText('Waiting for review')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /discard draft july-statement.csv/i })).toBeInTheDocument()
  })

  it('reviews rows, resolves the invalid one by ignoring it, then commits', async () => {
    apiMocks.get.mockImplementation((path: string) => {
      if (String(path).includes('/imports/session-1')) {
        return Promise.resolve(draftSession())
      }
      return Promise.resolve([])
    })
    renderAt('/app/import?session=session-1')
    expect(await screen.findByText('july-statement.csv')).toBeInTheDocument()
    expect(screen.getByText(/Coffee shop/)).toBeInTheDocument()

    // The invalid row must be resolved before commit is possible.
    expect(screen.getByRole('button', { name: /^Import$/ })).toBeDisabled()
    expect(
      screen.getByText(/fix or ignore invalid rows before importing/i),
    ).toBeInTheDocument()
  })

  it('shows completed evidence after a successful commit', async () => {
    const session = { ...draftSession(), status: 'completed' as const }
    session.result = { createdCount: 2, linkedCount: 1, ignoredCount: 3, committedAt: '2026-07-03T11:00:00Z' }
    apiMocks.get.mockImplementation((path: string) => {
      if (String(path).includes('/imports/session-1')) {
        return Promise.resolve(session)
      }
      return Promise.resolve([])
    })
    renderAt('/app/import?session=session-1')
    expect(
      await screen.findByText('This statement was already imported'),
    ).toBeInTheDocument()
    expect(screen.getByText(/2 added · 1 linked · 3 ignored/)).toBeInTheDocument()
  })

  it('blocks the whole flow without create permission', () => {
    const restricted: AppContextValue = {
      ...appValue,
      workspace: { ...appValue.workspace!, permissions: ['view_transactions'] },
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/app/import']}>
          <AppContext.Provider value={restricted}>
            <ImportPage />
          </AppContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(
      screen.getByText(/needs a live workspace with permission/i),
    ).toBeInTheDocument()
  })

  it('resolves a row through the decision select', async () => {
    const session = draftSession()
    session.rows = session.rows.filter((row) => row.state !== 'invalid')
    session.summary = { ...session.summary, totalRows: 1, validRows: 1, errorRows: 0 }
    apiMocks.get.mockImplementation((path: string) => {
      if (String(path).includes('/imports/session-1')) {
        return Promise.resolve(session)
      }
      return Promise.resolve([])
    })
    const updated = {
      ...session,
      rows: [{ ...session.rows[0], action: 'ignore' }],
      summary: { ...session.summary, createCount: 0, ignoredRows: 1 },
    }
    apiMocks.post.mockResolvedValue(updated)
    const user = userEvent.setup()
    renderAt('/app/import?session=session-1')
    const select = await screen.findByRole('button', { name: /decision for row 1/i })
    await user.click(select)
    await user.click(await screen.findByRole('option', { name: 'Ignore row' }))
    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith(
        '/workspaces/workspace-imports/imports/session-1/resolve',
        { resolutions: [{ index: 0, action: 'ignore' }] },
      )
    })
  })

  it('re-parses through the real PATCH endpoint when the mapping changes', async () => {
    const session = draftSession()
    apiMocks.get.mockImplementation((path: string) => {
      if (String(path).includes('/imports/session-1')) {
        return Promise.resolve(session)
      }
      return Promise.resolve([])
    })
    const reparsed = {
      ...session,
      mapping: { ...session.mapping, dateFormat: 'dmy', amountMode: 'two_column' },
      summary: { ...session.summary, errorRows: 0, validRows: 2 },
    }
    apiMocks.patch.mockResolvedValue(reparsed)
    // The mapping editor needs the original CSV text remembered for this session.
    sessionStorage.setItem('ledgerly:import-csv:session-1', 'Date,Details,Amount\n01/07/2026,Coffee shop,-120.50\n')
    const user = userEvent.setup()
    renderAt('/app/import?session=session-1')
    expect(await screen.findByText('Column mapping')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /adjust columns/i }))
    await user.click(await screen.findByRole('button', { name: /date format/i }))
    await user.click(await screen.findByRole('option', { name: '22/08/2026' }))

    await user.click(screen.getByRole('button', { name: 'Amount layout' }))
    await user.click(await screen.findByRole('option', { name: /separate debit and credit columns/i }))

    await user.click(screen.getByRole('button', { name: /re-parse with these columns/i }))
    await waitFor(() => {
      expect(apiMocks.patch).toHaveBeenCalledWith(
        '/workspaces/workspace-imports/imports/session-1',
        expect.objectContaining({
          csv: 'Date,Details,Amount\n01/07/2026,Coffee shop,-120.50\n',
          mapping: expect.objectContaining({
            dateColumn: 0,
            descriptionColumn: 1,
            amountMode: 'two_column',
            dateFormat: 'dmy',
          }),
        }),
      )
    })
  })
})
