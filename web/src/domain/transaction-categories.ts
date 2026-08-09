export type TransactionCategoryMode =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'split'

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

const SPLIT_PARTICIPANTS = [
  'Riya Sharma',
  'Kabir Sharma',
  'Meera Sharma',
] as const

export function categoriesForTransactionMode(
  mode: TransactionCategoryMode,
): readonly string[] {
  switch (mode) {
    case 'income':
      return INCOME_CATEGORIES
    case 'split':
      return SPLIT_PARTICIPANTS
    case 'transfer':
      return []
    case 'expense':
    default:
      return EXPENSE_CATEGORIES
  }
}

export function categoryForTransactionMode(
  mode: TransactionCategoryMode,
  current: string,
): string {
  const categories = categoriesForTransactionMode(mode)
  return categories.includes(current) ? current : categories[0] ?? ''
}
