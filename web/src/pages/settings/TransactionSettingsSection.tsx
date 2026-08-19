import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  Hash,
  Pencil,
  Tags,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useApp } from '@/app/app-state'
import {
  TRANSACTION_CATEGORY_MODES,
  orderedTransactionCategories,
  transactionSequencePreview,
  type TransactionCategory,
  type TransactionCategoryMode,
  type TransactionSequenceSetting,
} from '@/domain/transaction-categories'
import { api, ApiError } from '@/lib/api-client'
import { invalidatePeriodReviewQueries } from '@/lib/period-review-query'
import {
  categoryWriteBody,
  sequenceUpdateBody,
  transactionCategoryQueryKey,
  transactionSequenceQueryKey,
  useTransactionCategories,
  useTransactionSequences,
  type CategoryWriteBody,
  type CategoryFormValues,
  type SequenceUpdateBody,
} from '@/lib/transaction-settings'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/beui/select'
import { Badge, Button, Dialog, Field, Section } from '@/components/ui'
import { SettingToggle } from './SettingToggle'

const EMPTY_CATEGORY_FORM: CategoryFormValues = {
  name: '',
  description: '',
  icon: '',
  color: '',
}

function modeLabel(mode: TransactionCategoryMode) {
  return mode[0].toUpperCase() + mode.slice(1)
}

function apiErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

function ModeTabs({
  mode,
  onChange,
  label,
}: {
  mode: TransactionCategoryMode
  onChange: (mode: TransactionCategoryMode) => void
  label: string
}) {
  return (
    <div className="segmented-control transaction-settings-mode-tabs" role="tablist" aria-label={label}>
      {TRANSACTION_CATEGORY_MODES.map((item) => (
        <button
          key={item}
          type="button"
          role="tab"
          aria-selected={mode === item}
          onClick={() => onChange(item)}
        >
          {modeLabel(item)}
        </button>
      ))}
    </div>
  )
}

function SequenceEditor({ setting }: { setting: TransactionSequenceSetting }) {
  const { demoMode, workspace } = useApp()
  const queryClient = useQueryClient()
  const [autoGenerate, setAutoGenerate] = useState(setting.autoGenerate)
  const [nextNumber, setNextNumber] = useState(String(setting.nextNumber))
  const [minimumDigits, setMinimumDigits] = useState(
    String(setting.minimumDigits),
  )
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setAutoGenerate(setting.autoGenerate)
    setNextNumber(String(setting.nextNumber))
    setMinimumDigits(String(setting.minimumDigits))
    setValidationError(null)
    setSaved(false)
  }, [setting])

  const mutation = useMutation({
    mutationFn: (body: SequenceUpdateBody) =>
      demoMode
        ? Promise.resolve({
            ...setting,
            ...body,
            preview: transactionSequencePreview(
              body.nextNumber,
              body.minimumDigits,
            ),
            minimumAvailableNextNumber: Math.max(
              setting.minimumAvailableNextNumber,
              body.nextNumber,
            ),
          })
        : api.patch<TransactionSequenceSetting, SequenceUpdateBody>(
            `/workspaces/${encodeURIComponent(workspace.id)}/transaction-sequences/${setting.transactionType}`,
            body,
          ),
    onSuccess: (updated) => {
      queryClient.setQueryData<TransactionSequenceSetting[]>(
        transactionSequenceQueryKey(workspace.id),
        (current = []) =>
          current.map((item) =>
            item.transactionType === updated.transactionType ? updated : item,
          ),
      )
      if (!demoMode) {
        void queryClient.invalidateQueries({
          queryKey: transactionSequenceQueryKey(workspace.id),
        })
      }
      setSaved(true)
    },
  })

  const parsedNext = Number(nextNumber)
  const parsedDigits = Number(minimumDigits)
  const preview = transactionSequencePreview(parsedNext, parsedDigits)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSaved(false)
    if (
      !Number.isSafeInteger(parsedNext) ||
      parsedNext < setting.minimumAvailableNextNumber
    ) {
      setValidationError(
        `Next number must be a whole number of at least ${setting.minimumAvailableNextNumber}.`,
      )
      return
    }
    if (!Number.isInteger(parsedDigits) || parsedDigits < 1 || parsedDigits > 18) {
      setValidationError('Minimum digits must be a whole number from 1 to 18.')
      return
    }
    setValidationError(null)
    mutation.mutate(
      sequenceUpdateBody(autoGenerate, parsedNext, parsedDigits),
    )
  }

  return (
    <form className="transaction-sequence-card" onSubmit={submit}>
      <SettingToggle
        icon={<Hash aria-hidden="true" />}
        title="Auto Generate"
        description="Assign the next available numeric ID when a transaction is saved."
        checked={autoGenerate}
        onChange={(checked) => {
          setAutoGenerate(checked)
          setSaved(false)
        }}
        disabled={mutation.isPending}
      />
      <div className="transaction-sequence-fields">
        <Field
          label="Next number"
          hint={`Already-used IDs require ${setting.minimumAvailableNextNumber} or higher.`}
        >
          <input
            type="number"
            inputMode="numeric"
            min={setting.minimumAvailableNextNumber}
            step="1"
            value={nextNumber}
            disabled={mutation.isPending}
            onChange={(event) => {
              setNextNumber(event.target.value)
              setSaved(false)
              setValidationError(null)
            }}
          />
        </Field>
        <Field label="Minimum digits" hint="Adds leading zeroes only; no prefix is used.">
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="18"
            step="1"
            value={minimumDigits}
            disabled={mutation.isPending}
            onChange={(event) => {
              setMinimumDigits(event.target.value)
              setSaved(false)
              setValidationError(null)
            }}
          />
        </Field>
      </div>
      <div className="transaction-sequence-preview" aria-live="polite">
        <span>Live preview</span>
        <strong>{preview}</strong>
      </div>
      {validationError ? (
        <p className="field-error" role="alert">{validationError}</p>
      ) : null}
      {mutation.error ? (
        <p className="field-error" role="alert">
          {apiErrorMessage(
            mutation.error,
            'Sequence settings could not be saved. Try again.',
          )}
        </p>
      ) : null}
      {saved ? (
        <p className="settings-success" role="status">
          {demoMode
            ? 'Sequence updated for this demo session.'
            : 'Sequence settings saved.'}
        </p>
      ) : null}
      <div className="settings-form-actions">
        <Button type="submit" loading={mutation.isPending}>
          Save sequence
        </Button>
      </div>
    </form>
  )
}

function CategoryEditor({
  mode,
  category,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  mode: TransactionCategoryMode
  category: TransactionCategory | null
  busy: boolean
  error: string | null
  onCancel: () => void
  onSubmit: (values: CategoryFormValues) => void
}) {
  const [values, setValues] = useState<CategoryFormValues>(EMPTY_CATEGORY_FORM)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    setValues(
      category
        ? {
            name: category.name,
            description: category.description ?? '',
            icon: category.icon ?? '',
            color: category.color ?? '',
          }
        : EMPTY_CATEGORY_FORM,
    )
    setValidationError(null)
  }, [category, mode])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!values.name.trim()) {
      setValidationError('Enter a category name.')
      return
    }
    setValidationError(null)
    onSubmit(values)
  }

  return (
    <form className="transaction-category-form" onSubmit={submit}>
      <div className="transaction-category-form-heading">
        <div>
          <strong>{category ? `Edit ${category.name}` : `Add ${modeLabel(mode)} category`}</strong>
          <span>Only the name is required.</span>
        </div>
        {category ? (
          <Button type="button" variant="quiet" onClick={onCancel} disabled={busy}>
            Cancel edit
          </Button>
        ) : null}
      </div>
      <Field label="Name" error={validationError ?? undefined}>
        <input
          maxLength={100}
          value={values.name}
          disabled={busy}
          onChange={(event) => {
            setValues((current) => ({ ...current, name: event.target.value }))
            setValidationError(null)
          }}
        />
      </Field>
      <div className="transaction-category-optional-fields">
        <Field label="Description">
          <input
            maxLength={240}
            value={values.description}
            disabled={busy}
            placeholder="Optional"
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </Field>
        <Field label="Icon">
          <input
            maxLength={80}
            value={values.icon}
            disabled={busy}
            placeholder="Optional icon name"
            onChange={(event) =>
              setValues((current) => ({ ...current, icon: event.target.value }))
            }
          />
        </Field>
        <Field label="Color">
          <input
            maxLength={40}
            value={values.color}
            disabled={busy}
            placeholder="#536d52"
            onChange={(event) =>
              setValues((current) => ({ ...current, color: event.target.value }))
            }
          />
        </Field>
      </div>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <div className="settings-form-actions">
        <Button type="submit" loading={busy}>
          {category ? 'Save category' : 'Add category'}
        </Button>
      </div>
    </form>
  )
}

function CategoriesEditor({ mode }: { mode: TransactionCategoryMode }) {
  const { demoMode, workspace } = useApp()
  const queryClient = useQueryClient()
  const query = useTransactionCategories(mode)
  const categories = useMemo(
    () => orderedTransactionCategories(query.data ?? []),
    [query.data],
  )
  const [editing, setEditing] = useState<TransactionCategory | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TransactionCategory | null>(null)
  const [replacementId, setReplacementId] = useState('')

  useEffect(() => {
    setEditing(null)
    setDeleteTarget(null)
    setReplacementId('')
  }, [mode])

  const key = transactionCategoryQueryKey(workspace.id, mode)
  const replaceDemoCategories = (
    update: (current: TransactionCategory[]) => TransactionCategory[],
  ) => queryClient.setQueryData<TransactionCategory[]>(key, (current = []) => update(current))
  const refresh = () => {
    if (!demoMode) {
      void queryClient.invalidateQueries({
        queryKey: transactionCategoryQueryKey(workspace.id),
      })
    }
  }

  const writeMutation = useMutation({
    mutationFn: ({
      category,
      values,
    }: {
      category: TransactionCategory | null
      values: CategoryFormValues
    }) => {
      const body = categoryWriteBody(values)
      if (demoMode) {
        const updated: TransactionCategory = category
          ? { ...category, ...body }
          : {
              id: `demo-${mode}-${Date.now()}`,
              transactionType: mode,
              ...body,
              sortOrder: categories.length,
              isActive: true,
              usageCount: 0,
            }
        replaceDemoCategories((current) =>
          category
            ? current.map((item) => (item.id === category.id ? updated : item))
            : [...current, updated],
        )
        return Promise.resolve(updated)
      }
      return category
        ? api.patch<TransactionCategory, CategoryWriteBody>(
            `/workspaces/${encodeURIComponent(workspace.id)}/transaction-categories/${encodeURIComponent(category.id)}`,
            body,
          )
        : api.post<TransactionCategory, CategoryWriteBody & { transactionType: TransactionCategoryMode }>(
            `/workspaces/${encodeURIComponent(workspace.id)}/transaction-categories`,
            { transactionType: mode, ...body },
          )
    },
    onSuccess: (_updated, variables) => {
      setEditing(null)
      refresh()
      if (!demoMode && variables.category) {
        void invalidatePeriodReviewQueries(queryClient, workspace.id)
      }
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (category: TransactionCategory) => {
      const isActive = !category.isActive
      if (demoMode) {
        replaceDemoCategories((current) =>
          current.map((item) =>
            item.id === category.id ? { ...item, isActive } : item,
          ),
        )
        return Promise.resolve()
      }
      return api.patch<unknown, { isActive: boolean }>(
        `/workspaces/${encodeURIComponent(workspace.id)}/transaction-categories/${encodeURIComponent(category.id)}`,
        { isActive },
      )
    },
    onSuccess: refresh,
  })

  const reorderMutation = useMutation({
    mutationFn: (ordered: TransactionCategory[]) => {
      const categoryIds = ordered.map((category) => category.id)
      if (demoMode) {
        replaceDemoCategories(() =>
          ordered.map((category, sortOrder) => ({ ...category, sortOrder })),
        )
        return Promise.resolve()
      }
      return api.post<unknown, { transactionType: TransactionCategoryMode; categoryIds: string[] }>(
        `/workspaces/${encodeURIComponent(workspace.id)}/transaction-categories/reorder`,
        { transactionType: mode, categoryIds },
      )
    },
    onSuccess: refresh,
  })

  const deleteMutation = useMutation({
    mutationFn: ({
      category,
      replacementCategoryId,
    }: {
      category: TransactionCategory
      replacementCategoryId?: string
    }) => {
      if (demoMode) {
        replaceDemoCategories((current) =>
          current.filter((item) => item.id !== category.id),
        )
        return Promise.resolve()
      }
      const replacement = replacementCategoryId
        ? `?replacementCategoryId=${encodeURIComponent(replacementCategoryId)}`
        : ''
      return api.delete<void>(
        `/workspaces/${encodeURIComponent(workspace.id)}/transaction-categories/${encodeURIComponent(category.id)}${replacement}`,
      )
    },
    onSuccess: () => {
      setDeleteTarget(null)
      setReplacementId('')
      refresh()
      if (!demoMode) {
        void invalidatePeriodReviewQueries(queryClient, workspace.id)
      }
    },
  })

  const editorError = writeMutation.error
    ? apiErrorMessage(
        writeMutation.error,
        'Category could not be saved. Check for a duplicate name and try again.',
      )
    : null
  const rowError = toggleMutation.error || reorderMutation.error
    ? apiErrorMessage(
        toggleMutation.error ?? reorderMutation.error,
        'The category list could not be updated. Try again.',
      )
    : null
  const rowBusy = toggleMutation.isPending || reorderMutation.isPending

  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= categories.length || rowBusy) return
    const ordered = [...categories]
    const [category] = ordered.splice(index, 1)
    ordered.splice(nextIndex, 0, category)
    reorderMutation.mutate(ordered)
  }

  const replacementOptions = categories.filter(
    (category) =>
      category.id !== deleteTarget?.id && category.isActive,
  )
  const used = (deleteTarget?.usageCount ?? 0) > 0

  return (
    <div className="transaction-categories-editor">
      <CategoryEditor
        mode={mode}
        category={editing}
        busy={writeMutation.isPending}
        error={editorError}
        onCancel={() => {
          setEditing(null)
          writeMutation.reset()
        }}
        onSubmit={(values) => writeMutation.mutate({ category: editing, values })}
      />
      {query.isLoading ? (
        <p className="settings-inline-status" role="status">Loading categories…</p>
      ) : query.isError ? (
        <div className="transaction-category-query-error" role="alert">
          <span>Categories could not be loaded.</span>
          <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : categories.length ? (
        <ol className="transaction-category-list" aria-label={`${modeLabel(mode)} categories`}>
          {categories.map((category, index) => (
            <li key={category.id}>
              <div className="transaction-category-row-copy">
                <strong>{category.name}</strong>
                <span>
                  {category.usageCount ?? 0} {(category.usageCount ?? 0) === 1 ? 'use' : 'uses'}
                  {category.description ? ` · ${category.description}` : ''}
                </span>
              </div>
              {!category.isActive ? <Badge>Disabled</Badge> : null}
              <div className="transaction-category-row-actions">
                <Button
                  type="button"
                  variant="quiet"
                  aria-label={`Move ${category.name} up`}
                  disabled={index === 0 || rowBusy}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  aria-label={`Move ${category.name} down`}
                  disabled={index === categories.length - 1 || rowBusy}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  aria-label={`Edit ${category.name}`}
                  disabled={rowBusy}
                  onClick={() => {
                    writeMutation.reset()
                    setEditing(category)
                  }}
                >
                  <Pencil aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  disabled={rowBusy}
                  onClick={() => toggleMutation.mutate(category)}
                >
                  {category.isActive ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  aria-label={`Delete ${category.name}`}
                  disabled={rowBusy}
                  onClick={() => {
                    deleteMutation.reset()
                    setReplacementId('')
                    setDeleteTarget(category)
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="transaction-category-empty">
          <Tags aria-hidden="true" />
          <span>No categories yet. Add the first one above.</span>
        </div>
      )}
      {rowError ? <p className="field-error" role="alert">{rowError}</p> : null}
      <Dialog
        open={Boolean(deleteTarget)}
        title={used ? 'Replace or disable category' : 'Delete category'}
        description={
          used
            ? `${deleteTarget?.name ?? 'This category'} is used by ${deleteTarget?.usageCount ?? 0} transactions.`
            : `${deleteTarget?.name ?? 'This category'} is unused and can be deleted.`
        }
        onClose={deleteMutation.isPending ? () => undefined : () => setDeleteTarget(null)}
      >
        <div className="transaction-category-delete-dialog">
          {used ? (
            <Field label="Replacement category" hint="Historical transactions will move to this category before deletion.">
              <Select value={replacementId} onValueChange={setReplacementId}>
                <SelectTrigger className="w-full" data-field-control>
                  <SelectValue placeholder="Choose replacement" />
                </SelectTrigger>
                <SelectContent>
                  {replacementOptions.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          {deleteMutation.error ? (
            <p className="field-error" role="alert">
              {apiErrorMessage(
                deleteMutation.error,
                'Category could not be deleted. Try again.',
              )}
            </p>
          ) : null}
          <div className="dialog-actions">
            {used && deleteTarget?.isActive ? (
              <Button
                type="button"
                variant="secondary"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  toggleMutation.mutate(deleteTarget)
                  setDeleteTarget(null)
                }}
              >
                Disable instead
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleteMutation.isPending}
              disabled={used && !replacementId}
              onClick={() => {
                if (!deleteTarget) return
                deleteMutation.mutate({
                  category: deleteTarget,
                  replacementCategoryId: replacementId || undefined,
                })
              }}
            >
              <Trash2 aria-hidden="true" />
              {used ? 'Replace and delete' : 'Delete category'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

export function TransactionSettingsSection() {
  const searchParams = new URLSearchParams(window.location.search)
  const requestedArea =
    searchParams.get('transactionSettings') === 'categories'
      ? 'categories'
      : 'sequence'
  const [area, setArea] = useState<'sequence' | 'categories'>(requestedArea)
  const [mode, setMode] = useState<TransactionCategoryMode>('expense')
  const sequenceQuery = useTransactionSequences(area === 'sequence')
  const setting = sequenceQuery.data?.find(
    (candidate) => candidate.transactionType === mode,
  )

  useEffect(() => setArea(requestedArea), [requestedArea])

  return (
    <Section id="settings-5" aria-labelledby="settings-5-title">
      <div className="settings-section-heading">
        <h2 id="settings-5-title">Transactions</h2>
        <p>Control numeric IDs and the categories available in entry forms.</p>
      </div>
      <div className="transaction-settings-content">
        <div className="transaction-settings-area-tabs" role="tablist" aria-label="Transaction settings">
          <button
            type="button"
            role="tab"
            aria-selected={area === 'sequence'}
            onClick={() => setArea('sequence')}
          >
            <Hash aria-hidden="true" />
            ID &amp; Sequence
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={area === 'categories'}
            onClick={() => setArea('categories')}
          >
            <Tags aria-hidden="true" />
            Categories
          </button>
        </div>
        <ModeTabs
          mode={mode}
          onChange={setMode}
          label={`${area === 'sequence' ? 'Sequence' : 'Category'} transaction type`}
        />
        {area === 'sequence' ? (
          sequenceQuery.isLoading ? (
            <p className="settings-inline-status" role="status">Loading sequence settings…</p>
          ) : sequenceQuery.isError ? (
            <div className="transaction-category-query-error" role="alert">
              <span>Sequence settings could not be loaded.</span>
              <Button type="button" variant="secondary" onClick={() => void sequenceQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : setting ? (
            <SequenceEditor key={setting.transactionType} setting={setting} />
          ) : (
            <p className="field-error" role="alert">This sequence setting is unavailable.</p>
          )
        ) : (
          <CategoriesEditor mode={mode} />
        )}
      </div>
    </Section>
  )
}
