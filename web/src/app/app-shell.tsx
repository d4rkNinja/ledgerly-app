import { ShieldCheck } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useReducedMotion } from 'motion/react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { BottomSheet } from '@/components/beui/bottom-sheet'
import {
  AnimatedToastStack,
  useAnimatedToastStack,
} from '@/components/motion/animated-toast-stack'
import { QuickAddSheet } from '@/components/quick-add-sheet'
import {
  WorkspaceSearch,
  type WorkspaceSearchPage,
} from '@/components/workspace-search'
import { OfflineBanner, Skeleton } from '@/components/ui'
import { api } from '@/lib/api-client'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { useSoftKeyboard } from '@/lib/hooks/use-soft-keyboard'
import { useNativeAppState } from '@/platform/native-app-state'
import { AppTopbar } from './navigation/app-topbar'
import { DesktopRail } from './navigation/desktop-rail'
import { MobileNavigationDock } from './navigation/mobile-dock'
import {
  navigationRegistry,
  searchableNavigation,
  searchKeywordsFor,
} from './navigation/registry'
import { WorkspaceOptions } from './navigation/workspace-switcher'
import { WorkspaceManagementDialogs } from './workspace-management-dialogs'
import { useApp } from './app-state'

type NotificationUnreadSummary = {
  unreadCount: number
}

function RouteContentLoading({ pathname }: { pathname: string }) {
  const title =
    navigationRegistry.find((item) => item.to === pathname)?.label ?? 'Page'

  return (
    <div className="page-stack route-content-loading" aria-busy="true">
      <header className="page-header">
        <div>
          <span className="page-eyebrow">Loading</span>
          <h1>{title}</h1>
          <p>Preparing this workspace page.</p>
        </div>
      </header>
      <Skeleton className="route-loading-copy" />
    </div>
  )
}

export function AppShell() {
  const {
    demoMode,
    privacyMode,
    setPrivacyMode,
    resolvedTheme,
    setTheme,
    userName,
    workspace,
    availableWorkspaces,
    defaultWorkspaceId,
    preferredCurrency,
    refreshWorkspaces,
    deleteWorkspace,
    setWorkspace,
    setDefaultWorkspace,
  } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const reduceMotion = useReducedMotion() ?? false
  const mobile = useMediaQuery('(max-width: 980px)')
  const nativeAppState = useNativeAppState()
  const softKeyboardOpen = useSoftKeyboard(nativeAppState.nativeKeyboard)
  const online = nativeAppState.network.connected
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [workspaceDialog, setWorkspaceDialog] = useState<'create' | 'join' | 'delete' | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [routeAnnouncement, setRouteAnnouncement] = useState('')
  const { toasts, showToast, dismissToast } = useAnimatedToastStack({
    limit: 2,
    defaultDuration: 3600,
  })
  const mainRef = useRef<HTMLElement>(null)
  const quickAddTriggerRef = useRef<HTMLButtonElement>(null)
  const quickAddReturnPathRef = useRef<string | null>(null)
  const previousCreationDialogOpenRef = useRef(false)

  const canCreateTransactions =
    demoMode ||
    workspace.permissions?.includes('create_transactions') === true
  const canCreateAccount =
    demoMode || workspace.permissions?.includes('edit_vault') === true
  const canCreateBudget =
    demoMode || workspace.permissions?.includes('manage_budgets') === true
  const canCreateGoal =
    demoMode || workspace.permissions?.includes('manage_goals') === true
  const canManageContacts =
    demoMode || workspace.permissions?.includes('create_transactions') === true
  const canSubmitClaim =
    demoMode || workspace.permissions?.includes('submit_expenses') === true
  const canQuickAdd =
    canCreateTransactions ||
    canCreateAccount ||
    canCreateBudget ||
    canCreateGoal ||
    canManageContacts ||
    canSubmitClaim
  const canViewBalances =
    demoMode || workspace.permissions?.includes('view_balances') === true
  const workspaceSearchAvailable =
    !demoMode &&
    workspace.permissions?.includes('view_transactions') === true

  const unreadCountQuery = useQuery({
    queryKey: ['notification-unread-count', demoMode ? 'demo' : 'live'],
    queryFn: async ({ signal }): Promise<number> => {
      if (demoMode) return 1
      const response = await api.get<NotificationUnreadSummary>(
        '/notifications/unread-count',
        { signal },
      )
      return Number.isFinite(response.unreadCount)
        ? Math.max(0, Math.trunc(response.unreadCount))
        : 0
    },
    retry: 1,
    staleTime: demoMode ? Number.POSITIVE_INFINITY : 30_000,
    refetchOnWindowFocus: !demoMode,
  })
  const unreadNotifications = Number.isFinite(unreadCountQuery.data)
    ? Math.max(0, Math.trunc(unreadCountQuery.data ?? 0))
    : 0

  useEffect(() => {
    if (!mobile) setQuickAddOpen(false)
  }, [mobile])

  useEffect(() => {
    setRouteAnnouncement('')
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    const frame = requestAnimationFrame(() => {
      mainRef.current?.focus({ preventScroll: true })
      const pageTitle =
        mainRef.current?.querySelector('h1')?.textContent?.trim() ?? 'Page'
      setRouteAnnouncement(`${pageTitle} loaded`)
    })
    return () => cancelAnimationFrame(frame)
  }, [location.pathname])

  const searchPages = useMemo<WorkspaceSearchPage[]>(
    () =>
      searchableNavigation.map((item) => ({
        id: item.to,
        label: item.label,
        group: item.searchGroup,
        icon: item.icon,
        keywords: searchKeywordsFor(item),
        onSelect: () => navigate(item.to),
      })),
    [navigate],
  )
  const creationDialogOpen = useMemo(() => {
    const parameters = new URLSearchParams(location.search)
    return parameters.has('add') || parameters.has('claim')
  }, [location.search])

  useEffect(() => {
    const wasOpen = previousCreationDialogOpenRef.current
    previousCreationDialogOpenRef.current = creationDialogOpen

    if (
      !wasOpen ||
      creationDialogOpen ||
      !mobile ||
      quickAddReturnPathRef.current !== location.pathname
    ) {
      if (!creationDialogOpen && quickAddReturnPathRef.current !== location.pathname) {
        quickAddReturnPathRef.current = null
      }
      return
    }

    quickAddReturnPathRef.current = null
    const focusFrame = requestAnimationFrame(() => {
      quickAddTriggerRef.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(focusFrame)
  }, [creationDialogOpen, location.pathname, mobile])

  return (
    <div className={`product-shell${online ? '' : ' is-offline'}`}>
      {!online ? <OfflineBanner /> : null}
      <DesktopRail
        demoMode={demoMode}
        privacyMode={privacyMode}
        userName={userName}
        workspace={workspace}
        availableWorkspaces={availableWorkspaces}
        workspaceOpen={workspaceOpen}
        mobile={mobile}
        reduceMotion={reduceMotion}
        onWorkspaceOpenChange={setWorkspaceOpen}
        onWorkspaceSelect={setWorkspace}
        defaultWorkspaceId={defaultWorkspaceId}
        onWorkspaceCreate={() => setWorkspaceDialog('create')}
        onWorkspaceJoin={() => setWorkspaceDialog('join')}
        onWorkspaceSetDefault={setDefaultWorkspace}
        onWorkspaceDelete={
          !demoMode && workspace.role === 'owner'
            ? () => setWorkspaceDialog('delete')
            : undefined
        }
        onPrivacyModeChange={setPrivacyMode}
      />

      <div className="app-stage">
        <AppTopbar
          workspace={workspace}
          workspaceOpen={workspaceOpen}
          searchOpen={searchOpen}
          resolvedTheme={resolvedTheme}
          privacyMode={privacyMode}
          unreadNotifications={unreadNotifications}
          onWorkspaceOpenChange={setWorkspaceOpen}
          onSearchOpen={() => setSearchOpen(true)}
          onThemeChange={setTheme}
          onPrivacyModeChange={setPrivacyMode}
          onNavigate={(to) => navigate(to)}
        />
        {demoMode ? (
          <div className="demo-banner">
            <ShieldCheck aria-hidden="true" />
            Demo mode uses sample data. Changes that need the server stay disabled.
          </div>
        ) : null}
        <main
          ref={mainRef}
          id="main-content"
          className="content-stage"
          tabIndex={-1}
        >
          <span className="visually-hidden" aria-live="polite" aria-atomic="true">
            {routeAnnouncement}
          </span>
          <div className="route-stage">
            <Suspense
              key={location.pathname}
              fallback={<RouteContentLoading pathname={location.pathname} />}
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      {mobile ? (
        <MobileNavigationDock
          keyboardOpen={softKeyboardOpen}
          pathname={location.pathname}
          reduceMotion={reduceMotion}
          quickAddOpen={quickAddOpen}
          creationDialogOpen={creationDialogOpen}
          canQuickAdd={canQuickAdd}
          unreadNotifications={unreadNotifications}
          onQuickAddOpen={() => setQuickAddOpen(true)}
          quickAddButtonRef={quickAddTriggerRef}
        />
      ) : null}

      <WorkspaceSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        mobile={mobile}
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        workspaceSearchAvailable={workspaceSearchAvailable}
        demoMode={demoMode}
        concealAmounts={privacyMode}
        canViewBalances={canViewBalances}
        pages={searchPages}
        onNavigate={(to) => {
          quickAddReturnPathRef.current = to.split('?')[0]
          navigate(to)
        }}
      />
      <QuickAddSheet
        open={quickAddOpen && mobile}
        onOpenChange={setQuickAddOpen}
        onNavigate={(to) => navigate(to)}
        demoMode={demoMode}
        canCreateTransaction={canCreateTransactions}
        canCreateAccount={canCreateAccount}
        canCreateBudget={canCreateBudget}
        canCreateGoal={canCreateGoal}
        canManageContacts={canManageContacts}
        canSubmitClaim={canSubmitClaim}
      />
      <BottomSheet
        open={workspaceOpen && mobile}
        onOpenChange={setWorkspaceOpen}
        snapPoints={['auto']}
        title="Switch workspace"
        description="Choose where you want to work."
        className="mobile-workspace-sheet"
      >
        <WorkspaceOptions
          items={availableWorkspaces}
          current={workspace}
          onSelect={(item) => {
            setWorkspace(item)
            setWorkspaceOpen(false)
          }}
          defaultWorkspaceId={defaultWorkspaceId}
          onCreate={() => {
            setWorkspaceOpen(false)
            setWorkspaceDialog('create')
          }}
          onJoin={() => {
            setWorkspaceOpen(false)
            setWorkspaceDialog('join')
          }}
          onSetDefault={(item) => {
            setDefaultWorkspace(item)
            setWorkspaceOpen(false)
          }}
          onDelete={
            !demoMode && workspace.role === 'owner'
              ? () => {
                  setWorkspaceOpen(false)
                  setWorkspaceDialog('delete')
                }
              : undefined
          }
        />
      </BottomSheet>
      <WorkspaceManagementDialogs
        createOpen={workspaceDialog === 'create'}
        joinOpen={workspaceDialog === 'join'}
        deleteOpen={workspaceDialog === 'delete'}
        workspace={workspace}
        currency={preferredCurrency}
        onClose={() => setWorkspaceDialog(null)}
        onCreated={async (created) => {
          await refreshWorkspaces(created.id)
        }}
        onDeleted={async (workspaceId) => {
          await deleteWorkspace(workspaceId)
        }}
        onJoined={async (workspaceId) => {
          await refreshWorkspaces(workspaceId)
          showToast({
            title: 'Workspace joined',
            description: 'Your workspace is ready to use.',
            status: 'success',
          })
        }}
      />
      <AnimatedToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        position="bottom-center"
        placement="fixed"
        portal
      />
    </div>
  )
}
