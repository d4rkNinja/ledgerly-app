export type TransactionSplitDraft = {
  memberEmail: string
  amountMajor: string
}

export type TransactionSplitInput = {
  memberEmail: string
  amountMinor: number
}

export type TransactionSplitValidation =
  | {
      ok: true
      splits: TransactionSplitInput[]
      allocatedMinor: number
      fieldErrors: Record<string, never>
    }
  | {
      ok: false
      reason: 'empty' | 'invalid' | 'total'
      splits: TransactionSplitInput[]
      allocatedMinor: number
      fieldErrors: Record<string, string>
    }

export function splitShareMinorFromMajor(value: string) {
  const normalized = value.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined
  const [major, fraction = ''] = normalized.split('.')
  const amountMinor =
    Number(major) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(amountMinor) && amountMinor > 0
    ? amountMinor
    : undefined
}

export function validateTransactionSplits(
  drafts: readonly TransactionSplitDraft[],
  transactionAmountMinor: number,
): TransactionSplitValidation {
  const enteredDrafts = drafts.filter((draft) => draft.amountMajor.trim())
  if (enteredDrafts.length === 0) {
    return {
      ok: false,
      reason: 'empty',
      splits: [],
      allocatedMinor: 0,
      fieldErrors: {},
    }
  }

  const fieldErrors: Record<string, string> = {}
  const splits: TransactionSplitInput[] = []
  let allocatedMinor = 0
  for (const draft of enteredDrafts) {
    const memberEmail = draft.memberEmail.trim()
    const amountMinor = splitShareMinorFromMajor(draft.amountMajor)
    if (!memberEmail || amountMinor === undefined) {
      fieldErrors[draft.memberEmail] =
        'Enter a positive share with no more than two decimal places.'
      continue
    }
    splits.push({ memberEmail, amountMinor })
    allocatedMinor += amountMinor
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      reason: 'invalid',
      splits,
      allocatedMinor,
      fieldErrors,
    }
  }
  if (allocatedMinor !== transactionAmountMinor) {
    return {
      ok: false,
      reason: 'total',
      splits,
      allocatedMinor,
      fieldErrors,
    }
  }
  return {
    ok: true,
    splits,
    allocatedMinor,
    fieldErrors: {},
  }
}
