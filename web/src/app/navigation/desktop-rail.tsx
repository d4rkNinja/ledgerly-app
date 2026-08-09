import { Eye, EyeOff } from 'lucide-react'
import { NavLink } from 'react-router'
import type { Workspace } from '@/domain/types'
import { initials } from '@/lib/format'
import {
  collaborativeNavigation,
  footerNavigation,
  primaryNavigation,
} from './registry'
import { AppMark, DesktopWorkspaceSwitcher } from './workspace-switcher'

function formatRoleLabel(role: Workspace['role']) {
  const normalized =
    role === 'admin' ? 'administrator' : role.replaceAll('_', ' ')
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
}

export function DesktopRail({
  demoMode,
  privacyMode,
  userName,
  workspace,
  availableWorkspaces,
  workspaceOpen,
  mobile,
  reduceMotion,
  onWorkspaceOpenChange,
  onWorkspaceSelect,
  defaultWorkspaceId,
  onWorkspaceCreate,
  onWorkspaceJoin,
  onWorkspaceSetDefault,
  onWorkspaceDelete,
  onPrivacyModeChange,
}: {
  demoMode: boolean
  privacyMode: boolean
  userName: string
  workspace: Workspace
  availableWorkspaces: Workspace[]
  workspaceOpen: boolean
  mobile: boolean
  reduceMotion: boolean
  onWorkspaceOpenChange: (open: boolean) => void
  onWorkspaceSelect: (workspace: Workspace) => void
  defaultWorkspaceId: string
  onWorkspaceCreate: () => void
  onWorkspaceJoin: () => void
  onWorkspaceSetDefault: (workspace: Workspace) => void
  onWorkspaceDelete?: (workspace: Workspace) => void
  onPrivacyModeChange: (enabled: boolean) => void
}) {
  return (
    <aside className="desktop-rail">
      <div className="brand-row">
        <AppMark />
        <strong>Ledgerly</strong>
      </div>
      <DesktopWorkspaceSwitcher
        items={availableWorkspaces}
        current={workspace}
        open={workspaceOpen}
        mobile={mobile}
        reduceMotion={reduceMotion}
        onOpenChange={onWorkspaceOpenChange}
        onSelect={onWorkspaceSelect}
        defaultWorkspaceId={defaultWorkspaceId}
        onCreate={onWorkspaceCreate}
        onJoin={onWorkspaceJoin}
        onSetDefault={onWorkspaceSetDefault}
        onDelete={onWorkspaceDelete}
      />
      <nav className="side-navigation" aria-label="Main navigation">
        {primaryNavigation.map((item) => (
          <NavLink key={item.id} to={item.to}>
            <item.icon aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
        <span className="nav-group-label">Collaborate</span>
        {collaborativeNavigation.map((item) => (
          <NavLink key={item.id} to={item.to}>
            <item.icon aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="rail-footer">
        {footerNavigation.map((item) => (
          <NavLink key={item.id} to={item.to}>
            <item.icon aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => onPrivacyModeChange(!privacyMode)}
          aria-pressed={privacyMode}
        >
          {privacyMode ? (
            <Eye aria-hidden="true" />
          ) : (
            <EyeOff aria-hidden="true" />
          )}
          {privacyMode ? 'Show amounts' : 'Hide amounts'}
        </button>
        <div className="rail-profile">
          <span className="avatar">{initials(userName)}</span>
          <span>
            <strong>{userName}</strong>
            <small>
              {demoMode ? 'Demo workspace' : formatRoleLabel(workspace.role)}
            </small>
          </span>
        </div>
      </div>
    </aside>
  )
}
