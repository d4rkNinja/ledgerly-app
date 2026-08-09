import path from 'node:path'

export function resolveAndroidLayout(webRoot) {
  const resolvedWebRoot = path.resolve(webRoot)
  const androidDir = path.resolve(
    resolvedWebRoot,
    '..',
    'applications',
    'android',
  )

  return {
    webRoot: resolvedWebRoot,
    androidDir,
    nativeDir: path.join(androidDir, 'native', 'android'),
    assetRoot: androidDir,
    distDir: path.join(resolvedWebRoot, 'dist'),
  }
}
