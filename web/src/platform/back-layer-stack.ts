interface BackLayer {
  readonly dismiss: () => void
}

const layers: BackLayer[] = []

export function registerBackLayer(dismiss: () => void): () => void {
  const layer = { dismiss }
  layers.push(layer)
  let registered = true

  return () => {
    if (!registered) return
    registered = false
    const index = layers.lastIndexOf(layer)
    if (index !== -1) layers.splice(index, 1)
  }
}

export function dismissTopBackLayer(): boolean {
  const layer = layers.at(-1)
  if (!layer) return false

  try {
    layer.dismiss()
  } catch {
    // A visible owner still consumes this back press if its close path fails.
  }
  return true
}
