import { describe, expect, it } from 'vitest'
import {
  orderCategoriesByRecency,
  rememberAccount,
  rememberCategory,
  rememberedAccountId,
  rememberedCategory,
} from './transaction-memory'

function resetStorage() {
  localStorage.clear()
}

describe('transaction memory', () => {
  it('round-trips account and category memory', () => {
    resetStorage()
    rememberAccount('account-9')
    rememberCategory('expense', 'Groceries')
    expect(rememberedAccountId()).toBe('account-9')
    expect(rememberedCategory('expense')).toBe('Groceries')
    expect(rememberedCategory('income')).toBeUndefined()
  })

  it('keeps the most recent category first without duplicates', () => {
    resetStorage()
    rememberCategory('expense', 'A')
    rememberCategory('expense', 'B')
    rememberCategory('expense', 'A')
    const ordered = orderCategoriesByRecency(
      'expense',
      ['C', 'B', 'A', 'D'],
      (entry) => entry,
    )
    expect(ordered).toEqual(['A', 'B', 'C', 'D'])
  })

  it('caps recent categories at five entries', () => {
    resetStorage()
    for (const entry of ['1', '2', '3', '4', '5', '6', '7']) {
      rememberCategory('income', entry)
    }
    const ordered = orderCategoriesByRecency(
      'income',
      ['1', '2', '3', '4', '5', '6', '7'],
      (entry) => entry,
    )
    expect(ordered.slice(0, 5)).toEqual(['7', '6', '5', '4', '3'])
    expect(ordered).toHaveLength(7)
  })

  it('leaves lists untouched when nothing is remembered', () => {
    resetStorage()
    const categories = [{ name: 'Zeta' }, { name: 'Alpha' }]
    expect(orderCategoriesByRecency('split', categories, (entry) => entry.name)).toEqual([
      { name: 'Zeta' },
      { name: 'Alpha' },
    ])
  })
})
