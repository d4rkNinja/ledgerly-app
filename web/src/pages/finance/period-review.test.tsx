import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  PeriodReview,
  PeriodReviewChange,
  PeriodReviewTransactionVersion,
} from '@/domain/period-review'
import type { Workspace } from '@/domain/types'

import type { DashboardPeriodValue } from './period-selector'
import { PeriodReviewCard } from './period-review'

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {},
  api: apiMocks,
}))

const july: DashboardPeriodValue = {
  mode: 'custom-month',
  month: '2026-07-01',
  from: '2026-07-01',
  to: '2026-07-31',
}

const personalWorkspace: Workspace = {
  id: 'workspace-personal',
  name: 'Personal ledger',
  type: 'personal',
  role: 'owner',
  memberCount: 1,
  currency: 'USD',
  permissions: [
    'view_balances',
    'view_transactions',
    'view_audit_history',
  ],
}

const sharedWorkspace: Workspace = {
  ...personalWorkspace,
  id: 'workspace-shared',
  name: 'Household',
  type: 'family',
  memberCount: 3,
  permissions: [...(personalWorkspace.permissions ?? []), 'approve_expenses'],
}

const totals = (
  incomeMinor = '0',
  spendingMinor = '0',
  netMinor = '0',
  transactionCount = '0',
) => ({ incomeMinor, spendingMinor, netMinor, transactionCount })

function makeReview(overrides: Partial<PeriodReview> = {}): PeriodReview {
  return {
    id: 'review-1',
    workspaceId: personalWorkspace.id,
    status: 'reviewed',
    scope: 'member_view',
    from: '2026-07-01',
    to: '2026-07-31',
    timezone: 'Asia/Kolkata',
    fromUtc: '2026-06-30T18:30:00Z',
    toUtcExclusive: '2026-07-31T18:30:00Z',
    currency: 'USD',
    snapshot: totals('250000', '100000', '150000', '7'),
    vaultCount: 1,
    accountCount: 1,
    scopeNote: 'Your visible vaults and accounts at review time.',
    reviewedBy: {
      name: 'Asha Rao',
      initials: 'AR',
      status: 'active',
      isCurrentUser: true,
    },
    createdAt: '2026-08-01T08:15:00Z',
    delta: totals(),
    changeCount: '0',
    changedAfterClose: false,
    reviewState: 'current',
    ...overrides,
  }
}

function makeVersion(
  overrides: Partial<PeriodReviewTransactionVersion> = {},
): PeriodReviewTransactionVersion {
  return {
    id: 'transaction-1',
    transactionId: 'EXP-0042',
    accountId: 'account-1',
    type: 'expense',
    amountMinor: '4250',
    currency: 'USD',
    category: 'Groceries',
    merchant: 'Neighbourhood market',
    description: 'Weekly shop',
    notes: 'Receipt saved',
    privacy: 'workspace',
    occurredAt: '2026-07-01T00:00:00.000Z',
    enteredAt: '2026-07-02T03:04:05Z',
    createdAt: '2026-07-02T03:04:05Z',
    editedAt: '2026-08-02T06:07:08Z',
    updatedAt: '2026-08-02T06:07:08Z',
    approvalState: 'not_applicable',
    revisionState: 'committed',
    hasSplits: false,
    ...overrides,
  }
}

function makeChange(
  revisionOrder: string,
  overrides: Partial<PeriodReviewChange> = {},
): PeriodReviewChange {
  return {
    action: 'edited',
    editor: {
      name: 'Ravi Shah',
      initials: 'RS',
      status: 'former',
      isCurrentUser: false,
    },
    before: makeVersion({
      id: `transaction-${revisionOrder}`,
      merchant: `Merchant ${revisionOrder}`,
    }),
    after: makeVersion({
      id: `transaction-${revisionOrder}`,
      merchant: `Merchant ${revisionOrder}`,
      amountMinor: '4300',
    }),
    changedAt: '2026-08-02T06:07:08Z',
    delta: totals('0', '50', '-50', '0'),
    changedFields: ['amountMinor'],
    approvalState: 'not_applicable',
    revisionState: 'committed',
    beforeRedacted: false,
    afterRedacted: false,
    splitAllocationChanged: false,
    ...overrides,
  }
}

function installMediaQuery(mobile = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: mobile && query.includes('max-width: 680px'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

function renderCard({
  workspace = personalWorkspace,
  period = july,
  demoMode = false,
}: {
  workspace?: Workspace
  period?: DashboardPeriodValue
  demoMode?: boolean
} = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  const result = render(
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="always">
        <PeriodReviewCard
          workspace={workspace}
          demoMode={demoMode}
          period={period}
        />
      </MotionConfig>
    </QueryClientProvider>,
  )
  return { ...result, client }
}

describe('PeriodReviewCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installMediaQuery(false)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', (handle: number) =>
      window.clearTimeout(handle),
    )
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      locale: 'en-US',
      calendar: 'gregory',
      numberingSystem: 'latn',
      timeZone: 'America/New_York',
    })
    apiMocks.get.mockResolvedValue([])
    apiMocks.post.mockResolvedValue(makeReview())
  })

  afterEach(() => {
    cleanup()
    document.body.style.overflow = ''
    document.body.style.paddingRight = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('queries an exact civil-date period in the browser timezone and creates a personal review', async () => {
    const createdReview = makeReview({ timezone: 'America/New_York' })
    let created = false
    apiMocks.get.mockImplementation(() => Promise.resolve(created ? [createdReview] : []))
    apiMocks.post.mockImplementation(() => {
      created = true
      return Promise.resolve(createdReview)
    })
    const user = userEvent.setup()
    renderCard()

    await waitFor(() => {
      expect(apiMocks.get).toHaveBeenCalledWith(
        '/workspaces/workspace-personal/period-reviews?from=2026-07-01&to=2026-07-31&timezone=America%2FNew_York',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    })
    expect(await screen.findByText(/exact date range/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mark reviewed' }))

    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith(
        '/workspaces/workspace-personal/period-reviews',
        {
          from: '2026-07-01',
          to: '2026-07-31',
          timezone: 'America/New_York',
          status: 'reviewed',
          scope: 'member_view',
        },
      )
    })
    expect(
      await screen.findByText(/reviewed and has no later financial changes/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      /period (marked reviewed|review saved)/i,
    )
  })

  it('cancels an obsolete review lookup when the workspace changes', async () => {
    let firstSignal: AbortSignal | undefined
    apiMocks.get.mockImplementation(
      (path: string, options?: { signal?: AbortSignal }) => {
        if (path.includes('workspace-personal')) {
          firstSignal = options?.signal
          return new Promise<never>(() => undefined)
        }
        return Promise.resolve([])
      },
    )
    const { client, rerender } = renderCard()

    await waitFor(() => expect(firstSignal).toBeDefined())
    rerender(
      <QueryClientProvider client={client}>
        <MotionConfig reducedMotion="always">
          <PeriodReviewCard
            workspace={sharedWorkspace}
            demoMode={false}
            period={july}
          />
        </MotionConfig>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(firstSignal?.aborted).toBe(true)
      expect(apiMocks.get).toHaveBeenCalledWith(
        expect.stringContaining('/workspaces/workspace-shared/period-reviews?'),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    })
  })

  it('suppresses non-reproducible all-time actions and never persists demo markers', async () => {
    const allTime: DashboardPeriodValue = { ...july, mode: 'all-time' }
    const { rerender } = renderCard({ period: allTime })

    expect(screen.queryByRole('heading', { name: /period review/i })).not.toBeInTheDocument()
    expect(apiMocks.get).not.toHaveBeenCalled()

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MotionConfig reducedMotion="always">
          <PeriodReviewCard
            workspace={personalWorkspace}
            demoMode
            period={july}
          />
        </MotionConfig>
      </QueryClientProvider>,
    )

    expect(await screen.findByText(/demo mode does not persist/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /review|close/i })).not.toBeInTheDocument()
    expect(apiMocks.post).not.toHaveBeenCalled()
  })

  it('announces loading and recovers from a failed period lookup', async () => {
    apiMocks.get.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    renderCard()

    expect(screen.getByRole('status')).toHaveTextContent(/checking period status/i)
    expect(await screen.findByRole('alert', undefined, { timeout: 3_000 })).toHaveTextContent(
      /period status could not be loaded/i,
    )

    apiMocks.get.mockResolvedValue([])
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('button', { name: 'Mark reviewed' })).toBeEnabled()
  })

  it('keeps the period open and explains a failed checkpoint write', async () => {
    apiMocks.post.mockRejectedValue(new Error('write failed'))
    const user = userEvent.setup()
    renderCard()

    await user.click(await screen.findByRole('button', { name: 'Mark reviewed' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /period status could not be saved|no marker was created/i,
    )
    expect(screen.getByRole('button', { name: 'Mark reviewed' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /close (my )?period/i })).toBeEnabled()
  })

  it('shows the stored snapshot scope and remains discoverable after timezone travel', async () => {
    apiMocks.get.mockResolvedValue([
      makeReview({
        timezone: 'Asia/Kolkata',
        reviewedBy: {
          name: 'Asha Rao',
          initials: 'AR',
          status: 'active',
          isCurrentUser: true,
        },
      }),
    ])
    renderCard()

    expect(await screen.findByText(/reviewed and has no later financial changes/i)).toBeInTheDocument()
    expect(screen.getAllByText(/member view|your visible/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Asia\/Kolkata/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Asha Rao/).length).toBeGreaterThan(0)
    expect(apiMocks.get).toHaveBeenCalledWith(
      expect.stringContaining('America%2FNew_York'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('renders the immutable snapshot as unsigned totals while keeping later changes signed', async () => {
    apiMocks.get.mockResolvedValue([
      makeReview({
        changeCount: '1',
        delta: totals('100', '50', '50', '0'),
        reviewState: 'pending_re_review',
      }),
    ])
    renderCard()

    const snapshot = await screen.findByLabelText('Saved period snapshot')
    const cumulative = screen.getByLabelText('Cumulative change')

    expect(snapshot).not.toHaveTextContent('+')
    expect(cumulative).toHaveTextContent('+')
  })

  it('clears mutation feedback whenever the timezone, range, or workspace changes', async () => {
    const user = userEvent.setup()
    const august: DashboardPeriodValue = {
      mode: 'custom-month',
      month: '2026-08-01',
      from: '2026-08-01',
      to: '2026-08-31',
    }
    const { client, rerender } = renderCard()
    const renderScope = (workspace: Workspace, period: DashboardPeriodValue) => {
      rerender(
        <QueryClientProvider client={client}>
          <MotionConfig reducedMotion="always">
            <PeriodReviewCard workspace={workspace} demoMode={false} period={period} />
          </MotionConfig>
        </QueryClientProvider>,
      )
    }

    apiMocks.post.mockRejectedValueOnce(new Error('write failed'))
    await user.click(await screen.findByRole('button', { name: 'Mark reviewed' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be saved/i)

    vi.mocked(Intl.DateTimeFormat.prototype.resolvedOptions).mockReturnValue({
      locale: 'en-US',
      calendar: 'gregory',
      numberingSystem: 'latn',
      timeZone: 'Asia/Kolkata',
    })
    renderScope(personalWorkspace, july)
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())

    apiMocks.post.mockResolvedValueOnce(makeReview())
    await user.click(screen.getByRole('button', { name: 'Mark reviewed' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/period marked reviewed/i)

    renderScope(personalWorkspace, august)
    await waitFor(() => {
      expect(screen.queryByText(/period marked reviewed/i)).not.toBeInTheDocument()
    })

    apiMocks.post.mockRejectedValueOnce(new Error('write failed again'))
    await user.click(await screen.findByRole('button', { name: 'Mark reviewed' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be saved/i)

    renderScope(sharedWorkspace, august)
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('renders changed decimal strings exactly beyond Number.MAX_SAFE_INTEGER with one-change grammar', async () => {
    apiMocks.get.mockResolvedValue([
      makeReview({
        status: 'closed',
        delta: totals(
          '9007199254740993',
          '9007199254740992',
          '1',
          '0',
        ),
        changeCount: '1',
        changedAfterClose: true,
        reviewState: 'pending_re_review',
      }),
    ])
    renderCard()

    expect(await screen.findByRole('heading', { name: 'Changed after close' })).toBeInTheDocument()
    expect(screen.getByText('1 change')).toBeInTheDocument()
    expect(screen.getByText(/1 entry has changed/i)).toBeInTheDocument()
    const cumulative = screen.getByLabelText('Cumulative change')
    const expectedMinor = (minor: string) => {
      const value = BigInt(minor)
      const formatter = new Intl.NumberFormat(navigator.language || 'en-IN', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      const whole = value / 100n
      const fraction = (value % 100n).toString().padStart(2, '0')
      return formatter.formatToParts(whole).map((part) =>
        part.type === 'fraction' ? fraction : part.value,
      ).join('')
    }
    expect(cumulative).toHaveTextContent(expectedMinor('9007199254740993'))
    expect(cumulative).toHaveTextContent(expectedMinor('9007199254740992'))
    expect(cumulative).toHaveTextContent(expectedMinor('1'))
  })

  it('creates an authorised shared close with workspace scope', async () => {
    const user = userEvent.setup()
    renderCard({ workspace: sharedWorkspace })

    await user.click(await screen.findByRole('button', { name: /close (shared |workspace )?period/i }))

    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith(
        '/workspaces/workspace-shared/period-reviews',
        expect.objectContaining({
          status: 'closed',
          scope: 'workspace_view',
        }),
      )
    })
  })

  it('keeps an unchanged shared checkpoint visible while surfacing member changes in its own drilldown', async () => {
    const sharedReview = makeReview({
      id: 'review-shared',
      workspaceId: sharedWorkspace.id,
      status: 'closed',
      scope: 'workspace_view',
      scopeNote: 'All workspace vaults and accounts at close time.',
      reviewedBy: {
        name: 'Workspace owner',
        initials: 'WO',
        status: 'active',
        isCurrentUser: false,
      },
    })
    const memberReview = makeReview({
      id: 'review-member',
      workspaceId: sharedWorkspace.id,
      scope: 'member_view',
      changeCount: '2',
      delta: totals('0', '500', '-500', '1'),
      reviewState: 'pending_re_review',
    })
    apiMocks.get.mockImplementation((path: string) => {
      if (path.includes('/review-member/changes?')) return Promise.resolve([makeChange('1')])
      return Promise.resolve([sharedReview, memberReview])
    })
    const user = userEvent.setup()
    renderCard({ workspace: sharedWorkspace })

    expect(await screen.findByText(/closed and has no later financial changes/i)).toBeInTheDocument()
    expect(screen.getByText('Shared workspace view')).toBeInTheDocument()
    const memberAlert = screen.getByRole('region', { name: 'Your member view changed' })
    expect(memberAlert).toHaveTextContent('2 changes')
    expect(memberAlert).toHaveTextContent(/changed since your member view was reviewed/i)
    expect(screen.getByText('Closed')).toBeInTheDocument()

    await user.click(within(memberAlert).getByRole('button', { name: 'View my changes' }))

    expect(await screen.findByRole('dialog', { name: 'Changes after period review' })).toBeInTheDocument()
    expect(apiMocks.get).toHaveBeenCalledWith(
      expect.stringContaining('/period-reviews/review-member/changes?'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('keeps member re-review and shared close writes explicitly scope-specific', async () => {
    const sharedReview = makeReview({
      id: 'review-shared',
      workspaceId: sharedWorkspace.id,
      status: 'closed',
      scope: 'workspace_view',
      changeCount: '3',
      changedAfterClose: true,
      reviewState: 'pending_re_review',
    })
    const memberReview = makeReview({
      id: 'review-member',
      workspaceId: sharedWorkspace.id,
      scope: 'member_view',
      changeCount: '1',
      reviewState: 'pending_re_review',
    })
    apiMocks.get.mockResolvedValue([sharedReview, memberReview])
    apiMocks.post.mockResolvedValue(memberReview)
    const user = userEvent.setup()
    renderCard({ workspace: sharedWorkspace })

    const memberAlert = await screen.findByRole('region', { name: 'Your member view changed' })
    await user.click(within(memberAlert).getByRole('button', { name: 'Review my view again' }))

    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith(
        '/workspaces/workspace-shared/period-reviews',
        expect.objectContaining({
          status: 'reviewed',
          scope: 'member_view',
        }),
      )
    })

    await user.click(screen.getByRole('button', { name: 'Close again' }))

    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith(
        '/workspaces/workspace-shared/period-reviews',
        expect.objectContaining({
          status: 'closed',
          scope: 'workspace_view',
        }),
      )
    })
  })

  it('keeps a redacted edited side honest and exposes privacy-safe change metadata', async () => {
    const review = makeReview({
      status: 'closed',
      changeCount: '1',
      changedAfterClose: true,
      reviewState: 'pending_re_review',
    })
    const visibleAfter = makeVersion({
      notes: 'Visible note',
      hasSplits: true,
    })
    const change = makeChange('1', {
      before: undefined,
      after: visibleAfter,
      beforeRedacted: true,
      changedFields: ['notes'],
      splitAllocationChanged: true,
    })
    apiMocks.get.mockImplementation((path: string) =>
      Promise.resolve(path.includes('/changes?') ? [change] : [review]),
    )
    const user = userEvent.setup()
    renderCard()

    const trigger = await screen.findByRole('button', { name: 'View changes' })
    await user.click(trigger)
    const dialog = await screen.findByRole('dialog', {
      name: 'Changes after period review',
    })

    expect(within(dialog).getByText('Edited')).toBeInTheDocument()
    expect(
      within(dialog).getByRole('heading', { name: 'Before' }).closest('section'),
    ).toHaveTextContent(/details hidden/i)
    expect(within(dialog).queryByText('No earlier record.')).not.toBeInTheDocument()
    expect(within(dialog).getAllByText(/notes/i).length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText(/split allocation/i).length).toBeGreaterThan(0)
    expect(within(dialog).getByText(/Former member/i)).toBeInTheDocument()
    expect(
      within(dialog).getAllByText(/America\/New_York|Asia\/Kolkata/).length,
    ).toBeGreaterThan(0)
  })

  it('does not collapse distinct fully redacted changes that share a timestamp', async () => {
    const review = makeReview({
      status: 'closed',
      changeCount: '2',
      changedAfterClose: true,
      reviewState: 'pending_re_review',
    })
    const redacted = (action: PeriodReviewChange['action']): PeriodReviewChange => ({
      ...makeChange('redacted', { action }),
      before: undefined,
      after: undefined,
      beforeRedacted: true,
      afterRedacted: true,
      changedFields: [],
    })
    apiMocks.get.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes('/changes?')
          ? [redacted('edited'), redacted('deleted')]
          : [review],
      ),
    )
    const user = userEvent.setup()
    renderCard()

    await user.click(await screen.findByRole('button', { name: 'View changes' }))

    expect(await screen.findAllByRole('heading', { name: 'Transaction' })).toHaveLength(2)
    expect(screen.getAllByText(/details hidden due to your current access/i)).toHaveLength(4)
  })

  it('loads past 100 immutable changes without a silent cap', async () => {
    const review = makeReview({
      status: 'closed',
      changeCount: '101',
      changedAfterClose: true,
      reviewState: 'pending_re_review',
    })
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      makeChange(String(index + 1)),
    )
    const lastPage = [makeChange('101')]
    let changePage = 0
    apiMocks.get.mockImplementation((path: string) => {
      if (!path.includes('/changes?')) return Promise.resolve([review])
      changePage += 1
      return Promise.resolve(changePage === 1 ? firstPage : lastPage)
    })
    const user = userEvent.setup()
    renderCard()

    await user.click(await screen.findByRole('button', { name: 'View changes' }))
    expect(await screen.findByRole('heading', { name: 'Merchant 100' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /load more/i }))

    expect(await screen.findByRole('heading', { name: 'Merchant 101' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: /Merchant \d+/ })).toHaveLength(101)
    expect(screen.getAllByRole('heading', { name: 'Merchant 100' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument()
    expect(
      apiMocks.get.mock.calls.filter(([path]) => String(path).includes('/changes?')),
    ).toHaveLength(2)
    expect(apiMocks.get).toHaveBeenCalledWith(
      expect.stringContaining('limit=100&skip=100'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  }, 20_000)

  it('ignores a stale change count and preserves loaded rows while a failed next page can be retried', async () => {
    const review = makeReview({
      status: 'closed',
      changeCount: '1',
      changedAfterClose: true,
      reviewState: 'pending_re_review',
    })
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      makeChange(String(index + 1)),
    )
    let nextPageFails = true
    apiMocks.get.mockImplementation((path: string) => {
      if (!path.includes('/changes?')) return Promise.resolve([review])
      if (path.includes('skip=0')) return Promise.resolve(firstPage)
      return nextPageFails
        ? Promise.reject(new Error('next page offline'))
        : Promise.resolve([makeChange('101')])
    })
    const user = userEvent.setup()
    renderCard()

    await user.click(await screen.findByRole('button', { name: 'View changes' }))
    expect(await screen.findByRole('heading', { name: 'Merchant 100' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Load more changes' }))

    const paginationError = await screen.findByRole('alert', undefined, { timeout: 5_000 })
    expect(paginationError).toHaveTextContent(/already shown are still available/i)
    expect(screen.getAllByRole('heading', { name: /Merchant \d+/ })).toHaveLength(100)
    expect(screen.getByRole('heading', { name: 'Merchant 1' })).toBeInTheDocument()

    nextPageFails = false
    await user.click(within(paginationError).getByRole('button', { name: 'Retry loading changes' }))

    expect(await screen.findByRole('heading', { name: 'Merchant 101' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: /Merchant \d+/ })).toHaveLength(101)
    expect(apiMocks.get).toHaveBeenCalledWith(
      expect.stringContaining('limit=100&skip=100'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  }, 20_000)

  it('gives the desktop audit dialog an accessible name, Escape close, and focus return', async () => {
    const review = makeReview({
      changeCount: '1',
      reviewState: 'pending_re_review',
    })
    apiMocks.get.mockImplementation((path: string) =>
      Promise.resolve(path.includes('/changes?') ? [makeChange('1')] : [review]),
    )
    const user = userEvent.setup()
    renderCard()

    const trigger = await screen.findByRole('button', { name: 'View changes' })
    await user.click(trigger)
    const dialog = await screen.findByRole('dialog', {
      name: 'Changes after period review',
    })
    expect(dialog).toHaveAttribute('aria-modal', 'true')

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Changes after period review' })).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
    })
  })

  it('uses the same accessible audit flow in the narrow-screen bottom sheet', async () => {
    installMediaQuery(true)
    const review = makeReview({ changeCount: '1', reviewState: 'pending_re_review' })
    apiMocks.get.mockImplementation((path: string) =>
      Promise.resolve(path.includes('/changes?') ? [makeChange('1')] : [review]),
    )
    const user = userEvent.setup()
    renderCard()

    await user.click(await screen.findByRole('button', { name: 'View changes' }))

    const sheet = await screen.findByRole('dialog', {
      name: 'Changes after period review',
    })
    expect(sheet).toHaveAttribute('data-bottom-sheet', 'true')
    expect(within(sheet).getByRole('button', { name: 'Close bottom sheet' })).toHaveClass(
      'h-11',
      'w-11',
    )
  })

  it('allows a changed personal checkpoint to be reviewed again', async () => {
    const changedReview = makeReview({
      changeCount: '2',
      delta: totals('100', '100', '0', '0'),
      reviewState: 'pending_re_review',
    })
    apiMocks.get.mockResolvedValue([changedReview])
    apiMocks.post.mockResolvedValue(
      makeReview({ id: 'review-2', createdAt: '2026-08-03T08:00:00Z' }),
    )
    const user = userEvent.setup()
    renderCard()

    await user.click(await screen.findByRole('button', { name: /review again|mark reviewed again/i }))

    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith(
        '/workspaces/workspace-personal/period-reviews',
        expect.objectContaining({
          status: 'reviewed',
          scope: 'member_view',
        }),
      )
    })
  })

  it('keeps the dedicated surface safe at 320px and names only changed transition properties', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/pages/finance/period-review.css'),
      'utf8',
    )

    expect(css).toContain('min-width: 0;')
    expect(css).toContain('overflow-wrap: anywhere;')
    expect(css).toContain('@media (max-width: 360px)')
    expect(css).toContain('min-height: var(--target-min);')
    expect(css).toContain('font-variant-numeric: tabular-nums;')
    expect(css).toMatch(/\.period-review-metadata\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*flex-wrap:\s*wrap;/s)
    expect(css).toMatch(/\.period-review-error,\s*\.period-review-success\s*\{[^}]*grid-column:\s*1 \/ -1;/s)
    expect(css).not.toMatch(/transition\s*:\s*all\b/)
    expect(css).not.toMatch(/will-change\s*:\s*all\b/)
  })
})
