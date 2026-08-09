"use client";
// beui.dev/components/motion/dock

import { motion, useReducedMotion } from "motion/react";
import {
  createContext,
  useContext,
  useId,
  useMemo,
  type ReactNode,
} from "react";
import { EASE_OUT, SPRING_LAYOUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

type DockContextValue = {
  size: number;
  pillLayoutId: string;
  reduce: boolean;
};

const DockContext = createContext<DockContextValue | null>(null);

export interface DockProps {
  children: ReactNode;
  className?: string;
  /** Size of each item in px. */
  size?: number;
}

export function Dock({ children, size = 44, className }: DockProps) {
  const pillLayoutId = useId();
  const reduce = useReducedMotion() ?? false;
  const ctx = useMemo<DockContextValue>(
    () => ({ size, pillLayoutId, reduce }),
    [size, pillLayoutId, reduce],
  );

  return (
    <DockContext.Provider value={ctx}>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={
          reduce
            ? { opacity: 0, transition: { duration: 0 } }
            : {
                opacity: 0,
                y: 10,
                scale: 0.98,
                transition: { duration: 0.2, ease: EASE_OUT },
              }
        }
        transition={
          reduce
            ? { duration: 0 }
            : { duration: 0.38, ease: EASE_OUT }
        }
        className={cn(
          "inline-flex h-auto items-end gap-1.5 rounded-2xl border border-border bg-card/80 px-2 py-1 shadow-2xl backdrop-blur-xl",
          className,
        )}
      >
        {children}
      </motion.div>
    </DockContext.Provider>
  );
}

export interface DockItemProps {
  children: ReactNode;
  className?: string;
  /** When set, the item renders as a <button>. Omit when children carry their own link or button. */
  onClick?: () => void;
  active?: boolean;
  /** Non-negative unread count displayed in the shared notification badge. */
  badge?: number;
  /** Largest count rendered before the badge switches to a trailing plus sign. */
  badgeMax?: number;
  /** Accessible badge description appended to button labels. */
  badgeLabel?: string;
  "aria-label"?: string;
}

function safeAccessibleLabel(value: string | undefined) {
  const normalized = value
    ?.replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
  return normalized || undefined;
}

export function DockItem({
  children,
  className,
  onClick,
  active = false,
  badge = 0,
  badgeMax = 99,
  badgeLabel,
  ...rest
}: DockItemProps) {
  const dock = useContext(DockContext);
  const size = dock?.size ?? 44;
  const pillLayoutId = dock?.pillLayoutId ?? "dock-pill";
  const reduce = dock?.reduce ?? false;

  const normalizedBadge = Number.isFinite(badge)
    ? Math.max(0, Math.trunc(badge))
    : 0;
  const normalizedBadgeMax = Number.isFinite(badgeMax)
    ? Math.max(1, Math.trunc(badgeMax))
    : 99;
  const label = safeAccessibleLabel(rest["aria-label"]);
  const normalizedBadgeLabel = safeAccessibleLabel(badgeLabel);
  const buttonLabel =
    label && normalizedBadge > 0
      ? `${label}, ${
          normalizedBadgeLabel ??
          `${normalizedBadge} unread ${
            normalizedBadge === 1 ? "notification" : "notifications"
          }`
        }`
      : label;
  const pill = active ? (
    <motion.span
      aria-hidden="true"
      layoutId={pillLayoutId}
      transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
      className="absolute inset-0.5 -z-10 rounded-xl bg-primary/5"
    />
  ) : null;
  const badgeElement =
    normalizedBadge > 0 ? (
      <span className="notification-count" aria-hidden="true">
        {normalizedBadge > normalizedBadgeMax
          ? `${normalizedBadgeMax}+`
          : normalizedBadge}
      </span>
    ) : null;
  const sharedStyle = { width: size, height: size };
  const sharedClass = cn(
    "relative flex shrink-0 items-center justify-center rounded-full text-foreground",
    active && "is-active",
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={buttonLabel}
        aria-pressed={active}
        style={sharedStyle}
        className={cn(
          sharedClass,
          "cursor-pointer border-0 bg-transparent p-0 outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        {pill}
        {children}
        {badgeElement}
      </button>
    );
  }

  // Children carry their own link or button (and its accessible name).
  return (
    <div style={sharedStyle} className={sharedClass}>
      {pill}
      {children}
      {badgeElement}
    </div>
  );
}

export function DockSeparator({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("mx-1 h-6 w-px self-center bg-border", className)}
    />
  );
}
