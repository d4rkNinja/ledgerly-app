import type { Transaction } from '@/domain/types'

export function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Match every typed term against the allowed searchable text fields.
 * Callers decide which fields are searchable so private contact details such
 * as phone numbers and email addresses are never included accidentally.
 */
export function matchesSearchText(
  values: Array<string | undefined>,
  query: string,
) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return true

  const candidates = values
    .filter((value): value is string => Boolean(value))
    .map(normalizeSearchText)
    .filter(Boolean)
  const terms = normalizedQuery.split(' ').filter(Boolean)

  return terms.every((term) =>
    candidates.some((candidate) => candidate.includes(term)),
  )
}

export function matchesTransactionSearch(
  transaction: Pick<
    Transaction,
    'transactionId' | 'merchant' | 'note' | 'description' | 'contact'
  >,
  query: string,
) {
  return matchesSearchText(
    [
      transaction.transactionId,
      transaction.merchant,
      transaction.note,
      transaction.description,
      transaction.contact?.name,
    ],
    query,
  )
}
