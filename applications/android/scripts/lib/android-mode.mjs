import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const LOCAL_ANDROID_API = 'http://10.0.2.2:8080/api/v1'
export const DEPLOYED_HTTP_ANDROID_API = 'http://80.225.194.189:3001/api/v1'

export function selectAndroidMode(options = {}) {
  const mode = options.mode === 'release' ? 'release' : 'debug'
  const localDebug =
    mode === 'debug' && options.apiUrl === LOCAL_ANDROID_API
  const debugCleartext =
    mode === 'debug' &&
    [LOCAL_ANDROID_API, DEPLOYED_HTTP_ANDROID_API].includes(options.apiUrl)
  const releaseHttp =
    mode === 'release' && options.apiUrl === DEPLOYED_HTTP_ANDROID_API
  return {
    debugCleartext,
    localDebug,
    releaseHttp,
    mode,
  }
}

export function androidModeEnvironment(env = {}, mode = 'debug') {
  const selected = selectAndroidMode({
    apiUrl: env.VITE_API_BASE_URL,
    mode,
  })
  return {
    ...env,
    LEDGERLY_ANDROID_BUILD_MODE: selected.mode,
    LEDGERLY_ANDROID_LOCAL_DEBUG: selected.localDebug ? '1' : '0',
    LEDGERLY_ANDROID_HTTP_DEBUG: selected.debugCleartext ? '1' : '0',
    LEDGERLY_ANDROID_RELEASE_HTTP: selected.releaseHttp ? '1' : '0',
  }
}

export async function applyAndroidModeConfig(options = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd())
  const androidDir = path.resolve(
    options.androidDir ?? path.join(projectRoot, 'android'),
  )
  const selected = selectAndroidMode(options)
  const mainConfigPath = path.join(
    androidDir,
    'app',
    'src',
    'main',
    'assets',
    'capacitor.config.json',
  )
  const debugConfigPath = path.join(
    androidDir,
    'app',
    'src',
    'debug',
    'assets',
    'capacitor.config.json',
  )
  let mainConfig
  try {
    mainConfig = JSON.parse(await readFile(mainConfigPath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        'Capacitor sync did not produce app/src/main/assets/capacitor.config.json.',
      )
    }
    throw error
  }

  mainConfig.android = {
    ...(mainConfig.android ?? {}),
    allowMixedContent: false,
  }
  mainConfig.server = {
    ...(mainConfig.server ?? {}),
    cleartext: false,
  }
  await writeFile(mainConfigPath, `${JSON.stringify(mainConfig, null, 2)}\n`)

  await rm(debugConfigPath, { force: true })
  if (selected.debugCleartext) {
    const debugConfig = {
      ...mainConfig,
      android: {
        ...mainConfig.android,
        allowMixedContent: true,
      },
    }
    await mkdir(path.dirname(debugConfigPath), { recursive: true })
    await writeFile(
      debugConfigPath,
      `${JSON.stringify(debugConfig, null, 2)}\n`,
    )
  }

  return selected
}
