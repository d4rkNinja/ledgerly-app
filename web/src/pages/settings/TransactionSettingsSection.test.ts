import { describe, expect, it } from 'vitest'
import {
  categoryWriteBody,
  sequenceUpdateBody,
} from '@/lib/transaction-settings'

describe('transaction settings request bodies', () => {
  it('sends only the sequence contract fields', () => {
    expect(sequenceUpdateBody(false, 120, 6)).toEqual({
      autoGenerate: false,
      nextNumber: 120,
      minimumDigits: 6,
    })
  })

  it('requires only a category name and trims optional values', () => {
    expect(
      categoryWriteBody({
        name: '  Client meals  ',
        description: '',
        icon: '  utensils  ',
        color: '  #536d52  ',
      }),
    ).toEqual({
      name: 'Client meals',
      description: '',
      icon: 'utensils',
      color: '#536d52',
    })
  })
})
