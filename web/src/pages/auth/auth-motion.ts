import {
  MOTION_DISTANCE,
  TRANSITION_CONTENT,
} from '@/lib/ease'

export function entrance(reducedMotion: boolean, delay = 0) {
  return {
    initial: reducedMotion
      ? (false as const)
      : { opacity: 0, y: MOTION_DISTANCE.panel },
    animate: { opacity: 1, y: 0 },
    transition: reducedMotion
      ? { duration: 0 }
      : { ...TRANSITION_CONTENT, delay },
  }
}
