import { describe, expect, it } from 'vitest'
import { normalizeFinanceData } from './data'
import type { Account, Transaction } from '@/domain/types'
import { canDeleteTransaction } from './data'

describe('finance data normalization', () => {
  it('maps public bank-account metadata and inactive status without exposing internal relationships', () => {
    const [account] = normalizeFinanceData<Account[]>('accounts', [
      {
        id: 'account-1',
        vaultId: 'internal-vault-1',
        name: 'Household savings',
        type: 'savings',
        bankName: 'Example Bank',
        maskedIdentifier: '•••• 1842',
        balanceMinor: 250000,
        openingMinor: 175000,
        currency: 'INR',
        color: '#2d7d5a',
        icon: 'landmark',
        notes: 'Emergency fund',
        status: 'inactive',
      },
    ])

    expect(account).toMatchObject({
      id: 'account-1',
      name: 'Household savings',
      kind: 'savings',
      bankName: 'Example Bank',
      maskedNumber: '•••• 1842',
      openingMinor: 175000,
      balance: { amountMinor: 250000, currency: 'INR' },
      color: '#2d7d5a',
      icon: 'landmark',
      notes: 'Emergency fund',
      status: 'inactive',
    })
    expect(account).not.toHaveProperty('vaultId')
  })

  it('keeps internal vault relationships out of the account client model', () => {
    const accounts = normalizeFinanceData<Account[]>('accounts', [
      {
        id: 'account-1',
        vaultId: 'internal-vault-1',
        name: 'Everyday account',
        type: 'cash',
        balanceMinor: 1000,
        currency: 'INR',
      },
    ])

    expect(accounts[0]).not.toHaveProperty('vaultId')
  })

  it('uses safe creator ownership metadata for delete permission checks', () => {
    const transactions = normalizeFinanceData<Transaction[]>('transactions', [
      {
        id: 'transaction-1',
        createdBy: 'internal-user-1',
        type: 'expense',
        amountMinor: 1250,
        currency: 'INR',
        accountId: 'account-1',
        occurredAt: '2026-08-01T00:00:00.000Z',
        creator: {
          name: 'Asha Rao',
          initials: 'AR',
          status: 'active',
          isCurrentUser: true,
        },
      },
    ])

    expect(transactions[0]).not.toHaveProperty('createdBy')
    expect(transactions[0].creator?.isCurrentUser).toBe(true)
    expect(canDeleteTransaction(false, ['delete_own_transactions'], transactions[0])).toBe(true)
    expect(
      canDeleteTransaction(
        false,
        ['delete_own_transactions'],
        { ...transactions[0], creator: { ...transactions[0].creator!, isCurrentUser: false } },
      ),
    ).toBe(false)
    expect(canDeleteTransaction(false, ['delete_all_transactions'], transactions[0])).toBe(true)
  })

  it('uses the public split capability flag without retaining participant data', () => {
    const [transaction] = normalizeFinanceData<Transaction[]>('transactions', [{
      id: 'transaction-split',
      type: 'expense',
      amountMinor: 1250,
      currency: 'INR',
      hasSplits: true,
      splits: [{ userId: 'internal-member-id', amountMinor: 1250 }],
    }])

    expect(transaction.hasSplits).toBe(true)
    expect(transaction).not.toHaveProperty('splits')
  })

  it('normalizes creator display data without making internal IDs part of the view model', () => {
    const [entry] = normalizeFinanceData<Transaction[]>('transactions', [{
      id: 'entry-a', type: 'expense', amountMinor: 1200, currency: 'INR',
      creator: { name: 'Asha Rao', initials: 'AR', status: 'active', userId: 'hidden' },
    }])

    expect(entry.creator?.name).toBe('Asha Rao')
    expect(entry.creator?.initials).toBe('AR')
    expect(entry.creator).not.toHaveProperty('userId')
  })

  it('normalizes missing and incomplete creator display data safely', () => {
    const transactions = normalizeFinanceData<Transaction[]>('transactions', [
      { id: 'entry-missing', type: 'expense', amountMinor: 1200, currency: 'INR' },
      { id: 'entry-former', type: 'expense', amountMinor: 1200, currency: 'INR', creator: {} },
    ])

    expect(transactions[0].creator).toBeUndefined()
    expect(transactions[1].creator).toEqual({
      name: 'Former member',
      initials: 'FM',
      status: 'former',
      isCurrentUser: false,
    })
  })

  it('keeps adjustment records as a neutral supported transaction type', () => {
    const [transaction] = normalizeFinanceData<Transaction[]>('transactions', [{
      id: 'adjustment-a', type: 'adjustment', amountMinor: 1250, currency: 'INR',
    }])

    expect(transaction.rawType).toBe('adjustment')
  })

  it('preserves public transaction IDs and their user-facing scope', () => {
    const [transaction] = normalizeFinanceData<Transaction[]>('transactions', [{
      id: 'internal-transaction-a',
      transactionId: '000042',
      transactionIdScope: 'split',
      type: 'expense',
      amountMinor: 1250,
      currency: 'INR',
    }])

    expect(transaction.transactionId).toBe('000042')
    expect(transaction.transactionIdScope).toBe('split')
  })
})
