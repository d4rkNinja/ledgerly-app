import { useLayoutEffect, useRef, type Ref } from 'react'
import {
  Checkbox as RegistryCheckbox,
  type CheckboxProps as RegistryCheckboxProps,
} from '@/components/motion/checkbox'

export interface CheckboxProps extends RegistryCheckboxProps {
  buttonRef?: Ref<HTMLButtonElement>
  'aria-required'?: boolean
  'aria-invalid'?: boolean
}

export function Checkbox({
  buttonRef,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  ...props
}: CheckboxProps) {
  const hostRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const control = hostRef.current?.querySelector('button') ?? null
    if (control) {
      if (ariaRequired !== undefined) {
        control.setAttribute('aria-required', String(ariaRequired))
      }
      if (ariaInvalid !== undefined) {
        control.setAttribute('aria-invalid', String(ariaInvalid))
      }
    }
    if (typeof buttonRef === 'function') buttonRef(control)
    else if (buttonRef) buttonRef.current = control
    return () => {
      if (typeof buttonRef === 'function') buttonRef(null)
      else if (buttonRef) buttonRef.current = null
    }
  }, [ariaInvalid, ariaRequired, buttonRef])

  return (
    <span ref={hostRef} className="contents">
      <RegistryCheckbox {...props} />
    </span>
  )
}
