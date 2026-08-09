#!/usr/bin/env node

import { lstat, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  inspectAndroidEnvironment,
  inspectAndroidProject,
  loadDebugApiEnvironment,
  validateReleaseApiUrl,
} from './lib/android-environment.mjs'
import {
  androidModeEnvironment,
  applyAndroidModeConfig,
} from './lib/android-mode.mjs'
import { applyAndroidOverlay } from './lib/android-overlay.mjs'
import { resolveAndroidLayout } from './lib/android-paths.mjs'
import { runCommand } from './lib/android-process.mjs'

const ASSET_MODULE_URL = new URL('./lib/android-assets.mjs', import.meta.url).href
const DEBUG_APK = path.join(
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk',
)
const RELEASE_APK = path.join(
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk',
)
const APP_ID = 'io.github.d4rkninja.ledgerly'
const USAGE = `Usage:
  node scripts/android.mjs doctor
  node scripts/android.mjs setup [--open] [--release]
  node scripts/android.mjs sync
  node scripts/android.mjs assets
  node scripts/android.mjs open
  node scripts/android.mjs run [--target <adb-serial>]
  node scripts/android.mjs build <debug|release>
  node scripts/android.mjs test
  node scripts/android.mjs clean`


function requireSuccessfulDoctor(result) {
  if (result.ok) return result
  const messages = result.checks
    .filter(({ ok }) => !ok)
    .map(({ name, message }) => `${name}: ${message}`)
  throw new Error(`Android environment validation failed:\n${messages.join('\n')}`)
}

function releaseEnvironment(env) {
  const parsed = validateReleaseApiUrl(env.VITE_API_BASE_URL)
  return { ...env, VITE_API_BASE_URL: parsed.href }
}

export async function loadAssetGenerator(
  importer = (moduleUrl) => import(moduleUrl),
) {
  try {
    const module = await importer(ASSET_MODULE_URL)
    const generator = module.generateAndroidAssets ?? module.default
    if (typeof generator !== 'function') {
      throw new Error(
        'scripts/lib/android-assets.mjs must export generateAndroidAssets.',
      )
    }
    return generator
  } catch (error) {
    if (
      error.code === 'ERR_MODULE_NOT_FOUND' &&
      error.url === ASSET_MODULE_URL
    ) {
      throw new Error(
        'scripts/lib/android-assets.mjs is unavailable. Complete Task 7 before invoking an asset-requiring Android command.',
        { cause: error },
      )
    }
    throw error
  }
}

export function createAndroidOrchestrator(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd())
  const layout = resolveAndroidLayout(rootDir)
  const androidDir = path.resolve(options.androidDir ?? layout.androidDir)
  const nativeDir = path.resolve(options.nativeDir ?? layout.nativeDir)
  const distDir = path.resolve(options.distDir ?? layout.distDir)
  const env = options.env ?? process.env
  const runner = options.runner ?? runCommand
  const inspectEnvironment =
    options.inspectEnvironment ?? inspectAndroidEnvironment
  const inspectProject =
    options.inspectProject ??
    (() => inspectAndroidProject({ cwd: rootDir, androidDir }))
  const generateAssets = options.generateAssets
  const applyOverlay = options.applyOverlay ?? applyAndroidOverlay
  const configureMode =
    options.applyModeConfig ?? applyAndroidModeConfig

  async function resolveModeEnvironment(baseEnvironment, mode) {
    const effectiveEnvironment =
      mode === 'debug'
        ? await loadDebugApiEnvironment(rootDir, baseEnvironment)
        : baseEnvironment
    return androidModeEnvironment(effectiveEnvironment, mode)
  }

  async function runNpm(args, step, commandEnv = env) {
    await runner('npm', args, {
      cwd: rootDir,
      env: commandEnv,
      step,
    })
  }

  async function runGradle(task, step, commandEnv = env) {
    await runner('gradle', [task], {
      cwd: androidDir,
      env: commandEnv,
      step,
    })
  }

  async function inspect(requireProject) {
    return requireSuccessfulDoctor(
      await inspectEnvironment({
        cwd: rootDir,
        env,
        androidDir,
        requireProject,
      }),
    )
  }

  async function requireValidProject() {
    const project = await inspectProject()
    if (project.status !== 'valid') {
      throw new Error(
        project.status === 'partial'
          ? project.message
          : 'The Android project is absent; run android:setup first.',
      )
    }
    return inspect(true)
  }

  async function verifyArtifact(relativePath, label, baseDir = androidDir) {
    const artifactPath = path.join(baseDir, relativePath)
    let artifactStats
    try {
      artifactStats = await lstat(artifactPath)
    } catch {
      throw new Error(
        `${label} was not produced as a non-empty regular file at ${relativePath}.`,
      )
    }
    if (!artifactStats.isFile() || artifactStats.size === 0) {
      throw new Error(
        `${label} was not produced as a non-empty regular file at ${relativePath}.`,
      )
    }
    return artifactPath
  }

  async function removeExpectedArtifact(relativePath) {
    await rm(path.join(androidDir, relativePath), {
      force: true,
      recursive: true,
    })
  }

  async function freshWebBuild(script, commandEnv = env) {
    await rm(distDir, { force: true, recursive: true })
    await runNpm(['run', script], `React ${script}`, commandEnv)
    await verifyArtifact(
      'dist/index.html',
      'Fresh React production bundle',
      rootDir,
    )
  }

  async function assets() {
    const generator = generateAssets ?? (await loadAssetGenerator())
    return generator({
      androidDir,
      outputRoot: androidDir,
      projectRoot: rootDir,
      sourceRoot: rootDir,
    })
  }

  async function overlay() {
    return applyOverlay({
      androidDir,
      projectRoot: rootDir,
      sourceDir: nativeDir,
    })
  }

  async function synchronize(commandEnv = env, mode = 'debug') {
    const modeEnvironment = androidModeEnvironment(commandEnv, mode)
    await assets()
    await overlay()
    await runNpm(
      ['exec', '--', 'cap', 'sync', 'android'],
      'Capacitor Android sync',
      modeEnvironment,
    )
    await configureMode({
      androidDir,
      apiUrl: modeEnvironment.VITE_API_BASE_URL,
      mode,
      projectRoot: rootDir,
    })
    return modeEnvironment
  }

  async function doctor() {
    const project = await inspectProject()
    if (project.status === 'partial') {
      throw new Error(project.message)
    }
    return inspect(project.status === 'valid')
  }

  async function setup(setupOptions = {}) {
    const mode = setupOptions.release ? 'release' : 'debug'
    const baseEnvironment = setupOptions.release
      ? releaseEnvironment(env)
      : env
    const commandEnv = await resolveModeEnvironment(baseEnvironment, mode)
    await inspect(false)
    await runNpm(['ci'], 'npm clean install', commandEnv)
    await runNpm(['run', 'test:scripts'], 'Node Android script tests', commandEnv)
    await runNpm(
      ['exec', '--', 'cap', 'doctor'],
      'Capacitor doctor',
      commandEnv,
    )
    await freshWebBuild('check', commandEnv)

    const project = await inspectProject()
    if (project.status === 'partial') {
      throw new Error(project.message)
    }
    if (project.status === 'absent') {
      await runNpm(
        ['exec', '--', 'cap', 'add', 'android'],
        'Capacitor Android project creation',
        commandEnv,
      )
    }
    await inspect(true)
    await synchronize(commandEnv, mode)
    await runGradle('dependencies', 'Gradle dependency resolution', commandEnv)
    await runGradle('testDebugUnitTest', 'Gradle debug unit tests', commandEnv)
    await runGradle('lintDebug', 'Gradle debug lint', commandEnv)
    await removeExpectedArtifact(DEBUG_APK)
    await runGradle('assembleDebug', 'Gradle debug APK build', commandEnv)
    await verifyArtifact(DEBUG_APK, 'Debug APK')

    if (setupOptions.release) {
      await removeExpectedArtifact(RELEASE_APK)
      await runGradle('assembleRelease', 'Gradle release APK build', commandEnv)
      await verifyArtifact(RELEASE_APK, 'Release APK')
    }
    if (setupOptions.open) {
      await runNpm(
        ['exec', '--', 'cap', 'open', 'android'],
        'Open Android Studio',
        commandEnv,
      )
    }
  }

  async function sync() {
    await requireValidProject()
    const commandEnv = await resolveModeEnvironment(env, 'debug')
    await freshWebBuild('build', commandEnv)
    await synchronize(commandEnv, 'debug')
  }

  async function build(variant) {
    if (variant !== 'debug' && variant !== 'release') {
      throw new Error(USAGE)
    }
    const baseEnvironment =
      variant === 'release' ? releaseEnvironment(env) : env
    const commandEnv = await resolveModeEnvironment(baseEnvironment, variant)
    await requireValidProject()
    await freshWebBuild('build', commandEnv)
    await synchronize(commandEnv, variant)
    const task = variant === 'release' ? 'assembleRelease' : 'assembleDebug'
    const artifact = variant === 'release' ? RELEASE_APK : DEBUG_APK
    await removeExpectedArtifact(artifact)
    await runGradle(task, `Gradle ${variant} build`, commandEnv)
    return verifyArtifact(
      artifact,
      variant === 'release' ? 'Release APK' : 'Debug APK',
    )
  }

  async function open() {
    await requireValidProject()
    await runNpm(
      ['exec', '--', 'cap', 'open', 'android'],
      'Open Android Studio',
    )
  }

  async function run(runOptions = {}) {
    const apkPath = await build('debug')
    const result = await inspect(true)
    const adbPath = result.checks.find(({ name }) => name === 'adb')?.path
    if (!adbPath) throw new Error('adb path is unavailable after validation.')
    const targetArgs = runOptions.target ? ['-s', runOptions.target] : []
    await runner(
      adbPath,
      [...targetArgs, 'install', '-r', apkPath],
      {
        cwd: rootDir,
        env,
        step: 'Install debug APK with adb',
      },
    )
    await runner(
      adbPath,
      [
        ...targetArgs,
        'shell',
        'am',
        'start',
        '-n',
        `${APP_ID}/.MainActivity`,
      ],
      {
        cwd: rootDir,
        env,
        step: 'Launch Ledgerly with adb',
      },
    )
  }

  async function testAndroid() {
    await requireValidProject()
    await runGradle('dependencies', 'Gradle dependency resolution')
    await runGradle('testDebugUnitTest', 'Gradle debug unit tests')
    await runGradle('lintDebug', 'Gradle debug lint')
  }

  async function clean() {
    const project = await inspectProject()
    if (project.status === 'partial') throw new Error(project.message)
    if (project.status === 'valid') {
      await inspect(true)
      await runGradle('clean', 'Gradle clean')
    }
    await rm(distDir, { force: true, recursive: true })
  }

  return {
    assets,
    build,
    clean,
    doctor,
    open,
    run,
    setup,
    sync,
    test: testAndroid,
  }
}

function parseSetupOptions(args) {
  const allowed = new Set(['--open', '--release'])
  if (
    args.some((arg) => !allowed.has(arg)) ||
    new Set(args).size !== args.length
  ) {
    throw new Error(USAGE)
  }
  return {
    open: args.includes('--open'),
    release: args.includes('--release'),
  }
}

function parseRunOptions(args) {
  if (args.length === 0) return {}
  if (
    args.length !== 2 ||
    args[0] !== '--target' ||
    args[1].length === 0
  ) {
    throw new Error(USAGE)
  }
  return { target: args[1] }
}

export async function main(
  argv = process.argv.slice(2),
  orchestrator = createAndroidOrchestrator(),
) {
  const [command, ...args] = argv
  switch (command) {
    case 'doctor':
    case 'sync':
    case 'assets':
    case 'open':
    case 'test':
    case 'clean':
      if (args.length !== 0) throw new Error(USAGE)
      return orchestrator[command]()
    case 'setup':
      return orchestrator.setup(parseSetupOptions(args))
    case 'run':
      return orchestrator.run(parseRunOptions(args))
    case 'build':
      if (args.length !== 1) throw new Error(USAGE)
      return orchestrator.build(args[0])
    default:
      throw new Error(USAGE)
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
