import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FlaskConical,
  Plus,
  Sparkles,
  Trash2,
  Workflow,
} from 'lucide-react'
import { useApp } from '@/app/app-state'
import type {
  AutomationRule,
  RuleAction,
  RuleCondition,
  RuleConditionField,
  RuleConditionOperator,
  RulePreviewResult,
} from '@/domain/intelligence'
import { api, ApiError } from '@/lib/api-client'
import { formatMoney } from '@/lib/format'
import { Badge, Button, Dialog, EmptyState, ErrorState, Field, PageHeader, Section } from '@/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/beui/select'
import { DataSkeleton, InfoNotice, PageFrame } from './shared'
import { hasWorkspacePermission, useFinanceData } from './data'

const CONDITION_FIELD_LABELS: Record<RuleConditionField, string> = {
  description: 'Description',
  type: 'Entry type',
  amount: 'Amount',
  category: 'Category',
  account: 'Account',
  contact: 'Contact',
  imported: 'Came from import',
}

const OPERATOR_LABELS: Partial<Record<RuleConditionOperator, string>> = {
  contains: 'contains',
  equals: 'is',
  not_equals: 'is not',
  in: 'is one of',
  greater_than: 'greater than',
  less_than: 'less than',
  between: 'between',
  is_true: 'yes',
  is_false: 'no',
}

const OPERATORS_BY_FIELD: Record<RuleConditionField, RuleConditionOperator[]> = {
  description: ['contains', 'equals'],
  type: ['equals'],
  amount: ['greater_than', 'less_than', 'between', 'equals'],
  category: ['equals', 'not_equals'],
  account: ['equals'],
  contact: ['equals'],
  imported: ['is_true', 'is_false'],
}

const ACTION_LABELS: Record<RuleAction['type'], string> = {
  set_category: 'Set category',
  set_contact: 'Set contact',
  rename: 'Rename entry',
  set_account: 'Move to account',
  add_tag: 'Add tag',
  set_privacy: 'Privacy',
}

function operatorsFor(field: RuleConditionField) {
  return OPERATORS_BY_FIELD[field] ?? ['equals']
}

interface ConditionDraft extends RuleCondition {}

interface ActionDraft extends RuleAction {}

interface RuleDraft {
  name: string
  priority: number
  enabled: boolean
  conditions: ConditionDraft[]
  actions: ActionDraft[]
}

function emptyDraft(): RuleDraft {
  return {
    name: '',
    priority: 100,
    enabled: true,
    conditions: [{ field: 'description', operator: 'contains', value: '' }],
    actions: [{ type: 'set_category', value: '' }],
  }
}

export function RulesPage() {
  const { demoMode, workspace } = useApp()
  const queryClient = useQueryClient()
  // Demo sessions never touch the rules API: hasWorkspacePermission returns
  // true for every permission in demo mode, so exclude demo explicitly.
  const canManage =
    !demoMode &&
    hasWorkspacePermission(demoMode, workspace.permissions, 'edit_all_transactions')
  const rulesQuery = useQuery({
    queryKey: ['automation-rules', workspace.id],
    queryFn: () => api.get<unknown>(`/workspaces/${workspace.id}/automation-rules`) as Promise<AutomationRule[]>,
    enabled: !demoMode,
    retry: false,
  })
  const [editing, setEditing] = useState<{ draft: RuleDraft; id?: string } | null>(null)

  const toggleMutation = useMutation({
    mutationFn: ({ rule, enabled }: { rule: AutomationRule; enabled: boolean }) =>
      api.patch(`/workspaces/${workspace.id}/automation-rules/${rule.id}`, {
        name: rule.name,
        priority: rule.priority,
        enabled,
        conditions: rule.conditions,
        actions: rule.actions,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['automation-rules', workspace.id] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/workspaces/${workspace.id}/automation-rules/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['automation-rules', workspace.id] })
    },
  })

  const rules = [...(rulesQuery.data ?? [])].sort((left, right) =>
    left.priority === right.priority
      ? left.createdAt.localeCompare(right.createdAt)
      : left.priority - right.priority,
  )

  return (
    <PageFrame className="rules-page">
      <PageHeader
        title="Automation"
        description="Rules keep tidy entries flowing in — during statement imports and new transactions."
      />
      {demoMode ? (
        <InfoNotice>Rules apply to live workspaces only.</InfoNotice>
      ) : rulesQuery.isLoading ? (
        <DataSkeleton />
      ) : rulesQuery.isError ? (
        <ErrorState message="Rules could not be loaded." retry={() => rulesQuery.refetch()} />
      ) : (
        <>
          <Section>
            <div className="section-heading-row">
              <div>
                <h2>Rules</h2>
                <p>Lower numbers run first. Every change records which rule made it.</p>
              </div>
              {canManage ? (
                <Button variant="primary" onClick={() => setEditing({ draft: emptyDraft() })}>
                  <Plus size={16} aria-hidden="true" /> New rule
                </Button>
              ) : null}
            </div>
            {!rules.length ? (
              <EmptyState
                icon={<Workflow />}
                title="No rules yet"
                message='Create one like: if the description contains "Uber" and it is an expense, set the category to Transportation.'
              />
            ) : (
              <ul className="rule-list">
                {rules.map((rule) => (
                  <li key={rule.id} className="rule-row" data-enabled={rule.enabled}>
                    <div className="rule-copy">
                      <strong>{rule.name}</strong>
                      <span>{describeConditions(rule)}</span>
                      <span>{describeActions(rule)}</span>
                    </div>
                    <div className="rule-controls">
                      <Badge tone={rule.enabled ? 'positive' : 'neutral'}>
                        {rule.enabled ? `Runs #${rule.priority}` : 'Paused'}
                      </Badge>
                      {canManage ? (
                        <>
                          <Button
                            variant="quiet"
                            onClick={() =>
                              toggleMutation.mutate({ rule, enabled: !rule.enabled })
                            }
                            disabled={toggleMutation.isPending}
                          >
                            {rule.enabled ? 'Pause' : 'Enable'}
                          </Button>
                          <Button
                            variant="quiet"
                            onClick={() =>
                              setEditing({
                                id: rule.id,
                                draft: {
                                  name: rule.name,
                                  priority: rule.priority,
                                  enabled: rule.enabled,
                                  conditions: rule.conditions.map((condition) => ({ ...condition })),
                                  actions: rule.actions.map((action) => ({ ...action })),
                                },
                              })
                            }
                          >
                            Edit
                          </Button>
                          <Button
                            variant="quiet"
                            aria-label={`Delete ${rule.name}`}
                            onClick={() => {
                              if (window.confirm(`Delete the rule "${rule.name}"?`)) {
                                deleteMutation.mutate(rule.id)
                              }
                            }}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {!canManage ? (
            <InfoNotice>
              Only workspace managers can create or edit rules. Rules run when new
              transactions are created or statement imports are committed.
            </InfoNotice>
          ) : null}
        </>
      )}
      {editing ? (
        <RuleEditorDialog
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ['automation-rules', workspace.id] })
            setEditing(null)
          }}
        />
      ) : null}
    </PageFrame>
  )
}

function describeConditions(rule: AutomationRule) {
  return rule.conditions
    .map((condition) => describeCondition(condition))
    .join(' AND ')
}

function describeCondition(condition: RuleCondition) {
  const label = CONDITION_FIELD_LABELS[condition.field] ?? condition.field
  switch (condition.field) {
    case 'amount': {
      const minor =
        condition.operator === 'between'
          ? `${minorText(condition.minMinor)}–${minorText(condition.maxMinor)}`
          : minorText(condition.minMinor)
      return `${label} ${OPERATOR_LABELS[condition.operator] ?? condition.operator} ${minor}`
    }
    case 'imported':
      return condition.operator === 'is_true' ? 'From an import' : 'Not from an import'
    default: {
      const values = condition.values?.length ? condition.values.join(', ') : condition.value
      return `${label} ${OPERATOR_LABELS[condition.operator] ?? condition.operator} "${values ?? ''}"`
    }
  }
}

function minorText(value: number | undefined) {
  return value === undefined ? '?' : String(Math.round(value) / 100)
}

function describeActions(rule: AutomationRule) {
  return rule.actions
    .map((action) => {
      const label = ACTION_LABELS[action.type] ?? action.type
      if (action.type === 'set_privacy') return action.value === 'private' ? 'Make private' : 'Share with workspace'
      return `${label}: ${action.value}`
    })
    .join(' · ')
}

function RuleEditorDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing: { draft: RuleDraft; id?: string }
  onClose: () => void
  onSaved: () => void
}) {
  const { demoMode, workspace } = useApp()
  const accountsQuery = useFinanceData<{ id: string; name: string }[]>('accounts', '/accounts', [])
  const contactsQuery = useFinanceData<{ id: string; name: string }[]>('contacts', '/contacts', [])
  // The backend validates rule-assigned categories fail-closed against the
  // workspace's configured categories, so only active categories of every
  // entry type are offered here.
  const categoriesQuery = useFinanceData<
    { name: string; isActive?: boolean }[]
  >('transaction-categories-expense', '/transaction-categories', [])
  const accounts = accountsQuery.data ?? []
  const contacts = contactsQuery.data ?? []
  const categories = (categoriesQuery.data ?? []).filter(
    (category) => category.isActive !== false,
  )

  const [draft, setDraft] = useState<RuleDraft>(editing.draft)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<RulePreviewResult | null>(null)

  useEffect(() => setDraft(editing.draft), [editing])

  const saveMutation = useMutation({
    mutationFn: () =>
      editing.id
        ? api.patch(`/workspaces/${workspace.id}/automation-rules/${editing.id}`, draft)
        : api.post(`/workspaces/${workspace.id}/automation-rules`, draft),
    onSuccess: onSaved,
    onError: (error) => {
      if (error instanceof ApiError && error.fields) setErrors(error.fields)
      else setErrors({ form: 'The rule could not be saved.' })
    },
  })

  const previewMutation = useMutation({
    mutationFn: () =>
      api.post<unknown, typeof draft & { from?: string; to?: string }>(
        `/workspaces/${workspace.id}/automation-rule-previews`,
        draft,
      ) as Promise<RulePreviewResult>,
    onSuccess: (result) => setPreview(result),
    onError: () => setPreview(null),
  })

  const updateCondition = (index: number, patch: Partial<ConditionDraft>) => {
    setDraft((current) => ({
      ...current,
      conditions: current.conditions.map((condition, position) =>
        position === index ? { ...condition, ...patch } : condition,
      ),
    }))
  }
  const updateAction = (index: number, patch: Partial<ActionDraft>) => {
    setDraft((current) => ({
      ...current,
      actions: current.actions.map((action, position) =>
        position === index ? { ...action, ...patch } : action,
      ),
    }))
  }

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {}
    if (!draft.name.trim()) nextErrors.name = 'Enter a name'
    if (!draft.conditions.length) nextErrors.conditions = 'Add at least one condition'
    if (!draft.actions.length) nextErrors.actions = 'Add at least one action'
    for (const condition of draft.conditions) {
      const needsValue = condition.operator !== 'is_true' && condition.operator !== 'is_false'
      if (needsValue && !hasConditionValue(condition)) {
        nextErrors.conditions = 'Every condition needs a value'
        break
      }
    }
    for (const action of draft.actions) {
      if (action.type !== 'add_tag' || action.value.trim()) continue
      nextErrors.actions = 'Tags need a value'
    }
    if (draft.actions.some((action) => action.type !== 'add_tag' && !action.value.trim())) {
      nextErrors.actions = 'Every action needs a value'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  return (
    <Dialog
      open
      title={editing.id ? 'Edit rule' : 'New rule'}
      description="Conditions must all match. Rules run once per transaction, in priority order."
      onClose={saveMutation.isPending ? () => undefined : onClose}
    >
      <form
        className="dialog-form finance-write-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (validate()) saveMutation.mutate()
        }}
        aria-busy={saveMutation.isPending || undefined}
      >
        {demoMode ? <DemoNotice /> : null}
        <Field label="Rule name" error={errors.name}>
          <input
            autoFocus
            maxLength={120}
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            placeholder='e.g. Uber rides'
          />
        </Field>

        <fieldset className="rule-builder-group">
          <legend>If all of these match</legend>
          {draft.conditions.map((condition, index) => (
            <div className="rule-condition-row" key={index}>
              <Select
                value={condition.field}
                onValueChange={(value) =>
                  updateCondition(index, {
                    field: value as RuleConditionField,
                    operator: operatorsFor(value as RuleConditionField)[0],
                  })
                }
              >
                <SelectTrigger aria-label={`Condition ${index + 1} field`} className="w-full" data-field-control>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CONDITION_FIELD_LABELS) as RuleConditionField[]).map((field) => (
                    <SelectItem key={field} value={field}>
                      {CONDITION_FIELD_LABELS[field]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={condition.operator}
                onValueChange={(value) => updateCondition(index, { operator: value as RuleConditionOperator })}
              >
                <SelectTrigger aria-label={`Condition ${index + 1} comparison`} className="w-full" data-field-control>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operatorsFor(condition.field).map((operator) => (
                    <SelectItem key={operator} value={operator}>
                      {OPERATOR_LABELS[operator] ?? operator}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ConditionValueInput
                condition={condition}
                accounts={accounts}
                contacts={contacts}
                onChange={(patch) => updateCondition(index, patch)}
              />
              {draft.conditions.length > 1 ? (
                <Button
                  variant="quiet"
                  aria-label={`Remove condition ${index + 1}`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      conditions: current.conditions.filter((_, position) => position !== index),
                    }))
                  }
                >
                  <Trash2 size={15} aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          ))}
          <Button
            variant="quiet"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                conditions: [
                  ...current.conditions,
                  { field: 'description', operator: 'contains', value: '' },
                ],
              }))
            }
          >
            <Plus size={14} aria-hidden="true" /> Add condition
          </Button>
          {errors.conditions ? <p className="field-error" role="alert">{errors.conditions}</p> : null}
        </fieldset>

        <fieldset className="rule-builder-group">
          <legend>Then</legend>
          {draft.actions.map((action, index) => (
            <div className="rule-action-row" key={index}>
              <Select
                value={action.type}
                onValueChange={(value) => updateAction(index, { type: value as RuleAction['type'], value: '' })}
              >
                <SelectTrigger aria-label={`Action ${index + 1}`} className="w-full" data-field-control>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACTION_LABELS) as RuleAction['type'][]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {ACTION_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ActionValueInput
                action={action}
                accounts={accounts}
                contacts={contacts}
                categories={categories.map((category) => category.name)}
                onChange={(patch) => updateAction(index, patch)}
              />
              {draft.actions.length > 1 ? (
                <Button
                  variant="quiet"
                  aria-label={`Remove action ${index + 1}`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      actions: current.actions.filter((_, position) => position !== index),
                    }))
                  }
                >
                  <Trash2 size={15} aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          ))}
          <Button
            variant="quiet"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                actions: [...current.actions, { type: 'set_category', value: '' }],
              }))
            }
          >
            <Plus size={14} aria-hidden="true" /> Add action
          </Button>
          {errors.actions ? <p className="field-error" role="alert">{errors.actions}</p> : null}
        </fieldset>

        <div className="two-fields">
          <Field label="Priority" hint="Smaller runs first." error={errors.priority}>
            <input
              inputMode="numeric"
              value={String(draft.priority)}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10)
                setDraft((current) => ({ ...current, priority: Number.isNaN(parsed) ? 100 : parsed }))
              }}
              aria-label="Rule priority"
            />
          </Field>
        </div>

        <div className="rule-preview-panel">
          <Button
            type="button"
            variant="secondary"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending}
          >
            <FlaskConical size={16} aria-hidden="true" />
            {previewMutation.isPending ? 'Testing…' : 'Test against history'}
          </Button>
          {preview ? (
            <div className="rule-preview-result" role="status">
              <p>
                <Sparkles size={14} aria-hidden="true" /> Matches{' '}
                <strong>{preview.matchCount}</strong> of {preview.scanned} entries from the last
                90 days.
              </p>
              {preview.samples.length > 0 ? (
                <ul className="rule-preview-samples">
                  {preview.samples.slice(0, 5).map((sample) => (
                    <li key={sample.id}>
                      <strong>{sample.merchant}</strong>
                      <span>
                        {formatMoney(sample)} ·{' '}
                        {sample.changes
                          .map((change) => `${change.field} → ${change.to ?? ''}`)
                          .join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        {errors.form ? <p className="field-error" role="alert">{errors.form}</p> : null}
        <div className="dialog-actions">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saveMutation.isPending}>
            {editing.id ? 'Save rule' : 'Create rule'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function DemoNotice() {
  return <InfoNotice>Demo sessions cannot create rules.</InfoNotice>
}

function hasConditionValue(condition: ConditionDraft) {
  if (condition.values?.length) return true
  return Boolean(condition.value?.trim())
}

function ConditionValueInput({
  condition,
  accounts,
  contacts,
  onChange,
}: {
  condition: ConditionDraft
  accounts: { id: string; name: string }[]
  contacts: { id: string; name: string }[]
  onChange: (patch: Partial<ConditionDraft>) => void
}) {
  if (condition.operator === 'is_true' || condition.operator === 'is_false') {
    return <span className="rule-value-spacer" />
  }
  if (condition.operator === 'between') {
    return (
      <span className="rule-range-inputs">
        <input
          inputMode="decimal"
          placeholder="min"
          aria-label="Minimum amount"
          value={condition.minMinor === undefined ? '' : String(condition.minMinor / 100)}
          onChange={(event) => {
            const parsed = Number.parseFloat(event.target.value)
            onChange({
              minMinor: Number.isNaN(parsed) ? undefined : Math.round(parsed * 100),
            })
          }}
        />
        <input
          inputMode="decimal"
          placeholder="max"
          aria-label="Maximum amount"
          value={condition.maxMinor === undefined ? '' : String(condition.maxMinor / 100)}
          onChange={(event) => {
            const parsed = Number.parseFloat(event.target.value)
            onChange({
              maxMinor: Number.isNaN(parsed) ? undefined : Math.round(parsed * 100),
            })
          }}
        />
      </span>
    )
  }
  switch (condition.field) {
    case 'type':
      return (
        <SimpleSelect
          label={`Value for ${CONDITION_FIELD_LABELS[condition.field]}`}
          value={condition.value ?? 'expense'}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
            { value: 'transfer', label: 'Transfer' },
          ]}
          onChange={(value) => onChange({ value })}
        />
      )
    case 'account':
      return (
        <SimpleSelect
          label={`Value for ${CONDITION_FIELD_LABELS[condition.field]}`}
          value={condition.value ?? ''}
          placeholder="Choose account"
          options={accounts.map((account) => ({ value: account.id, label: account.name }))}
          onChange={(value) => onChange({ value })}
        />
      )
    case 'contact':
      return (
        <SimpleSelect
          label={`Value for ${CONDITION_FIELD_LABELS[condition.field]}`}
          value={condition.value ?? ''}
          placeholder="Choose contact"
          options={contacts.map((contact) => ({ value: contact.id, label: contact.name }))}
          onChange={(value) => onChange({ value })}
        />
      )
    default:
      return (
        <input
          value={condition.value ?? ''}
          onChange={(event) => onChange({ value: event.target.value })}
          placeholder={
            condition.field === 'description'
              ? 'e.g. uber'
              : condition.field === 'category'
                ? 'Category name'
                : 'Value'
          }
          aria-label={`Value for ${CONDITION_FIELD_LABELS[condition.field]}`}
        />
      )
  }
}

function ActionValueInput({
  action,
  accounts,
  contacts,
  categories,
  onChange,
}: {
  action: ActionDraft
  accounts: { id: string; name: string }[]
  contacts: { id: string; name: string }[]
  categories: string[]
  onChange: (patch: Partial<ActionDraft>) => void
}) {
  if (action.type === 'set_privacy') {
    return (
      <SimpleSelect
        label="Privacy value"
        value={action.value || 'workspace'}
        options={[
          { value: 'workspace', label: 'Workspace' },
          { value: 'private', label: 'Private' },
        ]}
        onChange={(value) => onChange({ value })}
      />
    )
  }
  if (action.type === 'set_account') {
    return (
      <SimpleSelect
        label="Target account"
        value={action.value}
        placeholder="Choose account"
        options={accounts.map((account) => ({ value: account.id, label: account.name }))}
        onChange={(value) => onChange({ value })}
      />
    )
  }
  if (action.type === 'set_contact') {
    return (
      <SimpleSelect
        label="Contact"
        value={action.value}
        placeholder="Choose contact"
        options={contacts.map((contact) => ({ value: contact.id, label: contact.name }))}
        onChange={(value) => onChange({ value })}
      />
    )
  }
  if (action.type === 'set_category') {
    return (
      <>
        <input
          value={action.value}
          list="rule-category-options"
          onChange={(event) => onChange({ value: event.target.value })}
          placeholder="Category"
          aria-label="New category"
        />
        <datalist id="rule-category-options">
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
      </>
    )
  }
  return (
    <input
      value={action.value}
      onChange={(event) => onChange({ value: event.target.value })}
      placeholder={action.type === 'rename' ? 'New name' : 'Tag'}
      aria-label={ACTION_LABELS[action.type]}
    />
  )
}

function SimpleSelect({
  value,
  options,
  onChange,
  label,
  placeholder,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  label: string
  placeholder?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full" data-field-control>
        <SelectValue placeholder={placeholder ?? 'Choose…'} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
