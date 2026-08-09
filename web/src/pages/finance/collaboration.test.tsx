import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { AppContext, type AppContextValue } from '@/app/app-state'
import type { Permission, WorkspaceMember } from '@/domain/types'
import { FamilyPage } from './collaboration'

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    readonly code = 'forbidden'
    readonly status = 403
  },
  api: apiMocks,
}))

const members: Array<WorkspaceMember & { invitationId?: string }> = [
  {
    name: 'Asha Rao',
    email: 'asha@example.test',
    role: 'owner',
    permissions: ['manage_roles', 'remove_members'],
    status: 'active',
    joinedAt: '2026-07-01T00:00:00Z',
  },
  {
    name: 'Bina Rao',
    email: 'bina@example.test',
    role: 'member',
    permissions: ['view_transactions'],
    status: 'active',
    joinedAt: '2026-07-02T00:00:00Z',
  },
  {
    name: 'Cora Shah',
    email: 'cora@example.test',
    role: 'administrator',
    permissions: ['manage_roles', 'remove_members'],
    status: 'active',
    joinedAt: '2026-07-02T00:00:00Z',
  },
  {
    name: 'Pending invite',
    email: 'pending@example.test',
    role: 'viewer',
    permissions: ['view_transactions'],
    status: 'pending',
    invitationId: 'invitation-a',
    invitationStatus: 'pending',
    joinedAt: '2026-07-03T00:00:00Z',
  },
]

const workspace = {
  id: 'workspace-a',
  name: 'Shared books',
  type: 'family' as const,
  role: 'owner' as const,
  memberCount: 3,
  permissions: [
    'view_workspace',
    'invite_members',
    'manage_roles',
    'remove_members',
    'view_audit_history',
  ] as Permission[],
}

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
    userId: 'asha-a',
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
    ...overrides,
  }
}

function renderFamily(value = appValue()) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppContext.Provider value={value}>
          <FamilyPage />
        </AppContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('FamilyPage member directory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.get.mockImplementation((path: string) =>
      path.endsWith('/members') ? Promise.resolve(members) : Promise.resolve([]),
    )
    apiMocks.patch.mockResolvedValue(members[1])
    apiMocks.delete.mockResolvedValue(undefined)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('loads member identity, hides owner controls, and permits administrator management', async () => {
    renderFamily()

    expect(await screen.findByText('Bina Rao')).toBeInTheDocument()
    expect(screen.getByText('Pending invite')).toBeInTheDocument()
    expect(screen.getByText('Pending invitation')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Role for Asha Rao' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Asha Rao' })).not.toBeInTheDocument()
    expect(screen.getByText('Owner access is protected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Role for Bina Rao' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Remove Bina Rao' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Role for Cora Shah' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Remove Cora Shah' })).toBeEnabled()
  })

  it('renders a legacy removed member with no permissions without crashing', async () => {
    const legacyRemovedMember = {
      name: 'Former member',
      email: 'former@example.test',
      role: 'member',
      permissions: null,
      status: 'removed',
      joinedAt: '2026-06-01T00:00:00Z',
    } as unknown as WorkspaceMember
    apiMocks.get.mockImplementation((path: string) =>
      path.endsWith('/members')
        ? Promise.resolve([...members, legacyRemovedMember])
        : Promise.resolve([]),
    )

    renderFamily()

    expect(await screen.findByText('Former member')).toBeInTheDocument()
    expect(screen.getByText('No additional access')).toBeInTheDocument()
  })

  it('allows an owner to confirm removing an administrator', async () => {
    const user = userEvent.setup()
    renderFamily()

    await user.click(
      await screen.findByRole('button', { name: 'Remove Cora Shah' }),
    )

    expect(screen.getByRole('button', { name: /confirm removal/i })).toBeEnabled()
  })

  it('updates a regular member role through the permission-gated mutation', async () => {
    const user = userEvent.setup()
    const value = appValue()
    renderFamily(value)

    const role = await screen.findByRole('button', { name: 'Role for Bina Rao' })
    await user.click(role)
    await user.click(screen.getByRole('option', { name: 'Viewer' }))

    await waitFor(() => {
      expect(apiMocks.patch).toHaveBeenCalledWith(
        '/workspaces/workspace-a/members/bina%40example.test',
        { role: 'viewer' },
      )
    })
    expect(value.refreshWorkspaces).toHaveBeenCalledWith('workspace-a')
  })

  it('shows a newly created workspace code with its remaining validity', async () => {
    const user = userEvent.setup()
    apiMocks.post.mockResolvedValue({
      code: 'join-code',
      expiresAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
    })
    renderFamily()

    await user.click(
      await screen.findByRole('button', { name: /create new join code/i }),
    )

    expect(await screen.findByDisplayValue('join-code')).toBeInTheDocument()
    expect(screen.getByText(/valid for/i)).toBeInTheDocument()
    expect(screen.getByText(/approval request/i)).toBeInTheDocument()
  })

  it('marks a returned join code expired when its expiry has passed', async () => {
    const user = userEvent.setup()
    apiMocks.post.mockResolvedValue({
      code: 'expired-code',
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    })
    renderFamily()

    await user.click(
      await screen.findByRole('button', { name: /create new join code/i }),
    )

    expect(await screen.findByText('Expired')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled()
  })

  it('sends a member removal request after explicit confirmation', async () => {
    const user = userEvent.setup()
    renderFamily()

    await user.click(
      await screen.findByRole('button', { name: 'Remove Bina Rao' }),
    )
    expect(apiMocks.delete).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /confirm removal/i }))

    await waitFor(() => {
      expect(apiMocks.delete).toHaveBeenCalledWith(
        '/workspaces/workspace-a/members/bina%40example.test',
      )
    })
  })

  it('revokes a pending invitation after explicit confirmation', async () => {
    const user = userEvent.setup()
    renderFamily()

    await user.click(
      await screen.findByRole('button', {
        name: 'Revoke invitation for Pending invite',
      }),
    )
    expect(apiMocks.delete).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /confirm revocation/i }))

    await waitFor(() => {
      expect(apiMocks.delete).toHaveBeenCalledWith(
        '/workspaces/workspace-a/invitations/invitation-a',
      )
    })
  })

  it('keeps direct invitation tokens on their distinct manual path without a public HTTPS app URL', async () => {
    const user = userEvent.setup()
    apiMocks.post.mockResolvedValue({
      token: 'direct-invitation-token',
      invitation: {
        id: 'invitation-a',
        email: 'bina@example.test',
        role: 'member',
        expiresAt: '2026-08-02T12:00:00Z',
      },
    })
    renderFamily()

    await user.click(screen.getByRole('button', { name: 'Invite member' }))
    await user.click(screen.getByRole('button', { name: 'Create invitation' }))

    expect(
      await screen.findByRole('textbox', { name: 'Direct invitation token' }),
    ).toHaveValue('direct-invitation-token')
    expect(
      screen.getByText(/direct invitation tokens are accepted separately/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/needs an HTTPS app URL/i)).toBeInTheDocument()
  })

  it('keeps role and removal controls disabled without permissions', async () => {
    renderFamily(
      appValue({
        workspace: { ...workspace, permissions: ['view_workspace'] },
      }),
    )

    await screen.findByText('Bina Rao')
    expect(screen.getByRole('button', { name: 'Role for Bina Rao' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove Bina Rao' })).toBeDisabled()
  })
})
