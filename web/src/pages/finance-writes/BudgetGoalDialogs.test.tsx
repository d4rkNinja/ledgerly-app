import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppContext, type AppContextValue } from '@/app/app-state'
import { BudgetCreateDialog, GoalCreateDialog } from './BudgetGoalDialogs'

const workspace = {
  id: 'workspace-a',
  name: 'Shared books',
  type: 'family' as const,
  role: 'owner' as const,
  memberCount: 1,
  permissions: [],
}

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function appValue(): AppContextValue {
  return {
    demoMode: true,
    isAuthenticated: true,
    userId: 'owner-a',
    userName: 'Asha Rao',
    workspace,
    availableWorkspaces: [workspace],
    defaultWorkspaceId: workspace.id,
    preferredCurrency: 'INR',
    privacyMode: false,
    theme: 'system',
    resolvedTheme: 'light',
    enterDemo: vi.fn(),
    completeLogin: vi.fn().mockResolvedValue(undefined),
    refreshWorkspaces: vi.fn().mockResolvedValue([workspace]),
    deleteWorkspace: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn(),
    setWorkspace: vi.fn(),
    setDefaultWorkspace: vi.fn(),
    setPrivacyMode: vi.fn(),
    setPreferredCurrency: vi.fn(),
    setTheme: vi.fn(),
  }
}

function renderInApp(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <MotionConfig reducedMotion="always">
      <QueryClientProvider client={client}>
        <AppContext.Provider value={appValue()}>{children}</AppContext.Provider>
      </QueryClientProvider>
    </MotionConfig>,
  )
}

function calendarLabel(day: number) {
  return `Choose ${new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), day)))}`
}

describe('Budget and goal date controls', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('uses calendar controls for budget dates and prevents an end date before the chosen start', async () => {
    const user = userEvent.setup()
    renderInApp(<BudgetCreateDialog open onClose={vi.fn()} />)

    const start = screen.getByRole('button', { name: /start date/i })
    const end = screen.getByRole('button', { name: /end date/i })
    const startPicker = start.closest('.date-picker')
    const endPicker = end.closest('.date-picker')
    expect(startPicker).not.toBeNull()
    expect(endPicker).not.toBeNull()
    expect(document.querySelector('input[type="date"]')).not.toBeInTheDocument()

    await user.click(start)
    await user.click(
      within(startPicker as HTMLElement).getByRole('gridcell', {
        name: calendarLabel(12),
      }),
    )
    await user.click(end)

    expect(
      within(endPicker as HTMLElement).getByRole('gridcell', {
        name: calendarLabel(11),
      }),
    ).toBeDisabled()
  })

  it('uses a labelled BeUI select for goal visibility and a calendar for the optional target date', async () => {
    const user = userEvent.setup()
    renderInApp(<GoalCreateDialog open onClose={vi.fn()} />)

    const visibility = screen.getByRole('button', { name: 'Goal visibility' })
    expect(screen.getByRole('button', { name: /target date/i })).toBeInTheDocument()

    await user.click(visibility)
    await user.click(screen.getByRole('option', { name: 'Private' }))

    expect(visibility).toHaveTextContent('Private')
  })

  it('uses the BeUI checkbox for the budget rollover preference', async () => {
    const user = userEvent.setup()
    renderInApp(<BudgetCreateDialog open onClose={vi.fn()} />)

    const rollover = screen.getByRole('checkbox', {
      name: /roll unused amount forward/i,
    })
    expect(rollover).toHaveAttribute('data-state', 'unchecked')
    expect(document.querySelector('input[type="checkbox"]')).not.toBeInTheDocument()

    await user.click(rollover)
    expect(rollover).toHaveAttribute('aria-checked', 'true')
  })

  it('exposes commitment types and inline contact creation in the goal form', async () => {
    const user = userEvent.setup()
    renderInApp(<GoalCreateDialog open onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Goal type' }))
    await user.click(screen.getByRole('option', { name: 'Custom' }))
    expect(screen.getByLabelText('Custom type label')).toBeInTheDocument()

    const contact = screen.getByRole('combobox', { name: 'Goal contact' })
    await user.type(contact, 'Alex Morgan')
    await user.click(screen.getByRole('button', { name: /create .* as a contact/i }))
    expect(screen.getByRole('heading', { name: 'Create contact' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add to demo' }))
    expect(contact).toHaveValue('Alex Morgan')
  })
})
