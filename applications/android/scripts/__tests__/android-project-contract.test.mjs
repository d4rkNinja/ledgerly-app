import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { inspectAndroidProject } from '../lib/android-environment.mjs'

async function touch(filePath, contents = '') {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, contents)
}

async function createLockedProject(t, overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ledgerly-project-id-'))
  t.after(() => rm(root, { force: true, recursive: true }))
  const android = path.join(root, 'android')
  const values = {
    namespace: 'io.github.d4rkninja.ledgerly',
    applicationId: 'io.github.d4rkninja.ledgerly',
    minSdk: 24,
    compileSdk: 36,
    targetSdk: 36,
    agp: '8.13.0',
    gradle: '8.14.3',
    capacitorVersion: '8.4.2',
    activity:
      'package io.github.d4rkninja.ledgerly;\n\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {}\n',
    ...overrides,
  }

  await Promise.all([
    touch(path.join(android, 'gradlew'), '#!/usr/bin/env sh\n'),
    touch(path.join(android, 'gradlew.bat'), '@echo off\r\n'),
    touch(path.join(android, 'gradle', 'wrapper', 'gradle-wrapper.jar'), 'jar'),
    touch(
      path.join(
        android,
        'gradle',
        'wrapper',
        'gradle-wrapper.properties',
      ),
      `distributionUrl=https\\://services.gradle.org/distributions/gradle-${values.gradle}-all.zip\n`,
    ),
    touch(
      path.join(android, 'build.gradle'),
      `classpath 'com.android.tools.build:gradle:${values.agp}'\n`,
    ),
    touch(
      path.join(android, 'variables.gradle'),
      `ext {\n minSdkVersion = ${values.minSdk}\n compileSdkVersion = ${values.compileSdk}\n targetSdkVersion = ${values.targetSdk}\n}\n`,
    ),
    touch(
      path.join(android, 'app', 'build.gradle'),
      `android {\n namespace = "${values.namespace}"\n defaultConfig {\n applicationId "${values.applicationId}"\n }\n}\n`,
    ),
    touch(path.join(android, 'settings.gradle'), "include ':app'\n"),
    touch(
      path.join(android, 'capacitor.settings.gradle'),
      [
        "include ':capacitor-android'",
        "project(':capacitor-android').projectDir = new File('../node_modules/@capacitor/android/capacitor')",
        "include ':capacitor-network'",
        "project(':capacitor-network').projectDir = new File('../node_modules/@capacitor/network/android')",
        "include ':capacitor-haptics'",
        "project(':capacitor-haptics').projectDir = new File('../node_modules/@capacitor/haptics/android')",
      ].join('\n'),
    ),
    touch(
      path.join(
        android,
        'app',
        'src',
        'main',
        'java',
        'io',
        'github',
        'd4rkninja',
        'ledgerly',
        'MainActivity.java',
      ),
      values.activity,
    ),
    touch(
      path.join(android, 'app', 'src', 'main', 'res', 'values', 'strings.xml'),
      '<resources><string name="app_name">Ledgerly</string><string name="title_activity_main">Ledgerly</string><string name="package_name">io.github.d4rkninja.ledgerly</string><string name="custom_url_scheme">io.github.d4rkninja.ledgerly</string></resources>\n',
    ),
    touch(
      path.join(
        root,
        'node_modules',
        '@capacitor',
        'android',
        'package.json',
      ),
      `${JSON.stringify({ name: '@capacitor/android', version: values.capacitorVersion })}\n`,
    ),
    touch(
      path.join(root, 'node_modules', '@capacitor', 'cli', 'package.json'),
      `${JSON.stringify({ name: '@capacitor/cli', version: values.capacitorVersion })}\n`,
    ),
    touch(
      path.join(root, 'node_modules', '@capacitor', 'network', 'package.json'),
      `${JSON.stringify({ name: '@capacitor/network', version: '8.0.1' })}\n`,
    ),
    touch(
      path.join(root, 'node_modules', '@capacitor', 'haptics', 'package.json'),
      `${JSON.stringify({ name: '@capacitor/haptics', version: '8.0.2' })}\n`,
    ),
  ])
  await chmod(path.join(android, 'gradlew'), 0o755)
  return root
}

function inspectOptions(cwd) {
  return {
    cwd,
    expectedWrapperJarSha256: createHash('sha256')
      .update('jar')
      .digest('hex'),
    platform: 'win32',
  }
}

test('locked generated project identity is accepted', async (t) => {
  const cwd = await createLockedProject(t)
  const result = await inspectAndroidProject(inspectOptions(cwd))
  assert.equal(result.status, 'valid', result.message)
})

for (const [label, overrides] of [
  ['namespace', { namespace: 'com.example.drift' }],
  ['application ID', { applicationId: 'com.example.drift' }],
  ['minimum SDK', { minSdk: 23 }],
  ['compile SDK', { compileSdk: 35 }],
  ['target SDK', { targetSdk: 35 }],
  ['Android Gradle plugin', { agp: '8.12.0' }],
  ['Gradle wrapper', { gradle: '8.13' }],
  ['Capacitor Android package', { capacitorVersion: '8.4.1' }],
  [
    'MainActivity subclass',
    {
      activity:
        'package io.github.d4rkninja.ledgerly;\n\npublic class MainActivity {}\n',
    },
  ],
]) {
  test(`project validation rejects drifted ${label} with regeneration guidance`, async (t) => {
    const cwd = await createLockedProject(t, overrides)
    const result = await inspectAndroidProject(inspectOptions(cwd))
    assert.equal(result.status, 'partial')
    assert.match(result.message, /remove.*android|regenerat/i)
  })
}
