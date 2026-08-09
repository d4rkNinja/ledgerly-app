import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Workspace } from '@/domain/types'
import { WorkspaceManagementDialogs } from './workspace-management-dialogs'

const apiMocks = vi.hoisted(() => ({
  post: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    readonly code = 'not_found'
    readonly status = 404
  },
  api: { post: apiMocks.post },
}))

const workspace: Workspace = {
  id: 'workspace-1',
  name: 'Personal books',
  type: 'personal',
  role: 'owner',
  memberCount: 1,
}

describe('workspace deletion dialog', () => {
  beforeEach(() => {
    apiMocks.post.mockReset()
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

  it('requires the exact workspace name before deleting', async () => {
    const user = userEvent.setup()
    const onDeleted = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()

    render(
      <WorkspaceManagementDialogs
        createOpen={false}
        joinOpen={false}
        deleteOpen
        workspace={workspace}
        currency="INR"
        onClose={onClose}
        onCreated={vi.fn().mockResolvedValue(undefined)}
        onDeleted={onDeleted}
        onJoined={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    const deleteButton = screen.getByRole('button', { name: 'Delete workspace' })
    expect(deleteButton).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: 'Workspace name' }), 'wrong')
    expect(deleteButton).toBeDisabled()
    expect(onDeleted).not.toHaveBeenCalled()

    await user.clear(screen.getByRole('textbox', { name: 'Workspace name' }))
    await user.type(screen.getByRole('textbox', { name: 'Workspace name' }), workspace.name)
    expect(deleteButton).toBeEnabled()

    await user.click(deleteButton)
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(workspace.id))
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the current workspace while a join-code request waits for approval', async () => {
    const user = userEvent.setup()
    apiMocks.post.mockResolvedValue({
      workspaceName: 'Shared books',
      status: 'pending',
    })
    const onClose = vi.fn()
    const onJoined = vi.fn().mockResolvedValue(undefined)

    render(
      <WorkspaceManagementDialogs
        createOpen={false}
        joinOpen
        deleteOpen={false}
        workspace={workspace}
        currency="INR"
        onClose={onClose}
        onCreated={vi.fn().mockResolvedValue(undefined)}
        onDeleted={vi.fn().mockResolvedValue(undefined)}
        onJoined={onJoined}
      />,
    )

    await user.type(
      screen.getByRole('textbox', { name: 'Workspace access code' }),
      'join-code',
    )
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith('/workspace-join-requests', {
        code: 'join-code',
      })
    })
    expect(
      await screen.findByText(/Request sent for Shared books/),
    ).toBeInTheDocument()
    expect(onJoined).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('refreshes workspace data before closing when a direct invitation code joins immediately', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onJoined = vi.fn().mockResolvedValue(undefined)
    apiMocks.post.mockResolvedValue({
      workspaceId: 'workspace-joined',
      workspaceName: 'Shared books',
      status: 'joined',
      role: 'member',
      permissions: ['view_transactions'],
    })

    render(
      <WorkspaceManagementDialogs
        createOpen={false}
        joinOpen
        deleteOpen={false}
        workspace={workspace}
        currency="INR"
        onClose={onClose}
        onCreated={vi.fn().mockResolvedValue(undefined)}
        onDeleted={vi.fn().mockResolvedValue(undefined)}
        onJoined={onJoined}
      />,
    )

    await user.type(
      screen.getByRole('textbox', { name: 'Workspace access code' }),
      'direct-invitation-code',
    )
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(onJoined).toHaveBeenCalledWith('workspace-joined')
      expect(onClose).toHaveBeenCalledTimes(1)
    })
    expect(onJoined.mock.invocationCallOrder[0]).toBeLessThan(
      onClose.mock.invocationCallOrder[0],
    )
    expect(
      screen.getByRole('textbox', { name: 'Workspace access code' }),
    ).toHaveValue('')
  })

  it('explains the temporary and direct invitation access-code outcomes', () => {
    render(
      <WorkspaceManagementDialogs
        createOpen={false}
        joinOpen
        deleteOpen={false}
        workspace={workspace}
        currency="INR"
        onClose={vi.fn()}
        onCreated={vi.fn().mockResolvedValue(undefined)}
        onDeleted={vi.fn().mockResolvedValue(undefined)}
        onJoined={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(
      screen.getByText(
        /temporary workspace code \(approval required\) or a direct invitation code \(joins immediately\)/i,
      ),
    ).toBeInTheDocument()
  })
})
