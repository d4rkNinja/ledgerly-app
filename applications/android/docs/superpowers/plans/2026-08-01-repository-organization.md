# Repository Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Reorganize Ledgerly into api, web, and applications/android, remove duplicate/generated workspace material, and preserve the current web, API, and Android build contracts.

**Architecture:** The tracked React/Capacitor client becomes web/. The independent API repository becomes api/ with its nested Git history preserved. The generated Android project becomes applications/android/, with its native overlay, Android assets, orchestration scripts, tests, and documentation colocated beneath it. Android tooling receives explicit web-root and Android-root paths.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, npm, Capacitor 8.4.2, Android Gradle Plugin 8.13.0, Gradle wrapper, Go 1.22, MongoDB, adb, and the Android emulator.

## Global Constraints

- Keep exactly three product directories at the workspace root: api/, web/, and applications/.
- Keep .git, .gitattributes, .gitignore, .node-version, .nvmrc, and README.md at the root; move application-specific docs under applications/android/docs/.
- Preserve the nested Git history in api/.git and do not flatten it into the root repository.
- Preserve the four pre-existing modified paths and their content: the Android overlay manifest, native Gradle state, and Android environment helper.
- Do not change Ledgerly’s package ID (io.github.d4rkninja.ledgerly), API routes, authentication behavior, security policy, or UI behavior.
- Generated caches, build output, logs, IDE metadata, and the duplicate ignored ledgerly-web/ reference are cleanup targets; tracked source is not deleted.
- Use absolute-path checks before recursive removal, and do not remove a path outside D:\Codeverse\ledgerly.
- Run fresh verification from the new working directories before claiming completion.

---

### Task 1: Capture the migration baseline

**Files:**
- Read: root tracked files, ledgerly-api/, and ledgerly-web/
- No source files are changed in this task.

**Interfaces:**
- Produces: a verified list of source/destination paths, nested-repository states, and pre-existing root modifications used to guard the migration.

- [ ] Step 1: Record repository state.

Run from D:\Codeverse\ledgerly:

~~~powershell
git status --short --branch
git diff --name-only
git -c safe.directory=D:/Codeverse/ledgerly/ledgerly-api -C ledgerly-api status --short --branch
git -c safe.directory=D:/Codeverse/ledgerly/ledgerly-web -C ledgerly-web status --short --branch
~~~

Expected: ledgerly-web is clean; ledgerly-api has only generated api.exe as an untracked file; root changes match the known baseline.

- [ ] Step 2: Assert all migration sources exist and destinations are absent.

~~~powershell
$workspaceRoot = (Resolve-Path '.').Path
$sources = @('src','public','assets','resources','native','android','scripts','docs','ledgerly-api','ledgerly-web')
$sources | ForEach-Object {
  $path = Join-Path $workspaceRoot $_
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing source: $path" }
}
$destinations = @('api','web','applications')
$destinations | ForEach-Object {
  $path = Join-Path $workspaceRoot $_
  if (Test-Path -LiteralPath $path) { throw "Destination already exists: $path" }
}
~~~

- [ ] Step 3: Save the pre-existing modified-file list outside the workspace.

~~~powershell
git diff --name-only | Set-Content -NoNewline "$env:TEMP\ledgerly-preexisting-modifications.txt"
~~~

### Task 2: Create the product roots and move source trees

**Files:**
- Create: api/, web/, applications/
- Move: ledgerly-api/** to api/**
- Move: root web source/config files to web/**
- Move: android/**, native/**, assets/**, resources/**, scripts/**, docs/** to applications/android/**
- Delete: ledgerly-web/ after verifying it is the superseded duplicate.

**Interfaces:**
- Consumes: Task 1 target assertions.
- Produces: the requested boundaries without changing source contents.

- [ ] Step 1: Create destinations.

~~~powershell
New-Item -ItemType Directory -Force -Path 'api','web','applications','applications/android' | Out-Null
~~~

- [ ] Step 2: Move the API repository and retain its nested history.

~~~powershell
Move-Item -LiteralPath 'ledgerly-api/.git' -Destination 'api/.git'
Get-ChildItem -LiteralPath 'ledgerly-api' -Force | Where-Object { $_.Name -ne '.git' } | Move-Item -Destination 'api'
if ((Get-ChildItem -LiteralPath 'api' -Force -File | Where-Object Name -eq 'api.exe').Count -eq 1) {
  Remove-Item -LiteralPath 'api/api.exe' -Force
}
~~~

Expected: api/.git and api/go.mod exist, and no API source remains at ledgerly-api/.

- [ ] Step 3: Move the current tracked web app into web/.

~~~powershell
$webFiles = @(
  '.oxlintrc.json','.env','.env.android','.env.android.example','capacitor.config.ts','components.json',
  'index.html','package.json','package-lock.json','tsconfig.json','vite.config.js',
  'vitest.config.ts','src','public'
)
$webFiles | ForEach-Object {
  if (Test-Path -LiteralPath $_) { Move-Item -LiteralPath $_ -Destination 'web' }
}
~~~

Keep .nvmrc and .node-version at the root as workspace-wide version constraints.

- [ ] Step 4: Move Android, tooling, assets, and documentation.

~~~powershell
Get-ChildItem -LiteralPath 'android' -Force | Move-Item -Destination 'applications/android'
Move-Item -LiteralPath 'native' -Destination 'applications/android/native'
Move-Item -LiteralPath 'assets' -Destination 'applications/android/assets'
Move-Item -LiteralPath 'resources' -Destination 'applications/android/resources'
Move-Item -LiteralPath 'scripts' -Destination 'applications/android/scripts'
Move-Item -LiteralPath 'docs' -Destination 'applications/android/docs'
~~~

Expected: applications/android/gradlew exists, the overlay is applications/android/native/android, and Android tests are applications/android/scripts/__tests__.

- [ ] Step 5: Verify and remove the duplicate web reference.

~~~powershell
Get-Content -Raw 'applications/android/docs/android/FRONTEND_BASELINE.md'
git -c safe.directory=D:/Codeverse/ledgerly/ledgerly-web -C ledgerly-web status --short
$duplicate = (Resolve-Path 'ledgerly-web').Path
$root = (Resolve-Path '.').Path
if (-not $duplicate.StartsWith($root + '\',[System.StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove outside workspace: $duplicate" }
Remove-Item -LiteralPath $duplicate -Recurse -Force
~~~

### Task 3: Make web and Android path contracts explicit

**Files:**
- Modify: web/capacitor.config.ts and web/package.json
- Modify: applications/android/scripts/android.mjs and applications/android/scripts/lib/*.mjs
- Create: applications/android/scripts/lib/android-paths.mjs
- Modify: applications/android/scripts/__tests__/*.test.mjs

**Interfaces:**
- resolveAndroidLayout(webRoot) returns webRoot, androidDir, nativeDir, assetRoot, and distDir.
- createAndroidOrchestrator({ rootDir, androidDir }) uses explicit roots; temporary fixtures may pass the old layout explicitly.
- inspectAndroidProject({ cwd, androidDir }) and inspectAndroidEnvironment({ cwd, androidDir, ... }) inspect the passed Android root.
- generateAndroidAssets({ sourceRoot, outputRoot }) reads sourceRoot/public/logo.svg and writes beneath outputRoot.
- applyAndroidModeConfig({ projectRoot, androidDir }) reads/writes Capacitor assets beneath androidDir.

- [ ] Step 1: Add the shared layout resolver.

Create applications/android/scripts/lib/android-paths.mjs:

~~~js
import path from 'node:path'

export function resolveAndroidLayout(webRoot) {
  const resolvedWebRoot = path.resolve(webRoot)
  const androidDir = path.resolve(resolvedWebRoot, '..', 'applications', 'android')
  return {
    webRoot: resolvedWebRoot,
    androidDir,
    nativeDir: path.join(androidDir, 'native', 'android'),
    assetRoot: androidDir,
    distDir: path.join(resolvedWebRoot, 'dist'),
  }
}
~~~

- [ ] Step 2: Update Capacitor and npm scripts.

Set the Android path in web/capacitor.config.ts to ../applications/android and leave every existing Android option unchanged. Change Android npm scripts to call ../applications/android/scripts/android.mjs; set test:scripts to node --test ../applications/android/scripts/__tests__/*.test.mjs. Leave web-only scripts unchanged.

- [ ] Step 3: Thread explicit roots through the orchestrator.

In android.mjs, derive rootDir from the web working directory and use:

~~~js
const layout = resolveAndroidLayout(rootDir)
const androidDir = path.resolve(options.androidDir ?? layout.androidDir)
const nativeDir = path.resolve(options.nativeDir ?? layout.nativeDir)
const distDir = path.resolve(options.distDir ?? layout.distDir)
~~~

Derive APK/AAB paths from androidDir; keep dist under web. Pass explicit roots to project inspection, asset generation, overlay application, and mode configuration. Preserve the existing Gradle, Capacitor, ownership, symlink, package identity, and artifact checks.

- [ ] Step 4: Update helpers and fixtures.

Replace implicit projectRoot/android and projectRoot/native/android derivations with passed paths. Make asset generation read web/public/logo.svg and write to applications/android/assets, resources, and native/android. Update temporary fixtures to pass explicit paths and add android-layout.test.mjs asserting that web/dist, applications/android, and applications/android/native/android are distinct.

### Task 4: Update metadata and documentation

**Files:**
- Modify: root .gitignore and root README.md
- Modify: moved documentation under applications/android/docs/**
- Modify: moved scripts/tests containing old path references.

**Interfaces:**
- Produces: documented commands using only api, web, and applications/android.

- [ ] Step 1: Update ignore rules.

Add or update:

~~~gitignore
api/
web/node_modules/
web/dist/
web/coverage/
applications/android/.gradle/
applications/android/**/build/
applications/android/**/.cxx/
applications/android/**/.externalNativeBuild/
applications/android/**/local.properties
applications/android/**/captures/
applications/android/**/native/**/.gradle/
applications/android/evidence/
~~~

Retain credential, package, log, cache, and OS metadata rules.

- [ ] Step 2: Rewrite root README commands.

Document:

~~~powershell
cd api
go test ./...

cd ..\web
npm ci
npm run check
npm run android:doctor
npm run android:test
npm run android:build:debug
~~~

Explain that npm/Capacitor runs from web and Gradle files live in applications/android. Remove stale golang, frontend, and root-relative Android instructions.

- [ ] Step 3: Update current path references.

~~~powershell
rg -n --hidden -g '!applications/android/**/build/**' -g '!web/node_modules/**' -g '!.git/**' 'ledgerly-api|ledgerly-web|native/android|android/|android\\|scripts/|assets/|resources/|cd frontend|cd golang' .
~~~

Update runtime commands and current paths; keep historical commit hashes and external repository URLs as historical references.

### Task 5: Remove generated workspace material safely

**Files:**
- Delete: confirmed generated root directories and untracked outputs.
- Modify: .gitignore.

**Interfaces:**
- Produces: no duplicate web reference, compiled API binary, stale root build output, or local cache remains.

- [ ] Step 1: Enumerate cleanup targets.

~~~powershell
$root = (Resolve-Path '.').Path
$cleanupTargets = @(
  '.cache-go','.gobuildcache','.gocache','.gomodcache','.gopath',
  '.npm-cache','.runtime-logs','.idea','.superpowers','coverage','dist','node_modules',
  'web/node_modules','web/dist','web/coverage',
  'applications/android/app/build','applications/android/build',
  'applications/android/.gradle'
)
$cleanupTargets | ForEach-Object {
  $path = Join-Path $root $_
  if (Test-Path -LiteralPath $path) { Get-Item -LiteralPath $path | Select-Object FullName,Mode }
}
~~~

- [ ] Step 2: Remove only verified generated targets.

For each reported path, resolve it and require that it starts with the workspace root before using Remove-Item -Recurse -Force. Do not remove tracked applications/android/native/android/app/.gradle files; move them as-is to preserve the known user changes.

- [ ] Step 3: Verify old and new roots.

~~~powershell
@('ledgerly-api','ledgerly-web','android','native','scripts','src','public','assets','resources') | ForEach-Object {
  if (Test-Path -LiteralPath $_) { throw "Stale root path remains: $_" }
}
@('api','web','applications','applications/android/gradlew','web/package.json','api/go.mod') | ForEach-Object {
  if (-not (Test-Path -LiteralPath $_)) { throw "Expected path is missing: $_" }
}
~~~

### Task 6: Run web and API verification

**Files:**
- Read: web/package.json, api/go.mod, test output, and build output.
- Write: ignored web/dist/ and test caches only.

**Interfaces:**
- Produces: fresh web/API evidence before Android QA.

- [ ] Step 1: Validate the web.

Run from D:\Codeverse\ledgerly\web:

~~~powershell
npm ci
npm run test:run
npm run typecheck
npm run lint
npm run build
npm run test:scripts
~~~

Expected: every command exits 0 and web/dist/index.html exists after the build.

- [ ] Step 2: Validate the API.

Run from D:\Codeverse\ledgerly\api:

~~~powershell
go test ./...
~~~

If integration tests require MongoDB, start only the service documented by api/docker-compose.yml, rerun the complete command, and record the dependency.

### Task 7: Build and validate the Android application

**Files:**
- Read: applications/android/, Gradle output, and emulator state.
- Write: ignored build output and QA evidence only.

**Interfaces:**
- Produces: fresh debug APK, optional release AAB, installed emulator app, screenshots/UI trees/logcat, and flow-by-flow QA results.

- [ ] Step 1: Run doctor and native tests.

From D:\Codeverse\ledgerly\web:

~~~powershell
npm run android:doctor
npm run android:test
~~~

Expected: Node/npm/JDK/SDK/platform/build-tools/adb checks, Gradle dependency resolution, unit tests, and debug lint pass.

- [ ] Step 2: Build debug and release artifacts.

~~~powershell
npm run android:build:debug
npm run android:build:release
~~~

Expected: non-empty applications/android/app/build/outputs/apk/debug/app-debug.apk and, when release configuration permits, applications/android/app/build/outputs/bundle/release/app-release.aab.

- [ ] Step 3: Install and launch the latest APK using the Android Emulator QA skill.

~~~powershell
adb devices
$serialLine = adb devices | Select-String '\\tdevice$' | Select-Object -First 1
if (-not $serialLine) { throw 'No online Android emulator/device was reported by adb devices.' }
$serial = ($serialLine.ToString() -split '\\s+')[0]
adb -s $serial install -r 'D:\Codeverse\ledgerly\applications\android\app\build\outputs\apk\debug\app-debug.apk'
adb -s $serial shell cmd package resolve-activity --brief io.github.d4rkninja.ledgerly
adb -s $serial shell am force-stop io.github.d4rkninja.ledgerly
adb -s $serial shell am start -n io.github.d4rkninja.ledgerly/.MainActivity
~~~

Use only the serial returned by adb devices.

- [ ] Step 4: Exercise the application flows.

Before every interaction, dump the UI tree, summarize it, and derive tap coordinates with ui_pick.py. Capture evidence under ignored applications/android/evidence/ or a temporary directory. Exercise cold launch, welcome/demo, onboarding/login and Remember this device when credentials exist, mobile dock, workspace switcher, search, back navigation, dashboard, activity, bills/insights, budgets/goals, accounts, claims, collaboration, invitations, settings, quick-add, demo write, theme/privacy, share-sheet preview/copy/fallback, modal dismissal, and background-resume. Test live API/network recovery only when a reachable backend and safe credentials are available.

Capture:

~~~powershell
adb -s $serial logcat -c
adb -s $serial exec-out uiautomator dump /dev/tty > applications/android/evidence/ui-launch.xml
adb -s $serial exec-out screencap -p > applications/android/evidence/launch.png
adb -s $serial logcat -b crash -d > applications/android/evidence/crash-log.txt
adb -s $serial logcat -d > applications/android/evidence/logcat.txt
~~~

### Task 8: Final verification and handoff

**Files:**
- Read: final tree, Git status/diff, migration baseline, and QA evidence.
- Modify: none after verification passes.

**Interfaces:**
- Produces: evidence-backed report with exact paths, test results, cleanup summary, and environment limitations.

- [ ] Step 1: Verify final layout.

~~~powershell
Get-ChildItem -Force | Select-Object Mode,Name
@('api','web','applications') | ForEach-Object { if (-not (Test-Path -LiteralPath $_)) { throw "Missing product root: $_" } }
@('android','native','scripts','src','public','assets','resources','ledgerly-api','ledgerly-web') | ForEach-Object { if (Test-Path -LiteralPath $_) { throw "Stale root directory: $_" } }
~~~

- [ ] Step 2: Compare pre-existing changes and whitespace.

~~~powershell
Get-Content "$env:TEMP\ledgerly-preexisting-modifications.txt"
git status --short --branch
git diff --check
git diff --name-status
~~~

Confirm the known user modifications remain present under their relocated paths and no unrelated source was overwritten.

- [ ] Step 3: Report only verified results.

Include exact web, API, Android, emulator, QA-flow, crash/logcat, and cleanup evidence. Report unavailable live-backend or release-signing conditions explicitly rather than implying they passed.
