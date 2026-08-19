import {
  CreditCard,
  Landmark,
  Plus,
  PiggyBank,
  Wallet,
  WalletCards,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  motion,
  useReducedMotion,
} from 'motion/react'
import { useState } from 'react'
import { useApp } from '@/app/app-state'
import {
  accounts as demoAccounts,
} from '@/domain/demo-data'
import type {
  Account,
} from '@/domain/types'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
} from '@/components/ui'
import { formatMoney } from '@/lib/format'
import { api } from '@/lib/api-client'
import { buildSafeTextSharePayload, type SharePayload } from '@/lib/share'
import {
  AccountCreateDialog,
  AccountEditDialog,
  removeDemoSessionItem,
  useDemoSessionCollection,
  useQueryDialog,
} from '../finance-writes'

import {
  DataSkeleton,
  InfoNotice,
  MoneyText,
  PageFrame,
} from './shared'
import {
  friendlyLabel,
  hasWorkspacePermission,
  useFinanceData,
} from './data'
import { RecordActionDrawer } from './record-action-drawer'

function AccountGlyph({ account }: { account: Account }) {
  if (account.icon === 'credit-card' || account.kind === 'credit_card') {
    return <CreditCard aria-hidden="true" />
  }
  if (account.icon === 'wallet' || account.kind === 'digital_wallet') {
    return <Wallet aria-hidden="true" />
  }
  if (account.icon === 'piggy-bank') {
    return <PiggyBank aria-hidden="true" />
  }
  return <Landmark aria-hidden="true" />
}

export function AccountsPage() {
  const { demoMode, workspace } = useApp()
  const queryClient = useQueryClient()
  const query = useFinanceData<Account[]>('accounts', '/accounts', demoAccounts)
  const canCreateAccount = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'edit_vault',
  )
  const [dialogOpen, setDialogOpen] = useQueryDialog(
    'add',
    canCreateAccount,
  )
  const items = useDemoSessionCollection(
    demoMode,
    workspace.id,
    'accounts',
    query.data ?? [],
  )
  const reduce = useReducedMotion()
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const canArchiveAccount = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'archive_vault',
  )
  const canShareAccount = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'export_data',
  )
  const archiveSelectedAccount = async () => {
    if (!selectedAccount) return
    if (demoMode) {
      removeDemoSessionItem(workspace.id, 'accounts', selectedAccount.id)
      return
    }
    await api.delete<void>(
      `/workspaces/${workspace.id}/accounts/${selectedAccount.id}`,
    )
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['accounts', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['vaults', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['transactions', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard', workspace.id] }),
      queryClient.invalidateQueries({ queryKey: ['insights', workspace.id] }),
    ])
  }
  const demoSharePayload: SharePayload | undefined = selectedAccount
    ? buildSafeTextSharePayload({
        title: 'Account summary',
        text: `${selectedAccount.name} account balance: ${formatMoney(selectedAccount.balance)}`,
      })
    : undefined
  return (
    <PageFrame className="accounts-page">
      <PageHeader
        title="Accounts"
        description="Balances stay separated by currency and owner."
        actions={
          canCreateAccount ? (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus aria-hidden="true" />
              Add account
            </Button>
          ) : undefined
        }
      />
      {!canCreateAccount ? (
        <InfoNotice>
          Your workspace role cannot create accounts.
        </InfoNotice>
      ) : null}
      {query.isLoading ? (
        <DataSkeleton />
      ) : query.isError ? (
        <ErrorState message="Accounts are unavailable." retry={() => query.refetch()} />
      ) : !items.length ? (
        <EmptyState
          icon={<WalletCards />}
          title="No accounts yet"
          message="Connected bank, cash, card, and investment accounts will appear here."
          action={
            canCreateAccount ? (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus aria-hidden="true" />
                Add account
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="account-grid">
          {items.map((account, index) => (
            <motion.article
              className="account-card account-card-interactive"
              key={account.id}
              role="button"
              tabIndex={0}
              aria-label={`View details for ${account.name}`}
              onClick={() => setSelectedAccount(account)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                setSelectedAccount(account)
              }}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reduce ? 0 : 0.3,
                delay: reduce ? 0 : Math.min(index * 0.045, 0.2),
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{ '--account-color': account.color } as React.CSSProperties}
            >
              <header>
                <span className="account-symbol">
                  <AccountGlyph account={account} />
                </span>
                {account.status === 'inactive' ? <Badge tone="warning">Inactive</Badge> : null}
              </header>
              <div>
                <span>{account.bankName || friendlyLabel(account.kind)}</span>
                <h2>{account.name}</h2>
                <MoneyText money={account.balance} />
              </div>
              <footer>
                <span>{account.maskedNumber}</span>
                <Badge tone={account.balance.amountMinor < 0 ? 'warning' : 'positive'}>
                  {account.balance.amountMinor < 0 ? 'Amount due' : 'Available'}
                </Badge>
              </footer>
            </motion.article>
          ))}
          {canCreateAccount ? (
            <button
              className="add-account-card"
              type="button"
              onClick={() => setDialogOpen(true)}
            >
              <Plus aria-hidden="true" />
              <strong>Add another account</strong>
              <span>Keep another balance in this workspace</span>
            </button>
          ) : null}
        </div>
      )}
      <AccountCreateDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
      <RecordActionDrawer
        open={Boolean(selectedAccount)}
        onClose={() => setSelectedAccount(null)}
        title={selectedAccount?.name ?? 'Account details'}
        description="Review balances and keep actions out of the account list."
        details={selectedAccount ? [
          { label: 'Bank', value: selectedAccount.bankName || 'Not provided' },
          { label: 'Type', value: friendlyLabel(selectedAccount.kind) },
          { label: 'Account identifier', value: selectedAccount.maskedNumber || 'Not provided' },
          { label: 'Opening balance', value: formatMoney({ amountMinor: selectedAccount.openingMinor ?? selectedAccount.balance.amountMinor, currency: selectedAccount.balance.currency }) },
          { label: 'Current balance', value: formatMoney(selectedAccount.balance) },
          { label: 'Currency', value: selectedAccount.balance.currency },
          { label: 'Account colour', value: selectedAccount.color },
          { label: 'Account icon', value: selectedAccount.icon ? friendlyLabel(selectedAccount.icon) : 'Bank' },
          { label: 'Status', value: selectedAccount.status === 'inactive' ? 'Inactive' : 'Active' },
          { label: 'Notes', value: selectedAccount.notes || 'None' },
          { label: 'Workspace total', value: selectedAccount.excludeFromTotal ? 'Excluded' : 'Included' },
          { label: 'Visibility', value: selectedAccount.privacy === 'private' ? 'Private' : 'Workspace' },
        ] : []}
        onEdit={canCreateAccount && selectedAccount ? () => setEditingAccount(selectedAccount) : undefined}
        canShare={canShareAccount}
        sharePath={selectedAccount && !demoMode ? `/workspaces/${workspace.id}/accounts/${selectedAccount.id}/share` : undefined}
        demoSharePayload={demoMode ? demoSharePayload : undefined}
        canDelete={canArchiveAccount}
        deleteLabel="Archive account"
        deleteDescription="This hides the account from active account lists. It does not delete, reassign, or alter associated transactions; they remain in reports and account history."
        onDelete={archiveSelectedAccount}
      />
      <AccountEditDialog
        account={editingAccount}
        open={Boolean(editingAccount)}
        onClose={() => setEditingAccount(null)}
      />
    </PageFrame>
  )
}
