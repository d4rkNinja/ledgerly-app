import { createHash } from 'node:crypto'
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

const OWNED_PATHS_FILE = '.ledgerly-android-overlay.json'

function safeRelativePath(relativePath) {
  return (
    typeof relativePath === 'string' &&
    relativePath !== '' &&
    !path.isAbsolute(relativePath) &&
    !relativePath.split(/[\\/]/).includes('..')
  )
}

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true })
  const files = []

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const absolutePath = path.join(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, absolutePath)))
    } else if (entry.isFile()) {
      files.push(path.relative(root, absolutePath).split(path.sep).join('/'))
    } else {
      throw new Error(
        'The native Android overlay may contain only regular files and directories.',
      )
    }
  }
  return files
}

async function readPreviousOwnedPaths(manifestPath) {
  try {
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8'))
    if (
      !Array.isArray(parsed.ownedPaths) ||
      !parsed.ownedPaths.every(safeRelativePath)
    ) {
      throw new Error('invalid owned path manifest')
    }
    return parsed.ownedPaths
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw new Error(
      'The Android overlay ownership manifest is corrupt; remove it and rerun setup.',
    )
  }
}

async function ownedTreeHash(rootDir, ownedPaths) {
  const hash = createHash('sha256')
  for (const relativePath of ownedPaths) {
    hash.update(relativePath)
    hash.update('\0')
    hash.update(await readFile(path.join(rootDir, relativePath)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

async function existingStats(filePath) {
  try {
    return await lstat(filePath)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function assertSafeDestination(androidDir, destinationPath) {
  const relativePath = path.relative(androidDir, destinationPath)
  if (!safeRelativePath(relativePath.split(path.sep).join('/'))) {
    throw new Error('The Android overlay destination escapes the Android root.')
  }
  const segments = relativePath.split(path.sep)
  let current = androidDir
  for (const segment of segments) {
    current = path.join(current, segment)
    const stats = await existingStats(current)
    if (stats?.isSymbolicLink()) {
      throw new Error(
        'The Android overlay destination may contain only regular directories and files; symlinks are not permitted.',
      )
    }
  }
}

export async function applyAndroidOverlay(options = {}) {
  const sourceDir = path.resolve(
    options.sourceDir ??
      path.join(options.projectRoot ?? process.cwd(), 'native', 'android'),
  )
  const androidDir = path.resolve(
    options.androidDir ??
      path.join(options.projectRoot ?? process.cwd(), 'android'),
  )

  try {
    const sourceStats = await lstat(sourceDir)
    if (!sourceStats.isDirectory()) throw new Error('not a directory')
  } catch {
    throw new Error(
      'The native/android overlay is unavailable. Complete Task 7 before running an Android sync or build command.',
    )
  }

  const androidStats = await existingStats(androidDir)
  if (
    androidStats &&
    (!androidStats.isDirectory() || androidStats.isSymbolicLink())
  ) {
    throw new Error('The Android overlay root must be a regular directory.')
  }
  await mkdir(androidDir, { recursive: true })
  const manifestPath = path.join(androidDir, OWNED_PATHS_FILE)
  const previousOwnedPaths = await readPreviousOwnedPaths(manifestPath)
  const ownedPaths = await listFiles(sourceDir)
  const expectedHash = await ownedTreeHash(sourceDir, ownedPaths)
  const writeOwnedFile = options.writeOwnedFile ?? writeFile
  const currentPaths = new Set(ownedPaths)

  for (const stalePath of previousOwnedPaths) {
    if (!currentPaths.has(stalePath)) {
      const destinationPath = path.join(androidDir, stalePath)
      await assertSafeDestination(androidDir, destinationPath)
      await rm(destinationPath, { force: true })
    }
  }

  for (const relativePath of ownedPaths) {
    const sourcePath = path.join(sourceDir, relativePath)
    const destinationPath = path.join(androidDir, relativePath)
    await assertSafeDestination(androidDir, destinationPath)
    await mkdir(path.dirname(destinationPath), { recursive: true })
    await assertSafeDestination(androidDir, destinationPath)
    await writeOwnedFile(destinationPath, await readFile(sourcePath))
  }

  const destinationHash = await ownedTreeHash(androidDir, ownedPaths)
  if (destinationHash !== expectedHash) {
    throw new Error(
      'The Android overlay failed source-to-destination owned-tree parity.',
    )
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify({ hash: expectedHash, ownedPaths }, null, 2)}\n`,
  )

  return { hash: expectedHash, ownedPaths }
}
