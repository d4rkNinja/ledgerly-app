import type { QueryClient } from '@tanstack/react-query'

export const periodReviewQueryPrefix = (workspaceId: string) =>
  ['period-reviews', workspaceId] as const

export function invalidatePeriodReviewQueries(
  queryClient: QueryClient,
  workspaceId: string,
) {
  return queryClient.invalidateQueries({
    queryKey: periodReviewQueryPrefix(workspaceId),
  })
}
