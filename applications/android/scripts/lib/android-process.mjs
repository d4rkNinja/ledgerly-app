import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'

const ALLOWED_NPM_FALLBACK_ARGUMENTS = new Set([
  'ci',
  'exec\0--\0cap\0add\0android',
  'exec\0--\0cap\0doctor',
  'exec\0--\0cap\0open\0android',
  'exec\0--\0cap\0sync\0android',
  'run\0build',
  'run\0check',
])

const ALLOWED_GRADLE_TASKS = new Set([
  'assembleDebug',
  'assembleRelease',
  'bundleRelease',
  'clean',
  'dependencies',
  'lintDebug',
  'testDebugUnitTest',
])

async function defaultExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function exactArgumentsAllowed(args, allowed) {
  return allowed.has(args.join('\0'))
}

function assertTrustedBatchPath(filePath, expectedName) {
  if (
    !path.win32.isAbsolute(filePath) ||
    path.win32.basename(filePath).toLowerCase() !== expectedName ||
    /["%!\r\n]/.test(filePath) ||
    filePath.includes('\0')
  ) {
    throw new Error(`Refusing an untrusted ${expectedName} path.`)
  }
}

function windowsBatchCommand(filePath, args) {
  return `"${filePath}"${args.length === 0 ? '' : ` ${args.join(' ')}`}`
}

async function resolveNpmCli(options, exists) {
  const explicitlyDisabled = options.npmExecPath === null
  const configuredPath =
    options.npmExecPath ??
    options.env?.npm_execpath ??
    process.env.npm_execpath
  const adjacentPath = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  )
  const candidate = explicitlyDisabled ? null : configuredPath ?? adjacentPath

  if (!candidate) return null
  const resolved = path.resolve(candidate)
  if (
    path.basename(resolved).toLowerCase() !== 'npm-cli.js' ||
    !(await exists(resolved))
  ) {
    if (configuredPath) {
      throw new Error(
        'npm_execpath must resolve to an existing trusted npm-cli.js.',
      )
    }
    return null
  }
  return resolved
}

async function resolveWindowsNpmFallback(options, exists) {
  const npmPath = path.resolve(
    options.npmPath ?? path.join(path.dirname(process.execPath), 'npm.cmd'),
  )
  assertTrustedBatchPath(npmPath, 'npm.cmd')
  if (!(await exists(npmPath))) {
    throw new Error(
      'Unable to locate trusted npm.cmd; run through npm or install npm beside Node.js.',
    )
  }
  return npmPath
}

async function resolveComspec(options, exists) {
  const comspec = path.resolve(
    options.comspec ?? options.env?.ComSpec ?? process.env.ComSpec ?? '',
  )
  assertTrustedBatchPath(comspec, 'cmd.exe')
  if (!(await exists(comspec))) {
    throw new Error('Unable to locate the trusted Windows command processor.')
  }
  return comspec
}

export function gradleCommand(platform = process.platform) {
  return platform === 'win32' ? 'gradlew.bat' : './gradlew'
}

async function resolveInvocation(command, args, options) {
  const platform = options.platform ?? process.platform
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const exists = options.exists ?? defaultExists

  if (command === 'npm') {
    const npmCli = await resolveNpmCli(options, exists)
    if (npmCli) {
      return {
        command: process.execPath,
        args: [npmCli, ...args],
      }
    }

    if (platform !== 'win32') {
      return { command: 'npm', args }
    }
    if (!exactArgumentsAllowed(args, ALLOWED_NPM_FALLBACK_ARGUMENTS)) {
      throw new Error(
        'npm.cmd fallback arguments are not permitted by the fixed allowlist.',
      )
    }
    const npmPath = await resolveWindowsNpmFallback(options, exists)
    const comspec = await resolveComspec(options, exists)
    return {
      command: comspec,
      args: ['/d', '/s', '/c', windowsBatchCommand(npmPath, args)],
    }
  }

  if (command === 'gradle') {
    if (
      args.length !== 1 ||
      !exactArgumentsAllowed(args, ALLOWED_GRADLE_TASKS)
    ) {
      throw new Error(
        'Gradle wrapper arguments are not permitted by the fixed task allowlist.',
      )
    }
    const wrapper = path.resolve(cwd, gradleCommand(platform))
    if (!(await exists(wrapper))) {
      throw new Error('The validated Gradle wrapper is missing.')
    }
    if (platform !== 'win32') {
      return { command: wrapper, args }
    }
    assertTrustedBatchPath(wrapper, 'gradlew.bat')
    const comspec = await resolveComspec(options, exists)
    return {
      command: comspec,
      args: ['/d', '/s', '/c', wrapper, ...args],
    }
  }

  if (
    platform === 'win32' &&
    /\.(?:cmd|bat)$/i.test(String(command))
  ) {
    throw new Error(
      'Generic Windows batch execution is not permitted; use a trusted logical command.',
    )
  }

  return { command, args }
}

export async function runCommand(command, args, options = {}) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new TypeError('Command arguments must be a string array.')
  }

  const cwd = path.resolve(options.cwd ?? process.cwd())
  const invocation = await resolveInvocation(command, args, {
    ...options,
    cwd,
  })
  const spawnImpl = options.spawnImpl ?? spawn
  const step = options.step ?? command

  await new Promise((resolve, reject) => {
    let settled = false
    const child = spawnImpl(invocation.command, invocation.args, {
      cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    })

    child.once('error', (error) => {
      if (settled) return
      settled = true
      reject(new Error(`${step} failed to start: ${error.message}`))
    })
    child.once('close', (code, signal) => {
      if (settled) return
      settled = true
      if (code === 0) {
        resolve()
        return
      }
      const status = signal ? `signal ${signal}` : `exit code ${code}`
      reject(new Error(`${step} failed with ${status}.`))
    })
  })
}
