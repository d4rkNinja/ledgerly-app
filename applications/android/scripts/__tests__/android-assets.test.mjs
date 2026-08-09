import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from 'node:fs/promises'
import os from 'node:os'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { generateAndroidAssets } from '../lib/android-assets.mjs'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(testDirectory, '..', '..', '..', '..')
const sharp = createRequire(
  path.join(workspaceRoot, 'web', 'package.json'),
)('sharp')

const EXPECTED_SOURCE_SIZES = new Map([
  ['assets/icon-only.png', [1024, 1024]],
  ['assets/icon-foreground.png', [1024, 1024]],
  ['assets/icon-background.png', [1024, 1024]],
  ['assets/splash.png', [2732, 2732]],
  ['assets/splash-dark.png', [2732, 2732]],
  ['resources/play-store-icon.png', [512, 512]],
])

async function createFixture(t) {
  const projectRoot = await mkdtemp(
    path.join(os.tmpdir(), 'ledgerly-android-assets-'),
  )
  t.after(() => rm(projectRoot, { force: true, recursive: true }))
  await mkdir(path.join(projectRoot, 'public'), { recursive: true })
  await copyFile(
    path.resolve('public/logo.svg'),
    path.join(projectRoot, 'public', 'logo.svg'),
  )
  return projectRoot
}

async function treeHashes(rootDir) {
  const hashes = new Map()
  async function visit(current) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      const absolutePath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await visit(absolutePath)
      } else if (entry.isFile()) {
        const relativePath = path
          .relative(rootDir, absolutePath)
          .split(path.sep)
          .join('/')
        hashes.set(
          relativePath,
          createHash('sha256')
            .update(await readFile(absolutePath))
            .digest('hex'),
        )
      }
    }
  }
  await visit(rootDir)
  return hashes
}

test('asset generation uses exact Sharp and emits deterministic required sources', async (t) => {
  const projectRoot = await createFixture(t)
  const sharpPackage = JSON.parse(
    await readFile(
      path.join(workspaceRoot, 'web', 'node_modules', 'sharp', 'package.json'),
      'utf8',
    ),
  )
  assert.equal(sharpPackage.version, '0.35.3')

  const first = await generateAndroidAssets({ projectRoot })
  const firstHashes = await treeHashes(projectRoot)
  const second = await generateAndroidAssets({ projectRoot })
  const secondHashes = await treeHashes(projectRoot)

  assert.deepEqual(first, second)
  assert.deepEqual(firstHashes, secondHashes)

  for (const [
    relativePath,
    [minimumWidth, minimumHeight],
  ] of EXPECTED_SOURCE_SIZES) {
    const metadata = await sharp(path.join(projectRoot, relativePath)).metadata()
    assert.ok(metadata.width >= minimumWidth, `${relativePath} width`)
    assert.ok(metadata.height >= minimumHeight, `${relativePath} height`)
  }

  const storeMetadata = await sharp(
    path.join(projectRoot, 'resources', 'play-store-icon.png'),
  ).metadata()
  assert.equal(storeMetadata.width, 512)
  assert.equal(storeMetadata.height, 512)
  assert.equal(storeMetadata.hasAlpha, false)
  assert.equal(storeMetadata.space, 'srgb')
})

test('adaptive foreground mark stays inside the inner 66.67 percent safe zone', async (t) => {
  const projectRoot = await createFixture(t)
  await generateAndroidAssets({ projectRoot })
  const { data, info } = await sharp(
    path.join(projectRoot, 'assets', 'icon-foreground.png'),
  )
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] !== 0) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }
  const inset = Math.floor(info.width / 6)
  assert.ok(minX >= inset)
  assert.ok(minY >= inset)
  assert.ok(maxX < info.width - inset)
  assert.ok(maxY < info.height - inset)
})

test('asset manifest is sorted, content-addressed, and native monochrome is single-color', async (t) => {
  const projectRoot = await createFixture(t)
  await generateAndroidAssets({ projectRoot })

  const manifest = JSON.parse(
    await readFile(
      path.join(projectRoot, 'assets', 'android-assets.sha256.json'),
      'utf8',
    ),
  )
  const paths = manifest.files.map(({ path: filePath }) => filePath)
  assert.deepEqual(paths, [...paths].sort())
  assert.ok(manifest.files.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256)))

  const monochrome = await readFile(
    path.join(
      projectRoot,
      'native',
      'android',
      'app',
      'src',
      'main',
      'res',
      'drawable',
      'ic_launcher_monochrome.xml',
    ),
    'utf8',
  )
  const colors = [
    ...monochrome.matchAll(/fillColor="(#[A-Fa-f0-9]{6,8})"/g),
  ].map((match) => match[1].toLowerCase())
  assert.ok(colors.length >= 1)
  assert.deepEqual([...new Set(colors)], ['#000000'])
})
