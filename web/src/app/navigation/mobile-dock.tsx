import { AnimatePresence, motion } from 'motion/react'
import type { Ref } from 'react'
import { Link } from 'react-router'
import { Dock, DockItem } from '@/components/motion/dock'
import { SPRING_PRESS } from '@/lib/app-motion'
import { selectionHaptic } from '@/platform/haptics'
import {
  isMobileNavigationActive,
  mobileNavigation,
  type AppNavigationItem,
} from './registry'

const MotionLink = motion.create(Link)

type MobileNavigationItem = AppNavigationItem & {
  dock: NonNullable<AppNavigationItem['dock']>
}

function DockItemContent({
  item,
  active,
  reduceMotion,
}: {
  item: MobileNavigationItem
  active: boolean
  reduceMotion: boolean
}) {
  return (
    <motion.span
      className="dock-link-motion"
      animate={
        reduceMotion
          ? undefined
          : {
              y: active ? -1 : 0,
              scale: active ? 1.025 : 1,
            }
      }
      transition={reduceMotion ? { duration: 0 } : SPRING_PRESS}
    >
      <item.icon aria-hidden="true" />
      <span>{item.dock.label ?? item.label}</span>
    </motion.span>
  )
}

function safeUnreadCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

export function MobileNavigationDock({
  keyboardOpen,
  pathname,
  reduceMotion,
  quickAddOpen,
  creationDialogOpen,
  canQuickAdd,
  unreadNotifications,
  onQuickAddOpen,
  quickAddButtonRef,
}: {
  keyboardOpen: boolean
  pathname: string
  reduceMotion: boolean
  quickAddOpen: boolean
  creationDialogOpen: boolean
  canQuickAdd: boolean
  unreadNotifications: number
  onQuickAddOpen: () => void
  quickAddButtonRef?: Ref<HTMLButtonElement>
}) {
  const addModeActive = quickAddOpen || creationDialogOpen
  const unreadCount = safeUnreadCount(unreadNotifications)

  return (
    <nav className="mobile-dock-wrap" aria-label="Mobile navigation">
      <AnimatePresence initial>
        {!keyboardOpen ? (
          <Dock key="mobile-navigation" size={58} className="mobile-dock">
            {mobileNavigation.map((item) => {
              const active = isMobileNavigationActive(
                item,
                pathname,
                addModeActive,
              )
              const isQuickAdd = item.dock.kind === 'quick-add'
              const isOverflow = item.dock.kind === 'overflow'
              const itemUnreadCount = isOverflow ? unreadCount : 0
              const destinationLabel =
                itemUnreadCount > 0
                  ? `${item.label}, ${itemUnreadCount} unread ${
                      itemUnreadCount === 1 ? 'notification' : 'notifications'
                    }`
                  : item.label

              return (
                <DockItem
                  key={item.id}
                  active={active}
                  className={`dock-item${active ? ' is-active' : ''}${isQuickAdd ? ' dock-add' : ''}`}
                >
                  {itemUnreadCount > 0 ? (
                    <span
                      className="dock-unread-badge"
                      aria-label={`${itemUnreadCount} unread notifications`}
                    >
                      {itemUnreadCount > 99 ? '99+' : itemUnreadCount}
                    </span>
                  ) : null}
                  {isQuickAdd ? (
                    <motion.button
                      ref={quickAddButtonRef}
                      type="button"
                      disabled={!canQuickAdd}
                      aria-label={
                        canQuickAdd
                          ? 'Open quick add'
                          : 'Quick add unavailable for this role'
                      }
                      aria-haspopup="dialog"
                      aria-expanded={quickAddOpen}
                      title={
                        canQuickAdd
                          ? undefined
                          : 'Your role does not include create actions'
                      }
                      className="dock-link bg-transparent p-0"
                      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                      transition={
                        reduceMotion ? { duration: 0 } : SPRING_PRESS
                      }
                      onClick={() => {
                        onQuickAddOpen()
                        void selectionHaptic()
                      }}
                    >
                      <DockItemContent
                        item={item}
                        active={active}
                        reduceMotion={reduceMotion}
                      />
                    </motion.button>
                  ) : (
                    <MotionLink
                      to={item.to}
                      aria-label={destinationLabel}
                      aria-current={active ? 'page' : undefined}
                      className="dock-link"
                      onClick={() => void selectionHaptic()}
                      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                      transition={
                        reduceMotion ? { duration: 0 } : SPRING_PRESS
                      }
                    >
                      <DockItemContent
                        item={item}
                        active={active}
                        reduceMotion={reduceMotion}
                      />
                    </MotionLink>
                  )}
                </DockItem>
              )
            })}
          </Dock>
        ) : null}
      </AnimatePresence>
    </nav>
  )
}
