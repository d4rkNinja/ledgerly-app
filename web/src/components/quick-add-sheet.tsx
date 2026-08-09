import {
  ArrowDownLeft,
  BanknoteArrowUp,
  Bookmark,
  Goal,
  NotebookTabs,
  PiggyBank,
  ReceiptText,
  Split,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { BottomSheet } from '@/components/motion/bottom-sheet'
import { selectionHaptic } from '@/platform/haptics'

type QuickAddAction = {
  description: string
  icon: LucideIcon
  label: string
  to: string
}

type QuickAddSheetProps = {
  canCreateAccount: boolean
  canCreateBudget: boolean
  canCreateGoal: boolean
  canManageContacts?: boolean
  canCreateTransaction: boolean
  canSubmitClaim: boolean
  demoMode: boolean
  onNavigate: (to: string) => void
  onOpenChange: (open: boolean) => void
  open: boolean
}

const transactionActions: QuickAddAction[] = [
  {
    label: 'Expense',
    description: 'Record money spent',
    icon: ReceiptText,
    to: '/app/transactions?add=expense',
  },
  {
    label: 'Income',
    description: 'Record money received',
    icon: ArrowDownLeft,
    to: '/app/transactions?add=income',
  },
  {
    label: 'Transfer',
    description: 'Move money between accounts',
    icon: BanknoteArrowUp,
    to: '/app/transactions?add=transfer',
  },
]

function QuickAddGroup({
  actions,
  label,
  onSelect,
}: {
  actions: QuickAddAction[]
  label: string
  onSelect: (to: string) => void
}) {
  const reduce = useReducedMotion()
  const labelId = `quick-add-${label.toLowerCase().replaceAll(' ', '-')}`

  if (!actions.length) return null

  return (
    <section aria-labelledby={labelId}>
      <h3
        id={labelId}
        className="mb-2 text-xs font-semibold text-muted-foreground"
      >
        {label}
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action, index) => (
          <motion.button
            key={action.to}
            type="button"
            className="flex min-h-24 items-start gap-3 rounded-2xl border border-border bg-muted/35 p-3 text-left text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            initial={
              reduce
                ? false
                : {
                    opacity: 0,
                    y: 8,
                  }
            }
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduce
                ? { duration: 0 }
                : {
                    delay: Math.min(index * 0.045, 0.16),
                    duration: 0.24,
                  }
            }
            whileTap={reduce ? undefined : { scale: 0.975 }}
            onClick={() => onSelect(action.to)}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-primary">
              <action.icon aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <strong className="block text-sm leading-5">{action.label}</strong>
              <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                {action.description}
              </span>
            </span>
          </motion.button>
        ))}
      </div>
    </section>
  )
}

export function QuickAddSheet({
  canCreateAccount,
  canCreateBudget,
  canCreateGoal,
  canManageContacts = false,
  canCreateTransaction,
  canSubmitClaim,
  demoMode,
  onNavigate,
  onOpenChange,
  open,
}: QuickAddSheetProps) {
  const transactionItems = canCreateTransaction
    ? [
        ...transactionActions,
        ...(demoMode
          ? [
              {
                label: 'Split',
                description: 'Try a shared expense in demo',
                icon: Split,
                to: '/app/transactions?add=split',
              },
            ]
          : []),
      ]
    : []

  const planningItems: QuickAddAction[] = [
    ...(canCreateAccount
      ? [
          {
            label: 'Account',
            description: 'Add a bank, card or cash account',
            icon: WalletCards,
            to: '/app/accounts?add=1',
          },
        ]
      : []),
    ...(canCreateBudget
      ? [
          {
            label: 'Budget',
            description: 'Set a spending boundary',
            icon: PiggyBank,
            to: '/app/budgets?add=1',
          },
        ]
      : []),
    ...(canManageContacts
      ? [
          {
            label: 'Contacts',
            description: 'Store and manage reusable people',
            icon: NotebookTabs,
            to: '/app/contacts',
          },
          {
            label: 'Saved names',
            description: 'Manage reusable transaction labels',
            icon: Bookmark,
            to: '/app/saved-names',
          },
        ]
      : canCreateGoal
        ? [
            {
              label: 'Goal',
              description: 'Plan a savings target',
              icon: Goal,
              to: '/app/goals?add=1',
            },
          ]
        : []),
  ]

  const workItems: QuickAddAction[] = canSubmitClaim
    ? [
        {
          label: 'Expense claim',
          description: 'Request a workspace reimbursement',
          icon: ReceiptText,
          to: '/app/office?claim=1',
        },
      ]
    : []

  const select = (to: string) => {
    onOpenChange(false)
    onNavigate(to)
    void selectionHaptic()
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={['auto']}
      title="Quick add"
      description="Choose what you want to record or plan."
    >
      <div className="grid gap-5 pb-2 pt-2">
        {demoMode ? (
          <div
            className="rounded-2xl border border-border bg-muted/35 px-4 py-3 text-xs leading-5 text-muted-foreground"
            role="status"
          >
            Demo additions stay in memory until you refresh and never call the
            live API.
          </div>
        ) : null}
        <QuickAddGroup
          label="Transactions"
          actions={transactionItems}
          onSelect={select}
        />
        <QuickAddGroup
          label="Plan and organise"
          actions={planningItems}
          onSelect={select}
        />
        <QuickAddGroup
          label="Workspace"
          actions={workItems}
          onSelect={select}
        />
        {!transactionItems.length &&
        !planningItems.length &&
        !workItems.length ? (
          <div
            className="rounded-2xl border border-border bg-muted/35 p-4 text-sm text-muted-foreground"
            role="status"
          >
            Your current role does not include any create actions.
          </div>
        ) : null}
      </div>
    </BottomSheet>
  )
}
