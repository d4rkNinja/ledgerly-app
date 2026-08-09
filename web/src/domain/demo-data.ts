import type {
  Account,
  Bill,
  Budget,
  Contact,
  Goal,
  SavedTransactionName,
  Transaction,
  Workspace,
} from './types'

export const workspaces: Workspace[] = [
  { id: 'personal', name: 'My money', type: 'personal', role: 'owner', memberCount: 1 },
  { id: 'family', name: 'Sharma family', type: 'family', role: 'admin', memberCount: 4 },
  { id: 'office', name: 'Fieldwork studio', type: 'office', role: 'member', memberCount: 12 },
]

export const accounts: Account[] = [
  {
    id: 'a1',
    name: 'Everyday account',
    kind: 'Bank account',
    balance: { amountMinor: 24865000, currency: 'INR' },
    maskedNumber: '•• 1842',
    color: '#536d52',
  },
  {
    id: 'a2',
    name: 'Rainy day',
    kind: 'Savings',
    balance: { amountMinor: 63440000, currency: 'INR' },
    maskedNumber: '•• 9081',
    color: '#456b7d',
  },
  {
    id: 'a3',
    name: 'Travel card',
    kind: 'Credit card',
    balance: { amountMinor: -2189000, currency: 'INR' },
    maskedNumber: '•• 4910',
    color: '#7b6253',
  },
]

export const transactions: Transaction[] = [
  {
    id: 't1',
    merchant: 'Salary',
    category: 'Income',
    occurredAt: '2026-07-25T09:00:00.000Z',
    amount: { amountMinor: 12600000, currency: 'INR' },
    direction: 'credit',
    status: 'cleared',
    accountId: 'a1',
  },
  {
    id: 't2',
    merchant: 'City Supermarket',
    category: 'Groceries',
    occurredAt: '2026-07-24T17:40:00.000Z',
    amount: { amountMinor: 428000, currency: 'INR' },
    direction: 'debit',
    status: 'cleared',
    accountId: 'a1',
  },
  {
    id: 't3',
    merchant: 'Metro recharge',
    category: 'Transport',
    occurredAt: '2026-07-24T08:15:00.000Z',
    amount: { amountMinor: 150000, currency: 'INR' },
    direction: 'debit',
    status: 'cleared',
    accountId: 'a1',
  },
  {
    id: 't4',
    merchant: 'Cedar Coffee',
    category: 'Dining',
    occurredAt: '2026-07-23T12:10:00.000Z',
    amount: { amountMinor: 56000, currency: 'INR' },
    direction: 'debit',
    status: 'pending',
    accountId: 'a3',
  },
]

export const budgets: Budget[] = [
  {
    id: 'b1',
    name: 'Groceries',
    spent: { amountMinor: 1840000, currency: 'INR' },
    limit: { amountMinor: 3000000, currency: 'INR' },
    period: 'July',
  },
  {
    id: 'b2',
    name: 'Dining out',
    spent: { amountMinor: 720000, currency: 'INR' },
    limit: { amountMinor: 1200000, currency: 'INR' },
    period: 'July',
  },
  {
    id: 'b3',
    name: 'Transport',
    spent: { amountMinor: 860000, currency: 'INR' },
    limit: { amountMinor: 1000000, currency: 'INR' },
    period: 'July',
  },
]

export const goals: Goal[] = [
  {
    id: 'g1',
    name: 'Emergency reserve',
    saved: { amountMinor: 22400000, currency: 'INR' },
    target: { amountMinor: 50000000, currency: 'INR' },
    targetDate: '2027-03-31',
  },
  {
    id: 'g2',
    name: 'Japan trip',
    saved: { amountMinor: 8600000, currency: 'INR' },
    target: { amountMinor: 25000000, currency: 'INR' },
    targetDate: '2027-10-01',
  },
]

export const bills: Bill[] = [
  {
    id: 'bill1',
    name: 'Home internet',
    dueDate: '2026-07-29',
    amount: { amountMinor: 119900, currency: 'INR' },
    autopay: true,
  },
  {
    id: 'bill2',
    name: 'Electricity',
    dueDate: '2026-08-02',
    amount: { amountMinor: 284000, currency: 'INR' },
    autopay: false,
  },
  {
    id: 'bill3',
    name: 'Health insurance',
    dueDate: '2026-08-06',
    amount: { amountMinor: 560000, currency: 'INR' },
    autopay: true,
  },
]

export const contacts: Contact[] = [
  {
    id: 'contact-1',
    name: 'Priya Shah',
    phone: '+91 98765 43210',
    email: 'priya@example.com',
    notes: 'Monthly rent',
    createdBy: 'demo-user',
    createdAt: '2026-07-18T09:00:00.000Z',
    updatedAt: '2026-07-30T09:00:00.000Z',
  },
  {
    id: 'contact-2',
    name: 'Aarav Mehta',
    phone: '+91 91234 56789',
    notes: 'Weekend cricket group',
    createdBy: 'demo-user',
    createdAt: '2026-07-21T09:00:00.000Z',
    updatedAt: '2026-07-21T09:00:00.000Z',
  },
]

export const savedTransactionNames: SavedTransactionName[] = [
  {
    id: 'saved-name-1',
    name: 'Monthly rent',
    createdBy: 'demo-user',
    createdAt: '2026-07-12T09:00:00.000Z',
    updatedAt: '2026-07-12T09:00:00.000Z',
  },
  {
    id: 'saved-name-2',
    name: 'Household groceries',
    createdBy: 'demo-user',
    createdAt: '2026-07-20T09:00:00.000Z',
    updatedAt: '2026-07-20T09:00:00.000Z',
  },
]
