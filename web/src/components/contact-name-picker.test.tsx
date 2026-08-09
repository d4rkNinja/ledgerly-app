import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ContactNamePicker } from './contact-name-picker'
import { getContactPickerMenuLayout } from './contact-name-picker-layout'
import type { Contact, SavedTransactionName } from '@/domain/types'

const contact: Contact = {
  id: 'contact-1',
  name: 'Asha Sharma',
  phone: '+91 98765 43210',
  email: 'asha@example.com',
  notes: 'Primary contact',
  createdBy: 'user-1',
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
}

const savedName: SavedTransactionName = {
  id: 'name-1',
  name: 'Monthly rent',
  createdBy: 'user-1',
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
}

function renderPicker() {
  const onContactSelect = vi.fn()
  const onSavedNameSelect = vi.fn()

  function ControlledPicker() {
    const [inputValue, setInputValue] = useState('')
    return (
      <ContactNamePicker
        inputValue={inputValue}
        inputAriaLabel="Name or description"
        contacts={[contact]}
        savedNames={[savedName]}
        onInputChange={setInputValue}
        onContactSelect={onContactSelect}
        onSavedNameSelect={onSavedNameSelect}
      />
    )
  }

  render(<ControlledPicker />)
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Choose a contact or saved transaction name',
    }),
  )
  return { onContactSelect, onSavedNameSelect }
}

function renderTypingPicker() {
  function ControlledPicker() {
    const [inputValue, setInputValue] = useState('')
    return (
      <ContactNamePicker
        inputValue={inputValue}
        inputAriaLabel="Name or description"
        contacts={[contact]}
        savedNames={[savedName]}
        onInputChange={setInputValue}
        onContactSelect={vi.fn()}
        onSavedNameSelect={vi.fn()}
      />
    )
  }

  render(<ControlledPicker />)
}

describe('ContactNamePicker', () => {
  beforeAll(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    cleanup()
  })

  it('searches contacts and selects one from the notebook popover', () => {
    const { onContactSelect } = renderPicker()
    const search = screen.getByRole('combobox', {
      name: 'Name or description',
    })

    fireEvent.change(search, { target: { value: 'asha' } })
    expect(screen.getByRole('option', { name: /Asha Sharma/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Monthly rent/ })).toBeNull()

    fireEvent.click(screen.getByRole('option', { name: /Asha Sharma/ }))
    expect(onContactSelect).toHaveBeenCalledExactlyOnceWith(contact)
  })

  it('keeps saved transaction names in the same searchable picker', () => {
    const { onSavedNameSelect } = renderPicker()
    const search = screen.getByRole('combobox', {
      name: 'Name or description',
    })

    fireEvent.change(search, { target: { value: 'rent' } })
    fireEvent.click(screen.getByRole('option', { name: /Monthly rent/ }))
    expect(onSavedNameSelect).toHaveBeenCalledExactlyOnceWith(savedName)
  })

  it('shows matching suggestions while a user types any word from a contact name', () => {
    renderTypingPicker()

    fireEvent.change(screen.getByRole('combobox', {
      name: 'Name or description',
    }), { target: { value: 'sharma' } })

    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(screen.getByRole('option', { name: /Asha Sharma/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Monthly rent/ })).toBeNull()
  })

  it('does not search contacts by phone number or email address', () => {
    renderTypingPicker()
    const search = screen.getByRole('combobox', {
      name: 'Name or description',
    })

    fireEvent.change(search, { target: { value: '98765' } })
    expect(screen.queryByRole('option', { name: /Asha Sharma/ })).toBeNull()

    fireEvent.change(search, { target: { value: 'asha@example.com' } })
    expect(screen.queryByRole('option', { name: /Asha Sharma/ })).toBeNull()

    fireEvent.change(search, { target: { value: 'asha' } })
    expect(screen.getByRole('option', { name: /Asha Sharma/ })).toBeTruthy()
  })

  it('keeps the typed suggestions available to keyboard selection', () => {
    const { onContactSelect } = renderPicker()
    const input = screen.getByRole('combobox', {
      name: 'Name or description',
    })

    fireEvent.change(input, { target: { value: 'asha' } })
    expect(input).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onContactSelect).toHaveBeenCalledExactlyOnceWith(contact)
  })

  it('keeps enough vertical room when loading suggestions become available', () => {
    expect(
      getContactPickerMenuLayout(
        { top: 240, bottom: 290, width: 378, height: 50 },
        { top: 92, bottom: 869 },
      ),
    ).toEqual({ placement: 'bottom', maxHeight: 288 })
  })
})
