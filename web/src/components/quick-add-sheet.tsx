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
import { BottomSheet } from '@/components/beui/bottom-sheet'
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
    <section className="quick-add-group" aria-labelledby={labelId}>
      <h3
        id={labelId}
        className="quick-add-group-title"
      >
        {label}
      </h3>
      <div className="quick-add-grid">
        {actions.map((action, index) => (
          <motion.button
            key={action.to}
            type="button"
            className="quick-add-action"
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
            whileTap={reduce ? undefined : { scale: 0.96 }}
            onClick={() => onSelect(action.to)}
          >
            <span className="quick-add-action-icon">
              <action.icon aria-hidden="true" />
            </span>
            <span className="quick-add-action-copy">
              <strong>{action.label}</strong>
              <span>
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
      <div className="quick-add-content">
        {demoMode ? (
          <div
            className="quick-add-note"
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
            className="quick-add-empty"
            role="status"
          >
            Your current role does not include any create actions.
          </div>
        ) : null}
      </div>
    </BottomSheet>
  )
}
