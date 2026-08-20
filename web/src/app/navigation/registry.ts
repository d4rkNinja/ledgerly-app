import {
  Bell,
  Bookmark,
  Building2,
  CircleHelp,
  CreditCard,
  FileChartColumn,
  Goal,
  HandCoins,
  Home,
  Menu,
  PiggyBank,
  ReceiptText,
  Settings,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'

export type DesktopNavigationSection = 'primary' | 'collaborate' | 'footer'
export type SearchNavigationGroup = 'Money' | 'Collaborate' | 'Account'
export type DockNavigationKind = 'link' | 'quick-add' | 'overflow'

export interface AppNavigationItem {
  id: string
  label: string
  to: string
  icon: LucideIcon
  desktopSection?: DesktopNavigationSection
  searchGroup?: SearchNavigationGroup
  searchKeywords?: readonly string[]
  dock?: {
    kind: DockNavigationKind
    order: number
    label?: string
  }
}

export const navigationRegistry: readonly AppNavigationItem[] = [
  {
    id: 'home',
    label: 'Home',
    to: '/app/home',
    icon: Home,
    desktopSection: 'primary',
    searchGroup: 'Money',
    dock: { kind: 'link', order: 0 },
  },
  {
    id: 'transactions',
    label: 'Transactions',
    to: '/app/transactions',
    icon: ReceiptText,
    desktopSection: 'primary',
    searchGroup: 'Money',
    dock: { kind: 'link', order: 1, label: 'Entries' },
  },
  {
    id: 'accounts',
    label: 'Accounts',
    to: '/app/accounts',
    icon: WalletCards,
    desktopSection: 'primary',
    searchGroup: 'Money',
  },
  {
    id: 'contacts',
    label: 'Contacts',
    to: '/app/contacts',
    icon: Users,
    desktopSection: 'primary',
    searchGroup: 'Money',
    searchKeywords: ['people', 'payee', 'payer'],
  },
  {
    id: 'saved-names',
    label: 'Saved names',
    to: '/app/saved-names',
    icon: Bookmark,
    desktopSection: 'primary',
    searchGroup: 'Money',
    searchKeywords: ['labels', 'transaction names'],
  },
  {
    id: 'budgets',
    label: 'Budgets',
    to: '/app/budgets',
    icon: PiggyBank,
    desktopSection: 'primary',
    searchGroup: 'Money',
    dock: { kind: 'link', order: 3 },
  },
  {
    id: 'goals',
    label: 'Goals',
    to: '/app/goals',
    icon: Goal,
    desktopSection: 'primary',
    searchGroup: 'Money',
  },
  {
    id: 'bills',
    label: 'Bills',
    to: '/app/bills',
    icon: CreditCard,
    desktopSection: 'primary',
    searchGroup: 'Money',
  },
  {
    id: 'insights',
    label: 'Insights',
    to: '/app/insights',
    icon: FileChartColumn,
    desktopSection: 'collaborate',
    searchGroup: 'Money',
  },
  {
    id: 'family',
    label: 'Members',
    to: '/app/family',
    icon: Users,
    desktopSection: 'collaborate',
    searchGroup: 'Collaborate',
  },
  {
    id: 'office',
    label: 'Office',
    to: '/app/office',
    icon: Building2,
    desktopSection: 'collaborate',
    searchGroup: 'Collaborate',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    to: '/app/notifications',
    icon: Bell,
    searchGroup: 'Money',
  },
  {
    id: 'settings',
    label: 'Settings',
    to: '/app/settings',
    icon: Settings,
    desktopSection: 'footer',
    searchGroup: 'Account',
    searchKeywords: [
      'IDs',
      'transaction IDs',
      'ID sequence',
      'auto generate ID',
      'categories',
      'transaction categories',
    ],
  },
  {
    id: 'help',
    label: 'Help and support',
    to: '/app/help',
    icon: CircleHelp,
    searchGroup: 'Account',
  },
  {
    id: 'quick-add',
    label: 'Add',
    to: '/app/transactions?add=1',
    icon: HandCoins,
    dock: { kind: 'quick-add', order: 2 },
  },
  {
    id: 'more',
    label: 'More',
    to: '/app/more',
    icon: Menu,
    dock: { kind: 'overflow', order: 4 },
  },
]

export const primaryNavigation = navigationRegistry.filter(
  (item) => item.desktopSection === 'primary',
)

export const collaborativeNavigation = navigationRegistry.filter(
  (item) => item.desktopSection === 'collaborate',
)

export const footerNavigation = navigationRegistry.filter(
  (item) => item.desktopSection === 'footer',
)

export const searchableNavigation = navigationRegistry.filter(
  (
    item,
  ): item is AppNavigationItem & {
    searchGroup: SearchNavigationGroup
  } => item.searchGroup !== undefined,
)

export const mobileNavigation = navigationRegistry
  .filter(
    (
      item,
    ): item is AppNavigationItem & {
      dock: NonNullable<AppNavigationItem['dock']>
    } => item.dock !== undefined,
  )
  .sort((left, right) => left.dock.order - right.dock.order)

export function navigationItemById(id: string) {
  const item = navigationRegistry.find((candidate) => candidate.id === id)
  if (!item) throw new Error(`Unknown navigation item: ${id}`)
  return item
}

export function searchKeywordsFor(item: (typeof searchableNavigation)[number]) {
  return [
    item.label,
    item.to.replace('/app/', ''),
    ...(item.searchKeywords ?? []),
  ]
}

export function isMobileNavigationActive(
  item: (typeof mobileNavigation)[number],
  pathname: string,
  creationModeActive: boolean,
) {
  if (item.dock.kind === 'quick-add') return creationModeActive
  if (creationModeActive) return false

  if (item.dock.kind === 'overflow') {
    return !mobileNavigation.some(
      (candidate) =>
        candidate.dock.kind === 'link' && candidate.to === pathname,
    )
  }

  return item.to === pathname
}
