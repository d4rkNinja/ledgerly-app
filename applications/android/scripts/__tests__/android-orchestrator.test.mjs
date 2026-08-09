import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createAndroidOrchestrator,
  main,
} from '../android.mjs'
import { applyAndroidOverlay } from '../lib/android-overlay.mjs'
import {
  gradleCommand,
  runCommand,
} from '../lib/android-process.mjs'

async function touch(filePath, contents = '') {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents)
}

async function createRoot(t, label = 'ledgerly-android-orchestrator-') {
  const root = await mkdtemp(path.join(os.tmpdir(), label))
  t.after(() => rm(root, { force: true, recursive: true }))
  return root
}

function fixtureLayout(rootDir) {
  return {
    androidDir: path.join(rootDir, 'android'),
    nativeDir: path.join(rootDir, 'native', 'android'),
    distDir: path.join(rootDir, 'dist'),
  }
}

function debugApkPath(rootDir) {
  return path.join(
    rootDir,
    'android',
    'app',
    'build',
    'outputs',
    'apk',
    'debug',
    'app-debug.apk',
  )
}

function releaseApkPath(rootDir) {
  return path.join(
    rootDir,
    'android',
    'app',
    'build',
    'outputs',
    'apk',
    'release',
    'app-release.apk',
  )
}

function successfulDoctor(adbPath = 'C:\\Android SDK\\platform-tools\\adb.exe') {
  return {
    ok: true,
    checks: [
      {
        ok: true,
        name: 'adb',
        version: null,
        path: adbPath,
        message: 'adb is available.',
      },
    ],
  }
}

async function workflowFixture(t, options = {}) {
  const rootDir = await createRoot(t)
  const events = []
  const projectStates = [...(options.projectStates ?? ['absent'])]
  const env = {
    VITE_API_BASE_URL: 'https://api.ledgerly.example/api/v1',
  }

  const runner = async (command, args, commandOptions) => {
    const call = `${command}:${args.join(' ')}`
    events.push(call)
    if (call === options.failAt) {
      throw new Error(`intentional failure at ${call}`)
    }
    if (call === 'npm:run check' || call === 'npm:run build') {
      await touch(path.join(rootDir, 'dist', 'index.html'), 'fresh')
    }
    if (call === 'gradle:assembleDebug' && options.writeApk !== false) {
      const artifactPath = debugApkPath(rootDir)
      if (options.apkAsDirectory) {
        await mkdir(artifactPath, { recursive: true })
      } else {
        await touch(artifactPath, options.apkContents ?? 'apk')
      }
    }
    if (call === 'gradle:assembleRelease' && options.writeReleaseApk !== false) {
      await touch(
        releaseApkPath(rootDir),
        options.releaseApkContents ?? 'release apk',
      )
    }
    assert.equal(commandOptions.cwd.startsWith(rootDir), true)
  }

  const inspectEnvironment = async ({ requireProject }) => {
    events.push(requireProject ? 'doctor:project' : 'doctor:host')
    return successfulDoctor()
  }

  const inspectProject = async () => {
    const status = projectStates.length > 1
      ? projectStates.shift()
      : projectStates[0]
    events.push(`project:${status}`)
    return { status, message: `project is ${status}` }
  }

  const generateAssets = async () => {
    events.push('assets')
  }
  const applyOverlay = async () => {
    events.push('overlay')
    return { hash: 'fixture-overlay-hash' }
  }
  const applyModeConfig = async () => {
    events.push('mode-config')
  }

  const orchestrator = createAndroidOrchestrator({
    rootDir,
    ...fixtureLayout(rootDir),
    env,
    runner,
    inspectEnvironment,
    inspectProject,
    generateAssets,
    applyOverlay,
    applyModeConfig,
  })

  return { rootDir, env, events, orchestrator }
}

test('setup executes the complete debug pipeline in fail-fast order without a duplicate web build', async (t) => {
  const fixture = await workflowFixture(t, {
    projectStates: ['absent', 'valid'],
  })

  await fixture.orchestrator.setup({ open: true, release: true })

  assert.deepEqual(fixture.events, [
    'doctor:host',
    'npm:ci',
    'npm:run test:scripts',
    'npm:exec -- cap doctor',
    'npm:run check',
    'project:absent',
    'npm:exec -- cap add android',
    'doctor:project',
    'assets',
    'overlay',
    'npm:exec -- cap sync android',
    'mode-config',
    'gradle:dependencies',
    'gradle:testDebugUnitTest',
    'gradle:lintDebug',
    'gradle:assembleDebug',
    'gradle:assembleRelease',
    'npm:exec -- cap open android',
  ])
  assert.equal(
    fixture.events.filter((event) => event === 'npm:run build').length,
    0,
  )
})

test('setup skips cap add for an existing structurally valid Android project', async (t) => {
  const fixture = await workflowFixture(t, {
    projectStates: ['valid'],
  })

  await fixture.orchestrator.setup()

  assert.equal(
    fixture.events.includes('npm:exec -- cap add android'),
    false,
  )
  assert.equal(fixture.events.includes('doctor:project'), true)
})

test('setup rejects a partial Android directory without running cap add or later steps', async (t) => {
  const fixture = await workflowFixture(t, {
    projectStates: ['partial'],
  })

  await assert.rejects(
    fixture.orchestrator.setup(),
    /partial or corrupt|project is partial/,
  )

  assert.equal(
    fixture.events.includes('npm:exec -- cap add android'),
    false,
  )
  assert.equal(fixture.events.includes('assets'), false)
})

test('a failed command prevents every later setup command', async (t) => {
  const fixture = await workflowFixture(t, {
    failAt: 'gradle:lintDebug',
    projectStates: ['valid'],
  })

  await assert.rejects(fixture.orchestrator.setup(), /lintDebug/)

  assert.equal(fixture.events.includes('gradle:assembleDebug'), false)
  assert.equal(fixture.events.includes('gradle:assembleRelease'), false)
})

test('invalid release setup configuration has no doctor, build, or sync side effect', async (t) => {
  const fixture = await workflowFixture(t)
  fixture.env.VITE_API_BASE_URL = 'https://user:secret@example.com/api/v1'

  await assert.rejects(
    fixture.orchestrator.setup({ release: true }),
    /VITE_API_BASE_URL/,
  )

  assert.deepEqual(fixture.events, [])
})

test('setup fails when the debug APK is missing after successful commands', async (t) => {
  const fixture = await workflowFixture(t, {
    projectStates: ['valid'],
    writeApk: false,
  })

  await assert.rejects(fixture.orchestrator.setup(), /app-debug\.apk/)
})

test('release setup fails when the release APK is missing after assembleRelease', async (t) => {
  const fixture = await workflowFixture(t, {
    projectStates: ['valid'],
    writeReleaseApk: false,
  })

  await assert.rejects(
    fixture.orchestrator.setup({ release: true }),
    /app-release\.apk/,
  )
})

test('setup removes a stale debug APK and rejects a successful Gradle run that does not replace it', async (t) => {
  const fixture = await workflowFixture(t, {
    projectStates: ['valid'],
    writeApk: false,
  })
  await touch(debugApkPath(fixture.rootDir), 'stale apk')

  await assert.rejects(fixture.orchestrator.setup(), /app-debug\.apk/)
  await assert.rejects(readFile(debugApkPath(fixture.rootDir)), /ENOENT/)
})

test('release setup removes a stale APK and rejects assembleRelease when it does not replace it', async (t) => {
  const fixture = await workflowFixture(t, {
    projectStates: ['valid'],
    writeReleaseApk: false,
  })
  await touch(releaseApkPath(fixture.rootDir), 'stale apk')

  await assert.rejects(
    fixture.orchestrator.setup({ release: true }),
    /app-release\.apk/,
  )
  await assert.rejects(readFile(releaseApkPath(fixture.rootDir)), /ENOENT/)
})

test('direct debug build removes a stale APK before assembleDebug', async (t) => {
  const fixture = await workflowFixture(t, {
    projectStates: ['valid'],
    writeApk: false,
  })
  await touch(debugApkPath(fixture.rootDir), 'stale apk')

  await assert.rejects(fixture.orchestrator.build('debug'), /app-debug\.apk/)
  await assert.rejects(readFile(debugApkPath(fixture.rootDir)), /ENOENT/)
})

test('direct release build removes a stale APK before assembleRelease', async (t) => {
  const fixture = await workflowFixture(t, {
    projectStates: ['valid'],
    writeReleaseApk: false,
  })
  await touch(releaseApkPath(fixture.rootDir), 'stale apk')

  await assert.rejects(
    fixture.orchestrator.build('release'),
    /app-release\.apk/,
  )
  await assert.rejects(readFile(releaseApkPath(fixture.rootDir)), /ENOENT/)
})

test('direct release build produces a release APK through assembleRelease', async (t) => {
  const fixture = await workflowFixture(t, {
    projectStates: ['valid'],
  })

  const artifact = await fixture.orchestrator.build('release')

  assert.equal(artifact, releaseApkPath(fixture.rootDir))
  assert.equal(await readFile(artifact, 'utf8'), 'release apk')
  assert.equal(fixture.events.includes('gradle:assembleRelease'), true)
  assert.equal(fixture.events.includes('gradle:bundleRelease'), false)
})

test('artifact verification rejects newly produced empty files and directories', async (t) => {
  const emptyFile = await workflowFixture(t, {
    apkContents: '',
    projectStates: ['valid'],
  })
  await assert.rejects(
    emptyFile.orchestrator.build('debug'),
    /non-empty regular file|app-debug\.apk/,
  )

  const directory = await workflowFixture(t, {
    apkAsDirectory: true,
    projectStates: ['valid'],
  })
  await assert.rejects(
    directory.orchestrator.build('debug'),
    /non-empty regular file|app-debug\.apk/,
  )
})

for (const command of ['sync', 'build-debug', 'build-release']) {
  test(`${command} removes stale dist before building and synchronizes only the fresh bundle`, async (t) => {
    const fixture = await workflowFixture(t, {
      projectStates: ['valid'],
    })
    await touch(path.join(fixture.rootDir, 'dist', 'index.html'), 'stale')
    await touch(path.join(fixture.rootDir, 'dist', 'stale-only.js'), 'stale')

    if (command === 'sync') {
      await fixture.orchestrator.sync()
    } else if (command === 'build-debug') {
      await fixture.orchestrator.build('debug')
    } else {
      await fixture.orchestrator.build('release')
    }

    await assert.rejects(
      readFile(path.join(fixture.rootDir, 'dist', 'stale-only.js')),
      /ENOENT/,
    )
    assert.equal(
      fixture.events.indexOf('npm:run build') <
        fixture.events.indexOf('npm:exec -- cap sync android'),
      true,
    )
  })
}

test('doctor does not load future asset generation and assets fails actionably only when invoked', async (t) => {
  const rootDir = await createRoot(t)
  const orchestrator = createAndroidOrchestrator({
    rootDir,
    ...fixtureLayout(rootDir),
    inspectEnvironment: async () => successfulDoctor(),
    inspectProject: async () => ({ status: 'absent' }),
  })

  await orchestrator.doctor()
  await assert.rejects(
    orchestrator.assets(),
    /public[\\/]logo\.svg|ENOENT/,
  )
})

test('default doctor classifies a project without the wrapper JAR as partial', async (t) => {
  const rootDir = await createRoot(t)
  const androidDir = path.join(rootDir, 'android')
  await Promise.all([
    touch(path.join(androidDir, 'gradlew')),
    touch(path.join(androidDir, 'gradlew.bat')),
    touch(path.join(androidDir, 'gradle', 'wrapper', 'gradle-wrapper.properties')),
    touch(path.join(androidDir, 'app', 'build.gradle')),
    touch(path.join(androidDir, 'settings.gradle')),
  ])
  const orchestrator = createAndroidOrchestrator({
    rootDir,
    ...fixtureLayout(rootDir),
    inspectEnvironment: async () => successfulDoctor(),
  })

  await assert.rejects(orchestrator.doctor(), /partial|wrapper/i)
})

test('default doctor rejects a directory masquerading as gradlew.bat', async (t) => {
  const rootDir = await createRoot(t)
  const androidDir = path.join(rootDir, 'android')
  await Promise.all([
    touch(path.join(androidDir, 'gradlew')),
    mkdir(path.join(androidDir, 'gradlew.bat'), { recursive: true }),
    touch(path.join(androidDir, 'gradle', 'wrapper', 'gradle-wrapper.jar')),
    touch(
      path.join(
        androidDir,
        'gradle',
        'wrapper',
        'gradle-wrapper.properties',
      ),
    ),
    touch(path.join(androidDir, 'app', 'build.gradle')),
    touch(path.join(androidDir, 'settings.gradle')),
  ])
  const orchestrator = createAndroidOrchestrator({
    rootDir,
    ...fixtureLayout(rootDir),
    inspectEnvironment: async () => successfulDoctor(),
  })

  await assert.rejects(orchestrator.doctor(), /partial|wrapper/i)
})

test('overlay application is byte-identical across runs and removes stale formerly-owned files', async (t) => {
  const rootDir = await createRoot(t)
  const sourceDir = path.join(rootDir, 'native', 'android')
  const androidDir = path.join(rootDir, 'android')
  await touch(path.join(sourceDir, 'app', 'src', 'main', 'owned.xml'), 'one')
  await touch(path.join(sourceDir, 'obsolete.txt'), 'remove me later')
  await touch(path.join(androidDir, 'generated.txt'), 'preserve me')

  const first = await applyAndroidOverlay({ androidDir, sourceDir })
  await unlink(path.join(sourceDir, 'obsolete.txt'))
  await touch(path.join(sourceDir, 'replacement.txt'), 'replacement')
  const second = await applyAndroidOverlay({ androidDir, sourceDir })
  const third = await applyAndroidOverlay({ androidDir, sourceDir })

  assert.notEqual(first.hash, second.hash)
  assert.equal(second.hash, third.hash)
  assert.equal(
    await readFile(path.join(androidDir, 'replacement.txt'), 'utf8'),
    'replacement',
  )
  assert.deepEqual(
    await Promise.all([
      readFile(path.join(androidDir, 'app', 'src', 'main', 'owned.xml'), 'utf8'),
      readFile(path.join(androidDir, 'replacement.txt'), 'utf8'),
    ]),
    ['one', 'replacement'],
  )
  await assert.rejects(
    readFile(path.join(androidDir, 'obsolete.txt')),
    /ENOENT/,
  )
  assert.equal(
    await readFile(path.join(androidDir, 'generated.txt'), 'utf8'),
    'preserve me',
  )
})

test('overlay rejects copy corruption before writing the ownership manifest', async (t) => {
  const rootDir = await createRoot(t)
  const sourceDir = path.join(rootDir, 'native', 'android')
  const androidDir = path.join(rootDir, 'android')
  await touch(path.join(sourceDir, 'first.txt'), 'first source bytes')
  await touch(path.join(sourceDir, 'nested', 'second.txt'), 'second source bytes')

  await assert.rejects(
    applyAndroidOverlay({
      androidDir,
      sourceDir,
      writeOwnedFile: async (destinationPath, contents) => {
        await writeFile(
          destinationPath,
          destinationPath.endsWith('second.txt') ? 'corrupt bytes' : contents,
        )
      },
    }),
    /owned-tree parity|source.*destination/i,
  )
  await assert.rejects(
    readFile(path.join(androidDir, '.ledgerly-android-overlay.json')),
    /ENOENT/,
  )
})

function successfulSpawn(calls) {
  return (command, args, options) => {
    calls.push({ command, args, options })
    const child = new EventEmitter()
    queueMicrotask(() => child.emit('close', 0, null))
    return child
  }
}

test('Windows npm fallback quotes a trusted path containing spaces and metacharacters', async (t) => {
  const root = await createRoot(t, 'ledgerly & tools (safe)-')
  const npmPath = path.join(root, 'Node & npm (trusted)', 'npm.cmd')
  await touch(npmPath, '@echo off')
  const calls = []

  await runCommand('npm', ['run', 'check'], {
    comspec: 'C:\\Windows\\System32\\cmd.exe',
    cwd: root,
    npmExecPath: null,
    npmPath,
    platform: 'win32',
    spawnImpl: successfulSpawn(calls),
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, 'C:\\Windows\\System32\\cmd.exe')
  assert.deepEqual(calls[0].args.slice(0, 3), ['/d', '/s', '/c'])
  assert.equal(
    calls[0].args[3],
    `"${npmPath}" run check`,
  )
  assert.equal(calls[0].options.shell, false)
})

test('Windows Gradle fallback permits only fixed tasks and executes trusted gradlew.bat', async (t) => {
  const root = await createRoot(t, 'ledgerly gradle & safe-')
  const androidDir = path.join(root, 'Android (generated) & trusted')
  const wrapper = path.join(androidDir, 'gradlew.bat')
  await touch(wrapper, '@echo off')
  const calls = []

  await runCommand('gradle', ['assembleDebug'], {
    comspec: 'C:\\Windows\\System32\\cmd.exe',
    cwd: androidDir,
    platform: 'win32',
    spawnImpl: successfulSpawn(calls),
  })

  assert.equal(calls[0].args[3], wrapper)
  assert.equal(calls[0].args[4], 'assembleDebug')

  await runCommand('gradle', ['assembleRelease'], {
    comspec: 'C:\\Windows\\System32\\cmd.exe',
    cwd: androidDir,
    platform: 'win32',
    spawnImpl: successfulSpawn(calls),
  })
  assert.equal(calls[1].args[3], wrapper)
  assert.equal(calls[1].args[4], 'assembleRelease')

  await assert.rejects(
    runCommand('gradle', ['assembleDebug', '&calc'], {
      comspec: 'C:\\Windows\\System32\\cmd.exe',
      cwd: androidDir,
      platform: 'win32',
      spawnImpl: successfulSpawn([]),
    }),
    /allowlisted|not permitted/,
  )
})

test('Windows npm fallback rejects non-allowlisted or injected task tokens', async (t) => {
  const root = await createRoot(t)
  const npmPath = path.join(root, 'npm.cmd')
  await touch(npmPath, '@echo off')
  let spawned = false

  await assert.rejects(
    runCommand('npm', ['run', 'check & calc'], {
      comspec: 'C:\\Windows\\System32\\cmd.exe',
      cwd: root,
      npmExecPath: null,
      npmPath,
      platform: 'win32',
      spawnImpl: () => {
        spawned = true
      },
    }),
    /allowlisted|not permitted/,
  )
  assert.equal(spawned, false)
})

test('native adb receives the target as an argument and never through ComSpec', async (t) => {
  const root = await createRoot(t)
  const adbPath = path.join(root, 'adb.exe')
  await touch(adbPath)
  const calls = []
  const target = 'emulator-5554 & harmless-as-an-argument'

  await runCommand(adbPath, ['-s', target, 'install', '-r', 'app-debug.apk'], {
    comspec: 'C:\\Windows\\System32\\cmd.exe',
    cwd: root,
    platform: 'win32',
    spawnImpl: successfulSpawn(calls),
  })

  assert.equal(calls[0].command, adbPath)
  assert.deepEqual(calls[0].args, [
    '-s',
    target,
    'install',
    '-r',
    'app-debug.apk',
  ])
  assert.equal(calls[0].options.shell, false)
})

test('gradleCommand selects only the platform wrapper entry point', () => {
  assert.equal(gradleCommand('win32'), 'gradlew.bat')
  assert.equal(gradleCommand('linux'), './gradlew')
})

test('unknown commands and missing required options fail with usage before side effects', async (t) => {
  const fixture = await workflowFixture(t)

  await assert.rejects(main(['unknown'], fixture.orchestrator), /Usage:/)
  await assert.rejects(main(['run', '--target'], fixture.orchestrator), /Usage:/)
  await assert.rejects(main(['build'], fixture.orchestrator), /Usage:/)
  assert.deepEqual(fixture.events, [])
})
