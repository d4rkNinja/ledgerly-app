import { createContext, useContext } from 'react'
import type { CurrentUser, Workspace } from '@/domain/types'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = Exclude<Theme, 'system'>

export interface AppContextValue {
  demoMode: boolean
  isAuthenticated: boolean
  userId: string
  userName: string
  currentUser?: CurrentUser
  workspace: Workspace
  availableWorkspaces: Workspace[]
  defaultWorkspaceId: string
  preferredCurrency: string
  privacyMode: boolean
  theme: Theme
  resolvedTheme: ResolvedTheme
  enterDemo: () => void
  completeLogin: (
    userId: string,
    name: string,
    token: string,
    rememberDevice?: boolean,
    preferredCurrency?: string,
    appPin?: string,
  ) => Promise<void>
  refreshWorkspaces: (preferredWorkspaceId?: string) => Promise<Workspace[]>
  deleteWorkspace: (workspaceId: string) => Promise<void>
  signOut: () => void
  setWorkspace: (workspace: Workspace) => void
  setDefaultWorkspace: (workspace: Workspace) => void
  setPrivacyMode: (enabled: boolean) => void
  setPreferredCurrency: (currency: string) => void
  setTheme: (theme: Theme) => void
  setCurrentUser?: (user: CurrentUser) => void
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp() {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside AppProvider')
  return value
}
