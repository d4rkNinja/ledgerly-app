export interface ImportColumnMapping {
  hasHeader: boolean
  dateColumn: number
  descriptionColumn: number
  amountColumn: number
  debitColumn: number
  creditColumn: number
  notesColumn: number
  referenceColumn: number
  dateFormat: string
  amountMode: string
}

export interface ImportMatchInfo {
  label?: string
  occurredAt?: string
  amountMinor?: number
  score?: number
}

export interface ImportRow {
  index: number
  rawDate: string
  occurredAt: string
  description: string
  notes?: string
  reference?: string
  amountMinor: number
  direction: 'debit' | 'credit'
  state:
    | 'invalid'
    | 'new'
    | 'duplicate'
    | 'possible_match'
  error?: string
  action: '' | 'create' | 'ignore' | 'link'
  match?: ImportMatchInfo
}

export interface ImportSummary {
  totalRows: number
  validRows: number
  errorRows: number
  duplicateRows: number
  possibleMatches: number
  newRows: number
  ignoredRows: number
  createCount: number
  linkCount: number
}

export interface ImportResult {
  createdCount: number
  linkedCount: number
  ignoredCount: number
  committedAt: string
}

export interface ImportSession {
  id: string
  accountId: string
  status: 'draft' | 'completed' | 'cancelled'
  sourceName: string
  currency: string
  mapping: ImportColumnMapping
  rows: ImportRow[]
  summary: ImportSummary
  result?: ImportResult
  hasBlockingErrors?: boolean
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export type RuleConditionField =
  | 'type'
  | 'account'
  | 'description'
  | 'contact'
  | 'amount'
  | 'category'
  | 'imported'

export type RuleConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'in'
  | 'greater_than'
  | 'less_than'
  | 'between'
  | 'is_true'
  | 'is_false'

export type RuleActionType =
  | 'set_category'
  | 'set_contact'
  | 'rename'
  | 'set_account'
  | 'add_tag'
  | 'set_privacy'

export interface RuleCondition {
  field: RuleConditionField
  operator: RuleConditionOperator
  value?: string
  values?: string[]
  minMinor?: number
  maxMinor?: number
}

export interface RuleAction {
  type: RuleActionType
  value: string
}

export interface AutomationRule {
  id: string
  name: string
  priority: number
  enabled: boolean
  conditions: RuleCondition[]
  actions: RuleAction[]
  matchCount?: number
  createdAt: string
  updatedAt: string
}

export interface AppliedRuleChange {
  field: string
  from?: string
  to?: string
}

export interface RulePreviewSample {
  id: string
  merchant?: string
  type: string
  category?: string
  amountMinor: number
  currency: string
  occurredAt: string
  changes: AppliedRuleChange[]
}

export interface RulePreviewResult {
  matchCount: number
  samples: RulePreviewSample[]
  scanned: number
  from: string
  to: string
}

export interface RuleRunSummary {
  examined: number
  changed: number
}

export interface ForecastEvent {
  label: string
  kind: string
  direction: 'income' | 'expense'
  amountMinor: number
  frequency?: string
}

export interface ForecastPoint {
  date: string
  events: ForecastEvent[]
  billExpenseMinor: number
  baselineExpenseMinor: number
  baselineIncomeMinor: number
  oneOffExpenseMinor: number
  oneOffIncomeMinor: number
  incomeMinor: number
  expenseMinor: number
  closingBalanceMinor: number
}

export interface ForecastTotals {
  expectedIncomeMinor: number
  expectedExpenseMinor: number
  netMinor: number
}

export interface ForecastResult {
  currency: string
  generatedAt: string
  startDate: string
  days: number
  startingBalanceMinor: number
  points: ForecastPoint[]
  totals: ForecastTotals
  lowestProjectedBalanceMinor: number
  lowestProjectedDate?: string
  availableAfterCommittedMinor: number
  firstNegativeDate?: string
  negativeDays: number
  baselineDailyExpenseMinor: number
  baselineDailyIncomeMinor: number
  assumptions: string[]
}

export interface ForecastOneOffInput {
  date: string
  direction: 'income' | 'expense'
  label: string
  amountMinor: number
}

export interface ForecastScenarioInput {
  days: number
  includeBills: boolean
  includeBaseline: boolean
  includeIncome: boolean
  oneOff: ForecastOneOffInput[]
}

export type AttentionSeverity = 'critical' | 'warning' | 'info'

export interface AttentionItem {
  kind: string
  severity: AttentionSeverity
  title: string
  detail?: string
  count?: number
  amountMinor?: number
  currency?: string
  href: string
}

export interface AttentionResult {
  items: AttentionItem[]
  generatedAt: string
}

export interface ReconciliationPreviewResult {
  currency: string
  accountId: string
  statementDate: string
  ledgerBalanceMinor: number
  statementBalanceMinor?: number
  differenceMinor?: number
  hasStatementBalance: boolean
  clearedCount: number
  unclearedCount: number
}

export interface AccountReconciliation {
  id: string
  accountId: string
  statementDate: string
  currency: string
  ledgerBalanceMinor: number
  statementBalanceMinor: number
  differenceMinor: number
  differenceAcknowledged: boolean
  clearedCount: number
  unclearedCount: number
  note?: string
  createdAt: string
}

export interface RecurringSuggestion {
  signature: string
  label: string
  category?: string
  direction: 'debit' | 'credit'
  amountMinor: number
  currency: string
  frequency: string
  occurrences: number
  lastOccurredAt: string
  nextDueEstimate: string
}

export type BillFrequency = 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly'

export const BILL_FREQUENCY_LABELS: Record<BillFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  fortnightly: 'Every two weeks',
  monthly: 'Monthly',
  quarterly: 'Every three months',
  yearly: 'Yearly',
}

export interface BillInputPayload {
  name: string
  amountMinor: number
  currency: string
  frequency: string
  dueDate: string
  autopay: boolean
}
