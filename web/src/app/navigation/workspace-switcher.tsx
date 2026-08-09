import { Check, ChevronDown, LogIn, Plus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef } from 'react'
import { BrandLogo } from '@/components/brand-logo'
import type { Workspace } from '@/domain/types'
import { EASE_OUT } from '@/lib/ease'
import { initials } from '@/lib/format'
import { registerBackLayer } from '@/platform/back-layer-stack'

const DESKTOP_TRIGGER_ID = 'desktop-workspace-trigger'

export function AppMark() {
  return (
    <div className="app-mark" aria-hidden="true">
      <BrandLogo />
    </div>
  )
}

export function WorkspaceOptions({
  items,
  current,
  onSelect,
  defaultWorkspaceId,
  onCreate,
  onJoin,
  onSetDefault,
  onDelete,
  menuId,
}: {
  items: Workspace[]
  current: Workspace
  onSelect: (workspace: Workspace) => void
  defaultWorkspaceId?: string
  onCreate?: () => void
  onJoin?: () => void
  onSetDefault?: (workspace: Workspace) => void
  onDelete?: (workspace: Workspace) => void
  menuId?: string
}) {
  return (
    <div
      id={menuId}
      className="workspace-options"
      role="menu"
      aria-label="Available workspaces"
      onKeyDown={(event) => {
        if (
          event.key !== 'ArrowDown' &&
          event.key !== 'ArrowUp' &&
          event.key !== 'Home' &&
          event.key !== 'End'
        ) {
          return
        }

        const options = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            '[role="menuitemradio"]',
          ),
        )
        if (!options.length) return

        event.preventDefault()
        const activeIndex = Math.max(
          0,
          options.indexOf(document.activeElement as HTMLButtonElement),
        )
        const nextIndex =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : event.key === 'ArrowDown'
                ? (activeIndex + 1) % options.length
                : (activeIndex - 1 + options.length) % options.length
        options[nextIndex]?.focus()
      }}
    >
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          role="menuitemradio"
          aria-checked={item.id === current.id}
          aria-current={item.id === current.id ? 'true' : undefined}
          tabIndex={item.id === current.id ? 0 : -1}
          onClick={() => onSelect(item)}
        >
          <span className={`workspace-avatar ${item.type}`}>
            {initials(item.name)}
          </span>
          <span>
            <strong>{item.name}</strong>
            <small>
              {item.memberCount} {item.memberCount === 1 ? 'member' : 'members'}
            </small>
          </span>
          {item.id === current.id ? (
            <span className="workspace-current">Current</span>
          ) : null}
        </button>
      ))}
      {onCreate || onJoin || onSetDefault || onDelete ? (
        <div className="workspace-menu-actions">
          {onCreate ? (
            <button type="button" role="menuitem" onClick={onCreate}>
              <Plus aria-hidden="true" /> Create workspace
            </button>
          ) : null}
          {onJoin ? (
            <button type="button" role="menuitem" onClick={onJoin}>
              <LogIn aria-hidden="true" /> Join workspace
            </button>
          ) : null}
          {onSetDefault ? (
            <button
              type="button"
              role="menuitem"
              disabled={current.id === defaultWorkspaceId}
              onClick={() => onSetDefault(current)}
            >
              <Check aria-hidden="true" />
              {current.id === defaultWorkspaceId ? 'Default workspace' : 'Set current as default'}
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              role="menuitem"
              className="workspace-menu-danger"
              onClick={() => onDelete(current)}
            >
              <Trash2 aria-hidden="true" /> Delete workspace
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function DesktopWorkspaceSwitcher({
  items,
  current,
  open,
  mobile,
  reduceMotion,
  onOpenChange,
  onSelect,
  defaultWorkspaceId,
  onCreate,
  onJoin,
  onSetDefault,
  onDelete,
}: {
  items: Workspace[]
  current: Workspace
  open: boolean
  mobile: boolean
  reduceMotion: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (workspace: Workspace) => void
  defaultWorkspaceId?: string
  onCreate?: () => void
  onJoin?: () => void
  onSetDefault?: (workspace: Workspace) => void
  onDelete?: (workspace: Workspace) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)

  const onOpenChangeRef = useRef(onOpenChange)

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  }, [onOpenChange])

  const closeAndRestoreFocus = useCallback(() => {
    onOpenChangeRef.current(false)
    window.setTimeout(() => {
      document.getElementById(DESKTOP_TRIGGER_ID)?.focus()
    }, 0)
  }, [])

  useEffect(() => {
    if (!open || mobile) return
    return registerBackLayer(closeAndRestoreFocus)
  }, [closeAndRestoreFocus, mobile, open])
  useEffect(() => {
    if (!open || mobile) return

    const focusFrame = requestAnimationFrame(() => {
      wrapRef.current
        ?.querySelector<HTMLElement>(
          '[role="menuitemradio"][aria-checked="true"]',
        )
        ?.focus()
    })
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !wrapRef.current?.contains(event.target)
      ) {
        onOpenChange(false)
      }
    }

    document.addEventListener('pointerdown', closeOutside)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('pointerdown', closeOutside)
    }
  }, [mobile, onOpenChange, open])

  useEffect(() => {
    if (!open || mobile) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      closeAndRestoreFocus()
    }

    addEventListener('keydown', onKeyDown)
    return () => removeEventListener('keydown', onKeyDown)
  }, [closeAndRestoreFocus, mobile, open])

  const selectWorkspace = (workspace: Workspace) => {
    onSelect(workspace)
    closeAndRestoreFocus()
  }

  return (
    <div className="workspace-wrap" ref={wrapRef}>
      <button
        id={DESKTOP_TRIGGER_ID}
        type="button"
        className="workspace-button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="desktop-workspace-menu"
      >
        <span className={`workspace-avatar ${current.type}`}>
          {initials(current.name)}
        </span>
        <span>
          <strong>{current.name}</strong>
          <small>{current.type}</small>
        </span>
        <ChevronDown aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open && !mobile ? (
          <motion.div
            className="workspace-menu"
            aria-labelledby={DESKTOP_TRIGGER_ID}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -6, scale: 0.97 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -4, scale: 0.98 }
            }
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            <span>Switch workspace</span>
            <WorkspaceOptions
              items={items}
              current={current}
              menuId="desktop-workspace-menu"
              onSelect={selectWorkspace}
              defaultWorkspaceId={defaultWorkspaceId}
              onCreate={() => {
                onOpenChange(false)
                onCreate?.()
              }}
              onJoin={() => {
                onOpenChange(false)
                onJoin?.()
              }}
              onSetDefault={(item) => {
                onSetDefault?.(item)
                closeAndRestoreFocus()
              }}
              onDelete={(item) => {
                onDelete?.(item)
                closeAndRestoreFocus()
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
