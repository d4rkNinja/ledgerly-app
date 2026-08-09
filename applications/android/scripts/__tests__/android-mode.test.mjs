import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  applyAndroidModeConfig,
  androidModeEnvironment,
  selectAndroidMode,
} from '../lib/android-mode.mjs'

const LOCAL_API = 'http://10.0.2.2:8080/api/v1'
const DEPLOYED_HTTP_API = 'http://80.225.194.189:3001/api/v1'

async function fixture(t) {
  const projectRoot = await mkdtemp(
    path.join(os.tmpdir(), 'ledgerly-android-mode-'),
  )
  t.after(() => rm(projectRoot, { force: true, recursive: true }))
  const mainConfig = path.join(
    projectRoot,
    'android',
    'app',
    'src',
    'main',
    'assets',
    'capacitor.config.json',
  )
  await mkdir(path.dirname(mainConfig), { recursive: true })
  await writeFile(
    mainConfig,
    `${JSON.stringify({ android: { allowMixedContent: true } })}\n`,
  )
  return { mainConfig, projectRoot }
}

test('only exact emulator API in an orchestrator-selected debug sync selects local mode', () => {
  assert.equal(
    selectAndroidMode({ mode: 'debug', apiUrl: LOCAL_API }).localDebug,
    true,
  )
  for (const candidate of [
    { mode: 'release', apiUrl: LOCAL_API },
    { mode: 'debug', apiUrl: undefined },
    { mode: 'debug', apiUrl: 'http://10.0.2.2:8080/api/v1/' },
    { mode: 'debug', apiUrl: 'http://localhost:8080/api/v1' },
  ]) {
    assert.equal(selectAndroidMode(candidate).localDebug, false)
  }
})

test('exact deployed HTTP API enables cleartext only for explicitly selected builds', () => {
  assert.equal(
    selectAndroidMode({ mode: 'debug', apiUrl: DEPLOYED_HTTP_API })
      .debugCleartext,
    true,
  )
  assert.equal(
    selectAndroidMode({ mode: 'release', apiUrl: DEPLOYED_HTTP_API })
      .debugCleartext,
    false,
  )
  assert.equal(
    selectAndroidMode({ mode: 'release', apiUrl: DEPLOYED_HTTP_API })
      .releaseHttp,
    true,
  )
  assert.equal(
    selectAndroidMode({
      mode: 'debug',
      apiUrl: `${DEPLOYED_HTTP_API}/`,
    }).debugCleartext,
    false,
  )
  assert.equal(
    selectAndroidMode({
      mode: 'release',
      apiUrl: `${DEPLOYED_HTTP_API}/`,
    }).releaseHttp,
    false,
  )
})

test('release mode exports a scoped cleartext flag only for the authorized endpoint', () => {
  assert.equal(
    androidModeEnvironment(
      { VITE_API_BASE_URL: DEPLOYED_HTTP_API },
      'release',
    ).LEDGERLY_ANDROID_RELEASE_HTTP,
    '1',
  )
  assert.equal(
    androidModeEnvironment(
      { VITE_API_BASE_URL: 'https://api.ledgerly.example/api/v1' },
      'release',
    ).LEDGERLY_ANDROID_RELEASE_HTTP,
    '0',
  )
})

test('mode config keeps main secure and creates a debug-source-set override only for exact local debug', async (t) => {
  const { mainConfig, projectRoot } = await fixture(t)
  const debugConfig = path.join(
    projectRoot,
    'android',
    'app',
    'src',
    'debug',
    'assets',
    'capacitor.config.json',
  )

  await applyAndroidModeConfig({
    projectRoot,
    mode: 'debug',
    apiUrl: LOCAL_API,
  })
  assert.equal(
    JSON.parse(await readFile(mainConfig, 'utf8')).android.allowMixedContent,
    false,
  )
  assert.equal(
    JSON.parse(await readFile(debugConfig, 'utf8')).android.allowMixedContent,
    true,
  )

  await applyAndroidModeConfig({
    projectRoot,
    mode: 'debug',
    apiUrl: undefined,
  })
  await assert.rejects(readFile(debugConfig), /ENOENT/)

  await applyAndroidModeConfig({
    projectRoot,
    mode: 'release',
    apiUrl: LOCAL_API,
  })
  assert.equal(
    JSON.parse(await readFile(mainConfig, 'utf8')).android.allowMixedContent,
    false,
  )
  await assert.rejects(readFile(debugConfig), /ENOENT/)
})

test('mode config enables the same debug override for the exact deployed HTTP API', async (t) => {
  const { mainConfig, projectRoot } = await fixture(t)
  const debugConfig = path.join(
    projectRoot,
    'android',
    'app',
    'src',
    'debug',
    'assets',
    'capacitor.config.json',
  )

  await applyAndroidModeConfig({
    projectRoot,
    mode: 'debug',
    apiUrl: DEPLOYED_HTTP_API,
  })

  assert.equal(
    JSON.parse(await readFile(mainConfig, 'utf8')).android.allowMixedContent,
    false,
  )
  assert.equal(
    JSON.parse(await readFile(debugConfig, 'utf8')).android.allowMixedContent,
    true,
  )
})

test('release mode keeps WebView mixed content disabled for the authorized HTTP API', async (t) => {
  const { mainConfig, projectRoot } = await fixture(t)

  await applyAndroidModeConfig({
    projectRoot,
    mode: 'release',
    apiUrl: DEPLOYED_HTTP_API,
  })

  const config = JSON.parse(await readFile(mainConfig, 'utf8'))
  assert.equal(config.android.allowMixedContent, false)
  assert.equal(config.server.cleartext, false)
})
