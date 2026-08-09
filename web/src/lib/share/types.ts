import type {
  Bill,
  CreatorSummary,
  Money,
  Transaction,
  WorkspaceType,
} from '@/domain/types'

declare const safePublicUrlBrand: unique symbol
declare const sharePayloadBrand: unique symbol

/**
 * An HTTPS URL that has passed the sharing layer's public-host validation.
 * Create one with `createSafePublicUrl`; arbitrary strings are intentionally
 * not accepted by payload builders.
 */
export type SafePublicUrl = string & {
  readonly [safePublicUrlBrand]: true
}

/**
 * Privacy-reviewed data ready for a native, clipboard, or WhatsApp share.
 * Payloads are branded so application code cannot accidentally pass an
 * unrestricted object containing internal fields.
 */
export type SharePayload = Readonly<{
  title: string
  text: string
  url?: SafePublicUrl
}> & {
  readonly [sharePayloadBrand]: true
}

export interface ShareBuildOptions {
  /** Deterministic default: en-IN. Pass navigator.language at the UI boundary. */
  locale?: string
  /** Used for timestamp display. Date-only values remain timezone-stable. */
  timeZone?: string
  /** The only URL type payload builders accept. */
  safePublicUrl?: SafePublicUrl
  /** Removes all monetary values from the payload when privacy mode is active. */
  concealAmounts?: boolean
}

/**
 * Extra Transaction properties such as id, note, and accountId are
 * deliberately excluded and are never read by the builder.
 */
export type TransactionShareInput = Pick<
  Transaction,
  'merchant' | 'category' | 'occurredAt' | 'amount' | 'direction' | 'status'
> & {
  createdAt?: string
  creator?: Pick<CreatorSummary, 'name' | 'status'>
}

/**
 * Invitation emails, invitation ids, share tokens, and API URLs are
 * deliberately absent. A validated public invitation URL may be supplied in
 * ShareBuildOptions.
 */
export interface WorkspaceInviteShareInput {
  workspaceName: string
  workspaceType?: WorkspaceType
  inviterDisplayName?: string
  roleLabel?: string
  expiresAt?: string | Date
}

/** Bill ids and payment-account information are deliberately excluded. */
export type BillReminderShareInput = Pick<
  Bill,
  'name' | 'dueDate' | 'amount' | 'autopay'
>

/**
 * Claim ids, receipt URLs, private notes, and reimbursement account details
 * are deliberately absent.
 */
export interface ExpenseClaimShareInput {
  purpose: string
  amount: Money
  claimantDisplayName?: string
  status?: string
  submittedAt?: string | Date
}

export interface MonthlySummaryPeriod {
  year: number
  /** Calendar month, from 1 (January) through 12 (December). */
  month: number
}

/**
 * Only aggregate monthly values are accepted. Account balances, transaction
 * rows, and account identifiers are intentionally not part of this contract.
 */
export interface MonthlySummaryShareInput {
  period: MonthlySummaryPeriod
  income: Money
  spending: Money
  net?: Money
  workspaceName?: string
  topCategory?: {
    name: string
    amount: Money
  }
}

export interface ClipboardLike {
  writeText(text: string): Promise<void>
}

export interface ShareNavigator {
  share?: (data: ShareData) => Promise<void>
  canShare?: (data: ShareData) => boolean
  clipboard?: ClipboardLike
}

export type ShareFallbackReason =
  | 'native-unavailable'
  | 'native-rejected'
  | 'clipboard-unavailable'
  | 'clipboard-rejected'

export type ShareDeliveryResult =
  | {
      status: 'shared'
      method: 'native'
    }
  | {
      status: 'copied'
      method: 'clipboard'
      text: string
      fallbackFrom?: 'native-unavailable' | 'native-rejected'
    }
  | {
      status: 'cancelled'
      method: 'native'
    }
  | {
      status: 'manual'
      method: 'manual'
      text: string
      reason: ShareFallbackReason
      fallbackFrom?: 'native-unavailable' | 'native-rejected'
    }
