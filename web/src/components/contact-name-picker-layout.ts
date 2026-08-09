export type ContactPickerMenuPlacement = 'top' | 'bottom'

const MENU_GAP = 8
export const CONTACT_PICKER_MENU_MAX_HEIGHT = 288

/**
 * The panel must be capped by the available viewport space, not its initial
 * loading-state content height. Otherwise a short loading message can lock
 * the menu before contacts arrive and hide every real suggestion.
 */
export function getContactPickerMenuLayout(
  trigger: {
    top: number
    bottom: number
    width: number
    height: number
  },
  bounds: { top: number; bottom: number },
) {
  if (trigger.width <= 0 || trigger.height <= 0) {
    return {
      placement: 'bottom' as const,
      maxHeight: CONTACT_PICKER_MENU_MAX_HEIGHT,
    }
  }

  const above = Math.max(0, trigger.top - bounds.top - MENU_GAP)
  const below = Math.max(0, bounds.bottom - trigger.bottom - MENU_GAP)
  const placement: ContactPickerMenuPlacement =
    below >= CONTACT_PICKER_MENU_MAX_HEIGHT || below >= above
      ? 'bottom'
      : 'top'
  const available = placement === 'bottom' ? below : above
  return {
    placement,
    maxHeight: Math.max(0, Math.min(CONTACT_PICKER_MENU_MAX_HEIGHT, available)),
  }
}
