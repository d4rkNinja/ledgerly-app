type BodyScrollStyles = {
  position: string
  top: string
  left: string
  right: string
  overflow: string
}

type BodyScrollLockState = {
  count: number
  scrollY: number
  styles: BodyScrollStyles
}

let state: BodyScrollLockState | null = null

function snapshotBodyStyles(): BodyScrollStyles {
  return {
    position: document.body.style.position,
    top: document.body.style.top,
    left: document.body.style.left,
    right: document.body.style.right,
    overflow: document.body.style.overflow,
  }
}

function restoreBodyStyles(styles: BodyScrollStyles) {
  document.body.style.position = styles.position
  document.body.style.top = styles.top
  document.body.style.left = styles.left
  document.body.style.right = styles.right
  document.body.style.overflow = styles.overflow
}

export function lockBodyScroll() {
  if (typeof document === 'undefined') return () => undefined

  if (!state) {
    state = {
      count: 0,
      scrollY: window.scrollY,
      styles: snapshotBodyStyles(),
    }
    document.body.style.position = 'fixed'
    document.body.style.top = `-${state.scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.overflow = 'hidden'
  }

  state.count += 1
  let released = false

  return () => {
    if (released || !state) return
    released = true
    state.count -= 1
    if (state.count > 0) return

    const previous = state
    state = null
    restoreBodyStyles(previous.styles)
    window.scrollTo(0, previous.scrollY)
  }
}
