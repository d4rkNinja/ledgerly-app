import type { Money } from '@/domain/types'

import {
  formatShareDate,
  formatShareMoney,
  formatShareMonth,
} from './format'
import {
  cleanShareLabel,
  humanizeShareLabel,
  truncateUnicode,
} from './text'
import type {
  BillReminderShareInput,
  ExpenseClaimShareInput,
  MonthlySummaryShareInput,
  ShareBuildOptions,
  SharePayload,
  TransactionShareInput,
  WorkspaceInviteShareInput,
} from './types'

const TITLE_LIMIT = 96
const DISPLAY_NAME_LIMIT = 96
const DETAIL_LIMIT = 140
const PAYLOAD_TEXT_LIMIT = 1_400

function createPayload(
  title: string,
  lines: Array<string | null | undefined | false>,
  options: ShareBuildOptions,
): SharePayload {
  const payload = {
    title: cleanShareLabel(title, TITLE_LIMIT, 'Money update'),
    text: truncateUnicode(
      lines.filter((line): line is string => Boolean(line)).join('\n'),
      PAYLOAD_TEXT_LIMIT,
    ),
    ...(options.safePublicUrl ? { url: options.safePublicUrl } : {}),
  }

  return Object.freeze(payload) as SharePayload
}

/**
 * Converts a server-prepared or local plain-text summary into the branded
 * share contract used by device/clipboard adapters. Keeping this conversion
 * here means UI code cannot pass arbitrary record objects to the share sheet.
 */
export function buildSafeTextSharePayload(input: {
  title: string
  text: string
}): SharePayload {
  return createPayload(
    input.title,
    [cleanShareLabel(input.text, PAYLOAD_TEXT_LIMIT, 'Money update')],
    {},
  )
}

function sameCurrency(left: Money, right: Money): boolean {
  return left.currency.trim().toUpperCase() === right.currency.trim().toUpperCase()
}

export function buildTransactionSharePayload(
  transaction: TransactionShareInput,
  options: ShareBuildOptions = {},
): SharePayload {
  const merchant = cleanShareLabel(
    transaction.merchant,
    DISPLAY_NAME_LIMIT,
    'Transaction',
  )
  const category = cleanShareLabel(
    transaction.category,
    DISPLAY_NAME_LIMIT,
    'Uncategorised',
  )
  const amount = options.concealAmounts
    ? null
    : formatShareMoney(transaction.amount, options.locale, true)
  const occurredAt = formatShareDate(
    transaction.occurredAt,
    options.locale,
    options.timeZone,
  )
  const status = humanizeShareLabel(
    transaction.status,
    'Status unavailable',
  )
  const creator = transaction.creator
    ? cleanShareLabel(
        transaction.creator.name +
          (transaction.creator.status === 'former' ? ' (Former member)' : ''),
        DISPLAY_NAME_LIMIT,
      )
    : null
  const createdAt = transaction.createdAt
    ? formatShareDate(
        transaction.createdAt,
        options.locale,
        options.timeZone,
      )
    : null
  const action = transaction.direction === 'credit' ? 'Received' : 'Spent'
  const merchantPhrase = options.concealAmounts
    ? merchant === 'Transaction'
      ? `${action} amount hidden by privacy mode`
      : `${action} ${transaction.direction === 'credit' ? 'from' : 'at'} ${merchant} · Amount hidden by privacy mode`
    : merchant === 'Transaction'
      ? `${action} ${amount}`
      : `${action} ${amount} ${transaction.direction === 'credit' ? 'from' : 'at'} ${merchant}`

  return createPayload(
    transaction.direction === 'credit'
      ? 'Money received'
      : 'Transaction snapshot',
    [
      merchantPhrase,
      [
        category,
        occurredAt,
        status,
        creator ? 'Created by ' + creator : null,
        createdAt ? 'Created ' + createdAt : null,
      ]
        .filter(Boolean)
        .join(' · '),
    ],
    options,
  )
}

export function buildWorkspaceInviteSharePayload(
  invitation: WorkspaceInviteShareInput,
  options: ShareBuildOptions = {},
): SharePayload {
  const workspaceName = cleanShareLabel(
    invitation.workspaceName,
    DISPLAY_NAME_LIMIT,
    'your workspace',
  )
  const inviter = cleanShareLabel(
    invitation.inviterDisplayName,
    DISPLAY_NAME_LIMIT,
  )
  const role = cleanShareLabel(invitation.roleLabel, DISPLAY_NAME_LIMIT)
  const expiresAt = invitation.expiresAt
    ? formatShareDate(
        invitation.expiresAt,
        options.locale,
        options.timeZone,
      )
    : null
  const workspaceKind = invitation.workspaceType
    ? `${humanizeShareLabel(invitation.workspaceType, 'Shared')} workspace`
    : 'Shared workspace'

  return createPayload(
    `Invitation to ${workspaceName}`,
    [
      inviter
        ? `${inviter} invited you to join ${workspaceName}.`
        : `You're invited to join ${workspaceName}.`,
      [workspaceKind, role ? `Role: ${role}` : null]
        .filter(Boolean)
        .join(' · '),
      expiresAt ? `Invitation expires ${expiresAt}.` : null,
      options.safePublicUrl
        ? 'Open the secure invitation link to continue.'
        : 'Open Ledgerly to continue.',
    ],
    options,
  )
}

export function buildBillReminderSharePayload(
  bill: BillReminderShareInput,
  options: ShareBuildOptions = {},
): SharePayload {
  const name = cleanShareLabel(
    bill.name,
    DISPLAY_NAME_LIMIT,
    'Upcoming bill',
  )
  const dueDate = formatShareDate(
    bill.dueDate,
    options.locale,
    options.timeZone,
  )
  const amount = options.concealAmounts
    ? null
    : formatShareMoney(bill.amount, options.locale, true)

  return createPayload(
    'Bill reminder',
    [
      [name, amount ?? 'Amount hidden by privacy mode'].join(' · '),
      [
        dueDate ? `Due ${dueDate}` : 'Due date unavailable',
        bill.autopay ? 'Autopay on' : 'Manual payment',
      ].join(' · '),
    ],
    options,
  )
}

export function buildExpenseClaimSharePayload(
  claim: ExpenseClaimShareInput,
  options: ShareBuildOptions = {},
): SharePayload {
  const purpose = cleanShareLabel(
    claim.purpose,
    DETAIL_LIMIT,
    'Expense claim',
  )
  const claimant = cleanShareLabel(
    claim.claimantDisplayName,
    DISPLAY_NAME_LIMIT,
  )
  const status = claim.status
    ? humanizeShareLabel(claim.status, 'Status unavailable')
    : ''
  const submittedAt = claim.submittedAt
    ? formatShareDate(claim.submittedAt, options.locale, options.timeZone)
    : null

  return createPayload(
    'Expense claim',
    [
      [
        purpose,
        options.concealAmounts
          ? 'Amount hidden by privacy mode'
          : formatShareMoney(claim.amount, options.locale, true),
      ].join(' · '),
      [
        claimant ? `Submitted by ${claimant}` : null,
        status || null,
        submittedAt || null,
      ]
        .filter(Boolean)
        .join(' · '),
    ],
    options,
  )
}

export function buildMonthlySummarySharePayload(
  summary: MonthlySummaryShareInput,
  options: ShareBuildOptions = {},
): SharePayload {
  const month = formatShareMonth(summary.period, options.locale)
  const workspaceName = cleanShareLabel(
    summary.workspaceName,
    DISPLAY_NAME_LIMIT,
  )
  const computedNet =
    summary.net ??
    (sameCurrency(summary.income, summary.spending)
      ? {
          amountMinor:
            summary.income.amountMinor - summary.spending.amountMinor,
          currency: summary.income.currency,
        }
      : undefined)
  const category = summary.topCategory
    ? cleanShareLabel(
        summary.topCategory.name,
        DISPLAY_NAME_LIMIT,
        'Top category',
      )
    : ''

  return createPayload(
    `${month} money summary`,
    [
      workspaceName || null,
      options.concealAmounts
        ? 'Amounts hidden by privacy mode'
        : `Income ${formatShareMoney(summary.income, options.locale, true)}`,
      options.concealAmounts
        ? null
        : `Spending ${formatShareMoney(summary.spending, options.locale, true)}`,
      computedNet && !options.concealAmounts
        ? `Net cash flow ${formatShareMoney(computedNet, options.locale)}`
        : null,
      summary.topCategory && !options.concealAmounts
        ? `Top category ${category} · ${formatShareMoney(
            summary.topCategory.amount,
            options.locale,
            true,
          )}`
        : null,
    ],
    options,
  )
}
