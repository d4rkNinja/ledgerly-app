import { Coins } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  CURRENCY_OPTIONS,
  currencyLabel,
  normalizeCurrency,
} from '@/domain/currencies'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './motion/select'

export function CurrencySelect({
  value,
  onChange,
  compact = false,
  iconOnly = false,
  disabled = false,
  ariaLabel = 'Change currency',
  className,
}: {
  value: string
  onChange: (value: string) => void
  compact?: boolean
  iconOnly?: boolean
  disabled?: boolean
  ariaLabel?: string
  className?: string
}) {
  const normalized = normalizeCurrency(value)
  const compactTrigger = compact || iconOnly
  const options = CURRENCY_OPTIONS.some((option) => option.value === normalized)
    ? CURRENCY_OPTIONS
    : [
        {
          value: normalized,
          label: currencyLabel(normalized),
        },
        ...CURRENCY_OPTIONS,
      ]

  return (
    <Select
      value={normalized}
      onValueChange={onChange}
      disabled={disabled}
      className={compactTrigger ? 'currency-select-root' : undefined}
    >
      <SelectTrigger
        className={cn(
          compactTrigger ? 'currency-select-trigger' : 'w-full',
          iconOnly && 'currency-select-trigger-icon-only',
          className,
        )}
        aria-label={ariaLabel}
        data-field-control={!compactTrigger || undefined}
        hideIndicator={iconOnly}
      >
        <Coins
          className={cn(
            'currency-select-icon',
            compactTrigger ? 'h-3.5 w-3.5' : 'h-4 w-4',
          )}
          aria-hidden="true"
        />
        {iconOnly ? null : <SelectValue placeholder="Choose currency" />}
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
