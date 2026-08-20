import { describe, expect, it } from 'vitest'
import { searchableNavigation, searchKeywordsFor } from './registry'

describe('navigation search keywords', () => {
  it('makes transaction ID and category settings discoverable', () => {
    const settings = searchableNavigation.find((item) => item.id === 'settings')
    expect(settings).toBeDefined()

    const keywords = searchKeywordsFor(settings!)
      .join(' ')
      .toLocaleLowerCase()

    expect(keywords).toContain('transaction ids')
    expect(keywords).toContain('categories')
    expect(keywords).toContain('auto generate id')
  })
})
