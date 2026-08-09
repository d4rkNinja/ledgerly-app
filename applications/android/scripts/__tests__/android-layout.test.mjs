import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { resolveAndroidLayout } from '../lib/android-paths.mjs'

test('production layout keeps the web bundle separate from the Android project', () => {
  const workspaceRoot = path.resolve('D:/workspace/ledgerly')
  const layout = resolveAndroidLayout(path.join(workspaceRoot, 'web'))

  assert.equal(layout.webRoot, path.join(workspaceRoot, 'web'))
  assert.equal(layout.androidDir, path.join(workspaceRoot, 'applications', 'android'))
  assert.equal(
    layout.nativeDir,
    path.join(workspaceRoot, 'applications', 'android', 'native', 'android'),
  )
  assert.equal(layout.distDir, path.join(workspaceRoot, 'web', 'dist'))
})
