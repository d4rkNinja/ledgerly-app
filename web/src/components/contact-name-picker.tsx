import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Bookmark, NotebookTabs, UserRound } from 'lucide-react'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import type { Contact, SavedTransactionName } from '@/domain/types'
import { matchesSearchText, normalizeSearchText } from '@/lib/search'
import {
  CONTACT_PICKER_MENU_MAX_HEIGHT,
  getContactPickerMenuLayout,
  type ContactPickerMenuPlacement,
} from './contact-name-picker-layout'

type ContactNamePickerProps = {
  contacts: Contact[]
  savedNames: SavedTransactionName[]
  isLoading?: boolean
  isError?: boolean
  inputValue: string
  onInputChange: (value: string) => void
  onContactSelect: (contact: Contact) => void
  onSavedNameSelect: (name: SavedTransactionName) => void
  inputAriaLabel?: string
  inputPlaceholder?: string
  openOnFocus?: boolean
  disabled?: boolean
}

type Suggestion =
  | { kind: 'contact'; item: Contact }
  | { kind: 'saved-name'; item: SavedTransactionName }

const CLIPPING_OVERFLOW = /^(auto|clip|hidden|scroll)$/u

function contactDetails(contact: Contact) {
  return [contact.phone, contact.email].filter(Boolean).join(' · ') || 'No contact details'
}

function getVisibleBounds(trigger: HTMLElement) {
  const viewport = window.visualViewport
  let top = viewport?.offsetTop ?? 0
  let bottom = top + (viewport?.height ?? window.innerHeight)

  let ancestor = trigger.parentElement
  while (ancestor) {
    const style = window.getComputedStyle(ancestor)
    if (
      CLIPPING_OVERFLOW.test(style.overflowY) ||
      CLIPPING_OVERFLOW.test(style.overflow)
    ) {
      const rect = ancestor.getBoundingClientRect()
      if (rect.height > 0) {
        top = Math.max(top, rect.top)
        bottom = Math.min(bottom, rect.bottom)
      }
    }
    ancestor = ancestor.parentElement
  }

  return { top, bottom: Math.max(top, bottom) }
}

function suggestionId(menuId: string, suggestion: Suggestion) {
  return `${menuId}-${suggestion.kind}-${suggestion.item.id}`.replace(/[^A-Za-z0-9_-]/g, '-')
}

export function ContactNamePicker({
  contacts,
  savedNames,
  isLoading = false,
  isError = false,
  inputValue,
  onInputChange,
  onContactSelect,
  onSavedNameSelect,
  inputAriaLabel,
  inputPlaceholder = 'City Supermarket',
  openOnFocus = false,
  disabled = false,
}: ContactNamePickerProps) {
  const reduce = useReducedMotion()
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [placement, setPlacement] = useState<ContactPickerMenuPlacement>('bottom')
  const [maxHeight, setMaxHeight] = useState(CONTACT_PICKER_MENU_MAX_HEIGHT)
  const normalizedQuery = normalizeSearchText(inputValue)
  const visibleContacts = contacts.filter((contact) =>
    // Search the contact's name only. Phone numbers and email addresses are
    // display details, not searchable identity fields.
    matchesSearchText([contact.name], inputValue),
  )
  const visibleSavedNames = savedNames.filter((name) =>
    matchesSearchText([name.name], inputValue),
  )
  const suggestions: Suggestion[] = [
    ...visibleContacts.map((item) => ({ kind: 'contact' as const, item })),
    ...visibleSavedNames.map((item) => ({ kind: 'saved-name' as const, item })),
  ]
  const menuOpen = open && !disabled

  useEffect(() => {
    setActiveIndex(menuOpen && suggestions.length ? 0 : -1)
  }, [menuOpen, normalizedQuery, suggestions.length])

  useLayoutEffect(() => {
    if (!menuOpen) return
    const trigger = inputRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return

    const measure = () => {
      const rect = trigger.getBoundingClientRect()
      const layout = getContactPickerMenuLayout(
        rect,
        getVisibleBounds(trigger),
      )
      setPlacement(layout.placement)
      setMaxHeight(layout.maxHeight)
    }

    measure()
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure)
    observer?.observe(trigger)
    observer?.observe(menu)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    window.visualViewport?.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('scroll', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      window.visualViewport?.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('scroll', measure)
    }
  }, [menuOpen, normalizedQuery, suggestions.length])

  const close = () => {
    setOpen(false)
    setActiveIndex(-1)
  }

  const selectSuggestion = (suggestion: Suggestion) => {
    if (suggestion.kind === 'contact') {
      onContactSelect(suggestion.item)
    } else {
      onSavedNameSelect(suggestion.item)
    }
    close()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      close()
      return
    }

    if (event.key === 'ArrowDown') {
      if (!menuOpen) {
        setOpen(true)
        return
      }
      event.preventDefault()
      if (suggestions.length) {
        setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1))
      }
      return
    }

    if (event.key === 'ArrowUp' && menuOpen) {
      event.preventDefault()
      if (suggestions.length) {
        setActiveIndex((index) => Math.max(index - 1, 0))
      }
      return
    }

    if (event.key === 'Enter' && menuOpen && activeIndex >= 0) {
      const active = suggestions[activeIndex]
      if (!active) return
      event.preventDefault()
      selectSuggestion(active)
    }
  }

  const handleFocusLeave = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return
    }
    close()
  }

  return (
    <div
      ref={rootRef}
      className="contact-picker-field"
      data-open={menuOpen || undefined}
      onBlur={handleFocusLeave}
    >
      <input
        ref={inputRef}
        value={inputValue}
        aria-label={inputAriaLabel}
        aria-autocomplete="list"
        aria-controls={menuOpen ? menuId : undefined}
        aria-expanded={menuOpen}
        aria-activedescendant={
          menuOpen && activeIndex >= 0 && suggestions[activeIndex]
            ? suggestionId(menuId, suggestions[activeIndex])
            : undefined
        }
        role="combobox"
        onFocus={() => {
          if (openOnFocus || normalizedQuery) setOpen(true)
        }}
        onChange={(event) => {
          onInputChange(event.target.value)
          setOpen(true)
        }}
        onKeyDown={handleKeyDown}
        placeholder={inputPlaceholder}
        disabled={disabled}
      />
      <button
        type="button"
        className="contact-picker-trigger"
        aria-label="Choose a contact or saved transaction name"
        title="Choose a contact or saved transaction name"
        aria-controls={menuOpen ? menuId : undefined}
        aria-expanded={menuOpen}
        disabled={disabled}
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => {
          setOpen((current) => !current)
          inputRef.current?.focus({ preventScroll: true })
        }}
      >
        <NotebookTabs aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {menuOpen ? (
          <motion.div
            ref={menuRef}
            id={menuId}
            className="contact-picker-menu"
            data-placement={placement}
            data-state="open"
            role="presentation"
            style={{ maxHeight: `${maxHeight}px` }}
            initial={
              reduce
                ? false
                : { opacity: 0, y: placement === 'bottom' ? -4 : 4, scale: 0.985 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduce
                ? undefined
                : { opacity: 0, y: placement === 'bottom' ? -3 : 3, scale: 0.99 }
            }
            transition={
              reduce
                ? { duration: 0 }
                : { type: 'spring', duration: 0.3, bounce: 0 }
            }
          >
            {isLoading ? (
              <p className="contact-picker-status" role="status">
                Loading contacts…
              </p>
            ) : isError ? (
              <p className="contact-picker-status contact-picker-status-error" role="alert">
                Contacts could not be loaded.
              </p>
            ) : (
              <div
                className="contact-picker-list"
                role="listbox"
                aria-label="Contacts and saved names"
              >
                {visibleContacts.length ? (
                  <div className="contact-picker-group">
                    <p className="contact-picker-group-label">Contacts</p>
                    {visibleContacts.map((contact, index) => {
                      const suggestion: Suggestion = { kind: 'contact', item: contact }
                      return (
                        <button
                          type="button"
                          role="option"
                          id={suggestionId(menuId, suggestion)}
                          aria-selected={inputValue === contact.name}
                          data-active={activeIndex === index || undefined}
                          className="contact-picker-option"
                          key={contact.id}
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => selectSuggestion(suggestion)}
                        >
                          <span className="contact-picker-option-icon" aria-hidden="true">
                            <UserRound />
                          </span>
                          <span className="contact-picker-option-copy">
                            <strong>{contact.name}</strong>
                            <small>{contactDetails(contact)}</small>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                {visibleSavedNames.length ? (
                  <div className="contact-picker-group">
                    <p className="contact-picker-group-label">Saved names</p>
                    {visibleSavedNames.map((name, index) => {
                      const suggestion: Suggestion = { kind: 'saved-name', item: name }
                      return (
                        <button
                          type="button"
                          role="option"
                          id={suggestionId(menuId, suggestion)}
                          aria-selected={inputValue === name.name}
                          data-active={
                            activeIndex === visibleContacts.length + index || undefined
                          }
                          className="contact-picker-option"
                          key={name.id}
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => selectSuggestion(suggestion)}
                        >
                          <span className="contact-picker-option-icon" aria-hidden="true">
                            <Bookmark />
                          </span>
                          <span className="contact-picker-option-copy">
                            <strong>{name.name}</strong>
                            <small>Saved transaction name</small>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                {!suggestions.length ? (
                  <p className="contact-picker-status">
                    {normalizedQuery
                      ? 'No matching contacts or saved names.'
                      : 'No contacts or saved names yet.'}
                  </p>
                ) : null}
              </div>
            )}
            <a className="contact-picker-manage" href="/app/contacts" onClick={close}>
              Manage contacts
              <ArrowRight aria-hidden="true" />
            </a>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
