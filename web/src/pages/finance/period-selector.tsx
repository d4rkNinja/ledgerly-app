import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { DatePicker } from '@/components/date-picker'
import { Button } from '@/components/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/beui/select'
import {
  addDateOnlyMonths,
  formatDateOnly,
  isDateOnly,
  type DateOnly,
} from '@/lib/date-only'

export type DashboardPeriodMode =
  | 'this-month'
  | 'last-month'
  | 'custom-month'
  | 'custom-range'
  | 'this-week'
  | 'last-7-days'
  | 'this-year'
  | 'all-time'

export interface DashboardPeriodValue {
  mode: DashboardPeriodMode
  month: DateOnly
  from: DateOnly
  to: DateOnly
}

interface PeriodSelectorProps {
  value: DashboardPeriodValue
  onChange: (value: Partial<DashboardPeriodValue> & { mode: DashboardPeriodMode }) => void
  onClear: () => void
}

function monthDate(value: DateOnly) {
  return `${value.slice(0, 7)}-01` as DateOnly
}

function labelForMode(mode: DashboardPeriodMode) {
  switch (mode) {
    case 'this-month':
      return 'This month'
    case 'last-month':
      return 'Last month'
    case 'custom-month':
      return 'Custom month'
    case 'custom-range':
      return 'Custom date range'
    case 'this-week':
      return 'This week'
    case 'last-7-days':
      return 'Last 7 days'
    case 'this-year':
      return 'This year'
    case 'all-time':
      return 'All time'
  }
}

export function PeriodSelector({ value, onChange, onClear }: PeriodSelectorProps) {
  const month = monthDate(value.month)
  const monthLabel = formatDateOnly(month, { month: 'long', year: 'numeric' })
  const selectedYear = Number(month.slice(0, 4))
  const selectedMonth = month.slice(5, 7)
  const yearOptions = Array.from({ length: 21 }, (_, index) => selectedYear - 10 + index)
  const canMoveMonth = value.mode === 'this-month' || value.mode === 'last-month' || value.mode === 'custom-month'

  return (
    <section className="dashboard-period-selector" aria-label="Dashboard period">
      <div className="dashboard-period-selector-main">
        <div>
          <span className="dashboard-period-kicker">Reporting period</span>
          <strong>{labelForMode(value.mode)}</strong>
        </div>
        <Select
          value={value.mode}
          onValueChange={(mode) => onChange({ mode: mode as DashboardPeriodMode })}
          className="dashboard-period-select"
        >
          <SelectTrigger aria-label="Choose reporting period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this-month">This month</SelectItem>
            <SelectItem value="last-month">Last month</SelectItem>
            <SelectItem value="custom-month">Custom month</SelectItem>
            <SelectItem value="custom-range">Custom date range</SelectItem>
            <SelectItem value="this-week">This week</SelectItem>
            <SelectItem value="last-7-days">Last 7 days</SelectItem>
            <SelectItem value="this-year">This year</SelectItem>
            <SelectItem value="all-time">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {canMoveMonth ? (
        <div className="dashboard-month-controls" aria-label="Month navigation">
          <Button
            variant="quiet"
            className="dashboard-month-arrow"
            aria-label={`Previous month from ${monthLabel}`}
            onClick={() => onChange({ mode: 'custom-month', month: addDateOnlyMonths(month, -1) })}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <div className="dashboard-month-picker" aria-label="Choose month and year">
            <Select
              value={selectedMonth}
              onValueChange={(nextMonth) => onChange({ mode: 'custom-month', month: `${selectedYear}-${nextMonth}-01` as DateOnly })}
            >
              <SelectTrigger aria-label="Choose month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, index) => {
                  const monthNumber = String(index + 1).padStart(2, '0')
                  const label = formatDateOnly(`${selectedYear}-${monthNumber}-01` as DateOnly, { month: 'long' })
                  return <SelectItem key={monthNumber} value={monthNumber}>{label}</SelectItem>
                })}
              </SelectContent>
            </Select>
            <Select
              value={String(selectedYear)}
              onValueChange={(nextYear) => onChange({ mode: 'custom-month', month: `${nextYear}-${selectedMonth}-01` as DateOnly })}
            >
              <SelectTrigger aria-label="Choose year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="quiet"
            className="dashboard-month-arrow"
            aria-label={`Next month from ${monthLabel}`}
            onClick={() => onChange({ mode: 'custom-month', month: addDateOnlyMonths(month, 1) })}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          <Button
            variant="secondary"
            className="dashboard-period-current"
            onClick={() => onChange({ mode: 'this-month' })}
          >
            Current month
          </Button>
        </div>
      ) : null}
      {value.mode === 'custom-range' ? (
        <div className="dashboard-range-controls">
          <DatePicker
            label="From"
            value={value.from}
            onValueChange={(from) => {
              if (isDateOnly(from)) onChange({ mode: 'custom-range', from })
            }}
          />
          <DatePicker
            label="To"
            value={value.to}
            min={value.from}
            onValueChange={(to) => {
              if (isDateOnly(to)) onChange({ mode: 'custom-range', to })
            }}
          />
        </div>
      ) : null}
      <div className="dashboard-period-selector-footer">
        <span>{formatDateOnly(value.from)} to {formatDateOnly(value.to)}</span>
        <button type="button" className="dashboard-period-clear" onClick={onClear}>
          <RotateCcw aria-hidden="true" />
          Clear range
        </button>
      </div>
    </section>
  )
}
