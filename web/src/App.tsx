import {
  useEffect,
  lazy,
  Suspense,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router'
import { useApp } from '@/app/app-state'
import { EmptyState, Skeleton } from '@/components/ui'
import { CircleHelp } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import {
  MOTION_DISTANCE,
  TRANSITION_CONTENT,
} from '@/lib/app-motion'

const AppShell = lazy(() =>
  import('@/app/app-shell').then((module) => ({ default: module.AppShell })),
)
const WelcomePage = lazy(() =>
  import('@/pages/auth/WelcomePage').then((module) => ({
    default: module.WelcomePage,
  })),
)
const LoginPage = lazy(() =>
  import('@/pages/auth/LoginPage').then((module) => ({
    default: module.LoginPage,
  })),
)
const ForgotPasswordPage = lazy(() =>
  import('@/pages/auth/ForgotPasswordPage').then((module) => ({
    default: module.ForgotPasswordPage,
  })),
)
const OnboardingPage = lazy(() =>
  import('@/pages/auth/OnboardingPage').then((module) => ({
    default: module.OnboardingPage,
  })),
)
const HomePage = lazy(() =>
  import('@/pages/finance/home-transactions').then((module) => ({
    default: module.HomePage,
  })),
)
const TransactionsPage = lazy(() =>
  import('@/pages/finance/home-transactions').then((module) => ({
    default: module.TransactionsPage,
  })),
)
const AccountsPage = lazy(() =>
  import('@/pages/finance/accounts').then((module) => ({
    default: module.AccountsPage,
  })),
)
const ContactsPage = lazy(() =>
  import('@/pages/finance/contacts').then((module) => ({
    default: module.ContactsPage,
  })),
)
const SavedTransactionNamesPage = lazy(() =>
  import('@/pages/finance/contacts').then((module) => ({
    default: module.SavedTransactionNamesPage,
  })),
)
const BudgetsPage = lazy(() =>
  import('@/pages/finance/budgets-goals').then((module) => ({
    default: module.BudgetsPage,
  })),
)
const GoalsPage = lazy(() =>
  import('@/pages/finance/budgets-goals').then((module) => ({
    default: module.GoalsPage,
  })),
)
const BillsPage = lazy(() =>
  import('@/pages/finance/bills-insights').then((module) => ({
    default: module.BillsPage,
  })),
)
const InsightsPage = lazy(() =>
  import('@/pages/finance/bills-insights').then((module) => ({
    default: module.InsightsPage,
  })),
)
const FamilyPage = lazy(() =>
  import('@/pages/finance/collaboration').then((module) => ({
    default: module.FamilyPage,
  })),
)
const OfficePage = lazy(() =>
  import('@/pages/finance/collaboration').then((module) => ({
    default: module.OfficePage,
  })),
)
const NotificationsPage = lazy(() =>
  import('@/pages/finance/activity').then((module) => ({
    default: module.NotificationsPage,
  })),
)
const MorePage = lazy(() =>
  import('@/pages/finance/more-help').then((module) => ({
    default: module.MorePage,
  })),
)
const HelpPage = lazy(() =>
  import('@/pages/finance/more-help').then((module) => ({
    default: module.HelpPage,
  })),
)
const SettingsPage = lazy(() =>
  import('@/pages/settings/SettingsPage').then((module) => ({
    default: module.SettingsPage,
  })),
)
const InvitationPage = lazy(() =>
  import('@/pages/InvitationPage').then((module) => ({
    default: module.InvitationPage,
  })),
)

const routeTitles: Record<string, string> = {
  '/': 'Money clarity',
  '/login': 'Sign in',
  '/forgot-password': 'Reset password',
  '/onboarding': 'Create account',
  '/invite': 'Accept invitation',
  '/app/home': 'Home',
  '/app/transactions': 'Transactions',
  '/app/accounts': 'Accounts',
  '/app/contacts': 'Contacts',
  '/app/saved-names': 'Saved names',
  '/app/budgets': 'Budgets',
  '/app/goals': 'Goals',
  '/app/bills': 'Bills',
  '/app/insights': 'Insights',
  '/app/family': 'Family',
  '/app/office': 'Office',
  '/app/notifications': 'Notifications',
  '/app/activity': 'Activity',
  '/app/more': 'More',
  '/app/settings': 'Settings',
  '/app/help': 'Help and support',
}

function DocumentTitle() {
  const location = useLocation()

  useEffect(() => {
    const title = routeTitles[location.pathname] ?? 'Page not found'
    document.title = `${title} | Ledgerly`
  }, [location.pathname])

  return null
}

function ProtectedShell() {
  const { isAuthenticated } = useApp()
  return isAuthenticated ? <AppShell /> : <Navigate to="/login" replace />
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useApp()
  return isAuthenticated ? <Navigate to="/app/home" replace /> : children
}

function SkipLink() {
  const skipToMain = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    const target =
      document.getElementById('main-content') ??
      document.querySelector<HTMLElement>('main, [role="main"]')

    if (!target) return

    event.preventDefault()
    const hadTabIndex = target.hasAttribute('tabindex')
    if (!target.id) target.id = 'main-content'
    target.tabIndex = -1
    target.focus({ preventScroll: true })
    target.scrollIntoView({ block: 'start' })

    if (!hadTabIndex) {
      target.addEventListener(
        'blur',
        () => target.removeAttribute('tabindex'),
        { once: true },
      )
    }
  }

  return (
    <a className="skip-link" href="#main-content" onClick={skipToMain}>
      Skip to main content
    </a>
  )
}

function RouteLoading() {
  const reduce = useReducedMotion()
  return (
    <motion.main
      id="main-content"
      className="standalone-state route-loading-state"
      aria-busy="true"
      tabIndex={-1}
      initial={
        reduce
          ? false
          : { opacity: 0, y: MOTION_DISTANCE.content }
      }
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : TRANSITION_CONTENT}
    >
      <span className="visually-hidden" role="status">
        Loading page
      </span>
      <div className="route-loading-card" aria-hidden="true">
        <Skeleton className="route-loading-kicker" />
        <Skeleton className="route-loading-title" />
        <Skeleton className="route-loading-copy" />
      </div>
    </motion.main>
  )
}

function NotFoundPage() {
  return (
    <main className="standalone-state">
      <h1 className="visually-hidden">Page not found</h1>
      <EmptyState
        icon={<CircleHelp />}
        title="Page not found"
        message="This link may be old or you may not have access to this workspace page."
        action={
          <Link className="button button-primary" to="/app/home">
            Return home
          </Link>
        }
      />
    </main>
  )
}

export default function App() {
  return (
    <>
      <SkipLink />
      <DocumentTitle />
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route
            path="/"
            element={
              <PublicOnly>
                <WelcomePage />
              </PublicOnly>
            }
          />
          <Route
            path="/login"
            element={
              <PublicOnly>
                <LoginPage />
              </PublicOnly>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <PublicOnly>
                <ForgotPasswordPage />
              </PublicOnly>
            }
          />
          <Route
            path="/onboarding"
            element={
              <PublicOnly>
                <OnboardingPage />
              </PublicOnly>
            }
          />
          <Route path="/invite" element={<InvitationPage />} />
          <Route path="/app" element={<ProtectedShell />}>
            <Route index element={<Navigate to="home" replace />} />
            <Route path="home" element={<HomePage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="saved-names" element={<SavedTransactionNamesPage />} />
            <Route path="budgets" element={<BudgetsPage />} />
            <Route path="goals" element={<GoalsPage />} />
            <Route path="bills" element={<BillsPage />} />
            <Route path="insights" element={<InsightsPage />} />
            <Route path="family" element={<FamilyPage />} />
            <Route path="office" element={<OfficePage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="activity" element={<NotificationsPage />} />
            <Route path="more" element={<MorePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="help" element={<HelpPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  )
}
