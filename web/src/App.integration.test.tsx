import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  configure,
  getConfig,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  type InitialEntry,
  MemoryRouter,
  useLocation,
  useNavigate,
} from 'react-router'
import App from './App'
import { AppProvider } from './app/app-context'
import { publishNetworkState } from './platform/native-app-state'

const originalAsyncUtilTimeout = getConfig().asyncUtilTimeout
const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
)

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverStub implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '0px'
  readonly thresholds = [0]

  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

function LocationProbe() {
  const location = useLocation()

  return (
    <>
      <output aria-label="Current location">
        {location.pathname}
        {location.search}
        {location.hash}
      </output>
      <output aria-label="Current navigation state">
        {JSON.stringify(location.state)}
      </output>
    </>
  )
}

function HistoryBackButton() {
  const navigate = useNavigate()

  return (
    <button type="button" onClick={() => navigate(-1)}>
      History back
    </button>
  )
}

function renderApplication({
  authenticated = false,
  initialEntries,
  initialIndex,
  reducedMotion = 'always',
}: {
  authenticated?: boolean
  initialEntries: InitialEntry[]
  initialIndex?: number
  reducedMotion?: 'always' | 'never' | 'user'
}) {
  if (authenticated) localStorage.setItem('mt-demo', 'true')

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
      mutations: { retry: false },
    },
  })

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={initialEntries}
        initialIndex={initialIndex}
      >
        <MotionConfig reducedMotion={reducedMotion}>
          <AppProvider>
            <App />
          </AppProvider>
          <LocationProbe />
          <HistoryBackButton />
        </MotionConfig>
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return {
    ...view,
    queryClient,
    user: userEvent.setup(),
  }
}

describe('application routes', () => {
  beforeAll(() => {
    configure({ asyncUtilTimeout: 5_000 })
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', (handle: number) =>
      window.clearTimeout(handle),
    )
    vi.stubGlobal('scrollTo', vi.fn())
    HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  beforeEach(() => {
    localStorage.clear()
    publishNetworkState({ connected: true, connectionType: 'unknown' })
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  afterAll(() => {
    configure({ asyncUtilTimeout: originalAsyncUtilTimeout })
    vi.unstubAllGlobals()
    if (originalScrollIntoViewDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        'scrollIntoView',
        originalScrollIntoViewDescriptor,
      )
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    }
  })

  it('redirects an unauthenticated protected route to login', async () => {
    renderApplication({ initialEntries: ['/app/home'] })

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Welcome back',
      }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Current location')).toHaveTextContent(
      '/login',
    )
  })

  it('renders exactly one offline live region from native app state without raw network listeners', async () => {
    publishNetworkState({ connected: false, connectionType: 'none' })
    const addEventListener = vi.spyOn(window, 'addEventListener')

    const { container } = renderApplication({
      authenticated: true,
      initialEntries: ['/app/home'],
    })

    expect(
      await screen.findByText(
        'You are offline. Viewing the last available data.',
      ),
    ).toHaveAttribute('role', 'status')
    expect(
      screen.getAllByText(
        'You are offline. Viewing the last available data.',
      ),
    ).toHaveLength(1)
    expect(container.querySelector('.product-shell')).toHaveClass('is-offline')
    expect(
      addEventListener.mock.calls
        .map(([eventName]) => eventName)
        .filter(
          (eventName) =>
            eventName === 'online' || eventName === 'offline',
        )
        .sort(),
    ).toEqual(['offline', 'online'])
  })
  it('navigates authenticated nested routes through links and history', async () => {
    const { user } = renderApplication({
      authenticated: true,
      initialEntries: ['/app/home'],
    })

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /Good morning/,
      }),
    ).toBeInTheDocument()

    const mainNavigation = screen.getByRole('navigation', {
      name: 'Main navigation',
    })
    const homeLink = within(mainNavigation).getByRole('link', {
      name: 'Home',
    })
    const transactionsLink = within(mainNavigation).getByRole('link', {
      name: 'Transactions',
    })
    expect(homeLink).toHaveAttribute('aria-current', 'page')

    await user.click(
      await screen.findByRole('link', { name: 'View all' }),
    )

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Transactions',
      }),
    ).toBeInTheDocument()
    expect(transactionsLink).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByText('History back'))
    await waitFor(() => {
      expect(screen.getByLabelText('Current location')).toHaveTextContent(
        '/app/home',
      )
      expect(
        screen.queryAllByRole('heading', {
          level: 1,
          name: 'Transactions',
        }),
      ).toHaveLength(0)
    })
    await user.click(
      screen.getAllByRole('button', { name: 'Add transaction' })[0],
    )

    expect(
      await screen.findByRole('dialog', { name: 'Add expense' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Current location')).toHaveTextContent(
      '/app/transactions?add=1',
    )

    await user.click(screen.getByText('History back'))

    await waitFor(() => {
      expect(screen.getByLabelText('Current location')).toHaveTextContent(
        '/app/home',
      )
      expect(
        screen.getAllByRole('heading', {
          level: 1,
          name: /Good morning/,
        }).length,
      ).toBeGreaterThan(0)
    })
  })

  it('removes the previous route when returning home from another tab', async () => {
    const { user } = renderApplication({
      authenticated: true,
      initialEntries: ['/app/home'],
    })

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /Good morning/,
      }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Budgets' }))
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Budgets',
      }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Home' }))

    await waitFor(() => {
      expect(document.querySelectorAll('.route-stage')).toHaveLength(1)
      expect(
        screen.getAllByRole('heading', {
          level: 1,
          name: /Good morning/,
        }),
      ).toHaveLength(1)
      expect(
        screen.queryAllByRole('heading', {
          level: 1,
          name: 'Budgets',
        }),
      ).toHaveLength(0)
    })
  })

  it('keeps the selected tab visible while animation frames are paused', async () => {
    const defaultRequestAnimationFrame = globalThis.requestAnimationFrame
    const queuedFrames: FrameRequestCallback[] = []
    try {
      const { user } = renderApplication({
        authenticated: true,
        initialEntries: ['/app/home'],
        reducedMotion: 'never',
      })

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            level: 1,
            name: /Good morning/,
          }),
        ).toBeVisible()
      })

      vi.stubGlobal(
        'requestAnimationFrame',
        (callback: FrameRequestCallback) => {
          queuedFrames.push(callback)
          return queuedFrames.length
        },
      )
      await user.click(screen.getByRole('link', { name: 'Budgets' }))

      const routeStage = document.querySelector('.route-stage')
      expect(routeStage).toHaveTextContent('Budgets')
      expect(routeStage).toBeVisible()
    } finally {
      vi.stubGlobal('requestAnimationFrame', defaultRequestAnimationFrame)
      queuedFrames
        .splice(0)
        .forEach((callback) => callback(performance.now() + 1_000))
    }
  })

  it('renders the page-not-found route for an unknown URL', async () => {
    renderApplication({ initialEntries: ['/definitely-not-a-ledgerly-route'] })

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Page not found',
      }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(document.title).toBe('Page not found | Ledgerly')
    })
  })

  it('closes the transaction dialog while preserving location metadata and replacing history', async () => {
    const { user } = renderApplication({
      authenticated: true,
      initialEntries: [
        '/app/home?origin=before-dialog',
        {
          pathname: '/app/transactions',
          search: '?filter=pending&tag=one&tag=two&add=expense',
          hash: '#review-anchor',
          state: { source: 'review' },
        },
      ],
      initialIndex: 1,
    })

    expect(
      await screen.findByRole('dialog', { name: 'Add expense' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close dialog' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByLabelText('Current location')).toHaveTextContent(
      '/app/transactions?filter=pending&tag=one&tag=two#review-anchor',
    )
    expect(
      screen.getByLabelText('Current navigation state'),
    ).toHaveTextContent('{"source":"review"}')

    await user.click(screen.getByText('History back'))

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /Good morning/,
      }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Current location')).toHaveTextContent(
      '/app/home?origin=before-dialog',
    )
  })

  it('does not ask for a vault when adding an account', async () => {
    renderApplication({
      authenticated: true,
      initialEntries: ['/app/accounts?add=1'],
    })

    const dialog = await screen.findByRole('dialog', { name: 'Add account' })
    expect(dialog).not.toHaveTextContent(/vault/i)
    expect(dialog).toHaveTextContent('Account name')
    expect(dialog).toHaveTextContent('Account type')
  })

  it('clears an account field error when the user corrects the field', async () => {
    const { user } = renderApplication({
      authenticated: true,
      initialEntries: ['/app/accounts?add=1'],
    })

    const dialog = await screen.findByRole('dialog', { name: 'Add account' })
    await user.click(
      within(dialog).getByRole('button', { name: 'Add to demo' }),
    )

    expect(
      within(dialog).getByText('Enter an account name'),
    ).toBeInTheDocument()

    await user.type(
      within(dialog).getByRole('textbox', { name: 'Account name' }),
      'QA account',
    )

    await waitFor(() => {
      expect(
        within(dialog).queryByText('Enter an account name'),
      ).not.toBeInTheDocument()
    })
  })

  it.each([
    ['/app/budgets?add=1', 'Create budget'],
    ['/app/goals?add=1', 'Create goal'],
    ['/app/office?claim=1', 'Submit expense claim'],
  ])('does not expose vault fields in %s', async (entry, dialogName) => {
    renderApplication({
      authenticated: true,
      initialEntries: [entry],
    })

    const dialog = await screen.findByRole('dialog', { name: dialogName })
    expect(dialog).not.toHaveTextContent(/vault/i)
  })

  it('uses the saved currency in money dialogs and submits a selected currency without a free-text field', async () => {
    localStorage.setItem('mt-preferred-currency', JSON.stringify('USD'))
    const { user } = renderApplication({
      authenticated: true,
      initialEntries: ['/app/budgets?add=1'],
    })

    const dialog = await screen.findByRole('dialog', { name: 'Create budget' })
    expect(
      within(dialog).queryByRole('textbox', { name: 'Currency' }),
    ).not.toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: /change currency/i }),
    ).not.toHaveTextContent('USD')

    await user.click(
      within(dialog).getByRole('button', { name: /change currency/i }),
    )
    expect(
      screen.getByRole('option', { name: /US dollar.*USD/i }),
    ).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('option', { name: /Euro.*EUR/i }))
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Budget name' }),
      'Spring travel',
    )
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Budget limit' }),
      '125.50',
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Add to demo' }),
    )

    expect(
      await screen.findByText(
        'Budget added to this demo session only. No server data changed.',
      ),
    ).toBeInTheDocument()
  })

  it('resets scroll before the first animation frame after a tab navigation', async () => {
    const defaultRequestAnimationFrame = globalThis.requestAnimationFrame
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback) => {
        queuedFrames.push(callback)
        return queuedFrames.length
      },
    )

    try {
      const { user } = renderApplication({
        authenticated: true,
        initialEntries: ['/app/home'],
      })

      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: /Good morning/,
        }),
      ).toBeInTheDocument()

      queuedFrames.splice(0).forEach((callback) => callback(performance.now()))
      vi.mocked(window.scrollTo).mockClear()

      await user.click(screen.getByRole('link', { name: 'Transactions' }))
      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: 'Transactions',
        }),
      ).toBeInTheDocument()

      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: 'auto',
      })
    } finally {
      vi.stubGlobal('requestAnimationFrame', defaultRequestAnimationFrame)
    }
  })
})
