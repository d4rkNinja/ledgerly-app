import {
  ChevronDown,
  Eye,
  EyeOff,
  Moon,
  Search,
  Sun,
} from 'lucide-react'
import { ActionSwapIcon } from '@/components/motion/action-swap'
import { IconButton } from '@/components/ui'
import type { Workspace } from '@/domain/types'
import type { ResolvedTheme } from '../app-state'
import { navigationItemById } from './registry'
import { AppMark } from './workspace-switcher'

const notificationsNavigation = navigationItemById('notifications')

export function AppTopbar({
  workspace,
  workspaceOpen,
  searchOpen,
  resolvedTheme,
  privacyMode,
  unreadNotifications,
  onWorkspaceOpenChange,
  onSearchOpen,
  onThemeChange,
  onPrivacyModeChange,
  onNavigate,
}: {
  workspace: Workspace
  workspaceOpen: boolean
  searchOpen: boolean
  resolvedTheme: ResolvedTheme
  privacyMode: boolean
  unreadNotifications: number
  onWorkspaceOpenChange: (open: boolean) => void
  onSearchOpen: () => void
  onThemeChange: (theme: ResolvedTheme) => void
  onPrivacyModeChange: (enabled: boolean) => void
  onNavigate: (to: string) => void
}) {
  const notificationLabel =
    unreadNotifications > 0
      ? `Notifications, ${unreadNotifications} unread`
      : 'Notifications'
  const NotificationIcon = notificationsNavigation.icon

  return (
    <header className="topbar">
      <button
        type="button"
        className="mobile-brand mobile-workspace-trigger"
        aria-label={`Switch workspace, current workspace ${workspace.name}`}
        aria-expanded={workspaceOpen}
        aria-haspopup="dialog"
        onClick={() => onWorkspaceOpenChange(!workspaceOpen)}
      >
        <AppMark />
        <span>
          <strong>Ledgerly</strong>
          <small>{workspace.name}</small>
        </span>
        <ChevronDown aria-hidden="true" />
      </button>
      <button
        type="button"
        className="global-search"
        aria-expanded={searchOpen}
        aria-haspopup="dialog"
        onClick={onSearchOpen}
      >
        <Search aria-hidden="true" />
        <span>Search workspace</span>
        <kbd>⌘ K</kbd>
      </button>
      <div className="topbar-actions">
        <IconButton
          className="mobile-search-action"
          label="Search workspace and pages"
          aria-expanded={searchOpen}
          aria-haspopup="dialog"
          onClick={onSearchOpen}
        >
          <Search />
        </IconButton>
        <IconButton
          label={`Use ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
          onClick={() =>
            onThemeChange(resolvedTheme === 'dark' ? 'light' : 'dark')
          }
        >
          <ActionSwapIcon value={resolvedTheme} animation="blur">
            {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
          </ActionSwapIcon>
        </IconButton>
        <IconButton
          label={privacyMode ? 'Show amounts' : 'Hide amounts'}
          onClick={() => onPrivacyModeChange(!privacyMode)}
        >
          <ActionSwapIcon
            value={privacyMode ? 'private' : 'visible'}
            animation="blur"
          >
            {privacyMode ? <Eye /> : <EyeOff />}
          </ActionSwapIcon>
        </IconButton>
        <IconButton
          label={notificationLabel}
          onClick={() => onNavigate(notificationsNavigation.to)}
        >
          <NotificationIcon />
          {unreadNotifications > 0 ? (
            <span className="notification-count" aria-hidden="true">
              {unreadNotifications > 99 ? '99+' : unreadNotifications}
            </span>
          ) : null}
        </IconButton>
      </div>
    </header>
  )
}
