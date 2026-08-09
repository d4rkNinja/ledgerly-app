import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createAndroidOrchestrator,
  loadAssetGenerator,
} from '../android.mjs'
import { applyAndroidOverlay } from '../lib/android-overlay.mjs'

async function touch(filePath, contents = '') {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents)
}

async function createRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ledgerly-task7-pipeline-'))
  t.after(() => rm(root, { force: true, recursive: true }))
  return root
}

test('setup runs script contracts immediately after npm ci and stops on failure', async (t) => {
  const rootDir = await createRoot(t)
  const events = []
  const orchestrator = createAndroidOrchestrator({
    rootDir,
    androidDir: path.join(rootDir, 'android'),
    nativeDir: path.join(rootDir, 'native', 'android'),
    distDir: path.join(rootDir, 'dist'),
    env: {},
    inspectEnvironment: async () => ({ ok: true, checks: [] }),
    inspectProject: async () => ({ status: 'valid' }),
    runner: async (command, args) => {
      const event = `${command}:${args.join(' ')}`
      events.push(event)
      if (event === 'npm:run test:scripts') {
        throw new Error('script contract failure')
      }
    },
    generateAssets: async () => {},
    applyOverlay: async () => ({ hash: 'overlay' }),
    applyModeConfig: async () => {},
  })

  await assert.rejects(orchestrator.setup(), /script contract failure/)
  assert.deepEqual(events, ['npm:ci', 'npm:run test:scripts'])
})

test('asset loader relabels only exact missing top-level module errors', async () => {
  const topLevelUrl = new URL('../lib/android-assets.mjs', import.meta.url).href
  const missingTopLevel = Object.assign(new Error('missing top-level module'), {
    code: 'ERR_MODULE_NOT_FOUND',
    url: topLevelUrl,
  })
  await assert.rejects(
    loadAssetGenerator(async () => {
      throw missingTopLevel
    }),
    /android-assets\.mjs is unavailable/,
  )

  const missingSharp = Object.assign(new Error('missing nested sharp'), {
    code: 'ERR_MODULE_NOT_FOUND',
    url: 'file:///nested/node_modules/sharp/index.js',
  })
  await assert.rejects(
    loadAssetGenerator(async () => {
      throw missingSharp
    }),
    (error) => error === missingSharp,
  )

  const sharpFailure = new Error('sharp initialization failed')
  await assert.rejects(
    loadAssetGenerator(async () => {
      throw sharpFailure
    }),
    (error) => error === sharpFailure,
  )
})

test('overlay rejects a destination junction that escapes the Android root', async (t) => {
  const rootDir = await createRoot(t)
  const sourceDir = path.join(rootDir, 'native', 'android')
  const androidDir = path.join(rootDir, 'android')
  const outsideDir = path.join(rootDir, 'outside')
  await touch(
    path.join(sourceDir, 'app', 'src', 'main', 'owned.xml'),
    'owned source',
  )
  await mkdir(outsideDir, { recursive: true })
  await mkdir(path.join(androidDir, 'app', 'src'), { recursive: true })
  try {
    const { symlink } = await import('node:fs/promises')
    await symlink(
      outsideDir,
      path.join(androidDir, 'app', 'src', 'main'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
  } catch (error) {
    if (error.code === 'EPERM') {
      t.skip('Host policy does not permit creating a test junction.')
      return
    }
    throw error
  }

  await assert.rejects(
    applyAndroidOverlay({ androidDir, sourceDir }),
    /symlink|escape|regular directories/i,
  )
})
