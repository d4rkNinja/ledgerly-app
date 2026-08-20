import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { HelpPage } from './more-help'

const externalLinkMocks = vi.hoisted(() => ({
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/platform/external-links', () => externalLinkMocks)

function renderHelpPage() {
  return render(
    <MemoryRouter>
      <HelpPage />
    </MemoryRouter>,
  )
}

describe('HelpPage', () => {
  beforeAll(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  beforeEach(() => {
    externalLinkMocks.openExternalUrl.mockClear()
  })

  afterEach(cleanup)

  it('filters connected help destinations without hiding the search control', async () => {
    const user = userEvent.setup()
    renderHelpPage()

    const search = screen.getByRole('searchbox', { name: 'Search help topics' })
    expect(search).toBeEnabled()

    await user.type(search, 'claims')

    expect(screen.getByRole('heading', { name: 'Office claims' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Privacy and security' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open guide/i })).toHaveAttribute(
      'href',
      '/app/office',
    )
  })

  it('opens the documented support channel', async () => {
    const user = userEvent.setup()
    renderHelpPage()

    await user.click(screen.getByRole('button', { name: 'Open support discussions' }))

    expect(externalLinkMocks.openExternalUrl).toHaveBeenCalledExactlyOnceWith(
      'https://github.com/d4rkNinja/ledgerly-app/discussions',
    )
  })
})
