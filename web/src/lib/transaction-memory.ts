// Remembers small transaction-entry preferences so common flows need fewer
// taps. Stored locally per device; nothing here is authoritative data.

const STORAGE_KEY = 'ledgerly:transaction-memory:v1'
const MAX_RECENT_CATEGORIES = 5

export type MemoryMode = 'expense' | 'income' | 'transfer' | 'split'

interface TransactionMemory {
  accountId?: string
  categories?: Partial<Record<MemoryMode, string[]>>
}

function readMemory(): TransactionMemory {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as TransactionMemory
  } catch {
    return {}
  }
}

function writeMemory(memory: TransactionMemory) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory))
  } catch {
    // Storage is optional; entry still works without memory.
  }
}

export function rememberedAccountId() {
  return readMemory().accountId
}

export function rememberedCategory(mode: MemoryMode) {
  return readMemory().categories?.[mode]?.[0]
}

export function rememberAccount(accountId: string) {
  if (!accountId) return
  writeMemory({ ...readMemory(), accountId })
}

export function rememberCategory(mode: MemoryMode, category: string) {
  if (!category) return
  const memory = readMemory()
  const existing = memory.categories ?? {}
  const previous = existing[mode] ?? []
  const next = [category, ...previous.filter((entry) => entry !== category)].slice(
    0,
    MAX_RECENT_CATEGORIES,
  )
  writeMemory({
    ...memory,
    categories: { ...existing, [mode]: next },
  })
}

/** Orders categories so recently used ones appear first. */
export function orderCategoriesByRecency<T>(
  mode: MemoryMode,
  categories: T[],
  getName: (item: T) => string = (item) => String(item),
): T[] {
  const recent = readMemory().categories?.[mode] ?? []
  if (!recent.length || !categories.length) return categories
  const rank = new Map(recent.map((name, index) => [name, index]))
  return [...categories].sort((left, right) => {
    const leftRank = rank.get(getName(left))
    const rightRank = rank.get(getName(right))
    if (leftRank === undefined && rightRank === undefined) return 0
    if (leftRank === undefined) return 1
    if (rightRank === undefined) return -1
    return leftRank - rightRank
  })
}
