import {
  Bell,
  CalendarClock,
  Check,
  Flag,
  ShieldCheck,
  UserPlus,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useState,
} from 'react'
import {
  useLocation,
} from 'react-router'
import { useApp } from '@/app/app-state'
import { api, ApiError } from '@/lib/api-client'
import { formatDate } from '@/lib/format'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  ListRow,
  PageHeader,
  Section,
} from '@/components/ui'
import {
  addDemoSessionItem,
  useDemoSessionCollection,
} from '../finance-writes'

import {
  DataSkeleton,
  FeedbackNotice,
  MotionListItem,
  PageFrame,
  type Feedback,
} from './shared'
import { friendlyLabel, hasWorkspacePermission } from './data'

type NotificationView = {
  id: string
  title: string
  message: string
  type: string
  createdAt: string
  read: boolean
}

const demoNotificationUpdates: NotificationView[] = [
  {
    id: 'demo-budget',
    title: 'Transport budget is at 86%',
    message: 'Sharma family · 12 minutes ago',
    type: 'budget_threshold',
    createdAt: '',
    read: false,
  },
  {
    id: 'demo-claim',
    title: 'Your claim CLM-2041 was approved',
    message: 'Fieldwork studio · 2 hours ago',
    type: 'claim_approved',
    createdAt: '',
    read: true,
  },
  {
    id: 'demo-invitation',
    title: 'Riya invited you to Japan 2027',
    message: 'Shared travel expense · Yesterday',
    type: 'invitation',
    createdAt: '',
    read: true,
  },
  {
    id: 'demo-bill',
    title: 'Electricity bill is due in 7 days',
    message: 'My money · Yesterday',
    type: 'bill_due',
    createdAt: '',
    read: true,
  },
]

function normalizeNotifications(response: unknown): NotificationView[] {
  if (!Array.isArray(response)) return []
  return response.map((item) => {
    const notification = item as Record<string, unknown>
    return {
      id: String(notification.id),
      title: String(notification.title ?? 'Workspace update'),
      message: String(notification.message ?? ''),
      type: String(notification.type ?? 'update'),
      createdAt: String(notification.createdAt ?? ''),
      read: Boolean(notification.readAt),
    }
  })
}

function normalizeAuditEvents(response: unknown): NotificationView[] {
  if (!Array.isArray(response)) return []
  return response.map((item) => {
    const event = item as Record<string, unknown>
    const action = String(event.action ?? 'workspace.updated')
    const entityType = String(event.entityType ?? 'workspace')
    return {
      id: String(event.id),
      title: friendlyLabel(action.replaceAll('.', ' ')),
      message: `${friendlyLabel(entityType)} activity`,
      type: action,
      createdAt: String(event.createdAt ?? ''),
      read: true,
    }
  })
}

function notificationIcon(type: string) {
  if (type.includes('budget')) {
    return (
      <span className="notification-icon warning">
        <Flag aria-hidden="true" />
      </span>
    )
  }
  if (type.includes('claim') || type.includes('approved')) {
    return (
      <span className="notification-icon positive">
        <Check aria-hidden="true" />
      </span>
    )
  }
  if (type.includes('invit')) {
    return (
      <span className="notification-icon">
        <UserPlus aria-hidden="true" />
      </span>
    )
  }
  if (type.includes('bill') || type.includes('due')) {
    return (
      <span className="notification-icon">
        <CalendarClock aria-hidden="true" />
      </span>
    )
  }
  return (
    <span className="notification-icon">
      <Bell aria-hidden="true" />
    </span>
  )
}

function notificationSubtitle(notification: NotificationView) {
  if (!notification.createdAt) return notification.message
  const timestamp = new Date(notification.createdAt)
  const dateLabel = Number.isNaN(timestamp.getTime())
    ? ''
    : formatDate(notification.createdAt)
  return [notification.message, dateLabel].filter(Boolean).join(' · ')
}

export function NotificationsPage() {
  const { pathname } = useLocation()
  const { demoMode, workspace } = useApp()
  const queryClient = useQueryClient()
  const [notificationFeedback, setNotificationFeedback] =
    useState<Feedback | null>(null)
  const activityView = pathname.endsWith('/activity')
  const canViewActivity = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'view_audit_history',
  )
  const notificationQueryKey = [
    'notifications',
    demoMode ? 'demo' : 'live',
  ] as const
  const notificationUnreadCountQueryKey = [
    'notification-unread-count',
    demoMode ? 'demo' : 'live',
  ] as const
  const notificationQuery = useQuery({
    queryKey: notificationQueryKey,
    queryFn: async () => {
      if (demoMode) return demoNotificationUpdates
      return normalizeNotifications(await api.get<unknown>('/notifications'))
    },
    enabled: !activityView,
    retry: 1,
  })
  const activityQuery = useQuery({
    queryKey: ['activity', workspace.id, demoMode ? 'demo' : 'live'],
    queryFn: async () => {
      if (demoMode) return demoNotificationUpdates
      return normalizeAuditEvents(
        await api.get<unknown>(`/workspaces/${workspace.id}/audit`),
      )
    },
    enabled: activityView && canViewActivity,
    retry: 1,
  })
  const notificationUpdates = useDemoSessionCollection(
    demoMode,
    'demo-user',
    'notifications',
    notificationQuery.data ?? [],
  )
  const updates = activityView
    ? (activityQuery.data ?? [])
    : notificationUpdates
  const activeQuery = activityView ? activityQuery : notificationQuery
  const unreadUpdates = notificationUpdates.filter((update) => !update.read)

  const refreshNotificationState = () => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      queryClient.invalidateQueries({
        queryKey: notificationUnreadCountQueryKey,
        exact: true,
      }),
    ])
  }

  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) =>
      api.patch<unknown, undefined>(
        `/notifications/${encodeURIComponent(notificationId)}/read`,
        undefined,
      ),
    onSuccess: (_response, notificationId) => {
      queryClient.setQueryData<NotificationView[]>(
        notificationQueryKey,
        (current = []) =>
          current.map((notification) =>
            notification.id === notificationId
              ? { ...notification, read: true }
              : notification,
          ),
      )
      setNotificationFeedback({
        tone: 'success',
        message: 'Notification marked as read.',
      })
      refreshNotificationState()
    },
    onError: (error) => {
      setNotificationFeedback({
        tone: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'This notification could not be marked as read.',
      })
    },
  })

  const markAllMutation = useMutation({
    mutationFn: () =>
      api.patch<unknown, undefined>('/notifications/read-all', undefined),
    onSuccess: () => {
      queryClient.setQueryData<NotificationView[]>(
        notificationQueryKey,
        (current = []) =>
          current.map((notification) => ({
            ...notification,
            read: true,
          })),
      )
      setNotificationFeedback({
        tone: 'success',
        message: 'All notifications marked as read.',
      })
      refreshNotificationState()
    },
    onError: (error) => {
      setNotificationFeedback({
        tone: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Notifications could not be marked as read.',
      })
    },
  })

  const updateDemoUnreadCount = (nextUnread: number) => {
    queryClient.setQueryData<number>(
      notificationUnreadCountQueryKey,
      Math.max(0, nextUnread),
    )
  }

  const markNotificationRead = (notification: NotificationView) => {
    if (notification.read || markReadMutation.isPending) return
    setNotificationFeedback(null)
    if (demoMode) {
      addDemoSessionItem<NotificationView>(
        'demo-user',
        'notifications',
        { ...notification, read: true },
      )
      updateDemoUnreadCount(unreadUpdates.length - 1)
      setNotificationFeedback({
        tone: 'success',
        message:
          'Marked as read for this demo session only. No server data changed.',
      })
      return
    }
    markReadMutation.mutate(notification.id)
  }

  const markAllNotificationsRead = () => {
    if (!unreadUpdates.length || markAllMutation.isPending) return
    setNotificationFeedback(null)
    if (demoMode) {
      unreadUpdates.forEach((notification) => {
        addDemoSessionItem<NotificationView>(
          'demo-user',
          'notifications',
          { ...notification, read: true },
        )
      })
      updateDemoUnreadCount(0)
      setNotificationFeedback({
        tone: 'success',
        message:
          'All demo notifications are read for this session. No server data changed.',
      })
      return
    }
    markAllMutation.mutate()
  }

  return (
    <PageFrame className={activityView ? 'activity-page timeline-page' : 'notifications-page timeline-page'}>
      <PageHeader
        title={activityView ? 'Activity' : 'Notifications'}
        description={
          activityView
            ? 'Recent changes across your workspaces.'
            : 'Only the updates that need your attention.'
        }
        actions={
          !activityView && unreadUpdates.length ? (
            <Button
              variant="secondary"
              loading={markAllMutation.isPending}
              disabled={
                markAllMutation.isPending || markReadMutation.isPending
              }
              onClick={markAllNotificationsRead}
            >
              <Check aria-hidden="true" />
              Mark all read
            </Button>
          ) : undefined
        }
      />
      {!activityView && notificationFeedback ? (
        <FeedbackNotice feedback={notificationFeedback} />
      ) : null}
      {activityView && !canViewActivity ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="Activity is restricted"
          message="Your role does not include access to workspace audit history."
        />
      ) : activeQuery.isLoading ? (
        <DataSkeleton />
      ) : activeQuery.isError ? (
        <ErrorState
          message={
            activityView
              ? 'Workspace activity could not be loaded.'
              : 'Notifications could not be loaded.'
          }
          retry={() => activeQuery.refetch()}
        />
      ) : !updates.length ? (
        <EmptyState
          icon={<Bell />}
          title={activityView ? 'No recent activity' : 'You are all caught up'}
          message={
            activityView
              ? 'Recent workspace changes will appear here.'
              : 'New account, budget, bill, and collaboration updates will appear here.'
          }
        />
      ) : (
        <Section>
          <div className="section-heading-row">
            <div>
              <h2>
                {demoMode
                  ? activityView
                    ? 'Demo activity'
                    : 'Demo updates'
                  : 'Recent updates'}
              </h2>
              <p>
                {demoMode
                  ? 'Sample data for exploring the interface'
                  : 'Updates from your signed-in account'}
              </p>
            </div>
          </div>
          <div className="row-list">
            {updates.map((update, index) => (
              <MotionListItem key={update.id} index={index}>
                <ListRow
                  leading={notificationIcon(update.type)}
                  title={update.title}
                  subtitle={notificationSubtitle(update)}
                  trailing={
                    activityView ? undefined : (
                      <div className="flex items-center gap-2">
                        {!update.read ? (
                          <Badge tone="warning">New</Badge>
                        ) : null}
                        {!update.read ? (
                          <Button
                            variant="quiet"
                            loading={
                              markReadMutation.isPending &&
                              markReadMutation.variables === update.id
                            }
                            disabled={
                              markAllMutation.isPending ||
                              (markReadMutation.isPending &&
                                markReadMutation.variables !== update.id)
                            }
                            aria-label={`Mark “${update.title}” as read`}
                            onClick={() => markNotificationRead(update)}
                          >
                            Mark read
                          </Button>
                        ) : null}
                      </div>
                    )
                  }
                />
              </MotionListItem>
            ))}
          </div>
        </Section>
      )}
    </PageFrame>
  )
}
