export * from './ease'

import { EASE_OUT } from './ease'

/** Product-level timing layered on top of the registry-owned BeUI tokens. */
export const MOTION_DURATION = {
  instant: 0,
  fast: 0.14,
  standard: 0.22,
  deliberate: 0.28,
} as const

export const MOTION_DISTANCE = {
  content: 6,
  panel: 8,
} as const

export const TRANSITION_FADE = {
  duration: MOTION_DURATION.fast,
  ease: EASE_OUT,
} as const

export const TRANSITION_CONTENT = {
  duration: MOTION_DURATION.standard,
  ease: EASE_OUT,
} as const

export const TRANSITION_PANEL = {
  duration: MOTION_DURATION.deliberate,
  ease: EASE_OUT,
} as const
