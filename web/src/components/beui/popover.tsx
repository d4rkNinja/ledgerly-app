import { useLayoutEffect, useRef, type ReactNode } from 'react'
import {
  Popover,
  PopoverTrigger,
  PopoverContent as RegistryPopoverContent,
} from '@/components/motion/popover'

export { Popover, PopoverTrigger }

function AccessiblePopoverLabel({ label }: { label: string }) {
  const markerRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    markerRef.current?.closest('[role="dialog"]')?.setAttribute('aria-label', label)
  }, [label])

  return <span ref={markerRef} className="sr-only">{label}</span>
}

export function PopoverContent({
  children,
  className,
  ariaLabel,
}: {
  children: ReactNode
  className?: string
  ariaLabel?: string
}) {
  return (
    <RegistryPopoverContent className={className}>
      {ariaLabel ? <AccessiblePopoverLabel label={ariaLabel} /> : null}
      {children}
    </RegistryPopoverContent>
  )
}
