'use client'

import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  addDateOnlyDays,
  addDateOnlyMonths,
  dateOnlyWeekday,
  formatDateOnly,
  isDateOnly,
  startOfDateOnlyMonth,
  todayDateOnly,
  type DateOnly,
} from '@/lib/date-only'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { cn } from '@/lib/utils'
import { Dialog } from '@/components/ui'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/motion/popover'

type PopoverSide = 'top' | 'bottom'
type PopoverAlign = 'start' | 'end'

export interface DatePickerProps {
  /** A calendar date in YYYY-MM-DD format. Use an empty string for no selection. */
  value: string
  onValueChange: (value: string) => void
  label: string
  error?: string
  min?: string
  max?: string
  disabled?: boolean
  /** Allows an optional date field to be returned to an empty value. */
  clearable?: boolean
  className?: string
}

function clampInitialDate(value: string, min?: string, max?: string): DateOnly {
  let next = isDateOnly(value) ? value : todayDateOnly()
  if (isDateOnly(min) && next < min) next = min
  if (isDateOnly(max) && next > max) next = max
  return next
}

function isOutsideRange(value: DateOnly, min?: string, max?: string) {
  return (isDateOnly(min) && value < min) || (isDateOnly(max) && value > max)
}

function monthLabel(value: DateOnly) {
  return formatDateOnly(value, { month: 'long', year: 'numeric' })
}

function dayLabel(value: DateOnly) {
  return `Choose ${formatDateOnly(value, {
    weekday: undefined,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }, 'en-US')}`
}

function getVisibleCalendarDays(month: DateOnly) {
  const monthStart = startOfDateOnlyMonth(month)
  const firstVisible = addDateOnlyDays(monthStart, -dateOnlyWeekday(monthStart))
  return Array.from({ length: 42 }, (_, index) =>
    addDateOnlyDays(firstVisible, index),
  )
}

function getWeekBoundary(value: DateOnly, end: boolean) {
  const weekday = dateOnlyWeekday(value)
  return addDateOnlyDays(value, end ? 6 - weekday : -weekday)
}

function Calendar({
  value,
  min,
  max,
  open,
  onValueChange,
  onDismiss,
}: {
  value: string
  min?: string
  max?: string
  open: boolean
  onValueChange: (value: string) => void
  onDismiss: () => void
}) {
  const selected = isDateOnly(value) ? value : undefined
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfDateOnlyMonth(clampInitialDate(value, min, max)),
  )
  const [focusedDate, setFocusedDate] = useState<DateOnly>(() =>
    clampInitialDate(value, min, max),
  )
  const focusedDateRef = useRef(focusedDate)
  const calendarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const next = clampInitialDate(value, min, max)
    setVisibleMonth(startOfDateOnlyMonth(next))
    focusedDateRef.current = next
    setFocusedDate(next)
  }, [max, min, open, value])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      calendarRef.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${focusedDate}"]`)
        ?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [focusedDate, open, visibleMonth])

  const days = useMemo(() => getVisibleCalendarDays(visibleMonth), [visibleMonth])

  const moveFocus = useCallback(
    (next: DateOnly) => {
      if (isOutsideRange(next, min, max)) return
      focusedDateRef.current = next
      setFocusedDate(next)
      setVisibleMonth(startOfDateOnlyMonth(next))
    },
    [max, min],
  )

  const selectDate = useCallback(
    (next: DateOnly) => {
      if (isOutsideRange(next, min, max)) return
      onValueChange(next)
      onDismiss()
    },
    [max, min, onDismiss, onValueChange],
  )

  const onDayKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, day: DateOnly) => {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => moveFocus(addDateOnlyDays(day, -1)),
      ArrowRight: () => moveFocus(addDateOnlyDays(day, 1)),
      ArrowUp: () => moveFocus(addDateOnlyDays(day, -7)),
      ArrowDown: () => moveFocus(addDateOnlyDays(day, 7)),
      Home: () => moveFocus(getWeekBoundary(day, false)),
      End: () => moveFocus(getWeekBoundary(day, true)),
      PageUp: () => moveFocus(addDateOnlyMonths(day, -1)),
      PageDown: () => moveFocus(addDateOnlyMonths(day, 1)),
    }
    const action = actions[event.key]
    if (action) {
      event.preventDefault()
      action()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectDate(focusedDateRef.current)
    }
  }

  const previousMonth = addDateOnlyMonths(visibleMonth, -1)
  const nextMonth = addDateOnlyMonths(visibleMonth, 1)

  return (
    <div
      ref={calendarRef}
      className="date-picker-calendar mx-auto w-[min(20rem,calc(100vw-2rem))] p-3 text-foreground"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={`Show ${monthLabel(previousMonth)}`}
          onClick={() => {
            setVisibleMonth(previousMonth)
            moveFocus(previousMonth)
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <h3 className="text-sm font-semibold" aria-live="polite">
          {monthLabel(visibleMonth)}
        </h3>
        <button
          type="button"
          aria-label={`Show ${monthLabel(nextMonth)}`}
          onClick={() => {
            setVisibleMonth(nextMonth)
            moveFocus(nextMonth)
          }}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[0.7rem] font-medium text-muted-foreground" aria-hidden="true">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <span key={day} className="py-1">{day}</span>
        ))}
      </div>
      <div role="grid" aria-label={monthLabel(visibleMonth)} className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const disabled = isOutsideRange(day, min, max)
          const currentMonth = day.slice(0, 7) === visibleMonth.slice(0, 7)
          const isSelected = day === selected
          const isToday = day === todayDateOnly()
          return (
            <button
              key={day}
              type="button"
              role="gridcell"
              data-date={day}
              aria-label={dayLabel(day)}
              aria-selected={isSelected}
              disabled={disabled}
              tabIndex={day === focusedDate ? 0 : -1}
              onClick={() => selectDate(day)}
              onKeyDown={(event) => onDayKeyDown(event, day)}
              className={cn(
                'inline-flex h-10 items-center justify-center rounded-lg text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                currentMonth ? 'text-foreground' : 'text-muted-foreground/65',
                isSelected
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'hover:bg-muted',
                isToday && !isSelected ? 'ring-1 ring-border-strong' : '',
                'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-35',
              )}
            >
              {day.slice(-2).replace(/^0/u, '')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * A controlled, date-only calendar field. The value remains a YYYY-MM-DD
 * string and is never converted through the device timezone before it reaches
 * the caller.
 */
export function DatePicker({
  value,
  onValueChange,
  label,
  error,
  min,
  max,
  disabled = false,
  clearable = false,
  className,
}: DatePickerProps) {
  const mobile = useMediaQuery('(max-width: 680px)')
  const labelId = useId()
  const valueId = useId()
  const errorId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [popoverSide, setPopoverSide] = useState<PopoverSide>('bottom')
  const [popoverAlign, setPopoverAlign] = useState<PopoverAlign>('start')
  const selected = isDateOnly(value) ? value : undefined

  const positionPopover = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const viewport = window.visualViewport
    const viewportTop = viewport?.offsetTop ?? 0
    const viewportHeight = viewport?.height ?? window.innerHeight
    const viewportWidth = viewport?.width ?? window.innerWidth
    const below = viewportTop + viewportHeight - rect.bottom
    const above = rect.top - viewportTop
    const right = viewportWidth - rect.left
    const left = rect.right
    setPopoverSide(below >= 360 || below >= above ? 'bottom' : 'top')
    setPopoverAlign(right >= 320 || right >= left ? 'start' : 'end')
  }, [])

  useEffect(() => {
    if (!open || mobile) return
    const reposition = () => positionPopover()
    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    window.visualViewport?.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
      window.visualViewport?.removeEventListener('resize', reposition)
    }
  }, [mobile, open, positionPopover])

  const setCalendarOpen = (nextOpen: boolean) => {
    if (nextOpen && !mobile) positionPopover()
    setOpen(nextOpen)
  }

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      disabled={disabled}
      data-field-control="date-picker"
      aria-labelledby={`${labelId} ${valueId}`}
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
      onClick={mobile ? () => setCalendarOpen(true) : positionPopover}
      className={cn(
        'date-picker-trigger flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2 text-left text-sm text-foreground outline-none transition-colors',
        'hover:border-(--color-border-strong) focus-visible:ring-2 focus-visible:ring-foreground/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        error ? 'border-destructive focus-visible:ring-destructive/30' : '',
      )}
    >
      <span
        id={valueId}
        className={cn(
          'min-w-0 truncate',
          selected ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {selected ? formatDateOnly(selected) : 'Select date'}
      </span>
      <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  )

  const calendar = (
    <Calendar
      value={value}
      min={min}
      max={max}
      open={open}
      onValueChange={onValueChange}
      onDismiss={() => setCalendarOpen(false)}
    />
  )

  return (
    <div className={cn('date-picker min-w-0', className)}>
      <span id={labelId} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </span>
      <div className="flex min-w-0 items-stretch gap-2">
        {mobile ? (
          <>
            {trigger}
            <Dialog
              open={open}
              title={`Choose ${label}`}
              description="Use the calendar to select a date."
              onClose={() => setCalendarOpen(false)}
            >
              {calendar}
            </Dialog>
          </>
        ) : (
          <Popover
            open={open}
            onOpenChange={setCalendarOpen}
            side={popoverSide}
            align={popoverAlign}
            sideOffset={10}
            panelRadius={16}
            className="min-w-0 flex-1"
          >
            <PopoverTrigger>{trigger}</PopoverTrigger>
            <PopoverContent
              ariaLabel={`Choose ${label}`}
              className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
            >
              {calendar}
            </PopoverContent>
          </Popover>
        )}
        {clearable && selected ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onValueChange('')}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Clear ${label}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {error ? (
        <small id={errorId} className="mt-1.5 block text-sm text-destructive" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  )
}

export default DatePicker
