import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { access, lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { DEPLOYED_HTTP_ANDROID_API } from './android-mode.mjs'

const REQUIRED_ANDROID_PLATFORM = 'android-36'
const REQUIRED_BUILD_TOOLS = '36.0.0'
const SENSITIVE_ENV_KEY = /(TOKEN|PASSWORD|SECRET|KEYSTORE|PRIVATE)/i
const EXPECTED_WRAPPER_JAR_SHA256 =
  '7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172'
const EXPECTED_CAPACITOR_PACKAGES = new Map([
  ['@capacitor/android', '8.4.2'],
  ['@capacitor/cli', '8.4.2'],
  ['@capacitor/haptics', '8.0.2'],
  ['@capacitor/network', '8.0.1'],
])
const REGENERATION_MESSAGE =
  'Remove only the generated android directory and rerun npm run android:setup to regenerate it.'
const VITE_ENV_FILES = [
  '.env.production.local',
  '.env.production',
  '.env.local',
  '.env',
]

function parseViteApiBaseUrl(contents) {
  const match = String(contents).match(
    /^\s*VITE_API_BASE_URL\s*=\s*(.*?)\s*$/m,
  )
  if (!match) return null
  const value = match[1]
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1)
  }
  return value
}

export async function loadDebugApiEnvironment(
  rootDir,
  env = {},
  readFileImpl = readFile,
) {
  if (
    typeof env.VITE_API_BASE_URL === 'string' &&
    env.VITE_API_BASE_URL.trim() !== ''
  ) {
    return env
  }

  for (const fileName of VITE_ENV_FILES) {
    try {
      const contents = await readFileImpl(path.join(rootDir, fileName), 'utf8')
      const apiUrl = parseViteApiBaseUrl(contents)
      if (apiUrl) return { ...env, VITE_API_BASE_URL: apiUrl }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }

  return env
}

function numericTuple(value) {
  const match = String(value ?? '').match(/(\d+)\.(\d+)(?:\.(\d+))?/)
  return match
    ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
    : null
}

function versionResult(name, version, ok, message) {
  return {
    ok,
    name,
    version: version ?? null,
    path: null,
    message,
  }
}

export function validateNodeVersion(version) {
  const tuple = numericTuple(version)
  const ok =
    tuple !== null &&
    (tuple[0] >= 24 || (tuple[0] === 22 && tuple[1] >= 22))
  return versionResult(
    'node',
    version,
    ok,
    ok
      ? 'Node.js version is supported.'
      : 'Node.js 22.22+ or Node.js 24+ is required.',
  )
}

export function validateJavaVersion(version) {
  const tuple = numericTuple(version)
  const ok = tuple !== null && tuple[0] === 21
  return versionResult(
    'java',
    version,
    ok,
    ok ? 'JDK 21 is available.' : 'JDK 21 is required.',
  )
}

function validateNpmVersion(version) {
  const tuple = numericTuple(version)
  const ok = tuple !== null && tuple[0] >= 10
  return versionResult(
    'npm',
    version,
    ok,
    ok ? 'npm version is supported.' : 'npm 10 or newer is required.',
  )
}

export function validateReleaseApiUrl(value) {
  const message =
    'VITE_API_BASE_URL must be a canonical, credential-free HTTPS URL with the exact path /api/v1, or the explicitly authorized deployed HTTP endpoint.'

  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(message)
  }

  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(message)
  }

  const authorizedDeployedHttp = parsed.href === DEPLOYED_HTTP_ANDROID_API
  if (
    (parsed.protocol !== 'https:' && !authorizedDeployedHttp) ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/api/v1' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    parsed.href !== value
  ) {
    throw new Error(message)
  }

  return parsed
}

async function pathExists(filePath, exists = defaultExists) {
  if (!filePath) return false
  return exists(filePath)
}

async function defaultExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function fileResult(name, ok, filePath, successMessage, failureMessage) {
  return {
    ok,
    name,
    version: null,
    path: filePath ?? null,
    message: ok ? successMessage : failureMessage,
  }
}

function executableName(baseName, platform) {
  return platform === 'win32' ? `${baseName}.exe` : baseName
}

function normalizedPath(filePath, platform) {
  const normalized = path.resolve(filePath)
  return platform === 'win32' ? normalized.toLowerCase() : normalized
}

function npmVersionFromEnvironment(env) {
  if (SENSITIVE_ENV_KEY.test('npm_config_user_agent')) {
    return null
  }
  return String(env.npm_config_user_agent ?? '').match(/(?:^|\s)npm\/([^\s]+)/)?.[1]
}

async function defaultVersionProbe(_name, invocation) {
  if (!invocation.available) return null
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(invocation.command, invocation.args, {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch {
      resolve(null)
      return
    }
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    child.once('error', () => resolve(null))
    child.once('close', () => resolve(numericTuple(output)?.join('.') ?? null))
  })
}

async function inspectedPathStats(filePath, lstatImpl) {
  try {
    return await lstatImpl(filePath)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function readProjectFile(filePath, readFileImpl) {
  try {
    return await readFileImpl(filePath)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function contains(text, pattern) {
  return typeof text === 'string' && pattern.test(text)
}

function packageVersion(contents, expectedName) {
  try {
    const parsed = JSON.parse(contents)
    return parsed.name === expectedName ? parsed.version : null
  } catch {
    return null
  }
}

export async function inspectAndroidProject(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const platform = options.platform ?? process.platform
  const lstatImpl = options.lstat ?? lstat
  const readFileImpl = options.readFile ?? readFile
  const androidDir = path.resolve(
    options.androidDir ?? path.join(cwd, 'android'),
  )
  const androidStats = await inspectedPathStats(androidDir, lstatImpl)

  if (androidStats === null) {
    return {
      status: 'absent',
      wrapperOk: false,
      metadataOk: false,
      path: androidDir,
      message: 'Android project is absent.',
    }
  }
  if (!androidStats.isDirectory() || androidStats.isSymbolicLink()) {
    return {
      status: 'partial',
      wrapperOk: false,
      metadataOk: false,
      path: androidDir,
      message:
        `The android path is not a regular generated directory. ${REGENERATION_MESSAGE}`,
    }
  }

  const wrapperPaths = [
    path.join(androidDir, 'gradlew'),
    path.join(androidDir, 'gradlew.bat'),
    path.join(androidDir, 'gradle', 'wrapper', 'gradle-wrapper.jar'),
    path.join(androidDir, 'gradle', 'wrapper', 'gradle-wrapper.properties'),
  ]
  const metadataPaths = [
    path.join(androidDir, 'app', 'build.gradle'),
    path.join(androidDir, 'settings.gradle'),
  ]
  const identityPaths = {
    appBuild: path.join(androidDir, 'app', 'build.gradle'),
    capacitorSettings: path.join(androidDir, 'capacitor.settings.gradle'),
    mainActivity: path.join(androidDir, 'app', 'src', 'main', 'java', 'io', 'github', 'd4rkninja', 'ledgerly', 'MainActivity.java'),
    rootBuild: path.join(androidDir, 'build.gradle'),
    strings: path.join(androidDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml'),
    variables: path.join(androidDir, 'variables.gradle'),
    wrapperProperties: wrapperPaths[3],
  }
  const [wrapperStats, metadataStats] = await Promise.all([
    Promise.all(
      wrapperPaths.map((filePath) => inspectedPathStats(filePath, lstatImpl)),
    ),
    Promise.all(
      metadataPaths.map((filePath) => inspectedPathStats(filePath, lstatImpl)),
    ),
  ])
  const gradlewExecutable =
    platform === 'win32' ||
    (wrapperStats[0] !== null && (wrapperStats[0].mode & 0o111) !== 0)
  const wrapperOk =
    wrapperStats.every(
      (stats) =>
        stats?.isFile() === true && stats.isSymbolicLink?.() !== true,
    ) &&
    gradlewExecutable
  let metadataOk = metadataStats.every(
    (stats) => stats?.isFile() === true && stats.isSymbolicLink?.() !== true,
  )

  if (wrapperOk && metadataOk && !options.structuralOnly) {
    const identityEntries = await Promise.all(
      Object.entries(identityPaths).map(async ([name, filePath]) => {
        const stats = await inspectedPathStats(filePath, lstatImpl)
        const contents =
          stats?.isFile() === true && stats.isSymbolicLink?.() !== true
            ? await readProjectFile(filePath, readFileImpl)
            : null
        return [name, contents]
      }),
    )
    const identity = Object.fromEntries(
      identityEntries.map(([name, contents]) => [
        name,
        contents?.toString('utf8') ?? null,
      ]),
    )
    const wrapperJar = await readProjectFile(wrapperPaths[2], readFileImpl)
    const expectedWrapperJarSha256 =
      options.expectedWrapperJarSha256 ?? EXPECTED_WRAPPER_JAR_SHA256
    const wrapperJarOk =
      wrapperJar !== null &&
      createHash('sha256').update(wrapperJar).digest('hex') ===
        expectedWrapperJarSha256

    const packageVersions = new Map()
    for (const [packageName] of EXPECTED_CAPACITOR_PACKAGES) {
      const packagePath = path.join(
        cwd,
        'node_modules',
        ...packageName.split('/'),
        'package.json',
      )
      const contents = await readProjectFile(packagePath, readFileImpl)
      packageVersions.set(
        packageName,
        contents === null
          ? null
          : packageVersion(contents.toString('utf8'), packageName),
      )
    }
    const packagesOk = [...EXPECTED_CAPACITOR_PACKAGES].every(
      ([packageName, version]) =>
        packageVersions.get(packageName) === version,
    )
    const pluginMetadataOk =
      contains(
        identity.capacitorSettings,
        /@capacitor\/android\/capacitor/,
      ) &&
      contains(identity.capacitorSettings, /@capacitor\/network\/android/) &&
      contains(identity.capacitorSettings, /@capacitor\/haptics\/android/)
    const mainActivityOk =
      contains(identity.mainActivity, /package io\.github\.d4rkninja\.ledgerly;/) &&
      contains(identity.mainActivity, /public class MainActivity extends BridgeActivity/)
    const stringsOk =
      contains(identity.strings, /<string name="app_name">Ledgerly<\/string>/) &&
      contains(
        identity.strings,
        /<string name="title_activity_main">Ledgerly<\/string>/,
      ) &&
      contains(
        identity.strings,
        /<string name="package_name">io\.github\.d4rkninja\.ledgerly<\/string>/,
      ) &&
      contains(
        identity.strings,
        /<string name="custom_url_scheme">io\.github\.d4rkninja\.ledgerly<\/string>/,
      )
    const wrapperDistributionOk =
      contains(
        identity.wrapperProperties,
        /distributionUrl=(?:https\\?:\/\/services\.gradle\.org\/distributions\/gradle-8\.14\.3-all\.zip|file\\?:[/\\].*gradle-8\.(?:11\.1|14\.3)-all\.zip)/,
      ) &&
      contains(identity.wrapperProperties, /distributionUrl=/)

    const identityOk =
      wrapperJarOk &&
      packagesOk &&
      pluginMetadataOk &&
      mainActivityOk &&
      stringsOk &&
      wrapperDistributionOk &&
      contains(
        identity.rootBuild,
        /com\.android\.tools\.build:gradle:8\.13\.0/,
      ) &&
      contains(identity.variables, /minSdkVersion\s*=\s*24\b/) &&
      contains(identity.variables, /compileSdkVersion\s*=\s*36\b/) &&
      contains(identity.variables, /targetSdkVersion\s*=\s*36\b/) &&
      contains(
        identity.appBuild,
        /namespace\s*=\s*["']io\.github\.d4rkninja\.ledgerly["']/,
      ) &&
      contains(
        identity.appBuild,
        /applicationId\s+["']io\.github\.d4rkninja\.ledgerly["']/,
      )
    metadataOk = metadataOk && identityOk
  }
  const status = wrapperOk && metadataOk ? 'valid' : 'partial'

  return {
    status,
    wrapperOk,
    metadataOk,
    path: androidDir,
    message:
      status === 'valid'
        ? 'Android project matches the locked Capacitor 8.4.2 template and Ledgerly identity.'
        : `The android directory is partial, symlinked, corrupt, or drifted from the locked Capacitor 8.4.2 template. ${REGENERATION_MESSAGE}`,
  }
}
export async function inspectAndroidEnvironment(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const exists = options.exists ?? defaultExists
  const versions = options.versions ?? {}
  const versionProbe = options.versionProbe ?? defaultVersionProbe
  const checks = []

  checks.push(validateNodeVersion(versions.node ?? process.version))
  const npmCliPath = path.resolve(
    env.npm_execpath ??
      path.join(
        path.dirname(process.execPath),
        'node_modules',
        'npm',
        'bin',
        'npm-cli.js',
      ),
  )
  const npmCliAvailable =
    path.basename(npmCliPath).toLowerCase() === 'npm-cli.js' &&
    (await pathExists(npmCliPath, exists))
  checks.push(
    validateNpmVersion(
      versions.npm ??
        npmVersionFromEnvironment(env) ??
        (await versionProbe('npm', {
          command: process.execPath,
          args: [npmCliPath, '--version'],
          available: npmCliAvailable,
        })),
    ),
  )

  const javaHome = env.JAVA_HOME ? path.resolve(env.JAVA_HOME) : null
  const javaPath = javaHome
    ? path.join(javaHome, 'bin', executableName('java', platform))
    : null
  const javacPath = javaHome
    ? path.join(javaHome, 'bin', executableName('javac', platform))
    : null
  const [hasJava, hasJavac] = await Promise.all([
    pathExists(javaPath, exists),
    pathExists(javacPath, exists),
  ])

  checks.push(
    fileResult(
      'java-executable',
      hasJava,
      javaPath,
      'Java executable is available.',
      'JAVA_HOME must point to a JDK 21 installation containing Java.',
    ),
  )
  checks.push(
    fileResult(
      'javac',
      hasJavac,
      javacPath,
      'Javac executable is available.',
      'JAVA_HOME must point to a JDK 21 installation containing Javac.',
    ),
  )
  checks.push(
    validateJavaVersion(
      versions.java ??
        (await versionProbe('java', {
          command: javaPath,
          args: ['-version'],
          available: hasJava,
        })),
    ),
  )

  const androidHome = env.ANDROID_HOME
    ? path.resolve(env.ANDROID_HOME)
    : null
  const androidSdkRoot = env.ANDROID_SDK_ROOT
    ? path.resolve(env.ANDROID_SDK_ROOT)
    : null
  const sdkRootsAgree =
    !androidHome ||
    !androidSdkRoot ||
    normalizedPath(androidHome, platform) ===
      normalizedPath(androidSdkRoot, platform)
  const sdkRoot = androidHome ?? androidSdkRoot
  const hasSdkRoot =
    Boolean(sdkRoot) && sdkRootsAgree && (await pathExists(sdkRoot, exists))

  checks.push(
    fileResult(
      'android-sdk',
      hasSdkRoot,
      sdkRoot,
      'Android SDK environment is configured.',
      !sdkRoot
        ? 'ANDROID_HOME or ANDROID_SDK_ROOT must point to the Android SDK.'
        : !sdkRootsAgree
          ? 'ANDROID_HOME and ANDROID_SDK_ROOT must resolve to the same directory.'
          : 'The configured Android SDK directory does not exist.',
    ),
  )

  const platformJar = sdkRoot
    ? path.join(sdkRoot, 'platforms', REQUIRED_ANDROID_PLATFORM, 'android.jar')
    : null
  const buildTool = sdkRoot
    ? path.join(
        sdkRoot,
        'build-tools',
        REQUIRED_BUILD_TOOLS,
        executableName('aapt2', platform),
      )
    : null
  const adbPath = sdkRoot
    ? path.join(
        sdkRoot,
        'platform-tools',
        executableName('adb', platform),
      )
    : null
  const [hasPlatform, hasBuildTools, hasAdb] = await Promise.all([
    pathExists(platformJar, exists),
    pathExists(buildTool, exists),
    pathExists(adbPath, exists),
  ])

  checks.push(
    fileResult(
      'android-platform-36',
      hasPlatform,
      platformJar,
      'Android SDK 36 is installed.',
      'Install Android SDK platform 36.',
    ),
  )
  checks.push(
    fileResult(
      'android-build-tools-36.0.0',
      hasBuildTools,
      buildTool,
      'Android build-tools 36.0.0 are installed.',
      'Install Android build-tools 36.0.0.',
    ),
  )
  checks.push(
    fileResult(
      'adb',
      hasAdb,
      adbPath,
      'adb is available.',
      'Install Android SDK platform-tools containing adb.',
    ),
  )

  if (options.requireProject) {
    const project = await inspectAndroidProject({
      cwd,
      androidDir: options.androidDir,
      platform,
      lstat: options.lstat,
      structuralOnly: true,
    })
    checks.push(
      fileResult(
        'gradle-wrapper',
        project.wrapperOk,
        project.path,
        'Both Gradle wrapper entry points, wrapper JAR/properties, and POSIX executable mode are valid.',
        'The Android project requires regular gradlew, gradlew.bat, gradle-wrapper.jar, and gradle-wrapper.properties files; gradlew must be executable on POSIX.',
      ),
    )
    checks.push(
      fileResult(
        'android-project-metadata',
        project.metadataOk,
        project.path,
        'Android app Gradle metadata is present as regular files.',
        'The Android project is partial or corrupt; expected regular app/build.gradle and settings.gradle files.',
      ),
    )

  }
  return {
    ok: checks.every(({ ok }) => ok),
    checks,
  }
}
