import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppContextValue } from './app-state'
import { useApp } from './app-state'
import { AppProvider } from './app-context'
import { hashDevicePin } from '@/platform/device-pin'
import { restoreRememberedApiToken } from '@/platform/auth-session'

const preferenceMocks = vi.hoisted(() => ({
  persistNativePreference: vi.fn(),
  removeNativePreference: vi.fn(),
}))
const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  clearApiToken: vi.fn(),
  setApiToken: vi.fn(),
}))

vi.mock('@/platform/preferences', () => preferenceMocks)
vi.mock('@/lib/api-client', () => ({
  api: { get: apiMocks.get },
  clearApiToken: apiMocks.clearApiToken,
  setApiToken: apiMocks.setApiToken,
}))

let app!: AppContextValue

function Probe() {
  app = useApp()
  return null
}

describe('AppProvider preference persistence', () => {
  beforeEach(() => {
    cleanup()
    app = undefined as unknown as AppContextValue
    localStorage.clear()
    vi.clearAllMocks()
    preferenceMocks.persistNativePreference.mockResolvedValue(undefined)
    preferenceMocks.removeNativePreference.mockResolvedValue(undefined)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
  })

  it('routes every allowlisted mutation through the adapter with exact serialized values and no duplicate storage writes', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem')
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <AppProvider>
          <Probe />
        </AppProvider>
      </QueryClientProvider>,
    )

    act(() => app.enterDemo())
    act(() => app.setPrivacyMode(true))
    act(() => app.setTheme('dark'))
    act(() => app.setPreferredCurrency('USD'))

    const liveOne = {
      id: 'live-one',
      name: 'Live One',
      type: 'personal' as const,
      role: 'owner' as const,
      memberCount: 1,
    }
    const liveTwo = { ...liveOne, id: 'live-two', name: 'Live Two' }
    apiMocks.get.mockResolvedValueOnce([liveOne, liveTwo])
    await act(() => app.completeLogin('user-1', 'Ada', 'bearer-secret'))

    apiMocks.get.mockResolvedValueOnce([liveOne, liveTwo])
    await act(() => app.refreshWorkspaces('live-two'))
    act(() => app.setWorkspace(liveOne))
    act(() => app.signOut())

    expect(preferenceMocks.persistNativePreference.mock.calls).toEqual(
      expect.arrayContaining([
        ['mt-demo', 'true'],
        ['mt-user-name', JSON.stringify('Aarav Sharma')],
        ['mt-privacy', 'true'],
        ['mt-theme', JSON.stringify('dark')],
        ['mt-preferred-currency', JSON.stringify('USD')],
        ['mt-user-name', JSON.stringify('Ada')],
        ['mt-workspace', JSON.stringify(liveOne)],
        ['mt-workspace', JSON.stringify(liveTwo)],
      ]),
    )
    expect(preferenceMocks.removeNativePreference.mock.calls).toEqual(
      expect.arrayContaining([
        ['mt-demo'],
        ['mt-user-name'],
        ['mt-workspace'],
        ['mt-preferred-currency'],
      ]),
    )
    expect(
      preferenceMocks.persistNativePreference.mock.calls.flat(),
    ).not.toContain('bearer-secret')
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('restores the remembered API token after native preferences have hydrated', () => {
    localStorage.setItem('mt-auth-token', JSON.stringify('restored-token'))
    localStorage.setItem('mt-remember', 'true')

    expect(restoreRememberedApiToken()).toBe(true)
    expect(apiMocks.setApiToken).toHaveBeenCalledWith('restored-token')
  })

  it('keeps a remembered session behind the device PIN gate', async () => {
    localStorage.setItem('mt-auth-token', JSON.stringify('restored-token'))
    localStorage.setItem('mt-remember', 'true')
    localStorage.setItem('mt-user-id', JSON.stringify('user-1'))
    localStorage.setItem(
      'mt-app-pin-hash',
      JSON.stringify(await hashDevicePin('123456')),
    )

    const client = new QueryClient()
    const rendered = render(
      <QueryClientProvider client={client}>
        <AppProvider>
          <span>Protected content</span>
        </AppProvider>
      </QueryClientProvider>,
    )

    expect(rendered.queryByText('Protected content')).not.toBeInTheDocument()
    expect(
      rendered.getByRole('heading', { name: 'Welcome back' }),
    ).toBeInTheDocument()
  })

  it('hydrates all available workspaces after a remembered session is unlocked', async () => {
    const cachedWorkspace = {
      id: 'cached-workspace',
      name: 'Cached workspace',
      type: 'personal' as const,
      role: 'owner' as const,
      memberCount: 1,
    }
    const secondWorkspace = {
      ...cachedWorkspace,
      id: 'second-workspace',
      name: 'Second workspace',
    }
    localStorage.setItem('mt-auth-token', JSON.stringify('restored-token'))
    localStorage.setItem('mt-remember', 'true')
    localStorage.setItem('mt-user-id', JSON.stringify('user-1'))
    localStorage.setItem('mt-workspace', JSON.stringify(cachedWorkspace))
    localStorage.setItem(
      'mt-app-pin-hash',
      JSON.stringify(await hashDevicePin('123456')),
    )
    apiMocks.get.mockResolvedValueOnce([cachedWorkspace, secondWorkspace])

    const client = new QueryClient()
    const rendered = render(
      <QueryClientProvider client={client}>
        <AppProvider>
          <Probe />
        </AppProvider>
      </QueryClientProvider>,
    )

    fireEvent.change(rendered.getByLabelText('App PIN'), {
      target: { value: '123456' },
    })
    fireEvent.click(rendered.getByRole('button', { name: 'Unlock Ledgerly' }))

    await waitFor(() => {
      expect(apiMocks.get).toHaveBeenCalledWith('/workspaces')
      expect(app.availableWorkspaces).toEqual([
        cachedWorkspace,
        secondWorkspace,
      ])
    })
  })
})
