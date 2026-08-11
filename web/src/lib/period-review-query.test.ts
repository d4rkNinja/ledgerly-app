import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import {
  invalidatePeriodReviewQueries,
  periodReviewQueryPrefix,
} from './period-review-query'

describe('period-review query helpers', () => {
  it('creates a workspace-scoped prefix that matches every selected period', () => {
    expect(periodReviewQueryPrefix('workspace-42')).toEqual([
      'period-reviews',
      'workspace-42',
    ])
  })

  it('invalidates only the period-review prefix for the affected workspace', async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    await invalidatePeriodReviewQueries(client, 'workspace-42')

    expect(invalidate).toHaveBeenCalledExactlyOnceWith({
      queryKey: ['period-reviews', 'workspace-42'],
    })
  })
})
