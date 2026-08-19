import { useQueryClient } from '@tanstack/react-query'
import {
  Bookmark,
  Plus,
  UserRound,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { useApp } from '@/app/app-state'
import { Button, EmptyState, ErrorState, Field, PageHeader, Dialog } from '@/components/ui'
import {
  contacts as demoContacts,
  savedTransactionNames as demoSavedTransactionNames,
} from '@/domain/demo-data'
import type { Contact, SavedTransactionName } from '@/domain/types'
import { ApiError, api } from '@/lib/api-client'
import {
  addDemoSessionItem,
  createDemoId,
  removeDemoSessionItem,
  updateDemoSessionItem,
  useDemoSessionCollection,
} from '../finance-writes'
import { hasWorkspacePermission, useFinanceData } from './data'
import { RecordActionDrawer } from './record-action-drawer'
import { DataSkeleton, InfoNotice, PageFrame } from './shared'

type ContactInput = {
  name: string
  phone: string
  email: string
  notes: string
}
type ContactEditor =
  | { mode: 'create' }
  | { mode: 'edit'; item: Contact }
  | null
type SavedNameEditor =
  | { mode: 'create' }
  | { mode: 'edit'; item: SavedTransactionName }
  | null

const emptyContact: ContactInput = {
  name: '',
  phone: '',
  email: '',
  notes: '',
}

function contactInput(item?: Contact): ContactInput {
  return item
    ? {
        name: item.name,
        phone: item.phone ?? '',
        email: item.email ?? '',
        notes: item.notes ?? '',
      }
    : { ...emptyContact }
}

function contactDetails(contact: Contact) {
  return [contact.phone, contact.email].filter(Boolean).join(' · ') || 'No phone or email'
}

function savedNameDetails(name: SavedTransactionName) {
  return `Saved transaction name · Updated ${formatUpdatedAt(name.updatedAt)}`
}

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'recently'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function messageForError(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

async function refreshDirectoryData(
  queryClient: ReturnType<typeof useQueryClient>,
  workspaceId: string,
  key: 'contacts' | 'saved-transaction-names',
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [key, workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['transactions', workspaceId] }),
  ])
}

function DirectoryCard({
  index,
  item,
  kind,
  onOpen,
}: {
  index: number
  item: Contact | SavedTransactionName
  kind: 'contact' | 'saved-name'
  onOpen: () => void
}) {
  const reduce = useReducedMotion()
  const isContact = kind === 'contact'
  const contact = isContact ? item as Contact : undefined
  const savedName = !isContact ? item as SavedTransactionName : undefined
  const title = item.name
  const subtitle = contact ? contactDetails(contact) : savedNameDetails(savedName!)

  return (
    <motion.button
      type="button"
      className="directory-card"
      aria-label={`View details for ${title}`}
      onClick={onOpen}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce ? 0 : 0.28,
        delay: reduce ? 0 : Math.min(index * 0.045, 0.2),
        ease: [0.16, 1, 0.3, 1],
      }}
      whileTap={reduce ? undefined : { scale: 0.96 }}
    >
      <span className="directory-card-header">
        <span className="directory-card-symbol" aria-hidden="true">
          {isContact ? <UserRound /> : <Bookmark />}
        </span>
        <span className="directory-card-kind">
          {isContact ? 'Contact' : 'Saved name'}
        </span>
      </span>
      <span className="directory-card-copy">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      {contact?.notes ? (
        <span className="directory-card-note">{contact.notes}</span>
      ) : (
        <span className="directory-card-note directory-card-note-empty">
          {isContact ? 'No note added' : 'Use this label in new entries'}
        </span>
      )}
    </motion.button>
  )
}

function AddDirectoryCard({
  label,
  description,
  onClick,
}: {
  label: string
  description: string
  onClick: () => void
}) {
  const reduce = useReducedMotion()
  return (
    <motion.button
      type="button"
      className="directory-add-card"
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.96 }}
    >
      <span aria-hidden="true"><Plus /></span>
      <strong>{label}</strong>
      <small>{description}</small>
    </motion.button>
  )
}

function ContactEditorDialog({
  editor,
  draft,
  error,
  saving,
  onClose,
  onDraftChange,
  onSubmit,
}: {
  editor: ContactEditor
  draft: ContactInput
  error: string | null
  saving: boolean
  onClose: () => void
  onDraftChange: (update: Partial<ContactInput>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const editing = editor?.mode === 'edit'
  return (
    <Dialog
      open={editor !== null}
      title={editing ? 'Edit contact' : 'Add contact'}
      description="Reusable contacts are shared with people in this workspace."
      onClose={saving ? () => undefined : onClose}
    >
      <form className="dialog-form" onSubmit={onSubmit}>
        <Field label="Name">
          <input
            autoFocus
            required
            maxLength={120}
            value={draft.name}
            onChange={(event) => onDraftChange({ name: event.target.value })}
          />
        </Field>
        <Field label="Phone" hint="Optional">
          <input
            inputMode="tel"
            maxLength={40}
            value={draft.phone}
            onChange={(event) => onDraftChange({ phone: event.target.value })}
          />
        </Field>
        <Field label="Email" hint="Optional">
          <input
            type="email"
            maxLength={160}
            value={draft.email}
            onChange={(event) => onDraftChange({ email: event.target.value })}
          />
        </Field>
        <Field label="Notes" hint="Optional">
          <textarea
            rows={3}
            maxLength={500}
            value={draft.notes}
            onChange={(event) => onDraftChange({ notes: event.target.value })}
          />
        </Field>
        {error ? <p className="form-alert" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save contact
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function SavedNameEditorDialog({
  editor,
  value,
  error,
  saving,
  onClose,
  onValueChange,
  onSubmit,
}: {
  editor: SavedNameEditor
  value: string
  error: string | null
  saving: boolean
  onClose: () => void
  onValueChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const editing = editor?.mode === 'edit'
  return (
    <Dialog
      open={editor !== null}
      title={editing ? 'Edit saved name' : 'Add saved name'}
      description="Saved names make frequently used transaction labels faster to enter."
      onClose={saving ? () => undefined : onClose}
    >
      <form className="dialog-form" onSubmit={onSubmit}>
        <Field label="Transaction name">
          <input
            autoFocus
            required
            maxLength={160}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
          />
        </Field>
        {error ? <p className="form-alert" role="alert">{error}</p> : null}
        <div className="dialog-actions">
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? 'Save name' : 'Save name'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function ContactsPage() {
  const { demoMode, userId, workspace } = useApp()
  const queryClient = useQueryClient()
  const canView = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'view_transactions',
  )
  const canCreate = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'create_transactions',
  )
  const canEdit = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'edit_all_transactions',
  )
  const query = useFinanceData<Contact[]>(
    'contacts',
    '/contacts',
    demoContacts,
    canView,
  )
  const items = useDemoSessionCollection(
    demoMode,
    workspace.id,
    'contacts',
    query.data ?? [],
  )
  const [selected, setSelected] = useState<Contact | null>(null)
  const [editor, setEditor] = useState<ContactEditor>(null)
  const [draft, setDraft] = useState<ContactInput>({ ...emptyContact })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setError(null)
    setDraft(contactInput())
    setEditor({ mode: 'create' })
  }

  const openEdit = (item: Contact) => {
    setError(null)
    setDraft(contactInput(item))
    setEditor({ mode: 'edit', item })
  }

  const closeEditor = () => {
    if (saving) return
    setEditor(null)
    setError(null)
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editor || saving) return
    const input: ContactInput = {
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      notes: draft.notes.trim(),
    }
    if (!input.name) {
      setError('Enter a contact name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (demoMode) {
        const now = new Date().toISOString()
        if (editor.mode === 'edit') {
          updateDemoSessionItem<Contact>(
            workspace.id,
            'contacts',
            editor.item.id,
            (item) => ({ ...item, ...input, updatedAt: now }),
          )
        } else {
          addDemoSessionItem<Contact>(workspace.id, 'contacts', {
            id: createDemoId('contact'),
            ...input,
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
          })
        }
      } else if (editor.mode === 'edit') {
        await api.patch<Contact, ContactInput>(
          `/workspaces/${workspace.id}/contacts/${editor.item.id}`,
          input,
        )
      } else {
        await api.post<Contact, ContactInput>(
          `/workspaces/${workspace.id}/contacts`,
          input,
        )
      }
      if (!demoMode) {
        await refreshDirectoryData(queryClient, workspace.id, 'contacts')
      }
      setEditor(null)
    } catch (cause) {
      setError(messageForError(cause, 'Could not save this contact.'))
    } finally {
      setSaving(false)
    }
  }

  const deleteSelected = async () => {
    if (!selected) return
    if (demoMode) {
      removeDemoSessionItem(workspace.id, 'contacts', selected.id)
      return
    }
    await api.delete<void>(`/workspaces/${workspace.id}/contacts/${selected.id}`)
    await refreshDirectoryData(queryClient, workspace.id, 'contacts')
  }

  return (
    <PageFrame className="contacts-page directory-page">
      <PageHeader
        title="Contacts"
        description="Reusable people for clearer, faster transaction entries."
        actions={
          canCreate ? (
            <Button type="button" onClick={openCreate}>
              <Plus aria-hidden="true" />
              Add contact
            </Button>
          ) : undefined
        }
      />
      {!canView ? (
        <InfoNotice>
          Your workspace role cannot view contacts.
        </InfoNotice>
      ) : !canCreate ? (
        <InfoNotice>
          Your workspace role can view contacts but cannot create them.
        </InfoNotice>
      ) : null}
      {canView && query.isLoading ? <DataSkeleton /> : null}
      {canView && query.isError ? (
        <ErrorState message="Contacts are unavailable." retry={() => query.refetch()} />
      ) : null}
      {canView && !query.isLoading && !query.isError && !items.length ? (
        <EmptyState
          icon={<UserRound />}
          title="No contacts yet"
          message="Add people you pay, get paid by, or regularly record in this workspace."
          action={
            canCreate ? (
              <Button type="button" onClick={openCreate}>
                <Plus aria-hidden="true" />
                Add contact
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {canView && !query.isLoading && !query.isError && items.length ? (
        <div className="directory-grid">
          {items.map((item, index) => (
            <DirectoryCard
              key={item.id}
              index={index}
              item={item}
              kind="contact"
              onOpen={() => setSelected(item)}
            />
          ))}
          {canCreate ? (
            <AddDirectoryCard
              label="Add another contact"
              description="Keep another reusable person in this workspace"
              onClick={openCreate}
            />
          ) : null}
        </div>
      ) : null}
      <RecordActionDrawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name ?? 'Contact details'}
        description="Review contact details before using a management action."
        details={selected ? [
          { label: 'Phone', value: selected.phone || 'Not provided' },
          { label: 'Email', value: selected.email || 'Not provided' },
          { label: 'Notes', value: selected.notes || 'None' },
          { label: 'Added', value: formatUpdatedAt(selected.createdAt) },
          { label: 'Last updated', value: formatUpdatedAt(selected.updatedAt) },
        ] : []}
        onEdit={canEdit && selected ? () => openEdit(selected) : undefined}
        editLabel="Edit contact"
        canDelete={canEdit}
        deleteLabel="Delete contact"
        deleteDescription="Existing transactions remain unchanged and are not deleted or reassigned. This contact will no longer be selectable for new entries."
        onDelete={deleteSelected}
      />
      <ContactEditorDialog
        editor={editor}
        draft={draft}
        error={error}
        saving={saving}
        onClose={closeEditor}
        onDraftChange={(update) => setDraft((current) => ({ ...current, ...update }))}
        onSubmit={(event) => void save(event)}
      />
    </PageFrame>
  )
}

export function SavedTransactionNamesPage() {
  const { demoMode, userId, workspace } = useApp()
  const queryClient = useQueryClient()
  const canView = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'view_transactions',
  )
  const canCreate = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'create_transactions',
  )
  const canEdit = hasWorkspacePermission(
    demoMode,
    workspace.permissions,
    'edit_all_transactions',
  )
  const query = useFinanceData<SavedTransactionName[]>(
    'saved-transaction-names',
    '/saved-transaction-names',
    demoSavedTransactionNames,
    canView,
  )
  const items = useDemoSessionCollection(
    demoMode,
    workspace.id,
    'saved-transaction-names',
    query.data ?? [],
  )
  const [selected, setSelected] = useState<SavedTransactionName | null>(null)
  const [editor, setEditor] = useState<SavedNameEditor>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setError(null)
    setValue('')
    setEditor({ mode: 'create' })
  }

  const openEdit = (item: SavedTransactionName) => {
    setError(null)
    setValue(item.name)
    setEditor({ mode: 'edit', item })
  }

  const closeEditor = () => {
    if (saving) return
    setEditor(null)
    setError(null)
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editor || saving) return
    const name = value.trim()
    if (!name) {
      setError('Enter a saved name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (demoMode) {
        const now = new Date().toISOString()
        if (editor.mode === 'edit') {
          updateDemoSessionItem<SavedTransactionName>(
            workspace.id,
            'saved-transaction-names',
            editor.item.id,
            (item) => ({ ...item, name, updatedAt: now }),
          )
        } else {
          addDemoSessionItem<SavedTransactionName>(
            workspace.id,
            'saved-transaction-names',
            {
              id: createDemoId('saved-name'),
              name,
              createdBy: userId,
              createdAt: now,
              updatedAt: now,
            },
          )
        }
      } else if (editor.mode === 'edit') {
        await api.patch<SavedTransactionName, { name: string }>(
          `/workspaces/${workspace.id}/saved-transaction-names/${editor.item.id}`,
          { name },
        )
      } else {
        await api.post<SavedTransactionName, { name: string }>(
          `/workspaces/${workspace.id}/saved-transaction-names`,
          { name },
        )
      }
      if (!demoMode) {
        await refreshDirectoryData(
          queryClient,
          workspace.id,
          'saved-transaction-names',
        )
      }
      setEditor(null)
    } catch (cause) {
      setError(messageForError(cause, 'Could not save this name.'))
    } finally {
      setSaving(false)
    }
  }

  const deleteSelected = async () => {
    if (!selected) return
    if (demoMode) {
      removeDemoSessionItem(workspace.id, 'saved-transaction-names', selected.id)
      return
    }
    await api.delete<void>(
      `/workspaces/${workspace.id}/saved-transaction-names/${selected.id}`,
    )
    await refreshDirectoryData(
      queryClient,
      workspace.id,
      'saved-transaction-names',
    )
  }

  return (
    <PageFrame className="saved-names-page directory-page">
      <PageHeader
        title="Saved names"
        description="Reusable transaction labels for faster, more consistent entries."
        actions={
          canCreate ? (
            <Button type="button" onClick={openCreate}>
              <Plus aria-hidden="true" />
              Add name
            </Button>
          ) : undefined
        }
      />
      {!canView ? (
        <InfoNotice>
          Your workspace role cannot view saved names.
        </InfoNotice>
      ) : !canCreate ? (
        <InfoNotice>
          Your workspace role can view saved names but cannot create them.
        </InfoNotice>
      ) : null}
      {canView && query.isLoading ? <DataSkeleton /> : null}
      {canView && query.isError ? (
        <ErrorState message="Saved names are unavailable." retry={() => query.refetch()} />
      ) : null}
      {canView && !query.isLoading && !query.isError && !items.length ? (
        <EmptyState
          icon={<Bookmark />}
          title="No saved names yet"
          message="Save common transaction labels so they are quick to select next time."
          action={
            canCreate ? (
              <Button type="button" onClick={openCreate}>
                <Plus aria-hidden="true" />
                Add name
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {canView && !query.isLoading && !query.isError && items.length ? (
        <div className="directory-grid">
          {items.map((item, index) => (
            <DirectoryCard
              key={item.id}
              index={index}
              item={item}
              kind="saved-name"
              onOpen={() => setSelected(item)}
            />
          ))}
          {canCreate ? (
            <AddDirectoryCard
              label="Add another saved name"
              description="Keep another common label ready for new entries"
              onClick={openCreate}
            />
          ) : null}
        </div>
      ) : null}
      <RecordActionDrawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name ?? 'Saved name details'}
        description="Review this reusable label before making a change."
        details={selected ? [
          { label: 'Name', value: selected.name },
          { label: 'Added', value: formatUpdatedAt(selected.createdAt) },
          { label: 'Last updated', value: formatUpdatedAt(selected.updatedAt) },
        ] : []}
        onEdit={canEdit && selected ? () => openEdit(selected) : undefined}
        editLabel="Edit saved name"
        canDelete={canEdit}
        deleteLabel="Delete saved name"
        deleteDescription="Existing transactions remain unchanged. Removing this saved name only removes it from the selection list for future entries."
        onDelete={deleteSelected}
      />
      <SavedNameEditorDialog
        editor={editor}
        value={value}
        error={error}
        saving={saving}
        onClose={closeEditor}
        onValueChange={setValue}
        onSubmit={(event) => void save(event)}
      />
    </PageFrame>
  )
}
