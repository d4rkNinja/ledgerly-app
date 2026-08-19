import assert from 'node:assert/strict'
import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  inspectAndroidEnvironment,
  loadDebugApiEnvironment,
  validateJavaVersion,
  validateNodeVersion,
  validateReleaseApiUrl,
} from '../lib/android-environment.mjs'

const WINDOWS = 'win32'

async function touch(filePath, contents = '') {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents)
}

async function createHostFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ledgerly-android-env-'))
  t.after(() => rm(root, { force: true, recursive: true }))

  const sdk = path.join(root, 'Android SDK')
  const jdk = path.join(root, 'JDK 21')

  await Promise.all([
    touch(path.join(sdk, 'platforms', 'android-36', 'android.jar')),
    touch(path.join(sdk, 'build-tools', '36.0.0', 'aapt2.exe')),
    touch(path.join(sdk, 'build-tools', '36.0.0', 'aapt2')),
    touch(path.join(sdk, 'platform-tools', 'adb.exe')),
    touch(path.join(sdk, 'platform-tools', 'adb')),
    touch(path.join(jdk, 'bin', 'java.exe')),
    touch(path.join(jdk, 'bin', 'java')),
    touch(path.join(jdk, 'bin', 'javac.exe')),
    touch(path.join(jdk, 'bin', 'javac')),
  ])

  return {
    root,
    sdk,
    jdk,
    options: {
      cwd: root,
      env: {
        ANDROID_HOME: sdk,
        JAVA_HOME: jdk,
        LEDGERLY_TOKEN: 'must-never-appear',
      },
      platform: WINDOWS,
      versions: {
        java: '21.0.7',
        node: 'v24.13.1',
        npm: '11.8.0',
      },
    },
  }
}

function check(result, name) {
  const found = result.checks.find((candidate) => candidate.name === name)
  assert.ok(found, `expected a ${name} diagnostic`)
  return found
}

for (const [version, expected, description] of [
  ['v22.21.0', false, 'rejects Node 22 below the package engine floor'],
  ['v22.22.0', true, 'accepts the Node 22 package engine floor'],
  ['v24.13.1', true, 'accepts the current pinned Node 24 version'],
  ['v23.0.0', false, 'rejects unsupported odd-numbered Node 23'],
]) {
  test(`Node version validation ${description}`, () => {
    assert.equal(validateNodeVersion(version).ok, expected)
  })
}

test('unsupported Node diagnostic names the exact supported release branches', () => {
  assert.equal(
    validateNodeVersion('v22.21.0').message,
    'Node.js 22.22+ or Node.js 24+ is required.',
  )
})

test('Java version validation accepts JDK 21', () => {
  assert.equal(validateJavaVersion('21.0.7').ok, true)
})

test('release API validation accepts one canonical HTTPS /api/v1 endpoint', () => {
  assert.equal(
    validateReleaseApiUrl('https://api.ledgerly.example/api/v1').href,
    'https://api.ledgerly.example/api/v1',
  )
})

test('release API validation accepts the explicitly authorized deployed HTTP endpoint', () => {
  assert.equal(
    validateReleaseApiUrl('http://80.225.194.189:3001/api/v1').href,
    'http://80.225.194.189:3001/api/v1',
  )
})

test('release API validation rejects unsafe or non-canonical endpoints without echoing input', () => {
  const invalidValues = [
    '',
    ' http://api.example.com/api/v1',
    'http://api.example.com/api/v1',
    'https://user:secret@example.com/api/v1',
    'https://api.example.com/api/v1/',
    'https://api.example.com/api/v1?tenant=ledgerly',
    'https://api.example.com/api/v1#fragment',
    'http://80.225.194.189:3001/api/v1/',
    'https://api.example.com/api',
    'https://api.example.com/other/api/v1',
    'https://API.example.com/api/v1',
  ]

  for (const value of invalidValues) {
    assert.throws(
      () => validateReleaseApiUrl(value),
      (error) => {
        assert.match(error.message, /VITE_API_BASE_URL/)
        if (value !== '') {
          assert.equal(error.message.includes(value), false)
        }
        assert.equal(error.message.includes('secret'), false)
        return true
      },
    )
  }
})

test('debug Android builds inherit the effective Vite API URL when the shell omits it', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ledgerly-android-vite-env-'))
  t.after(() => rm(root, { force: true, recursive: true }))
  await writeFile(
    path.join(root, '.env'),
    'VITE_API_BASE_URL=http://80.225.194.189:3001/api/v1\n',
  )

  const resolved = await loadDebugApiEnvironment(root, {
    NODE_ENV: 'development',
  })

  assert.equal(
    resolved.VITE_API_BASE_URL,
    'http://80.225.194.189:3001/api/v1',
  )
})

test('an explicit debug API environment remains higher priority than project env files', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ledgerly-android-vite-env-'))
  t.after(() => rm(root, { force: true, recursive: true }))
  await writeFile(
    path.join(root, '.env'),
    'VITE_API_BASE_URL=http://80.225.194.189:3001/api/v1\n',
  )

  const resolved = await loadDebugApiEnvironment(root, {
    VITE_API_BASE_URL: 'http://10.0.2.2:8080/api/v1',
  })

  assert.equal(
    resolved.VITE_API_BASE_URL,
    'http://10.0.2.2:8080/api/v1',
  )
})

test('debug Android builds replace a relative web API URL with the emulator host', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ledgerly-android-vite-env-'))
  t.after(() => rm(root, { force: true, recursive: true }))
  await writeFile(path.join(root, '.env'), 'VITE_API_BASE_URL=/api/v1\n')

  const resolved = await loadDebugApiEnvironment(root, {
    NODE_ENV: 'development',
  })

  assert.equal(
    resolved.VITE_API_BASE_URL,
    'http://10.0.2.2:8080/api/v1',
  )
})

test('host inspection reports a missing Android SDK environment variable', async (t) => {
  const fixture = await createHostFixture(t)
  delete fixture.options.env.ANDROID_HOME

  const result = await inspectAndroidEnvironment(fixture.options)

  assert.equal(result.ok, false)
  assert.equal(check(result, 'android-sdk').ok, false)
  assert.match(check(result, 'android-sdk').message, /ANDROID_HOME/)
})

test('host inspection rejects conflicting Android SDK roots', async (t) => {
  const fixture = await createHostFixture(t)
  fixture.options.env.ANDROID_SDK_ROOT = path.join(fixture.root, 'different-sdk')

  const result = await inspectAndroidEnvironment(fixture.options)

  assert.equal(result.ok, false)
  assert.match(check(result, 'android-sdk').message, /same directory/)
})

test('host inspection requires Android SDK 36 and build-tools 36.0.0', async (t) => {
  const fixture = await createHostFixture(t)
  await rm(path.join(fixture.sdk, 'platforms', 'android-36'), { recursive: true })
  await rm(path.join(fixture.sdk, 'build-tools', '36.0.0'), { recursive: true })

  const result = await inspectAndroidEnvironment(fixture.options)

  assert.equal(check(result, 'android-platform-36').ok, false)
  assert.equal(check(result, 'android-build-tools-36.0.0').ok, false)
})

test('host inspection requires adb and Javac executables', async (t) => {
  const fixture = await createHostFixture(t)
  await rm(path.join(fixture.sdk, 'platform-tools', 'adb.exe'))
  await rm(path.join(fixture.jdk, 'bin', 'javac.exe'))

  const result = await inspectAndroidEnvironment(fixture.options)

  assert.equal(check(result, 'adb').ok, false)
  assert.equal(check(result, 'javac').ok, false)
})

test('fresh-project preflight validates host tools without requiring Gradle wrappers', async (t) => {
  const fixture = await createHostFixture(t)

  const result = await inspectAndroidEnvironment({
    ...fixture.options,
    requireProject: false,
  })

  assert.equal(result.ok, true)
  assert.equal(result.checks.some(({ name }) => name === 'gradle-wrapper'), false)
  assert.equal(JSON.stringify(result).includes('must-never-appear'), false)
})

test('host inspection safely probes npm and Java versions when overrides are absent', async (t) => {
  const fixture = await createHostFixture(t)
  const probes = []
  delete fixture.options.versions
  fixture.options.versionProbe = async (name, invocation) => {
    probes.push({ name, invocation })
    return name === 'npm' ? '11.8.0' : '21.0.7'
  }

  const result = await inspectAndroidEnvironment(fixture.options)

  assert.equal(result.ok, true)
  assert.deepEqual(
    probes.map(({ name }) => name),
    ['npm', 'java'],
  )
  assert.equal(
    probes.find(({ name }) => name === 'java').invocation.command,
    path.join(fixture.jdk, 'bin', 'java.exe'),
  )
})

test('project inspection separately requires both wrappers and Gradle metadata', async (t) => {
  const fixture = await createHostFixture(t)
  await mkdir(path.join(fixture.root, 'android'), { recursive: true })

  const partial = await inspectAndroidEnvironment({
    ...fixture.options,
    requireProject: true,
  })

  assert.equal(partial.ok, false)
  assert.equal(check(partial, 'gradle-wrapper').ok, false)
  assert.equal(check(partial, 'android-project-metadata').ok, false)

  await Promise.all([
    touch(path.join(fixture.root, 'android', 'gradlew')),
    touch(path.join(fixture.root, 'android', 'gradlew.bat')),
    touch(
      path.join(
        fixture.root,
        'android',
        'gradle',
        'wrapper',
        'gradle-wrapper.properties',
      ),
    ),
    touch(path.join(fixture.root, 'android', 'app', 'build.gradle')),
    touch(path.join(fixture.root, 'android', 'settings.gradle')),
  ])

  const missingWrapperJar = await inspectAndroidEnvironment({
    ...fixture.options,
    requireProject: true,
  })
  assert.equal(check(missingWrapperJar, 'gradle-wrapper').ok, false)

  await touch(
    path.join(
      fixture.root,
      'android',
      'gradle',
      'wrapper',
      'gradle-wrapper.jar',
    ),
  )

  const complete = await inspectAndroidEnvironment({
    ...fixture.options,
    requireProject: true,
  })

  assert.equal(complete.ok, true)
  assert.equal(check(complete, 'gradle-wrapper').ok, true)
  assert.equal(check(complete, 'android-project-metadata').ok, true)
})

test('project inspection rejects a directory masquerading as a wrapper file', async (t) => {
  const fixture = await createHostFixture(t)
  const androidDir = path.join(fixture.root, 'android')
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

  const result = await inspectAndroidEnvironment({
    ...fixture.options,
    requireProject: true,
  })

  assert.equal(check(result, 'gradle-wrapper').ok, false)
})

test('POSIX project inspection requires executable gradlew', async (t) => {
  const fixture = await createHostFixture(t)
  const androidDir = path.join(fixture.root, 'android')
  const gradlew = path.join(androidDir, 'gradlew')
  await Promise.all([
    touch(gradlew),
    touch(path.join(androidDir, 'gradlew.bat')),
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
  let gradlewMode = 0o644
  const projectLstat = async (filePath) => {
    const stats = await lstat(filePath)
    if (filePath !== gradlew) return stats
    return {
      isDirectory: () => stats.isDirectory(),
      isFile: () => stats.isFile(),
      mode: gradlewMode,
    }
  }

  const notExecutable = await inspectAndroidEnvironment({
    ...fixture.options,
    lstat: projectLstat,
    platform: 'linux',
    requireProject: true,
  })
  assert.equal(check(notExecutable, 'gradle-wrapper').ok, false)

  gradlewMode = 0o755
  const executable = await inspectAndroidEnvironment({
    ...fixture.options,
    lstat: projectLstat,
    platform: 'linux',
    requireProject: true,
  })
  assert.equal(check(executable, 'gradle-wrapper').ok, true)
})
