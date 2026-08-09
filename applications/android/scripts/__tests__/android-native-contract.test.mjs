import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(testDirectory, '..', '..', '..', '..')
const nativeRoot = path.join(root, 'applications', 'android', 'native', 'android')

function escaped(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
}

test('repository attributes pin native text modes and binary assets', async () => {
  const attributes = await readFile(path.join(root, '.gitattributes'), 'utf8')
  for (const expected of [
    '* text=auto',
    '*.sh text eol=lf',
    'gradlew text eol=lf',
    '*.bat text eol=crlf',
    '*.jar binary',
    '*.png binary',
    '*.webp binary',
    '*.keystore binary',
  ]) {
    assert.match(attributes, escaped(expected))
  }
})

test('owned main manifest is secure and declares only INTERNET', async () => {
  const manifest = await readFile(
    path.join(
      root,
      'applications',
      'android',
      'native',
      'android',
      'app',
      'src',
      'main',
      'AndroidManifest.xml',
    ),
    'utf8',
  )
  const permissions = [
    ...manifest.matchAll(/uses-permission[^>]+android:name="([^"]+)"/g),
  ].map((match) => match[1])
  assert.deepEqual(permissions, ['android.permission.INTERNET'])
  for (const required of [
    'xmlns:tools="http://schemas.android.com/tools"',
    'tools:replace="android:networkSecurityConfig,android:usesCleartextTraffic"',
    'android:allowBackup="false"',
    'android:dataExtractionRules="@xml/data_extraction_rules"',
    'android:fullBackupContent="@xml/backup_rules"',
    'android:hardwareAccelerated="true"',
    'android:networkSecurityConfig="${ledgerlyNetworkSecurityConfig}"',
    'android:usesCleartextTraffic="${ledgerlyUsesCleartextTraffic}"',
    'android:enableOnBackInvokedCallback="true"',
  ]) {
    assert.match(manifest, escaped(required))
  }
  assert.doesNotMatch(
    manifest,
    /windowSoftInputMode|screenOrientation|android\.intent\.action\.VIEW|BROWSABLE/,
  )
  assert.doesNotMatch(
    manifest,
    /CAMERA|RECORD_AUDIO|READ_|WRITE_|LOCATION|CONTACTS|POST_NOTIFICATIONS/,
  )
})

test('owned network policy and themes keep release HTTPS-only with day-night splash', async () => {
  const resource = (...parts) =>
    path.join(nativeRoot, 'app', 'src', ...parts)
  const mainNetwork = await readFile(
    resource('main', 'res', 'xml', 'network_security_config.xml'),
    'utf8',
  )
  const secureNetwork = await readFile(
    resource('main', 'res', 'xml', 'network_security_config_secure.xml'),
    'utf8',
  )
  const releaseHttpNetwork = await readFile(
    resource('main', 'res', 'xml', 'network_security_config_release_http.xml'),
    'utf8',
  )
  const debugNetwork = await readFile(
    resource('debug', 'res', 'xml', 'network_security_config.xml'),
    'utf8',
  )
  assert.match(mainNetwork, /cleartextTrafficPermitted="false"/)
  assert.doesNotMatch(mainNetwork, /10\.0\.2\.2/)
  assert.match(secureNetwork, /cleartextTrafficPermitted="false"/)
  assert.doesNotMatch(secureNetwork, /80\.225\.194\.189|localhost|10\.0\.2\.2/)
  assert.match(releaseHttpNetwork, /cleartextTrafficPermitted="true"/)
  assert.match(releaseHttpNetwork, /<domain[^>]*>80\.225\.194\.189<\/domain>/)
  assert.doesNotMatch(releaseHttpNetwork, /localhost|10\.0\.2\.2/)
  assert.match(debugNetwork, /cleartextTrafficPermitted="true"/)
  assert.match(debugNetwork, /<domain[^>]*>10\.0\.2\.2<\/domain>/)
  assert.doesNotMatch(debugNetwork, /includeSubdomains="true"/)

  for (const relativePath of [
    ['values', 'styles.xml'],
    ['values-night', 'styles.xml'],
    ['values-v31', 'styles.xml'],
    ['values-night-v31', 'styles.xml'],
  ]) {
    const styles = await readFile(
      resource('main', 'res', ...relativePath),
      'utf8',
    )
    assert.match(styles, /AppTheme\.NoActionBarLaunch/)
    assert.match(styles, /postSplashScreenTheme/)
  }
  assert.doesNotMatch(
    await readFile(resource('main', 'res', 'values', 'styles.xml'), 'utf8'),
    /navigationBarDividerColor|windowLightNavigationBar/,
  )
  assert.match(
    await readFile(
      resource('main', 'res', 'values-v27', 'styles.xml'),
      'utf8',
    ),
    /navigationBarDividerColor|windowLightNavigationBar/,
  )
})
