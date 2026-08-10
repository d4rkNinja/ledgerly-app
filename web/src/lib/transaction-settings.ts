import { useQuery } from '@tanstack/react-query'
import { useApp } from '@/app/app-state'
import {
  demoTransactionCategories,
  demoTransactionSequences,
  type TransactionCategory,
  type TransactionCategoryMode,
  type TransactionSequenceSetting,
} from '@/domain/transaction-categories'
import { api } from './api-client'

export type SequenceUpdateBody = {
  autoGenerate: boolean
  nextNumber: number
  minimumDigits: number
}

export type CategoryFormValues = {
  name: string
  description: string
  icon: string
  color: string
}

export type CategoryWriteBody = {
  name: string
  description: string
  icon: string
  color: string
}

export function sequenceUpdateBody(
  autoGenerate: boolean,
  nextNumber: number,
  minimumDigits: number,
): SequenceUpdateBody {
  return { autoGenerate, nextNumber, minimumDigits }
}

export function categoryWriteBody(
  values: CategoryFormValues,
): CategoryWriteBody {
  return {
    name: values.name.trim(),
    description: values.description.trim(),
    icon: values.icon.trim(),
    color: values.color.trim(),
  }
}

export function transactionSequenceQueryKey(workspaceId: string) {
  return ['transaction-sequences', workspaceId] as const
}

export function transactionCategoryQueryKey(
  workspaceId: string,
  mode?: TransactionCategoryMode,
) {
  return mode
    ? (['transaction-categories', workspaceId, mode] as const)
    : (['transaction-categories', workspaceId] as const)
}

export function useTransactionSequences(enabled = true) {
  const { demoMode, workspace } = useApp()
  return useQuery({
    queryKey: transactionSequenceQueryKey(workspace.id),
    queryFn: async () => {
      if (demoMode) return demoTransactionSequences()
      const response = await api.get<TransactionSequenceSetting[]>(
        `/workspaces/${encodeURIComponent(workspace.id)}/transaction-sequences`,
      )
      return Array.isArray(response) ? response : []
    },
    enabled,
    retry: 1,
  })
}

export function useTransactionCategories(
  mode: TransactionCategoryMode,
  enabled = true,
) {
  const { demoMode, workspace } = useApp()
  return useQuery({
    queryKey: transactionCategoryQueryKey(workspace.id, mode),
    queryFn: async () => {
      if (demoMode) return demoTransactionCategories(mode)
      const response = await api.get<TransactionCategory[]>(
        `/workspaces/${encodeURIComponent(workspace.id)}/transaction-categories?transactionType=${encodeURIComponent(mode)}`,
      )
      return Array.isArray(response) ? response : []
    },
    enabled,
    retry: 1,
  })
}
