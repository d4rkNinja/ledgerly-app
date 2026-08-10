import { describe, expect, it } from 'vitest'
import {
  categoriesForTransactionMode,
  categoryForTransactionMode,
  transactionSequencePreview,
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

  it('provides a demo-only transfer category', () => {
    expect(categoriesForTransactionMode('transfer')).toEqual(['Transfer'])
  })

  it('resets an invalid category to the first valid income category', () => {
    expect(categoryForTransactionMode('income', 'Groceries')).toBe('Salary')
  })

  it('keeps a category that belongs to the selected mode', () => {
    expect(categoryForTransactionMode('income', 'Freelance')).toBe('Freelance')
  })

  it('pads sequence previews without adding a prefix', () => {
    expect(transactionSequencePreview(42, 6)).toBe('000042')
    expect(transactionSequencePreview(12345, 3)).toBe('12345')
  })
})
