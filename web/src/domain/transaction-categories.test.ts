import { describe, expect, it } from 'vitest'
import {
  categoriesForTransactionMode,
  categoryForTransactionMode,
} from './transaction-categories'

describe('transaction categories', () => {
  it('keeps expense categories useful for spending entries', () => {
    const categories = categoriesForTransactionMode('expense')

    expect(categories).toContain('Groceries')
    expect(categories).toContain('Utilities')
  })

  it('uses income-specific categories instead of expense categories', () => {
    const categories = categoriesForTransactionMode('income')

    expect(categories).toContain('Salary')
    expect(categories).toContain('Freelance')
    expect(categories).not.toContain('Groceries')
  })

  it('does not ask for a category when recording a transfer', () => {
    expect(categoriesForTransactionMode('transfer')).toEqual([])
  })

  it('resets an invalid category to the first valid income category', () => {
    expect(categoryForTransactionMode('income', 'Groceries')).toBe('Salary')
  })

  it('keeps a category that belongs to the selected mode', () => {
    expect(categoryForTransactionMode('income', 'Freelance')).toBe('Freelance')
  })
})
