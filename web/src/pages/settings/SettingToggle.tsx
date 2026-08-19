import { useId, type ReactNode } from 'react'
import { Badge } from '@/components/ui'
import { Switch } from '@/components/motion/switch'

export function SettingToggle({
  icon,
  title,
  description,
  checked,
  onChange,
  disabled,
  badge,
}: {
  icon: ReactNode
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  badge?: string
}) {
  const inputId = useId()
  const titleId = `${inputId}-title`
  const descriptionId = `${inputId}-description`

  return (
    <div className="setting-toggle">
      <span className="setting-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="setting-copy">
        <strong id={titleId}>{title}</strong>
        <small id={descriptionId}>{description}</small>
      </span>
      {badge ? <Badge>{badge}</Badge> : null}
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        ariaLabel={title}
      />
    </div>
  )
}
