import type { CreatorSummary } from './types'

export type PeriodReviewStatus = 'reviewed' | 'closed'
export type PeriodReviewScope = 'member_view' | 'workspace_view'

export interface PeriodReviewFinancialValues {
  incomeMinor: string
  spendingMinor: string
  netMinor: string
  transactionCount: string
}

export interface PeriodReview {
  id: string
  workspaceId: string
  status: PeriodReviewStatus
  scope: PeriodReviewScope
  from: string
  to: string
  timezone: string
  fromUtc: string
  toUtcExclusive: string
  currency: string
  snapshot: PeriodReviewFinancialValues
  reviewedBy?: PeriodReviewEditor
  vaultCount: number
  accountCount: number
  scopeNote: string
  createdAt: string
  delta: PeriodReviewFinancialValues
  changeCount: string
  changedAfterClose: boolean
  reviewState: 'current' | 'pending_re_review'
}

export type PeriodReviewEditor = CreatorSummary

export interface PeriodReviewTransactionVersion {
  id: string
  transactionId?: string
  accountId: string
  destinationAccountId?: string
  type: string
  amountMinor: string
  currency: string
  category?: string
  merchant?: string
  description?: string
  notes?: string
  contactId?: string
  goalId?: string
  privacy: string
  occurredAt?: string
  enteredAt: string
  createdAt: string
  editedAt?: string
  updatedAt: string
  approvalState: string
  revisionState: string
  hasSplits: boolean
}

export interface PeriodReviewChange {
  action: 'added' | 'edited' | 'deleted'
  editor?: PeriodReviewEditor
  before?: PeriodReviewTransactionVersion
  after?: PeriodReviewTransactionVersion
  changedAt: string
  delta: PeriodReviewFinancialValues
  changedFields: string[]
  approvalState: string
  revisionState: string
  beforeRedacted: boolean
  afterRedacted: boolean
  splitAllocationChanged: boolean
}

export interface CreatePeriodReviewBody {
  from: string
  to: string
  timezone: string
  status: PeriodReviewStatus
  scope: PeriodReviewScope
}
