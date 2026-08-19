import {
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  SelectTrigger as RegistrySelectTrigger,
} from '@/components/motion/select'
import { cn } from '@/lib/utils'

export {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
}

export interface SelectTriggerProps {
  children: ReactNode
  className?: string
  id?: string
  autoFocus?: boolean
  hideIndicator?: boolean
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
  'data-field-control'?: string | boolean
}

/**
 * App adapter for DOM attributes that the registry trigger intentionally keeps
 * out of its visual API. The rendered control remains the fresh BeUI trigger.
 */
export function SelectTrigger({
  children,
  className,
  autoFocus,
  hideIndicator,
  ...attributes
}: SelectTriggerProps) {
  const hostRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const control = hostRef.current?.querySelector('button')
    if (!control) return

    for (const [name, value] of Object.entries(attributes)) {
      if (value === undefined || value === false) {
        control.removeAttribute(name)
      } else {
        control.setAttribute(name, value === true ? 'true' : String(value))
      }
    }
    if (autoFocus) control.focus()
  }, [attributes, autoFocus])

  return (
    <span ref={hostRef} className="contents">
      <RegistrySelectTrigger
        className={cn(
          className,
          hideIndicator && '[&>span:last-child]:hidden',
        )}
      >
        {children}
      </RegistrySelectTrigger>
    </span>
  )
}
