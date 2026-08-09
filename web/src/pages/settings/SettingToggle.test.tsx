import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Bell } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { SettingToggle } from './SettingToggle'

describe('SettingToggle', () => {
  it('uses the BeUI switch and respects its disabled state', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    const { rerender } = render(
      <SettingToggle
        icon={<Bell />}
        title="Spending alerts"
        description="Notify me about budget activity."
        checked={false}
        onChange={onChange}
      />,
    )

    const toggle = screen.getByRole('switch', { name: /spending alerts/i })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await user.click(toggle)
    expect(onChange).toHaveBeenCalledWith(true)

    rerender(
      <SettingToggle
        icon={<Bell />}
        title="Spending alerts"
        description="Notify me about budget activity."
        checked={false}
        disabled
        onChange={onChange}
      />,
    )
    await user.click(toggle)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
