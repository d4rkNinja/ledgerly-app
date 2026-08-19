"use client";
// beui.dev/components/motion/select

import { Check, ChevronDown } from "lucide-react";
import {
  motion,
  type Transition,
  useReducedMotion,
  type Variants,
} from "motion/react";
import {
  createContext,
  type ComponentPropsWithoutRef,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

const INSTANT_TRANSITION: Transition = { duration: 0 };

// Spring with bounce powers the unfold/separation; per-property timings in the
// content choreograph it (see SelectContent). Mirrors bouncy-accordion's feel.
const CHEVRON_TRANSITION: Transition = { duration: 0.18, ease: EASE_OUT };

const LIST_VARIANTS: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.05 } },
};
const ITEM_VARIANTS: Variants = {
  hidden: {
    opacity: 0,
    transform: "translateY(-4px)",
    filter: "blur(2px)",
  },
  show: {
    opacity: 1,
    transform: "translateY(0)",
    filter: "blur(0px)",
  },
};

type Placement = "bottom" | "top";

const SELECT_GAP = 8;
const SELECT_MAX_HEIGHT = 288;
const CLIPPING_OVERFLOW = /^(auto|clip|hidden|scroll)$/u;

function getVisibleBounds(trigger: HTMLElement) {
  const viewport = window.visualViewport;
  let top = viewport?.offsetTop ?? 0;
  let bottom = top + (viewport?.height ?? window.innerHeight);

  let ancestor = trigger.parentElement;
  while (ancestor) {
    const style = window.getComputedStyle(ancestor);
    if (
      CLIPPING_OVERFLOW.test(style.overflowY) ||
      CLIPPING_OVERFLOW.test(style.overflow)
    ) {
      const rect = ancestor.getBoundingClientRect();
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
    ancestor = ancestor.parentElement;
  }

  return { top, bottom: Math.max(top, bottom) };
}

function getSelectLayout(trigger: HTMLElement, contentHeight: number) {
  const rect = trigger.getBoundingClientRect();
  const preferredHeight = Math.min(contentHeight, SELECT_MAX_HEIGHT);
  if (rect.height <= 0 || rect.width <= 0) {
    return { placement: "bottom" as Placement, maxHeight: preferredHeight };
  }

  const bounds = getVisibleBounds(trigger);
  const above = Math.max(0, rect.top - bounds.top - SELECT_GAP);
  const below = Math.max(0, bounds.bottom - rect.bottom - SELECT_GAP);
  const placement: Placement =
    below >= preferredHeight || below >= above ? "bottom" : "top";
  const available = placement === "top" ? above : below;

  return {
    placement,
    maxHeight: Math.max(0, Math.min(preferredHeight, available)),
  };
}

interface SelectContextValue {
  value: string | undefined;
  open: boolean;
  setOpen: (open: boolean) => void;
  select: (value: string) => void;
  register: (value: string, label: string) => void;
  unregister: (value: string) => void;
  labelFor: (value: string | undefined) => string | undefined;
  reduce: boolean;
  triggerId: string;
  listId: string;
  disabled: boolean;
  placement: Placement;
  setPlacement: (p: Placement) => void;
}

const SelectContext = createContext<SelectContextValue | null>(null);

function useSelectContext(component: string) {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error(`${component} must be used within <Select>`);
  return ctx;
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function Select({
  value,
  defaultValue,
  onValueChange,
  disabled = false,
  className,
  children,
}: SelectProps) {
  const reduce = useReducedMotion() ?? false;
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(defaultValue);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [placement, setPlacement] = useState<Placement>("bottom");

  const controlled = value !== undefined;
  const current = controlled ? value : internal;

  const select = useCallback(
    (next: string) => {
      if (!controlled) setInternal(next);
      onValueChange?.(next);
      setOpen(false);
    },
    [controlled, onValueChange],
  );

  const register = useCallback((v: string, label: string) => {
    setLabels((m) => (m.get(v) === label ? m : new Map(m).set(v, label)));
  }, []);
  const unregister = useCallback((v: string) => {
    setLabels((m) => {
      if (!m.has(v)) return m;
      const next = new Map(m);
      next.delete(v);
      return next;
    });
  }, []);

  // close on outside pointer / escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node))
        setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const ctx = useMemo<SelectContextValue>(
    () => ({
      value: current,
      open,
      setOpen,
      select,
      register,
      unregister,
      labelFor: (v) => (v === undefined ? undefined : labels.get(v)),
      reduce,
      triggerId: `${baseId}-trigger`,
      listId: `${baseId}-list`,
      disabled,
      placement,
      setPlacement,
    }),
    [
      current,
      open,
      select,
      register,
      unregister,
      labels,
      reduce,
      baseId,
      disabled,
      placement,
    ],
  );

  return (
    <SelectContext.Provider value={ctx}>
      <div
        ref={rootRef}
        className={cn("relative", className)}
        data-ui="select"
        data-state={open ? "open" : "closed"}
      >
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export interface SelectTriggerProps {
  className?: string;
  children: ReactNode;
  hideIndicator?: boolean;
}

type SelectTriggerButtonProps = Omit<
  ComponentPropsWithoutRef<typeof motion.button>,
  "children" | "className"
>;

export function SelectTrigger({
  className,
  children,
  hideIndicator = false,
  ...props
}: SelectTriggerProps & SelectTriggerButtonProps) {
  const ctx = useSelectContext("SelectTrigger");
  return (
    <motion.button
      type="button"
      id={props.id ?? ctx.triggerId}
      disabled={props.disabled ?? ctx.disabled}
      aria-haspopup="listbox"
      aria-expanded={ctx.open}
      data-ui="select-trigger"
      data-state={ctx.open ? "open" : "closed"}
      aria-controls={props["aria-controls"] ?? ctx.listId}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) ctx.setOpen(!ctx.open);
      }}
      initial={false}
      className={cn(
        "relative z-10 flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors",
        "hover:border-(--color-border-strong) focus-visible:ring-2 focus-visible:ring-foreground/20",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      {hideIndicator ? null : (
        <motion.span
          aria-hidden
          animate={{
            transform: ctx.open ? "rotate(180deg)" : "rotate(0deg)",
          }}
          transition={ctx.reduce ? { duration: 0 } : CHEVRON_TRANSITION}
          className="text-muted-foreground"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      )}
    </motion.button>
  );
}

export interface SelectValueProps {
  placeholder?: string;
  className?: string;
}

export function SelectValue({ placeholder, className }: SelectValueProps) {
  const ctx = useSelectContext("SelectValue");
  const label = ctx.labelFor(ctx.value);
  return (
    <span
      className={cn(label ? "text-foreground" : "text-muted-foreground", className)}
    >
      {label ?? placeholder ?? "Select"}
    </span>
  );
}

export interface SelectContentProps {
  className?: string;
  children: ReactNode;
}

export function SelectContent({ className, children }: SelectContentProps) {
  const ctx = useSelectContext("SelectContent");
  const innerRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState(SELECT_MAX_HEIGHT);
  const open = ctx.open;
  const { setPlacement } = ctx;

  useLayoutEffect(() => {
    const node = innerRef.current;
    const trigger = document.getElementById(ctx.triggerId);
    if (!node || !trigger) return;
    const measure = () => {
      const layout = getSelectLayout(trigger, node.scrollHeight);
      setPlacement(layout.placement);
      setMaxHeight((current) =>
        current === layout.maxHeight ? current : layout.maxHeight,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(trigger);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [ctx.triggerId, setPlacement]);

  const isTop = ctx.placement === "top";

  // Items stay mounted so their labels remain registered after close. The
  // absolutely positioned panel can stay at natural height; only compositor-
  // friendly properties animate.
  return (
    <motion.div
      id={ctx.listId}
      role="listbox"
      aria-labelledby={ctx.triggerId}
      aria-hidden={!open}
      inert={!open}
      initial={false}
      animate={{
        opacity: open ? 1 : 0,
        transform:
          open || ctx.reduce
            ? "translateY(0) scale(1)"
            : `translateY(${isTop ? "4px" : "-4px"}) scale(0.985)`,
      }}
      transition={
        ctx.reduce
          ? INSTANT_TRANSITION
          : { duration: open ? 0.18 : 0.14, ease: EASE_OUT }
      }
      style={{
        transformOrigin: isTop ? "bottom" : "top",
        pointerEvents: open ? "auto" : "none",
      }}
      data-ui="select-content"
      data-state={open ? "open" : "closed"}
      className={cn(
        "absolute left-0 right-0 z-20 rounded-xl border border-border bg-background shadow-lg",
        isTop ? "bottom-full mb-2" : "top-full mt-2",
        className,
      )}
    >
      <motion.div
        ref={innerRef}
        className="select-content-scroll"
        style={{
          maxHeight: `${maxHeight}px`,
          overflowY: "auto",
          overscrollBehavior: "contain",
        }}
      >
        <motion.ul
          variants={ctx.reduce ? undefined : LIST_VARIANTS}
          initial={false}
          animate={open ? "show" : "hidden"}
          className="select-content-list m-0 list-none p-1"
        >
          {children}
        </motion.ul>
      </motion.div>
    </motion.div>
  );
}

export interface SelectItemProps {
  value: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

export function SelectItem({
  value,
  disabled = false,
  className,
  children,
}: SelectItemProps) {
  const ctx = useSelectContext("SelectItem");
  const { register, unregister, select, value: selectedValue } = ctx;
  const selected = selectedValue === value;
  const label = typeof children === "string" ? children : value;

  useLayoutEffect(() => {
    register(value, label);
    return () => unregister(value);
  }, [label, register, unregister, value]);

  return (
    <motion.li variants={ctx.reduce ? undefined : ITEM_VARIANTS}>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        disabled={disabled}
        onClick={() => select(value)}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors",
          selected
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted",
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
      >
        {children}
        {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
      </button>
    </motion.li>
  );
}
