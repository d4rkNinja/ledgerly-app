export type TransactionCategoryMode =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'split'

export const TRANSACTION_CATEGORY_MODES = [
  'expense',
  'income',
  'transfer',
  'split',
] as const satisfies readonly TransactionCategoryMode[]

export interface TransactionSequenceSetting {
  transactionType: TransactionCategoryMode
  autoGenerate: boolean
  nextNumber: number
  minimumDigits: number
  preview: string
  minimumAvailableNextNumber: number
}

export interface TransactionCategory {
  id: string
  transactionType: TransactionCategoryMode
  name: string
  description?: string
  icon?: string
  color?: string
  sortOrder: number
  isActive: boolean
  usageCount?: number
}

const EXPENSE_CATEGORIES = [
  'General',
  'Groceries',
  'Dining',
  'Transport',
  'Utilities',
  'Housing',
  'Health',
  'Shopping',
  'Entertainment',
  'Travel',
  'Fees',
] as const

const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Business',
  'Bonus',
  'Interest',
  'Investment',
  'Refund',
  'Gift',
  'Other income',
] as const

const TRANSFER_CATEGORIES = [
  'Transfer',
] as const

const SPLIT_CATEGORIES = [
  'Split expense',
  'Dining',
  'Travel',
  'Household',
] as const

export function categoriesForTransactionMode(
  mode: TransactionCategoryMode,
): readonly string[] {
  switch (mode) {
    case 'income':
      return INCOME_CATEGORIES
    case 'split':
      return SPLIT_CATEGORIES
    case 'transfer':
      return TRANSFER_CATEGORIES
    case 'expense':
    default:
      return EXPENSE_CATEGORIES
  }
}

export function transactionSequencePreview(
  nextNumber: number,
  minimumDigits: number,
) {
  const normalizedNumber = Number.isSafeInteger(nextNumber)
    ? Math.max(1, nextNumber)
    : 1
  const normalizedDigits = Number.isSafeInteger(minimumDigits)
    ? Math.min(18, Math.max(1, minimumDigits))
    : 4
  return String(normalizedNumber).padStart(normalizedDigits, '0')
}

export function demoTransactionSequences(): TransactionSequenceSetting[] {
  return TRANSACTION_CATEGORY_MODES.map((transactionType) => ({
    transactionType,
    autoGenerate: true,
    nextNumber: 1,
    minimumDigits: 4,
    preview: '0001',
    minimumAvailableNextNumber: 1,
  }))
}

export function demoTransactionCategories(
  mode: TransactionCategoryMode,
): TransactionCategory[] {
  return categoriesForTransactionMode(mode).map((name, sortOrder) => ({
    id: `demo-${mode}-${sortOrder}`,
    transactionType: mode,
    name,
    sortOrder,
    isActive: true,
    usageCount: 0,
  }))
}

export function orderedTransactionCategories(
  categories: readonly TransactionCategory[],
) {
  return [...categories].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.name.localeCompare(right.name),
  )
}

export function selectableTransactionCategoryNames(
  categories: readonly TransactionCategory[],
) {
  return orderedTransactionCategories(categories)
    .filter((category) => category.isActive)
    .map((category) => category.name)
}

export function transactionCategoryModeFor(
  transaction: {
    rawType?: string
    direction?: 'credit' | 'debit'
    hasSplits?: boolean
    transactionIdScope?: TransactionCategoryMode
  },
): TransactionCategoryMode {
  if (transaction.transactionIdScope) return transaction.transactionIdScope
  if (transaction.hasSplits || transaction.rawType === 'split') return 'split'
  if (transaction.rawType === 'transfer') return 'transfer'
  if (
    transaction.rawType === 'income' ||
    transaction.rawType === 'refund' ||
    transaction.rawType === 'reimbursement' ||
    transaction.direction === 'credit'
  ) {
    return 'income'
  }
  return 'expense'
}

export function categoryForTransactionMode(
  mode: TransactionCategoryMode,
  current: string,
): string {
  const categories = categoriesForTransactionMode(mode)
  return categories.includes(current) ? current : categories[0] ?? ''
}
