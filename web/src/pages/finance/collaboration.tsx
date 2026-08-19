import {
  CheckCircle2,
  Copy,
  FileText,
  Filter,
  MailPlus,
  MessageCircle,
  Plus,
  Share2,
  ShieldCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { motion, useReducedMotion } from 'motion/react'
import { useApp } from '@/app/app-state'
import type { Permission, WorkspaceMember } from '@/domain/types'
import { api, ApiError } from '@/lib/api-client'
import { initials } from '@/lib/format'
import {
  buildExpenseClaimSharePayload,
  buildWorkspaceInviteSharePayload,
  copyShareText,
  createSafePublicUrl,
  shareNative,
  shareToWhatsApp,
  type SharePayload,
} from '@/lib/share'
import { ShareSheet } from '@/components/share-sheet'
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  ListRow,
  PageHeader,
  Section,
} from '@/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/motion/select'
import {
  ClaimReviewDialog,
  ClaimSubmitDialog,
  useDemoSessionCollection,
  useQueryDialog,
  type FinanceClaim as ClaimView,
} from '../finance-writes'

import {
  DataSkeleton,
  FeedbackNotice,
  InfoNotice,
  MoneyText,
  MotionListItem,
  PageFrame,
  type Feedback,
} from './shared'
import {
  friendlyLabel,
  hasWorkspacePermission,
  useFinanceData,
} from './data'

type WorkspaceJoinCodeResult = {
  code: string
  expiresAt: string
}

function formatJoinCodeValidity(expiresAt: number, now: number): string {
  const remainingSeconds = Math.max(0, Math.ceil((expiresAt - now) / 1_000))
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60

  if (minutes === 0) {
    return `Valid for ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
  }

  return `Valid for ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}${
    seconds > 0 ? ` ${seconds} ${seconds === 1 ? 'second' : 'seconds'}` : ''
  }`
}

export function OwnerApprovalQueue() {
  const { demoMode, workspace } = useApp()
  const queryClient = useQueryClient()
  const [actionFeedback, setActionFeedback] = useState('')
  const [joinCode, setJoinCode] = useState<WorkspaceJoinCodeResult | null>(null)
  const [joinCodeNow, setJoinCodeNow] = useState(() => Date.now())
  type JoinRequest = {
    id: string
    requesterName: string
    requesterEmail: string
    createdAt: string
  }
  const requestsQuery = useQuery({
    queryKey: ['workspace-join-requests', workspace.id],
    queryFn: () =>
      demoMode
        ? Promise.resolve([] as JoinRequest[])
        : api.get<JoinRequest[]>(`/workspaces/${workspace.id}/join-requests`),
    enabled: demoMode || workspace.permissions?.includes('invite_members') === true,
  })
  const reviewMutation = useMutation({
    mutationFn: (input: { id: string; status: 'approved' | 'rejected' }) =>
      api.patch(`/workspaces/${workspace.id}/join-requests/${input.id}`, {
        status: input.status,
      }),
    onSuccess: (_result, input) => {
      setActionFeedback(`Request ${input.status}.`)
      void queryClient.invalidateQueries({
        queryKey: ['workspace-join-requests', workspace.id],
      })
    },
    onError: (error) =>
      setActionFeedback(error instanceof ApiError ? error.message : 'Request could not be reviewed.'),
  })
  const codeMutation = useMutation({
    mutationFn: () => api.post<WorkspaceJoinCodeResult, Record<string, never>>(
      `/workspaces/${workspace.id}/join-code`,
      {},
    ),
    onSuccess: (result) => {
      setJoinCode(result)
      setJoinCodeNow(Date.now())
      setActionFeedback('New workspace code created. The previous code no longer works.')
    },
    onError: (error) =>
      setActionFeedback(error instanceof ApiError ? error.message : 'Workspace code could not be created.'),
  })
  const requests = requestsQuery.data ?? []
  const canManage =
    demoMode || workspace.permissions?.includes('invite_members') === true
  const joinCodeExpiresAt = joinCode ? Date.parse(joinCode.expiresAt) : Number.NaN
  const joinCodeExpired =
    Boolean(joinCode) &&
    (!Number.isFinite(joinCodeExpiresAt) || joinCodeExpiresAt <= joinCodeNow)

  useEffect(() => {
    if (!joinCode || joinCodeExpired || !Number.isFinite(joinCodeExpiresAt)) {
      return undefined
    }

    const timeout = window.setTimeout(
      () => setJoinCodeNow(Date.now()),
      Math.min(1_000, Math.max(1, joinCodeExpiresAt - joinCodeNow)),
    )
    return () => window.clearTimeout(timeout)
  }, [joinCode, joinCodeExpired, joinCodeExpiresAt, joinCodeNow])

  return (
    <Section>
      <div className="section-heading-row">
        <div>
          <h2>Workspace access</h2>
          <p>Share a code, then approve each person before they join.</p>
        </div>
        {!demoMode && canManage ? (
          <Button variant="secondary" loading={codeMutation.isPending} onClick={() => codeMutation.mutate()}>
            Create new join code
          </Button>
        ) : null}
      </div>
      {joinCode ? (
        <div className="workspace-join-code-panel">
          <div className="workspace-join-code-heading">
            <div>
              <h3>Temporary workspace join code</h3>
              <p>
                {joinCodeExpired
                  ? 'This workspace join code has expired. Create a new code to accept another request.'
                  : `${formatJoinCodeValidity(joinCodeExpiresAt, joinCodeNow)}. Anyone who uses it creates an approval request for you to review.`}
              </p>
            </div>
            <Badge tone={joinCodeExpired ? 'danger' : 'positive'}>
              {joinCodeExpired ? 'Expired' : 'Approval required'}
            </Badge>
          </div>
          <Field label="Workspace join code">
            <div className="workspace-join-code-value">
              <input
                readOnly
                value={joinCode.code}
                className="min-w-0 flex-1 font-mono"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={joinCodeExpired}
                onClick={() => {
                  if (!navigator.clipboard) {
                    setActionFeedback('Copy is unavailable here. Select the code and copy it manually.')
                    return
                  }
                  void navigator.clipboard
                    .writeText(joinCode.code)
                    .then(() => setActionFeedback('Workspace code copied.'))
                    .catch(() =>
                      setActionFeedback('Copy was unavailable. Select the code and copy it manually.'),
                    )
                }}
              >
                <Copy aria-hidden="true" /> Copy
              </Button>
            </div>
          </Field>
        </div>
      ) : null}
      {actionFeedback ? (
        <div className="form-alert" style={{ marginBottom: '1rem' }} role="status">
          {actionFeedback}
        </div>
      ) : null}
      {requests.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="No pending join requests"
          message="Requests made with your workspace code will appear here."
        />
      ) : (
        <div className="row-list">
          {requests.map((req, index) => (
            <MotionListItem key={req.id} index={index}>
              <ListRow
                leading={<span className="avatar">{initials(req.requesterName)}</span>}
                title={req.requesterName || req.requesterEmail}
                subtitle={`${req.requesterEmail} · ${new Date(req.createdAt).toLocaleDateString()}`}
                trailing={
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => reviewMutation.mutate({ id: req.id, status: 'approved' })}
                    >
                      <CheckCircle2 aria-hidden="true" />
                      Approve
                    </Button>
                    <Button
                      variant="quiet"
                      onClick={() => reviewMutation.mutate({ id: req.id, status: 'rejected' })}
                    >
                      <XCircle aria-hidden="true" />
                      Reject
                    </Button>
                  </div>
                }
              />
            </MotionListItem>
          ))}
        </div>
      )}
    </Section>
  )
}

export function FamilyPage() {
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitePending, setInvitePending] = useState(false)
  const { demoMode, workspace } = useApp()
  const canInvite = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'invite_members',
  )
  const canViewActivity = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'view_audit_history',
  )
  return (
    <PageFrame className="members-page collaboration-page">
      <PageHeader
        title="Members"
        description="Manage private workspace access, roles, and invitations."
        actions={
          canInvite ? (
            <Button
              onClick={() => setInviteOpen(true)}
              aria-describedby={
                demoMode ? 'family-demo-invitation-note' : undefined
              }
            >
              <UserPlus aria-hidden="true" />
              Invite member
            </Button>
          ) : undefined
        }
      />
      {!canInvite ? (
        <InfoNotice>
          Your workspace role cannot invite or manage members.
        </InfoNotice>
      ) : null}
      {demoMode ? (
        <p className="sr-only" id="family-demo-invitation-note">
          Open the invitation dialog to see why invitations are unavailable in
          demo mode.
        </p>
      ) : null}
      <div className="family-summary">
        <div>
          <Users aria-hidden="true" />
          <span>
            <strong>
              {demoMode ? 4 : workspace.memberCount}{' '}
              {(demoMode ? 4 : workspace.memberCount) === 1
                ? 'person'
                : 'people'}
            </strong>
            <small>
              {demoMode
                ? '2 adults, 1 member, 1 child profile'
                : 'Active workspace memberships'}
            </small>
          </span>
        </div>
        <div>
          <ShieldCheck aria-hidden="true" />
          <span>
            <strong>Privacy rules active</strong>
            <small>Private accounts remain visible only to their owners</small>
          </span>
        </div>
      </div>
      <Section>
        <div className="section-heading-row">
          <div>
            <h2>Members</h2>
            <p>Roles control shared workspace actions</p>
          </div>
          {canViewActivity ? (
            <Link to="/app/activity">View activity</Link>
          ) : null}
        </div>
        {demoMode ? (
          <div className="row-list">
            {[
              ['Aarav Sharma', 'Owner', 'Full access'],
              ['Riya Sharma', 'Admin', 'Budgets and shared accounts'],
              ['Meera Sharma', 'Member', 'Shared expenses'],
              ['Kabir Sharma', 'Child', 'Allowance account only'],
            ].map(([name, role, access], index) => (
              <MotionListItem key={name} index={index}>
                <ListRow
                  leading={<span className="avatar">{initials(name)}</span>}
                  title={name}
                  subtitle={access}
                  trailing={<Badge>{role}</Badge>}
                />
              </MotionListItem>
            ))}
          </div>
        ) : (
          <MemberDirectory
            workspaceId={workspace.id}
            permissions={workspace.permissions}
          />
        )}
      </Section>
      <OwnerApprovalQueue />
      <Dialog
        open={inviteOpen}
        title="Invite a workspace member"
        onClose={
          invitePending ? () => undefined : () => setInviteOpen(false)
        }
      >
        <InviteForm type="family" onBusyChange={setInvitePending} />
      </Dialog>
    </PageFrame>
  )
}

function MemberDirectory({
  workspaceId,
  permissions,
}: {
  workspaceId: string
  permissions?: Permission[]
}) {
  const { refreshWorkspaces } = useApp()
  const queryClient = useQueryClient()
  const [feedback, setFeedback] = useState('')
  const [memberPendingRemoval, setMemberPendingRemoval] =
    useState<WorkspaceMember | null>(null)
  const [memberRemovalError, setMemberRemovalError] = useState('')
  const [invitationPendingCancellation, setInvitationPendingCancellation] =
    useState<WorkspaceMember | null>(null)
  const [invitationCancellationError, setInvitationCancellationError] =
    useState('')
  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () =>
      api.get<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`),
    retry: 1,
  })
  const updateMutation = useMutation({
    mutationFn: ({ member, role }: { member: WorkspaceMember; role: string }) =>
      api.patch<WorkspaceMember, { role: string }>(
        `/workspaces/${workspaceId}/members/${encodeURIComponent(member.email)}`,
        { role },
      ),
    onSuccess: () => {
      setFeedback('Member access updated.')
      void queryClient.invalidateQueries({
        queryKey: ['workspace-members', workspaceId],
      })
      void refreshWorkspaces(workspaceId).catch(() => undefined)
    },
    onError: (error) => {
      setFeedback(
        error instanceof ApiError
          ? error.message
          : 'Member access could not be updated.',
      )
    },
  })
  const removeMutation = useMutation({
    mutationFn: (member: WorkspaceMember) =>
      api.delete<void>(
        `/workspaces/${workspaceId}/members/${encodeURIComponent(member.email)}`,
      ),
    onSuccess: () => {
      setMemberPendingRemoval(null)
      setMemberRemovalError('')
      setFeedback('Member removed from this workspace.')
      void queryClient.invalidateQueries({
        queryKey: ['workspace-members', workspaceId],
      })
      void refreshWorkspaces(workspaceId).catch(() => undefined)
    },
    onError: (error) => {
      const message =
        error instanceof ApiError
          ? error.message
          : 'Member could not be removed.'
      setMemberRemovalError(message)
      setFeedback(message)
    },
  })
  const cancelInvitationMutation = useMutation({
    mutationFn: (invitation: WorkspaceMember) => {
      if (!invitation.invitationId) {
        return Promise.reject(new Error('This invitation cannot be revoked.'))
      }
      return api.delete<void>(
        `/workspaces/${workspaceId}/invitations/${encodeURIComponent(invitation.invitationId)}`,
      )
    },
    onSuccess: () => {
      setInvitationPendingCancellation(null)
      setInvitationCancellationError('')
      setFeedback('Invitation revoked. Its token no longer works.')
      void queryClient.invalidateQueries({
        queryKey: ['workspace-members', workspaceId],
      })
    },
    onError: (error) => {
      const message =
        error instanceof ApiError
          ? error.message
          : 'Invitation could not be revoked.'
      setInvitationCancellationError(message)
      setFeedback(message)
    },
  })
  const canManageRoles = permissions?.includes('manage_roles') === true
  const canRemoveMembers = permissions?.includes('remove_members') === true
  const canInviteMembers = permissions?.includes('invite_members') === true
  const removalCandidateIsProtected =
    memberPendingRemoval?.role === 'owner'
  const canConfirmRemoval =
    Boolean(memberPendingRemoval) &&
    canRemoveMembers &&
    memberPendingRemoval?.status === 'active' &&
    !removalCandidateIsProtected
  const canConfirmInvitationCancellation =
    Boolean(invitationPendingCancellation?.invitationId) &&
    invitationPendingCancellation?.status === 'pending' &&
    canInviteMembers

  if (membersQuery.isLoading) return <DataSkeleton />
  if (membersQuery.isError) {
    return (
      <ErrorState
        message="Workspace members could not be loaded."
        retry={() => membersQuery.refetch()}
      />
    )
  }
  const members = Array.isArray(membersQuery.data) ? membersQuery.data : []
  if (members.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title="No workspace members yet"
        message="Active members and pending invitations will appear here."
      />
    )
  }

  return (
    <div className="grid gap-3">
      {feedback ? (
        <div className="form-alert" role="status">
          {feedback}
        </div>
      ) : null}
      <div className="member-directory" aria-label="Workspace members">
        {members.map((member, index) => {
          const ownerRow = member.role === 'owner'
          const activeRow = member.status === 'active'
          const pendingInvitationRow =
            member.status === 'pending' && Boolean(member.invitationId)
          const canEdit = canManageRoles && activeRow && !ownerRow
          const canRemove = canRemoveMembers && activeRow && !ownerRow
          const canRevokeInvitation = canInviteMembers && pendingInvitationRow
          const memberPermissions = Array.isArray(member.permissions)
            ? member.permissions.filter(
                (permission) => typeof permission === 'string',
              )
            : []
          const busy =
            updateMutation.isPending ||
            removeMutation.isPending ||
            cancelInvitationMutation.isPending
          const statusTone =
            member.status === 'active'
              ? 'positive'
              : member.status === 'pending'
                ? 'warning'
                : member.status === 'expired' || member.status === 'removed'
                  ? 'danger'
                  : 'neutral'
          return (
            <MotionListItem key={`${member.email}-${member.joinedAt}-${index}`} index={index}>
              <article className="member-card" aria-label={`${member.name} member`}>
                <div className="member-card-identity">
                  {member.profileImageUrl ? (
                    <img
                      className="avatar member-card-avatar"
                      src={member.profileImageUrl}
                      alt=""
                    />
                  ) : (
                    <span className="avatar member-card-avatar">
                      {initials(member.name)}
                    </span>
                  )}
                  <div className="member-card-person">
                    <h3>{member.name}</h3>
                    <p>{member.email || 'No email provided'}</p>
                  </div>
                </div>
                <dl className="member-card-metadata">
                  <div>
                    <dt>Role</dt>
                    <dd>{friendlyLabel(member.role)}</dd>
                  </div>
                  <div>
                    <dt>Joined</dt>
                    <dd>
                      {member.joinedAt
                        ? new Date(member.joinedAt).toLocaleDateString()
                        : 'Date unavailable'}
                    </dd>
                  </div>
                  <div className="member-card-access">
                    <dt>Access</dt>
                    <dd>
                      {memberPermissions.length
                        ? memberPermissions.map(friendlyLabel).join(', ')
                        : 'No additional access'}
                    </dd>
                  </div>
                </dl>
                <div className="member-card-status">
                  <Badge tone={statusTone}>{friendlyLabel(member.status)}</Badge>
                  {member.invitationStatus ? (
                    <small>{friendlyLabel(member.invitationStatus)} invitation</small>
                  ) : null}
                </div>
                {activeRow ? (
                  ownerRow ? (
                    <div className="member-card-controls member-card-controls-protected">
                      <span className="member-card-protected-note">
                        Owner access is protected
                      </span>
                    </div>
                  ) : (
                    <div className="member-card-controls">
                      <div className="member-role-control">
                        <span>Role</span>
                        <Select
                          value={member.role}
                          disabled={!canEdit || busy}
                          onValueChange={(role) =>
                            updateMutation.mutate({
                              member,
                              role,
                            })
                          }
                        >
                          <SelectTrigger
                            aria-label={`Role for ${member.name}`}
                            className="w-full"
                            data-field-control
                          >
                            <SelectValue placeholder="Choose role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                            <SelectItem value="approver">Approver</SelectItem>
                            <SelectItem value="finance_manager">Finance manager</SelectItem>
                            <SelectItem value="administrator">Administrator</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="danger"
                        disabled={!canRemove || busy}
                        onClick={() => {
                          setMemberRemovalError('')
                          setMemberPendingRemoval(member)
                        }}
                        aria-label={`Remove ${member.name}`}
                      >
                        Remove
                      </Button>
                    </div>
                  )
                ) : pendingInvitationRow ? (
                  <div className="member-card-controls member-card-controls-single">
                    <Button
                      type="button"
                      variant="danger"
                      disabled={!canRevokeInvitation || busy}
                      onClick={() => {
                        setInvitationCancellationError('')
                        setInvitationPendingCancellation(member)
                      }}
                      aria-label={`Revoke invitation for ${member.name}`}
                    >
                      Revoke invitation
                    </Button>
                  </div>
                ) : null}
              </article>
            </MotionListItem>
          )
        })}
      </div>
      {memberPendingRemoval ? (
        <Dialog
          open
          title={`Remove ${memberPendingRemoval.name}?`}
          description="This removes their access to the shared workspace."
          onClose={
            removeMutation.isPending
              ? () => undefined
              : () => {
                  setMemberRemovalError('')
                  setMemberPendingRemoval(null)
                }
          }
        >
          <div className="dialog-form">
            <p className="form-alert" role="alert">
              {memberPendingRemoval.name} will lose access to this workspace.
              Their existing records remain in the workspace history.
            </p>
            {memberRemovalError ? (
              <p className="form-alert" role="alert">
                {memberRemovalError}
              </p>
            ) : null}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={removeMutation.isPending}
                onClick={() => {
                  setMemberRemovalError('')
                  setMemberPendingRemoval(null)
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                loading={removeMutation.isPending}
                disabled={!canConfirmRemoval || removeMutation.isPending}
                onClick={() => {
                  if (!memberPendingRemoval || !canConfirmRemoval) return
                  removeMutation.mutate(memberPendingRemoval)
                }}
              >
                Confirm removal
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
      {invitationPendingCancellation ? (
        <Dialog
          open
          title={`Revoke invitation for ${invitationPendingCancellation.name}?`}
          description="This immediately invalidates the invitation token."
          onClose={
            cancelInvitationMutation.isPending
              ? () => undefined
              : () => {
                  setInvitationCancellationError('')
                  setInvitationPendingCancellation(null)
                }
          }
        >
          <div className="dialog-form">
            <p className="form-alert" role="alert">
              {invitationPendingCancellation.name} will no longer be able to
              use this invitation.
            </p>
            {invitationCancellationError ? (
              <p className="form-alert" role="alert">
                {invitationCancellationError}
              </p>
            ) : null}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={cancelInvitationMutation.isPending}
                onClick={() => {
                  setInvitationCancellationError('')
                  setInvitationPendingCancellation(null)
                }}
              >
                Keep invitation
              </Button>
              <Button
                type="button"
                variant="danger"
                loading={cancelInvitationMutation.isPending}
                disabled={
                  !canConfirmInvitationCancellation ||
                  cancelInvitationMutation.isPending
                }
                onClick={() => {
                  if (
                    !invitationPendingCancellation ||
                    !canConfirmInvitationCancellation
                  ) {
                    return
                  }
                  cancelInvitationMutation.mutate(invitationPendingCancellation)
                }}
              >
                Confirm revocation
              </Button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}

type InvitationRole =
  | 'member'
  | 'administrator'
  | 'viewer'
  | 'approver'
  | 'finance_manager'

type InvitationResult = {
  invitation: {
    id: string
    email: string
    role: InvitationRole
    expiresAt: string
  }
  token: string
}

function invitationShareLink(token: string) {
  const configuredBase = (
    import.meta.env.VITE_PUBLIC_APP_URL as string | undefined
  )?.trim()

  if (!configuredBase) return null

  try {
    const url = new URL('/invite', configuredBase)
    url.hash = new URLSearchParams({ token }).toString()
    return createSafePublicUrl(url.toString())
  } catch {
    return null
  }
}

function InviteForm({
  type,
  onBusyChange,
}: {
  type: 'family' | 'office'
  onBusyChange: (busy: boolean) => void
}) {
  const { demoMode, userName, workspace, availableWorkspaces } = useApp()
  const queryClient = useQueryClient()
  const [workspaceId, setWorkspaceId] = useState(workspace.id)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InvitationRole>('member')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [shareToken, setShareToken] = useState('')
  const [invitedEmail, setInvitedEmail] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const submitLock = useRef(false)
  const mutation = useMutation({
    mutationFn: (input: { email: string; role: InvitationRole }) =>
      api.post<InvitationResult, typeof input>(
        `/workspaces/${workspaceId}/invitations`,
        input,
      ),
    onSuccess: (result) => {
      submitLock.current = false
      onBusyChange(false)
      setShareToken(result.token)
      setInvitedEmail(result.invitation.email)
      setCopyStatus('')
      setEmail('')
      void queryClient.invalidateQueries({
        queryKey: ['workspace-members', workspaceId],
      })
      setFeedback({
        tone: result.token ? 'success' : 'info',
        message: result.token
          ? result.invitation.email
            ? `Invitation created for ${result.invitation.email}. Share the token below; no email service is required.`
            : 'Manual invitation created. Anyone with this single-use token can join, so share it privately.'
          : 'Invitation created, but the server did not return a share token.',
      })
    },
    onError: (error) => {
      submitLock.current = false
      onBusyChange(false)
      setFeedback({
        tone: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Invitation could not be created. No invitation was added.',
      })
    },
  })
  const safeInvitationUrl = shareToken
    ? invitationShareLink(shareToken)
    : null
  const invitationPayload =
    shareToken && mutation.data && safeInvitationUrl
      ? buildWorkspaceInviteSharePayload(
          {
            workspaceName: workspace.name,
            workspaceType: workspace.type,
            inviterDisplayName: userName,
            roleLabel: friendlyLabel(mutation.data.invitation.role),
            expiresAt: mutation.data.invitation.expiresAt,
          },
          {
            locale: navigator.language,
            safePublicUrl: safeInvitationUrl,
          },
        )
      : null
  return (
    <form
      className="dialog-form"
      aria-label={`${friendlyLabel(type)} workspace invitation`}
      onSubmit={(event) => {
        event.preventDefault()
        if (submitLock.current || mutation.isPending) return
        if (demoMode) {
          setFeedback({
            tone: 'info',
            message:
              'Invitations are unavailable in demo mode. No invitation was created.',
          })
          return
        }
        setFeedback(null)
        setShareToken('')
        setInvitedEmail('')
        setCopyStatus('')
        submitLock.current = true
        onBusyChange(true)
        mutation.mutate({ email: email.trim(), role })
      }}
    >
      {demoMode ? (
        <InfoNotice>
          Demo mode cannot create invitations. Switch to a signed-in workspace
          to create a secure share token.
        </InfoNotice>
      ) : null}
      <Field label="Workspace">
        <Select value={workspaceId} onValueChange={setWorkspaceId}>
          <SelectTrigger className="w-full" data-field-control>
            <SelectValue
              placeholder={
                availableWorkspaces.find((item) => item.id === workspaceId)
                  ?.name ?? 'Choose workspace'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {availableWorkspaces.map((item) => (
              <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Email (optional)">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <Field label="Role">
        <Select
          value={role}
          onValueChange={(value) => setRole(value as InvitationRole)}
        >
          <SelectTrigger className="w-full" data-field-control>
            <SelectValue placeholder="Choose role" />
          </SelectTrigger>
          <SelectContent>
            {type === 'family' ? (
              <>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="administrator">Administrator</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </>
            ) : (
              <>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="approver">Approver</SelectItem>
                <SelectItem value="finance_manager">
                  Finance manager
                </SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
      </Field>
      {feedback ? <FeedbackNotice feedback={feedback} /> : null}
      {shareToken ? (
        <div className="direct-invitation-token-panel">
          <Field
            label={`Direct invitation token${invitedEmail ? ` for ${invitedEmail}` : ''}`}
          >
            <div className="flex items-stretch gap-2">
            <input
              className="min-w-0 flex-1 font-mono"
              value={shareToken}
              readOnly
              aria-label="Direct invitation token"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!navigator.clipboard) {
                  setCopyStatus(
                    'Copy is unavailable here. Select the token and copy it manually.',
                  )
                  return
                }
                void navigator.clipboard
                  .writeText(shareToken)
                  .then(() => setCopyStatus('Token copied.'))
                  .catch(() =>
                    setCopyStatus(
                      'Copy was unavailable. Select the token and copy it manually.',
                    ),
                  )
              }}
            >
              <Copy aria-hidden="true" />
              Copy
            </Button>
            </div>
            {copyStatus ? (
              <small role="status" aria-live="polite">
                {copyStatus}
              </small>
            ) : null}
            <small className="invitation-token-note">
              Direct invitation tokens are accepted separately on the secure
              invitation screen. They are not workspace join codes.
            </small>
          </Field>
        </div>
      ) : null}
      {invitationPayload && safeInvitationUrl ? (
        <div className="invitation-share-panel">
          <div>
            <ShieldCheck aria-hidden="true" />
            <p>
              The secure link is single-use and tied to {invitedEmail}. Send it
              only to that address.
            </p>
          </div>
          <div className="invitation-share-actions">
            <Button
              type="button"
              onClick={() => {
                void shareToWhatsApp(invitationPayload)
                  .then(() => {
                    setCopyStatus(
                      'Opening WhatsApp with the secure invitation.',
                    )
                  })
                  .catch(() => {
                    setCopyStatus(
                      'WhatsApp could not be opened. Copy the secure token instead.',
                    )
                  })
              }}
            >
              <MessageCircle aria-hidden="true" />
              WhatsApp
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void shareNative(invitationPayload).then((result) => {
                  if (result.status === 'cancelled') return
                  setCopyStatus(
                    result.status === 'shared'
                      ? 'Invitation shared.'
                      : result.status === 'copied'
                        ? 'Secure invitation copied.'
                        : 'Select and copy the token manually.',
                  )
                })
              }}
            >
              <Share2 aria-hidden="true" />
              Device share
            </Button>
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                void copyShareText(invitationPayload).then((result) =>
                  setCopyStatus(
                    result.status === 'copied'
                      ? 'Secure invitation copied.'
                      : 'Select and copy the token manually.',
                  ),
                )
              }}
            >
              <Copy aria-hidden="true" />
              Copy link
            </Button>
          </div>
        </div>
      ) : shareToken ? (
        <InfoNotice>
          Public invitation-link sharing needs an HTTPS app URL. You can still
          copy the direct invitation token above.
        </InfoNotice>
      ) : null}
      <Button
        type="submit"
        loading={mutation.isPending}
        disabled={demoMode || mutation.isPending}
      >
        <MailPlus aria-hidden="true" />
        Create invitation
      </Button>
    </form>
  )
}

const demoClaims: ClaimView[] = [
  {
    id: 'CLM-2048',
    person: 'Nisha Kapoor',
    purpose: 'Client transport',
    amount: { amountMinor: 186000, currency: 'INR' },
    status: 'Needs approval',
    rawStatus: 'pending',
    reimbursementStatus: 'not_reimbursed',
    submittedBy: 'demo-nisha',
  },
  {
    id: 'CLM-2047',
    person: 'Dev Malhotra',
    purpose: 'Workshop supplies',
    amount: { amountMinor: 428000, currency: 'INR' },
    status: 'Approved',
    rawStatus: 'approved',
    reimbursementStatus: 'not_reimbursed',
    submittedBy: 'demo-dev',
  },
  {
    id: 'CLM-2044',
    person: 'Leena Iyer',
    purpose: 'Team lunch',
    amount: { amountMinor: 635000, currency: 'INR' },
    status: 'Reimbursed',
    rawStatus: 'approved',
    reimbursementStatus: 'reimbursed',
    submittedBy: 'demo-leena',
  },
]

export function OfficePage() {
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitePending, setInvitePending] = useState(false)
  const [claimFilter, setClaimFilter] = useState<
    | 'all'
    | 'pending'
    | 'approved'
    | 'reimbursed'
    | 'correction_requested'
    | 'rejected'
  >('all')
  const [selectedClaim, setSelectedClaim] = useState<ClaimView | null>(null)
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null)
  const reduce = useReducedMotion()
  const { demoMode, privacyMode, userId, workspace } = useApp()
  const canInvite = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'invite_members',
  )
  const canSubmitClaims = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'submit_expenses',
  )
  const canApproveClaims = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'approve_expenses',
  )
  const [claimDialogOpen, setClaimDialogOpen] = useQueryDialog(
    'claim',
    canSubmitClaims,
  )
  const canShareClaims = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'export_data',
  )
  const claimQuery = useFinanceData<ClaimView[]>(
    'claims',
    '/expense-claims',
    demoClaims,
    canSubmitClaims,
  )
  const items = useDemoSessionCollection(
    demoMode,
    workspace.id,
    'claims',
    claimQuery.data ?? [],
  )
  const awaitingApproval = items.filter(
    (claim) => claim.rawStatus === 'pending',
  ).length
  const approved = items.filter(
    (claim) => claim.rawStatus === 'approved',
  ).length
  const awaitingReimbursement = items.filter(
    (claim) =>
      claim.rawStatus === 'approved' &&
      claim.reimbursementStatus !== 'reimbursed',
  ).length
  const visibleClaims = items.filter((claim) => {
    if (claimFilter === 'all') return true
    if (claimFilter === 'reimbursed') {
      return claim.reimbursementStatus === 'reimbursed'
    }
    if (claimFilter === 'approved') {
      return (
        claim.rawStatus === 'approved' &&
        claim.reimbursementStatus !== 'reimbursed'
      )
    }
    return claim.rawStatus === claimFilter
  })

  const claimAction = (claim: ClaimView) => (
    <div className="claim-actions">
      {claim.rawStatus === 'pending' && canApproveClaims ? (
        <Button
          variant="secondary"
          disabled={claim.submittedBy === userId}
          title={
            claim.submittedBy === userId
              ? 'You cannot approve your own claim'
              : undefined
          }
          onClick={() => setSelectedClaim(claim)}
        >
          Review
        </Button>
      ) : null}
      {canShareClaims ? (
        <IconButton
          label={`Share update for ${claim.purpose}`}
          onClick={() =>
            setSharePayload(
              buildExpenseClaimSharePayload(
                {
                  purpose: claim.purpose,
                  amount: claim.amount,
                  claimantDisplayName: claim.person,
                  status: claim.status,
                },
                {
                  locale: navigator.language,
                  concealAmounts: privacyMode,
                },
              ),
            )
          }
        >
          <Share2 />
        </IconButton>
      ) : null}
    </div>
  )

  return (
    <PageFrame className="office-page collaboration-page">
      <PageHeader
        title="Office expenses"
        description="Submit, approve, and reimburse with a clear audit trail."
        actions={
          <>
            {canInvite ? (
              <Button
                variant="secondary"
                onClick={() => setInviteOpen(true)}
                aria-describedby={
                  demoMode ? 'office-demo-invitation-note' : undefined
                }
              >
                <UserPlus aria-hidden="true" />
                Invite
              </Button>
            ) : null}
            {canSubmitClaims ? (
              <Button onClick={() => setClaimDialogOpen(true)}>
                <Plus aria-hidden="true" />
                New claim
              </Button>
            ) : null}
          </>
        }
      />
      {!canInvite || !canSubmitClaims ? (
        <InfoNotice>
          Your workspace role cannot{' '}
          {!canInvite && !canSubmitClaims
            ? 'invite members or submit expense claims'
            : !canInvite
              ? 'invite members'
              : 'submit expense claims'}
          .
        </InfoNotice>
      ) : null}
      {demoMode ? (
        <p className="sr-only" id="office-demo-invitation-note">
          Open the invitation dialog to see why invitations are unavailable in
          demo mode.
        </p>
      ) : null}
      {canSubmitClaims ? (
        <section
          className="office-metrics"
          aria-label="Office expense overview"
        >
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          <span>Awaiting approval</span>
          <strong>{awaitingApproval}</strong>
          <small>Claims currently pending review</small>
        </motion.div>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: reduce ? 0 : 0.28,
            delay: reduce ? 0 : 0.045,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <span>Approved claims</span>
          <strong>{approved}</strong>
          <small>Loaded approved claims</small>
        </motion.div>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: reduce ? 0 : 0.28,
            delay: reduce ? 0 : 0.09,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <span>Awaiting reimbursement</span>
          <strong>{awaitingReimbursement}</strong>
          <small>Approved but not reimbursed</small>
        </motion.div>
        </section>
      ) : null}
      {!canSubmitClaims ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="Claims are restricted"
          message="Your role does not include access to the expense-claim collection."
        />
      ) : claimQuery.isLoading ? (
        <DataSkeleton />
      ) : claimQuery.isError ? (
        <ErrorState
          message="Expense claims could not be loaded."
          retry={() => claimQuery.refetch()}
        />
      ) : !items.length ? (
        <EmptyState
          icon={<FileText />}
          title="No expense claims"
          message="Claims submitted in this workspace will appear here."
          action={
            canSubmitClaims ? (
              <Button onClick={() => setClaimDialogOpen(true)}>
                <Plus aria-hidden="true" />
                Submit claim
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Section>
        <div className="section-heading-row claim-section-heading">
          <div>
            <h2>Recent claims</h2>
            <p>
              {claimFilter === 'all'
                ? 'Submission and approval status'
                : `Showing ${visibleClaims.length} of ${items.length} loaded claims`}
            </p>
          </div>
          <label className="claim-filter-control">
            <Filter aria-hidden="true" />
            <span className="visually-hidden">Filter loaded claims</span>
            <Select
              value={claimFilter}
              onValueChange={(value) =>
                setClaimFilter(value as typeof claimFilter)
              }
            >
              <SelectTrigger
                className="w-full border-0 bg-transparent p-0 shadow-none"
                aria-label="Filter loaded claims"
              >
                <SelectValue placeholder="Filter loaded claims" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All claims</SelectItem>
                <SelectItem value="pending">Needs approval</SelectItem>
                <SelectItem value="approved">Awaiting reimbursement</SelectItem>
                <SelectItem value="reimbursed">Reimbursed</SelectItem>
                <SelectItem value="correction_requested">
                  Needs correction
                </SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        {!visibleClaims.length ? (
          <EmptyState
            icon={<Filter />}
            title="No matching claims"
            message="Choose another status to review the loaded claims."
          />
        ) : (
          <>
        <div
          className="claims-table hidden lg:block"
          role="table"
          aria-label="Expense claims"
        >
          <div role="rowgroup">
            <div className="claims-header" role="row">
              <span role="columnheader">Submitter</span>
              <span role="columnheader">Purpose</span>
              <span role="columnheader">Amount</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Actions</span>
            </div>
          </div>
          <div role="rowgroup">
            {visibleClaims.map((claim) => (
              <div className="claims-row" role="row" key={claim.id}>
                <span role="cell">{claim.person}</span>
                <span role="cell">{claim.purpose}</span>
                <span role="cell">
                  <MoneyText money={claim.amount} />
                </span>
                <span role="cell">
                  <Badge
                    tone={
                      claim.status === 'Approved'
                        ? 'positive'
                        : claim.status === 'Needs approval'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {claim.status}
                  </Badge>
                </span>
                <span role="cell">
                  {claimAction(claim)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div
          className="grid divide-y divide-[var(--line)] lg:hidden"
          role="list"
          aria-label="Expense claims"
        >
          {visibleClaims.map((claim, index) => (
            <motion.article
              className="grid gap-3 p-4"
              role="listitem"
              key={`mobile-${claim.id}`}
              initial={reduce ? false : { opacity: 0, y: 7 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reduce ? 0 : 0.26,
                delay: reduce ? 0 : Math.min(index * 0.045, 0.2),
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <header className="flex items-start justify-between gap-3">
                <span className="grid gap-1">
                  <strong>Expense claim</strong>
                  <small className="text-[var(--ink-faint)]">
                    {claim.person}
                  </small>
                </span>
                <Badge
                  tone={
                    claim.status === 'Approved'
                      ? 'positive'
                      : claim.status === 'Needs approval'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {claim.status}
                </Badge>
              </header>
              <p className="text-sm">{claim.purpose}</p>
              <footer className="flex items-center justify-between gap-3">
                <MoneyText money={claim.amount} />
                {claimAction(claim)}
              </footer>
            </motion.article>
          ))}
        </div>
          </>
        )}
        </Section>
      )}
      <ClaimSubmitDialog
        open={claimDialogOpen}
        onClose={() => setClaimDialogOpen(false)}
      />
      <ClaimReviewDialog
        claim={selectedClaim}
        onClose={() => setSelectedClaim(null)}
      />
      <Dialog
        open={inviteOpen}
        title="Invite a team member"
        onClose={
          invitePending ? () => undefined : () => setInviteOpen(false)
        }
      >
        <InviteForm type="office" onBusyChange={setInvitePending} />
      </Dialog>
      <ShareSheet
        open={Boolean(sharePayload)}
        onOpenChange={(open) => {
          if (!open) setSharePayload(null)
        }}
        payload={sharePayload}
        privacyNote="Only the claim purpose, submitter label, status, and visible amount are included. Claim IDs, receipts, comments, and reimbursement details stay private."
      />
    </PageFrame>
  )
}
