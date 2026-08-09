import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import {
  createElement,
  type ComponentProps,
  Fragment,
  StrictMode,
  useState,
} from 'react'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopWorkspaceSwitcher } from '@/app/navigation/workspace-switcher'
import { BottomSheet } from '@/components/motion/bottom-sheet'
import { Dialog } from '@/components/ui'
import { WorkspaceSearch } from '@/components/workspace-search'
import type { Workspace } from '@/domain/types'
import {
  dismissTopBackLayer,
  registerBackLayer,
} from './back-layer-stack'

const workspace: Workspace = {
  id: 'workspace-1',
  name: 'Personal',
  type: 'personal',
  role: 'owner',
  memberCount: 1,
}

function AllBackLayerOwners({ closed }: { closed: (owner: string) => void }) {
  const [bottomSheetOpen, setBottomSheetOpen] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(true)
  const [searchOpen, setSearchOpen] = useState(true)
  const [switcherOpen, setSwitcherOpen] = useState(true)

  return createElement(
    Fragment,
    null,
    createElement(
      BottomSheet,
      {
        open: bottomSheetOpen,
        onOpenChange: (open: boolean) => {
          if (!open) closed('BottomSheet')
          setBottomSheetOpen(open)
        },
        title: 'Bottom layer',
      },
      'Bottom content',
    ),
    createElement(
      Dialog,
      {
        open: dialogOpen,
        onClose: () => {
          closed('DesktopDialog')
          setDialogOpen(false)
        },
        title: 'Dialog layer',
      } as ComponentProps<typeof Dialog>,
      'Dialog content',
    ),
    createElement(WorkspaceSearch, {
      open: searchOpen,
      onOpenChange: (open: boolean) => {
        if (!open) closed('WorkspaceSearch')
        setSearchOpen(open)
      },
      mobile: false,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceSearchAvailable: false,
      demoMode: true,
      concealAmounts: false,
      canViewBalances: true,
      pages: [],
      onNavigate: () => undefined,
    }),
    createElement(DesktopWorkspaceSwitcher, {
      items: [workspace],
      current: workspace,
      open: switcherOpen,
      mobile: false,
      reduceMotion: true,
      onOpenChange: (open: boolean) => {
        if (!open) closed('DesktopWorkspaceSwitcher')
        setSwitcherOpen(open)
      },
      onSelect: () => undefined,
    }),
  )
}

describe('back layer stack', () => {
  beforeEach(() => {
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

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('dismisses registered layers in LIFO order and removes stale registrations', () => {
    const closed: string[] = []
    const unregisterBottom = registerBackLayer(() => closed.push('bottom'))
    const unregisterTop = registerBackLayer(() => closed.push('top'))

    expect(dismissTopBackLayer()).toBe(true)
    expect(closed).toEqual(['top'])

    unregisterTop()
    expect(dismissTopBackLayer()).toBe(true)
    expect(closed).toEqual(['top', 'bottom'])

    unregisterBottom()
    expect(dismissTopBackLayer()).toBe(false)
  })

  it('consumes back for a visible busy layer even when dismissal is a no-op', () => {
    const unregister = registerBackLayer(() => undefined)

    expect(dismissTopBackLayer()).toBe(true)

    unregister()
    expect(dismissTopBackLayer()).toBe(false)
  })

  it('registers exactly the four shared visible owners in visual LIFO order', async () => {
    const closed: string[] = []
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          MotionConfig,
          { reducedMotion: 'always' },
          createElement(AllBackLayerOwners, {
            closed: (owner: string) => closed.push(owner),
          }),
        ),
      ),
    )

    for (const expectedOwner of [
      'DesktopWorkspaceSwitcher',
      'WorkspaceSearch',
      'DesktopDialog',
      'BottomSheet',
    ]) {
      await act(async () => {
        expect(dismissTopBackLayer()).toBe(true)
      })
      expect(closed.at(-1)).toBe(expectedOwner)
    }

    expect(dismissTopBackLayer()).toBe(false)
  })

  it('does not leave stale owner registrations across Strict Mode cleanup', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const view = render(
      createElement(
        StrictMode,
        null,
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            MotionConfig,
            { reducedMotion: 'always' },
            createElement(AllBackLayerOwners, { closed: () => undefined }),
          ),
        ),
      ),
    )

    view.unmount()
    await act(async () => undefined)

    expect(dismissTopBackLayer()).toBe(false)
  })
})
