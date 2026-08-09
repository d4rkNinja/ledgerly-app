# Ledgerly Capacitor Android Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a polished, repeatable, production-ready Capacitor 8.4.2 Android application from the exact Ledgerly frontend baseline.

**Architecture:** The workspace root becomes an independent application repository containing a fresh tracked snapshot of `ledgerly-web/main`. Capacitor is isolated behind focused `src/platform` adapters, while an idempotent Node orchestrator owns Android generation, native overlays, assets, checks, and builds. Capacitor's built-in `SystemBars` plugin and CSS inset injection handle Android 15/16 edge-to-edge behavior without a third-party safe-area or navigation-bar plugin.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, TanStack Query 5, exact `react-router@8.3.0`, Capacitor 8.4.2, official Capacitor plugins 8.x, Android API 24-36, JDK 21, Gradle wrapper, Vitest 4, jsdom 29, React Testing Library 16, Sharp 0.35.3 for deterministic assets, Node.js orchestration, Bash, and PowerShell.

## Global Constraints

- New repository root: `D:\Codeverse\ledgerly`.
- Preserve and ignore `ledgerly-web/` and `ledgerly-api/`; never change either nested repository.
- Import `https://github.com/d4rkNinja/ledgerly-web.git`, branch `main`, commit `e934a3d48718db961a17b0db1b4514ea25e00fa7`.
- Use branch `feature/capacitor-android-app`; never force-push or rewrite the original frontend history.
- Application name: `Ledgerly`.
- Application ID and Android namespace: `io.github.d4rkninja.ledgerly`.
- Web directory: `dist`.
- Node baseline: `24.13.1`; accepted engine range: `^22.22.0 || >=24.0.0`.
- npm baseline: `11.8.0`; use `npm ci` after the lockfile is established.
- Capacitor core, CLI, and Android: `8.4.2`.
- Android minimum SDK: 24; compile SDK: 36; target SDK: 36; JDK: 21.
- Production Android builds require an HTTPS `VITE_API_BASE_URL` ending in `/api/v1`.
- The deployed API must allow credentialed CORS from exactly
  `https://localhost`, the packaged Capacitor origin.
- Do not redesign frontend APIs, authentication, business logic, React Query ownership, or route contracts.
- Do not store bearer tokens in Preferences, local files, logs, or generated Android resources.
- Do not request camera, microphone, storage, contacts, location, or notification permissions.
- Local Notifications, deep links, and a notification icon remain absent because the current product has no feature contract requiring them.
- Release configuration must disable cleartext traffic and WebView debugging and must not contain a development server URL.
- All generated caches, local SDK paths, environment files, signing secrets, keystores, APKs, AABs, mappings, and native symbols remain untracked.

---

## File map

### Repository and package metadata

- `.gitignore`: comprehensive Node, Capacitor, Android, IDE, environment, build, signing, artifact, and preserved-repository exclusions.
- `.nvmrc` and `.node-version`: `24.13.1`.
- `.gitattributes`: deterministic text/binary and wrapper line-ending policy.
- `.env.android.example`: the exact non-secret emulator debug URL and release prerequisite notes.
- `package.json` and `package-lock.json`: exact Capacitor/test dependencies and command surface.
- `capacitor.config.ts`: approved identity, `dist`, SystemBars inset handling, splash, keyboard, and secure production defaults.
- `vitest.config.ts` and `src/test/setup.ts`: deterministic jsdom platform tests.

### Platform boundary

- `src/platform/runtime.ts`: `isNativePlatform()` and `isNativeAndroid()`.
- `src/platform/system-ui.ts`: resolved-theme to `SystemBarsStyle` synchronization.
- `src/platform/network.ts`: native/browser network adapter and reconnect semantics.
- `src/platform/keyboard.ts`: Capacitor keyboard state and CSS publication.
- `src/platform/preferences.ts`: non-sensitive native preference migration,
  hydration, and local-storage mirroring.
- `src/platform/back-layer-stack.ts`: ordered registration and dismissal for
  dialogs, sheets, and search overlays.
- `src/platform/external-links.ts`: strict URL parsing, allow-listing, and native/browser opening.
- `src/platform/haptics.ts`: safe selection and success feedback.
- `src/platform/back-navigation.ts`: overlay → modal URL → route history → exit decision.
- `src/platform/startup.ts`: bounded first-frame/font readiness and splash release.
- `src/platform/native-app-state.ts`: one immutable network/keyboard external
  store consumed through `useSyncExternalStore`.
- `src/platform/native-app-bridge.tsx`: lifecycle/listener ownership and React integration.
- Matching `*.test.ts` or `*.test.tsx` files: behavioral contracts for each adapter.

### Existing frontend integration

- `src/main.tsx`: mount `NativeAppBridge`.
- `src/app/app-context.tsx`: synchronize system UI from the existing resolved theme without changing theme state ownership.
- `src/app/app-shell.tsx`: consume centralized network and keyboard state.
- `src/lib/hooks/use-soft-keyboard.ts`: use native keyboard state with the current visual-viewport fallback.
- `src/lib/share/whatsapp.ts`: route programmatic external navigation through the validator.
- `src/index.css`: canonical safe-area and keyboard variables.
- Shared dialog/sheet/search primitives: register with the ordered native-back
  layer stack and restore focus through their existing close paths.

### Android automation

- `scripts/create-android-app.sh`: required POSIX one-command entry point.
- `scripts/create-android-app.ps1`: Windows companion.
- `scripts/android.mjs`: command dispatcher for doctor/setup/sync/assets/open/run/build/test/clean.
- `scripts/lib/android-environment.mjs`: version, executable, SDK, and production API validation.
- `scripts/lib/android-process.mjs`: fail-fast process execution.
- `scripts/lib/android-overlay.mjs`: deterministic native overlay copy and parity validation.
- `scripts/lib/android-assets.mjs`: deterministic Sharp rendering and Android asset generation.
- `scripts/__tests__/*.test.mjs`: Node built-in tests for validation, ordering, failure propagation, and idempotence.

### Native overlay and generated Android project

- `native/android/app/src/main/AndroidManifest.xml`: minimal permission and secure application contract.
- `native/android/app/src/debug/AndroidManifest.xml`: emulator-only cleartext debug policy.

- `native/android/app/src/main/res/values/{colors,styles}.xml`: light resources.
- `native/android/app/src/main/res/values-night/{colors,styles}.xml`: dark resources.
- `native/android/app/src/main/res/values-v31/styles.xml` and `values-night-v31/styles.xml`: Android 12+ splash themes.
- `native/android/app/src/main/res/xml/network_security_config.xml`: production HTTPS-only trust policy.
- `native/android/app/src/debug/res/xml/network_security_config.xml`: `10.0.2.2` debug exception.
- `native/android/app/src/main/res/xml/{backup_rules,data_extraction_rules}.xml`: explicit no-backup policy.
- `native/android/app/src/main/res/mipmap-anydpi-v33/{ic_launcher,ic_launcher_round}.xml`: monochrome themed icon declarations.
- `native/android/variables.gradle`: SDK 24/36 values.
- `assets/logo.svg` and `assets/logo-dark.svg`: padded canonical brand sources.
- `assets/icon-only.png`, `assets/icon-foreground.png`, `assets/icon-background.png`, `assets/splash.png`, and `assets/splash-dark.png`: generated high-resolution Android resource inputs.
- `resources/play-store-icon.png`: 512-by-512 store source.
- `android/`: generated, synchronized, overlay-applied, buildable Capacitor Android project.

### Documentation and evidence

- `ANDROID_SETUP.md`: complete developer, build, signing, asset, architecture, and troubleshooting guide.
- `docs/android/FRONTEND_BASELINE.md`: source URL, branch, commit, import verification, and clean-state evidence.
- `docs/android/VERIFICATION_REPORT.md`: commands, results, artifacts, emulator evidence, commits, limitations, and manual prerequisites.

---

### Task 1: Establish the independent repository and exact frontend baseline

**Files:**
- Create: `.git/`
- Create: `.gitignore`
- Create: `docs/android/FRONTEND_BASELINE.md`
- Preserve: `ledgerly-web/**`
- Preserve: `ledgerly-api/**`
- Import: all tracked files from frontend commit `e934a3d48718db961a17b0db1b4514ea25e00fa7`

**Interfaces:**
- Consumes: clean upstream repository and approved topology.
- Produces: clean root `main` baseline and `feature/capacitor-android-app`.

- [ ] **Step 1: Re-verify the authoritative local and remote source state**

Run:

```powershell
git -C .\ledgerly-web status --porcelain=v1
git -C .\ledgerly-web rev-parse HEAD
git -C .\ledgerly-web branch --show-current
git -C .\ledgerly-web remote get-url origin
git ls-remote https://github.com/d4rkNinja/ledgerly-web.git refs/heads/main
```

Expected: no local changes, local branch `main`, local and remote commit
`e934a3d48718db961a17b0db1b4514ea25e00fa7`, and the approved origin URL.

- [ ] **Step 2: Clone the exact source into a verified temporary directory**

Run from PowerShell with an explicit `C:\tmp\ledgerly-frontend-e934a3d`
target after confirming that exact target does not contain user data:

```powershell
git clone --branch main --single-branch https://github.com/d4rkNinja/ledgerly-web.git C:\tmp\ledgerly-frontend-e934a3d
git -C C:\tmp\ledgerly-frontend-e934a3d checkout e934a3d48718db961a17b0db1b4514ea25e00fa7
git -C C:\tmp\ledgerly-frontend-e934a3d status --porcelain=v1
```

Expected: detached exact commit and clean output.

- [ ] **Step 3: Import only the tracked frontend tree**

Use `git archive` from the verified clone and extract it into
`D:\Codeverse\ledgerly`; do not copy `.git`, and do not delete or overwrite the
preserved `ledgerly-web`, `ledgerly-api`, or `docs/superpowers` directories.
Compare imported tracked-file hashes against `git ls-tree -r` from the clone.

- [ ] **Step 4: Verify the untouched frontend before Capacitor work**

In the verified temporary clone run:

```powershell
npm ci
npm run check
npm run dev -- --host 127.0.0.1
```

Start Vite in a hidden/background process, wait for its printed local URL,
verify `GET /` returns the Ledgerly HTML, exercise the initial page in a
browser at mobile and desktop widths, then stop only that recorded process.
Capture commands and results in `docs/android/FRONTEND_BASELINE.md`. Any
failure here is a baseline failure, not a Capacitor defect.

- [ ] **Step 5: Write the comprehensive `.gitignore`**

The file must contain explicit entries for:

```gitignore
ledgerly-web/
ledgerly-api/
node_modules/
dist/
coverage/
.vite/
.cache/
*.log
.env
.env.*
!.env.example
!.env.android.example
android/.gradle/
android/**/build/
android/local.properties
android/.idea/
android/captures/
.idea/
.vscode/
*.iml
*.jks
*.keystore
key.properties
keystore.properties
signing.properties
google-services.json
*service-account*.json
*.apk
*.aab
mapping.txt
native-debug-symbols/
```

Include standard npm, Windows, macOS, Android Studio, Gradle, Capacitor
transient, certificate, service-account, and crash-dump exclusions.

- [ ] **Step 6: Record the frontend evidence**

Write `docs/android/FRONTEND_BASELINE.md` with the exact URL, branch, starting
commit, import method, verification commands, timestamp, and confirmation that
both preserved nested repositories were untouched.

- [ ] **Step 7: Initialize the root baseline and branch before Android work**

Run:

```powershell
git init -b main
git add . ':!ledgerly-web' ':!ledgerly-api' ':!docs/superpowers/**' ':!docs/android/FRONTEND_BASELINE.md'
git diff --cached --check
git commit -m "chore: import fresh Ledgerly frontend baseline"
git switch -c feature/capacitor-android-app
git add docs/superpowers/specs/2026-07-30-capacitor-android-app-design.md
git commit -m "docs: add approved android application design"
git add docs/superpowers/plans/2026-07-30-capacitor-android-app.md docs/android/FRONTEND_BASELINE.md
git commit -m "docs: add capacitor android implementation plan"
```

Expected: clean feature branch based on an independent baseline commit.

---

### Task 2: Pin the toolchain, test harness, Capacitor packages, and configuration

**Files:**
- Create: `.nvmrc`
- Create: `.node-version`
- Create: `.env.android.example`
- Create: `capacitor.config.ts`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: npm lockfile baseline and exact approved identity.
- Produces: deterministic dependency graph, test runner, and typed Capacitor configuration.

- [ ] **Step 1: Add test scripts before platform implementation**

Add these exact package scripts:

```json
{
  "test": "vitest",
  "test:run": "vitest run",
  "test:coverage": "vitest run --coverage",
  "check": "npm run test:run && npm run typecheck && npm run lint && npm run build"
}
```

Create `vitest.config.ts` with jsdom, `src/test/setup.ts`, `@` alias resolution,
mock reset, and coverage limited to `src/platform` plus changed integration
files. `src/test/setup.ts` imports `@testing-library/jest-dom/vitest`.

- [ ] **Step 2: Install exact runtime dependencies**

Run:

```powershell
npm install --save-exact react-router@8.3.0 @capacitor/core@8.4.2 @capacitor/android@8.4.2 @capacitor/status-bar@8.0.3 @capacitor/splash-screen@8.0.2 @capacitor/keyboard@8.0.5 @capacitor/app@8.1.1 @capacitor/haptics@8.0.2 @capacitor/network@8.0.1 @capacitor/browser@8.0.4 @capacitor/preferences@8.0.1
```

`react-router@8.3.0` is the sole router package. Every router import, including
DOM routers and links, comes from `react-router`; do not install or import
`react-router-dom`.

- [ ] **Step 3: Install exact development dependencies**

Run:

```powershell
npm install --save-dev --save-exact @capacitor/cli@8.4.2 sharp@0.35.3 vitest@4.1.10 @vitest/coverage-v8@4.1.10 jsdom@29.0.1 @testing-library/react@16.3.2 @testing-library/jest-dom@7.0.0 @testing-library/user-event@14.6.1 typescript@5.9.3
```

Set:

```json
{
  "packageManager": "npm@11.8.0",
  "engines": {
    "node": "^22.22.0 || >=24.0.0",
    "npm": ">=10"
  }
}
```

- [ ] **Step 4: Pin local Node metadata**

Write `24.13.1` followed by one newline to both `.nvmrc` and `.node-version`.

- [ ] **Step 5: Write the typed Capacitor configuration**

Create `capacitor.config.ts` with this contract:

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.d4rkninja.ledgerly',
  appName: 'Ledgerly',
  webDir: 'dist',
  backgroundColor: '#f1f5f2',
  loggingBehavior: 'debug',
  android: {
    path: 'android',
    backgroundColor: '#f1f5f2',
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: false,
    useLegacyBridge: false,
  },
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SystemBars: {
      style: 'DEFAULT',
      hidden: false,
      insetsHandling: 'css',
    },
    SplashScreen: {
      launchAutoHide: false,
      launchFadeOutDuration: 180,
      backgroundColor: '#f1f5f2',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
  },
}

export default config
```

Do not add `server.url` or wildcard navigation. `Keyboard.resize` is retained
for supported platforms; Android IME behavior must be verified with the
emulator rather than inferred from that iOS-only option.

- [ ] **Step 6: Add non-secret Android environment examples**

Document only these values in `.env.android.example`:

```dotenv
# Emulator debug build only
VITE_API_BASE_URL=http://10.0.2.2:8080/api/v1

# Release values are never committed; supply the owned production endpoint
# through the invoking environment.
```

Release documentation may explain the required shape as
`https://<owned-production-api-host>/api/v1`, but no reserved, example, or
invented hostname is accepted or used to manufacture a release artifact.

- [ ] **Step 7: Verify dependency and config health**

Run:

```powershell
npm install
npm exec cap doctor
npm run typecheck
npm run lint
npm run build
```

Expected: lockfile updated, all Capacitor packages on major 8, `dist/index.html`
present, and no production server URL in generated configuration.

- [ ] **Step 8: Commit**

```powershell
git add .nvmrc .node-version .env.android.example package.json package-lock.json capacitor.config.ts vitest.config.ts src/test/setup.ts
git commit -m "chore: initialize capacitor android application"
```

---

### Task 3: Build the fail-fast, idempotent Android command orchestrator

**Files:**
- Create: `scripts/android.mjs`
- Create: `scripts/create-android-app.sh`
- Create: `scripts/create-android-app.ps1`
- Create: `scripts/lib/android-environment.mjs`
- Create: `scripts/lib/android-process.mjs`
- Create: `scripts/lib/android-overlay.mjs`
- Create: `scripts/__tests__/android-environment.test.mjs`
- Create: `scripts/__tests__/android-orchestrator.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `capacitor.config.ts`, npm scripts, SDK/JDK environment, `native/android`.
- Produces: `doctor()`, `setup()`, `sync()`, `assets()`, `open()`, `run()`, `build()`, `test()`, and `clean()` commands.
- A successful `setup()` always builds the React `dist` bundle and an
  installable Android debug APK.

- [ ] **Step 1: Write environment-validation tests**

Cover these exact contracts with Node's `node:test` and temporary directories:

```js
assert.equal(validateNodeVersion('v24.13.1').ok, true)
assert.equal(validateNodeVersion('v22.13.0').ok, false)
assert.equal(validateNodeVersion('v22.21.0').ok, false)
assert.equal(validateNodeVersion('v22.22.0').ok, true)
assert.equal(validateNodeVersion('v23.0.0').ok, false)
assert.equal(validateJavaVersion('21.0.7').ok, true)
assert.throws(() => validateReleaseApiUrl('http://api.example.com/api/v1'))
assert.throws(() => validateReleaseApiUrl('https://user:secret@example.com/api/v1'))
assert.equal(
  validateReleaseApiUrl('https://api.cloudflare.com/api/v1').href,
  'https://api.cloudflare.com/api/v1',
)
```

The full doctor path must accept Node 22.22+ within major 22, or Node 24+,
and reject Node 22.13 through 22.21 plus Node 23, matching package metadata
and React Router 8 before any pipeline side effect. Also test missing
`ANDROID_HOME`, conflicting `ANDROID_HOME` and
`ANDROID_SDK_ROOT`, SDK 36, build-tools 36.0.0, adb, and Javac. Test Gradle
wrapper diagnostics separately with `requireProject: true`; the fresh-project
preflight must not require a wrapper that `cap add android` has not generated.
Release URL tests also reject a trailing slash, query, fragment, whitespace,
and any non-exact `/api/v1` path without echoing credentials or the supplied
URL in diagnostics.

- [ ] **Step 2: Run tests and confirm failure**

Run:

```powershell
node --test scripts/__tests__/android-environment.test.mjs
```

Expected: module-not-found or missing-export failure.

- [ ] **Step 3: Implement environment validation**

Export:

```js
export function validateNodeVersion(version) {}
export function validateJavaVersion(version) {}
export function validateReleaseApiUrl(value) {}
export async function inspectAndroidEnvironment(options = {}) {}
```

`inspectAndroidEnvironment({ requireProject: false })` validates the host
Node/npm/JDK/SDK/adb toolchain only. It accepts Node 22.22+ within major 22, or
Node 24+, and rejects earlier Node 22 releases plus Node 23. With
`requireProject: true`, it additionally
requires a structurally valid existing `android/` project, both wrapper entry
points, and expected app Gradle metadata. A partial `android/` directory is a
hard error and is never overwritten by `cap add`.

Use parsed numeric tuples, explicit filesystem checks, and structured
`{ ok, name, version, path, message }` results. Never print environment values
whose keys contain `TOKEN`, `PASSWORD`, `SECRET`, `KEYSTORE`, or `PRIVATE`.

- [ ] **Step 4: Write process/orchestration tests**

Use an injected runner to assert this setup order:

```text
parse options → release URL validation when requested → host-toolchain doctor
→ npm ci → npm exec cap doctor → npm run check → verify fresh dist/index.html
→ cap add only when android is absent → validate generated/existing wrapper
→ assets → native overlay → cap sync android → Gradle dependencies
→ Gradle testDebugUnitTest → Gradle lintDebug → Gradle assembleDebug
→ verify APK → optional Gradle bundleRelease → verify AAB → optional open
```

`npm run check` owns the production Vite build, so setup must not build the
same bundle twice. Test that an existing valid `android/` skips `cap add`, a
partial/corrupt directory fails without overwrite, any failed command prevents
later commands, invalid release configuration causes no build/sync side
effect, missing artifacts fail after otherwise successful runners, and two
overlay runs produce identical complete owned-tree hashes.

- [ ] **Step 5: Implement the process runner**

Export:

```js
export async function runCommand(command, args, options = {}) {}
export function gradleCommand(platform = process.platform) {}
```

Use `spawn` with argument arrays, inherited output, explicit `cwd`, and
`shell: false` for every native executable/Node command and every POSIX path.
Prefer `process.execPath` plus a validated `npm_execpath` whenever available.
The single narrow Windows exception is for `.cmd`/`.bat` wrappers, which cannot
be executed directly with `shell: false`: resolve and validate trusted
`npm.cmd`/`gradlew.bat` paths, invoke them through explicit
`%ComSpec% /d /s /c`, robustly quote paths, and permit only allowlisted fixed
command/task tokens. Never interpolate user-controlled values into that shell
fragment. An adb target remains a separate argument to `adb.exe`, never part of
a shell fragment. Throw an error naming the failed step and exit code without
printing sensitive environment values.

- [ ] **Step 6: Implement the command dispatcher**

`scripts/android.mjs` accepts:

```text
doctor
setup [--open] [--release]
sync
assets
open
run [--target <adb-serial>]
build debug
build release
test
clean
```

Unknown commands and missing required arguments exit non-zero with usage.
The normal setup finishes only after
`android/app/build/outputs/apk/debug/app-debug.apk` exists. `--release`
validates a canonical, absolute, credential-free HTTPS `VITE_API_BASE_URL`
ending exactly in `/api/v1` immediately after option parsing and before any
build/sync side effect; it then runs `bundleRelease` and requires
`android/app/build/outputs/bundle/release/app-release.aab`.

`build debug` always runs the current React production build, applies the
owned overlay, synchronizes Capacitor, runs `assembleDebug`, and verifies the
APK. `build release` first performs the same release URL validation, then
builds React with that exact environment, applies the overlay, synchronizes
the resulting `dist`, runs `bundleRelease`, and verifies the AAB. Neither
command may reuse an unverified stale `dist` or stale WebView asset bundle.
`sync` likewise builds React before `cap sync`.

- [ ] **Step 7: Add the shell wrappers**

`scripts/create-android-app.sh`:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "${SCRIPT_DIR}/android.mjs" setup "$@"
```

`scripts/create-android-app.ps1`:

```powershell
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $scriptDir 'android.mjs') setup @args
exit $LASTEXITCODE
```

- [ ] **Step 8: Add package commands**

```json
{
  "android:doctor": "node ./scripts/android.mjs doctor",
  "android:setup": "node ./scripts/android.mjs setup",
  "android:setup:windows": "powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/create-android-app.ps1",
  "android:sync": "node ./scripts/android.mjs sync",
  "android:assets": "node ./scripts/android.mjs assets",
  "android:open": "node ./scripts/android.mjs open",
  "android:run": "node ./scripts/android.mjs run",
  "android:build": "npm run android:build:debug",
  "android:build:debug": "node ./scripts/android.mjs build debug",
  "android:build:release": "node ./scripts/android.mjs build release",
  "android:test": "node ./scripts/android.mjs test",
  "android:clean": "node ./scripts/android.mjs clean",
  "test:scripts": "node --test scripts/__tests__/*.test.mjs"
}
```

- [ ] **Step 9: Run the script tests**

```powershell
npm run test:scripts
```

Expected: all environment, ordering, idempotence, and failure tests pass.

- [ ] **Step 10: Commit**

```powershell
git add package.json package-lock.json scripts
git commit -m "chore: add android build and setup scripts"
```

---

### Task 4: Implement tested runtime, system UI, preferences, external link, network, keyboard, and haptic adapters

**Files:**
- Create: `src/platform/runtime.ts`
- Create: `src/platform/system-ui.ts`
- Create: `src/platform/external-links.ts`
- Create: `src/platform/network.ts`
- Create: `src/platform/keyboard.ts`
- Create: `src/platform/preferences.ts`
- Create: `src/platform/haptics.ts`
- Create: matching `src/platform/*.test.ts`

**Interfaces:**
- Consumes: official Capacitor plugins and existing Ledgerly `ResolvedTheme`.
- Produces:
  - `isNativePlatform(): boolean`
  - `isNativeAndroid(): boolean`
  - `syncSystemBars(theme: 'light' | 'dark'): Promise<void>`
  - `parseExternalUrl(raw: string): SafeExternalUrl`
  - `openExternalUrl(raw: string): Promise<void>`
  - `subscribeNetwork(listener: (state: NetworkState) => void): Promise<Cleanup>`
  - `refreshNetworkState(): Promise<NetworkState | null>`
  - `subscribeKeyboard(listener: (state: KeyboardState) => void): Promise<Cleanup>`
  - `resetNativeKeyboardState(): void`
  - `hydrateNativePreferences(options?: { signal?: AbortSignal }): Promise<void>`
  - `persistNativePreference(key: NativePreferenceKey, value: string): Promise<void>`
  - `removeNativePreference(key: NativePreferenceKey): Promise<void>`
  - `selectionHaptic(): Promise<void>`
  - `successHaptic(): Promise<void>`

- [ ] **Step 1: Write runtime and system-bar tests**

Mock `Capacitor.isNativePlatform`, `Capacitor.getPlatform`, and core
`SystemBars.setStyle`. Assert light theme maps both bars to
`SystemBarsStyle.Light`, dark maps both to `SystemBarsStyle.Dark`, browser
paths call nothing, and one failed native call does not throw into React.

- [ ] **Step 2: Write external URL tests**

Accept:

```text
https://example.com/path
https://wa.me/919999999999
```

Accept normalized public HTTPS URLs up to and including 4,096 characters.
WhatsApp delivery permits the exact `wa.me` host only; subdomains and lookalike
prefixes remain invalid. Reject HTTP, credentials, whitespace/control characters,
invalid or protocol-relative URLs, `javascript:`, `data:`, `file:`, `mailto:`,
`tel:`, trailing-dot and single-label hosts, localhost/private/reserved/example
names, `home.arpa`, non-public IPv4/IPv6 forms, and local-use or private-address
NAT64 embeddings. Assert both the raw and normalized URL stay within the same
4,096-character ceiling, native Browser receives only the frozen normalized
value, and the web fallback uses `_blank` plus `noopener,noreferrer`.

- [ ] **Step 3: Write network, keyboard, and preference tests**

Assert native Network emits initial state plus changes, browser events remain
the fallback, and `refreshNetworkState()` updates TanStack Query's
`onlineManager` in both modes. Active/disposed guards must ignore listener
callbacks that arrive after cleanup; cleanup is idempotent and removes every
successfully created handle.

Keyboard DOM publication is native-Android-only. Show publishes
`data-keyboard-open="true"` plus a finite, non-negative `--keyboard-height`;
hide and `resetNativeKeyboardState()` publish `"false"` and `0px`. Partial
listener registration failure removes the successful handle and clears both
markers. Cleanup does the same. Browser mode leaves the markers absent so the
existing `visualViewport` fallback remains authoritative.

Assert native preference hydration mirrors only `mt-demo`, `mt-user-name`,
`mt-workspace`, `mt-privacy`, and `mt-theme`; bearer-token keys are never read
or written. Hydration accepts an `AbortSignal` and performs no later storage
mutation once aborted. Native precedence, local-only migration, and plugin
failures are isolated per key. Persistence and removal update `localStorage`
synchronously, preserve exact raw serialized values, reject non-allowlisted keys
before storage access, and serialize native mutations through a FIFO queue per
key so rapid set/remove calls cannot commit out of order. Never call broad
Preferences operations such as `keys`, `clear`, `migrate`, or `removeOld`.

- [ ] **Step 4: Run tests and confirm failure**

```powershell
npm run test:run -- src/platform
```

Expected: missing modules/exports.

- [ ] **Step 5: Implement the adapters**

Use official plugin handles only inside these modules. Convert plugin listener
handles into idempotent cleanup functions, guard async registration and event
delivery after disposal, and remove partially registered handles. Catch
unsupported-plugin errors, but do not suppress URL-validation errors. Keep
preference mutation queues keyed independently and abort hydration between
every awaited native/storage operation.

The system bar mapping must call:

```ts
await Promise.all([
  SystemBars.setStyle({ bar: SystemBarType.StatusBar, style }),
  SystemBars.setStyle({ bar: SystemBarType.NavigationBar, style }),
])
```

- [ ] **Step 6: Implement haptic no-op safety**

Selection uses `Haptics.selectionChanged()`. Success uses
`Haptics.notification({ type: NotificationType.Success })`. Calls are skipped
outside native Android and plugin failures are swallowed because haptics are
non-critical feedback.

- [ ] **Step 7: Run focused and full checks**

```powershell
npm run test:run -- src/platform
npm run typecheck
npm run lint
```

- [ ] **Step 8: Commit**

```powershell
git add src/platform
git commit -m "feat: add centralized android platform services"
```

---

### Task 5: Implement lifecycle, ordered back layers, splash readiness, preference hydration, and React integration

**Files:**
- Create: `src/platform/back-navigation.ts`
- Create: `src/platform/back-layer-stack.ts`
- Create: `src/platform/native-app-state.ts`
- Create: `src/platform/startup.ts`
- Create: `src/platform/native-app-bridge.tsx`
- Create: matching focused tests under `src/platform`
- Modify: `src/main.tsx`
- Modify: `src/components/motion/bottom-sheet.tsx`
- Modify: the desktop `DesktopDialog` owner in `src/components/ui.tsx`
- Modify: the desktop overlay owner in `src/components/workspace-search.tsx`
- Modify: `DesktopWorkspaceSwitcher` in `src/app/navigation/workspace-switcher.tsx`

**Interfaces:**
- Consumes: `react-router` navigation/location, QueryClient, `ResolvedTheme`, and Task 4 adapters.
- Produces:
  - `registerBackLayer(dismiss: () => void): () => void`
  - `dismissTopBackLayer(): boolean`
  - `decideBackAction(input: BackInput): BackAction`
  - immutable `NativeAppState` snapshots plus `getNativeAppState()`,
    `getNativeAppStateServerSnapshot()`, `subscribeNativeAppState()`, and
    `useNativeAppState()`
  - `releaseNativeSplash(options?): Promise<void>`
  - `<NativeAppBridge resolvedTheme={resolvedTheme} demoMode={demoMode}`
    `isAuthenticated={isAuthenticated} />`

- [ ] **Step 1: Write the complete pure back-policy tests**

The ordered policy is overlay, modal URL, usable history, fallback root, then
exit. Test modal keys `add` and `claim`; removing them must preserve pathname,
ordered/repeated unrelated query parameters, hash, location state, and
replacement semantics. Usable history means the Capacitor event reports
`canGoBack` or the browser history index proves an earlier entry exists.

With no usable history, `/`, a directly entered `/login`, and authenticated
`/app/home` are the only exit roots. A non-root authenticated route must
replace-navigate to `/app/home`; a non-root unauthenticated route must
replace-navigate to `/`. An unauthenticated `/app/home` is not an exit root.
Assert `App.exitApp()` is impossible for every non-root decision.

- [ ] **Step 2: Write exact overlay-owner tests**

Register once at the four current shared owners: `BottomSheet`, desktop
`DesktopDialog`, desktop `WorkspaceSearch`, and `DesktopWorkspaceSwitcher`.
Do not also register their callers, which would duplicate a visible layer.
Assert native back closes only the most recently visible owner, stale
registrations disappear, URL-backed dialogs invoke their existing close
callback, and every owner follows its existing close-and-refocus path. The
unused command-palette component does not gain speculative ownership.

- [ ] **Step 3: Write one immutable native-state store**

`NativeAppState` contains readonly network state and exact field
`nativeKeyboard: KeyboardState | null`. Null means native keyboard state is
unavailable, so the browser `visualViewport` fallback remains authoritative.
Publish a new frozen snapshot only when a value changes; return the same object
when it does not. `getNativeAppStateServerSnapshot()` returns one stable frozen
singleton, and `useNativeAppState()` passes it as `useSyncExternalStore`'s
`getServerSnapshot`. Test subscription cleanup, immutable snapshots, stable
no-op and server-snapshot identity, SSR/jsdom rendering, and Strict Mode
mount/unmount behavior.

- [ ] **Step 4: Write splash and abortable hydration tests**

Use fake timers and mocked `document.fonts.ready`. Assert one stable animation
frame plus font readiness hides SplashScreen once, font failure still releases
it, the 3,000 ms splash ceiling releases it, and browser execution is a no-op.

The bounded native preference bootstrap owns an `AbortController`. Its timeout
aborts `hydrateNativePreferences({ signal })` before React proceeds, clears its
timer on early settlement, and prevents a timed-out native read from mutating
storage later. Hydration failure remains non-fatal and the startup path always
continues to splash release.

- [ ] **Step 5: Write bridge lifecycle and ownership tests**

`NativeAppBridge` is the sole owner of App, Network, and Keyboard subscriptions.
No page, shell, hook, or second bridge may subscribe, and no `appUrlOpen`
listener is registered because deep links are deliberately absent. Assert
cleanup removes every handle and ignores late async registration/events.

On resume, reapply system bars, call `refreshNetworkState()`, call
`resetNativeKeyboardState()`, and update TanStack Query's `focusManager`. A
single offline-to-online transition invalidates eligible active queries only
when authenticated and not in demo mode. Set QueryClient
`refetchOnReconnect: false`; this bridge is the only reconnect refetch owner,
so onlineManager does not cause a duplicate automatic refetch. Assert back
events execute the pure policy and exit only for an approved root.

- [ ] **Step 6: Run tests and confirm failure**

```powershell
npm run test:run -- src/platform/back-navigation.test.ts src/platform/back-layer-stack.test.ts src/platform/native-app-state.test.ts src/platform/startup.test.ts src/platform/native-app-bridge.test.tsx
```

- [ ] **Step 7: Implement and mount the bridge once**

Keep current location/theme/demo/authentication values in refs without
re-subscribing plugin listeners. Before React renders on native Android, run
the abortable bounded hydration, synchronously reapply `mt-theme`, and then
render. Inside the existing `BrowserRouter`, `QueryClientProvider`, and
`AppProvider`, mount one small owner component that reads existing app state
and passes `resolvedTheme`, `demoMode`, and `isAuthenticated` to
`NativeAppBridge`. Do not create a second router or query client.

- [ ] **Step 8: Run focused and full checks**

```powershell
npm run test:run -- src/platform
npm run typecheck
npm run lint
npm run build
```

- [ ] **Step 9: Commit**

```powershell
git add src/main.tsx src/platform src/components/motion/bottom-sheet.tsx src/components/ui.tsx src/components/workspace-search.tsx src/app/navigation/workspace-switcher.tsx
git commit -m "feat: add android lifecycle and back navigation"
```

---

### Task 6: Integrate safe areas, preferences, keyboard state, offline recovery, external links, and haptics into existing UI

**Files:**
- Modify: `index.html`
- Modify: `src/index.css`
- Modify: `src/app/app-shell.tsx`
- Modify: `src/app/app-context.tsx`
- Modify: `src/lib/hooks/use-soft-keyboard.ts`
- Modify: `src/lib/share/whatsapp.ts` and its current caller
- Modify: selected mobile navigation/quick-action files
- Create or modify: focused integration tests beside changed modules

**Interfaces:**
- Consumes: Task 4 adapters and Task 5's single immutable native-state store.
- Produces: centralized inset layout, native-aware keyboard/offline UI, safe asynchronous link delivery, replacement preference writes, and restrained nonblocking feedback.

- [ ] **Step 1: Write integration tests**

Assert `AppShell` consumes `useNativeAppState()` and shows exactly one offline
banner without registering online/offline or plugin listeners. Non-null
`nativeKeyboard` is authoritative. When null, mobile-dock and soft-keyboard
visibility come from the existing browser `visualViewport` fallback. Reconnect
does not replace an `ApiError`, and the Task 5 owner invalidates
eligible queries only once.

Assert each existing write/removal for the five allowlisted app-context keys
calls the preference adapter instead of calling `localStorage` separately.
WhatsApp delivery awaits `openExternalUrl`, preserves the 4,096-character URL
ceiling, and rejects an altered host. Haptic rejection or latency must not gate
navigation, UI state, or an already successful mutation.

- [ ] **Step 2: Add canonical CSS variables without duplicate inset ownership**

At `:root` define:

```css
--safe-area-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
--safe-area-right: var(--safe-area-inset-right, env(safe-area-inset-right, 0px));
--safe-area-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
--safe-area-left: var(--safe-area-inset-left, env(safe-area-inset-left, 0px));
--safe-top: var(--safe-area-top);
--safe-right: var(--safe-area-right);
--safe-bottom: var(--safe-area-bottom);
--safe-left: var(--safe-area-left);
--keyboard-height: 0px;
```

The legacy `--safe-*` names are aliases, not a second source. Apply safe-area
padding once at the relevant shared shell/chrome, mobile-dock, banner, or sheet
boundary. Do not add global `html`, `body`, or `#root` padding, per-page padding,
or nested aliases that count the same inset twice. `--keyboard-height` is a
visibility/measurement signal; do not add it as global bottom padding on top of
the WebView resize or add both it and the safe-area bottom to owners that
already receive those insets.

- [ ] **Step 3: Verify viewport coverage and accessibility**

Keep one viewport meta with `viewport-fit=cover`; do not set
`user-scalable=no`, a restrictive `maximum-scale`, or any other zoom blocker.
Confirm focused fields remain visible, fixed controls do not cover dialog
actions, and existing dialog/sheet labels and focus restoration survive the
integration.

- [ ] **Step 4: Replace duplicate network and keyboard event ownership**

Remove `navigator.onLine` state and raw online/offline listeners from
`AppShell`; read the one external-store snapshot for its banner and
`is-offline` class. Update `useSoftKeyboard` to read `nativeKeyboard` without
subscribing to Keyboard: a non-null value is authoritative, while null activates
its existing `visualViewport` listeners and fallback.

- [ ] **Step 5: Replace direct preference writes**

Replace, one for one, the current `localStorage.setItem` and
`localStorage.removeItem` calls for `mt-demo`, `mt-user-name`, `mt-workspace`,
`mt-privacy`, and `mt-theme` with `persistNativePreference` and
`removeNativePreference`. Do not keep a duplicate direct write: the adapter
already performs the synchronous local-storage mirror before its best-effort
native FIFO mutation. Preserve current React state ownership and serialized
values. Never persist the live bearer token.

- [ ] **Step 6: Centralize asynchronous external delivery**

Keep URL/text construction and privacy-reviewed payload truncation pure and
bounded at 4,096 URL characters. Make the WhatsApp delivery path asynchronous
and route its final exact `https://wa.me/...` value through
`await openExternalUrl(...)`; remove its direct `window.open`/injected opener
delivery path. Preserve current clipboard and native-share fallbacks. Callers
must await or explicitly handle the delivery promise.

- [ ] **Step 7: Add restrained, nonblocking haptics**

Fire selection feedback only after a native mobile destination or quick action
is accepted, and success feedback only after an operation already reports
success. Invoke haptics as contained best-effort feedback; never await them
before navigation, state updates, or a financial result, and never signal a
failed or merely initiated financial write.

- [ ] **Step 8: Run the responsive and accessibility matrix**

Run focused tests plus a production browser build at 360, 412, 768, and 1280
pixels in portrait and landscape. Check horizontal overflow, 200% zoom, visible
keyboard focus, dialog/sheet focus trapping and restoration, labeled close
controls, the offline live region, keyboard-focused forms, and mobile-dock
visibility. Record observations; a passing unit test does not substitute for
the responsive or accessibility checks.

- [ ] **Step 9: Commit**

```powershell
git add index.html src/index.css src/app src/lib src/components
git commit -m "feat: configure system bars navigation and safe areas"
```

---

### Task 7: Generate the Android project, secure native overlay, themes, splash, and branding

**Files:**
- Create: `.gitattributes`
- Create: `assets/**` and `resources/play-store-icon.png`
- Create: `scripts/lib/android-assets.mjs`
- Create: `native/android/**`
- Generate and modify: `android/**`
- Modify: `capacitor.config.ts`
- Modify: `scripts/android.mjs` and focused script helpers
- Create or modify: asset, environment, overlay, and orchestration tests under `scripts/__tests__`

**Interfaces:**
- Consumes: approved brand SVG, exact debug/release API mode, locked Capacitor 8.4.2 template, Android API 36 toolchain, and Task 3 overlay engine.
- Produces: a fully branded, secure, regenerable Android project whose source and merged manifests, template identity, assets, and one-command pipeline are verified.

- [ ] **Step 1: Write the complete pipeline/native contract tests**

Add failing tests for all of these contracts:

- `android:setup` runs `npm run test:scripts` after `npm ci` and before
  Capacitor/native generation, in addition to the existing React `npm run check`;
- the asset loader translates `ERR_MODULE_NOT_FOUND` only when the missing URL
  is exactly the top-level `scripts/lib/android-assets.mjs`; a missing nested
  Sharp/helper dependency and every other import error retain their original
  error and stack;
- generated Android metadata matches app ID/namespace
  `io.github.d4rkninja.ledgerly`, the locked `@capacitor/android@8.4.2`
  template, SDK 24/36/36, and the expected wrapper/template versions; partial
  or drifted projects fail rather than being overlaid;
- default and release config keep `allowMixedContent: false`; only an
  orchestrator-selected debug sync with the exact
  `http://10.0.2.2:8080/api/v1` value sets it true;
- the owned source main manifest declares only `android.permission.INTERNET`,
  while merged debug and release manifests contain exactly INTERNET,
  ACCESS_NETWORK_STATE, and VIBRATE, the latter two supplied by the official
  Network and Haptics plugins;
- overlay ownership, asset bytes, line endings, and tracked output remain
  identical across two complete setup runs.

- [ ] **Step 2: Add deterministic repository attributes**

Create `.gitattributes` with text auto-detection, LF for shell scripts and
`gradlew`, CRLF for `*.bat`, and binary treatment for JAR/PNG/WebP/keystore
formats. Verify `gradlew` retains its POSIX executable bit. This policy is part
of the setup idempotence check; running on Windows must not churn every
generated wrapper or resource file.

- [ ] **Step 3: Create and test deterministic branding assets**

Assert source dimensions:

```text
icon-only.png: 1024x1024 or larger
icon-foreground.png: 1024x1024 or larger with mark inside adaptive safe zone
icon-background.png: 1024x1024 or larger
splash.png: 2732x2732 or larger
splash-dark.png: 2732x2732 or larger
play-store-icon.png: exactly 512x512 with no alpha
```

Copy the canonical logo paths and colors without distortion. Center the mark
inside the adaptive icon's inner 66.67% safe region. Use `#f1f5f2` and
`#0b120e` backgrounds and preserve brand fills `#17483A`, `#A6B58A`, and
`#20272B`. Render with exact `sharp@0.35.3`, record source hashes, and generate
resources only through `node ./scripts/android.mjs assets`.

- [ ] **Step 4: Harden the asset loader and one-command order**

Implement `scripts/lib/android-assets.mjs`. Narrow the lazy-load diagnostic to
the exact missing top-level module URL; do not relabel exceptions raised while
that module imports Sharp or a helper. Add `npm run test:scripts` to the setup
sequence so `npm run android:setup` itself validates script ordering, release
guards, overlay parity, and asset contracts before it generates or builds
Android. Any failure stops later commands.

- [ ] **Step 5: Add Android only when absent and validate its template**

Run `npx cap add android` only for an absent project. Before applying the
overlay, inspect regular wrapper and Gradle files, package/namespace,
application ID, SDK values, Capacitor template/package version, wrapper
distribution, and generated plugin metadata. Compare generated version
identity to the locked local packages rather than accepting any structurally
plausible Android project. A partial, symlinked, mismatched, or older generated
project is a hard error with regeneration guidance.

- [ ] **Step 6: Write the secure source manifest overlay**

The main source manifest declares only INTERNET and these application
attributes:

```xml
android:allowBackup="false"
android:dataExtractionRules="@xml/data_extraction_rules"
android:fullBackupContent="@xml/backup_rules"
android:hardwareAccelerated="true"
android:networkSecurityConfig="@xml/network_security_config"
android:usesCleartextTraffic="false"
```

Keep the launcher activity exported, orientation-unlocked, predictive-back
enabled, and on the launch theme. Keep `android:windowSoftInputMode` unset:
Capacitor 8.4 SystemBars/IME handling and `resizeOnFullScreen` own resizing.
Do not add `adjustResize`, deep-link intent filters, Local Notifications, or
unrelated providers. After plugin merge, assert the exact normal-permission set
is INTERNET plus ACCESS_NETWORK_STATE and VIBRATE; do not misreport the merged
plugin permissions as source declarations or dangerous runtime permissions.

- [ ] **Step 7: Implement exact debug-only cleartext and mixed-content policy**

Main/release network security trusts system certificates and denies cleartext.
The debug overlay permits cleartext only to `10.0.2.2`, and the orchestrator
sets Capacitor `allowMixedContent: true` only when both the selected build mode
is debug and `VITE_API_BASE_URL` is exactly
`http://10.0.2.2:8080/api/v1`. Missing/debug-demo and every other URL keep it
false. Release setup/build forces `allowMixedContent: false` and release
cleartext false before sync regardless of the caller environment. Test the
generated config and merged manifests, not only source text.

- [ ] **Step 8: Add day/night themes, splash, and adaptive icons**

Use centralized light/dark resources and Android 12+ `Theme.SplashScreen`
attributes for background, padded animated icon, and post-splash theme. Keep
native window and web-root backgrounds identical. Generate launcher, round,
foreground, background, monochrome API-33, light/dark splash, and density
resources, then prove every reference resolves during `aapt2`/Gradle build.

- [ ] **Step 9: Apply the owned overlay and synchronize twice**

Run assets, apply the explicit owned-path manifest, and run `cap sync android`.
The overlay removes stale formerly owned files, preserves unrelated generated
Capacitor files, verifies source/destination byte parity before writing its
ownership manifest, and permits no symlink escape. Run the complete setup
twice and compare tracked Git status plus owned-tree, asset, wrapper, and
configuration hashes; timestamp-only evidence is not idempotence.

- [ ] **Step 10: Run native and merged-manifest checks**

```powershell
npm run android:setup
cd android
./gradlew.bat dependencies
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug
./gradlew.bat assembleDebug
./gradlew.bat processDebugMainManifest processReleaseMainManifest
```

Inspect both merged manifests for exact identity, SDK, cleartext/debuggable
state, deep-link absence, and INTERNET + ACCESS_NETWORK_STATE + VIBRATE only.
The setup must finish with a fresh current-React debug APK. Command-line
wrapper builds remain supported when Android Studio is absent or older than
2025.2.1; `android:doctor`/`android:open` emit an actionable IDE warning, but
an IDE-version warning alone does not fail CLI setup or build.

- [ ] **Step 11: Commit**

```powershell
git add .gitattributes assets resources native android scripts capacitor.config.ts package.json
git commit -m "feat: add android splash icons and native theming"
```

---

### Task 8: Complete release validation, signing, artifact inspection, documentation, and repeatability checks

**Files:**
- Create: `ANDROID_SETUP.md`
- Create: `docs/android/VERIFICATION_REPORT.md`
- Modify: `README.md` and `.env.android.example`
- Modify: `scripts/android.mjs`, `scripts/lib/android-environment.mjs`, and focused script tests
- Modify: owned Android Gradle overlay files only as required for fail-closed external signing

**Interfaces:**
- Consumes: all implementation tasks, an actual owned production API endpoint for release, and optional external upload-keystore values.
- Produces: reproducible developer/release guidance, inspected artifact sidecars, and an evidence-backed delivery record that distinguishes debug, unsigned verification, signed upload-candidate, and blocked states.

- [ ] **Step 1: Write hardened release-validator tests**

Before changing the validator, add tests that reject missing/empty values, HTTP,
credentials, whitespace/control characters, query, fragment, trailing slash,
wrong path, trailing-dot or single-label hosts, every IPv4/IPv6 literal,
localhost, `.local`, `.internal`, `home.arpa`, private/reserved ranges, and
reserved/example/test/invalid domains. Canonical HTTPS with exact `/api/v1` is
necessary but not sufficient operationally: the supplied hostname must be the
operator's real owned production API. Diagnostics must not echo credentials or
the rejected URL.

Exercise both `android:setup -- --release` and
`android:build:release`. Invalid or missing production configuration must fail
before npm, Vite, Capacitor sync, Gradle, artifact deletion, or any other build
side effect. It must be impossible for any release command to emit or bless an
AAB using a reserved, example, local, private, literal, or invented endpoint.

- [ ] **Step 2: Implement release gating and remove fake release examples**

Harden `validateReleaseApiUrl` with the tested host rules and use the same
validated object for the Vite environment, Capacitor sync, artifact metadata,
and `bundleRelease`. Remove the commented example-domain release URL from
.env.android.example`; non-executable documentation may show only the shape
`https://<owned-production-api-host>/api/v1`. If the real owned endpoint is not
available, deliberately exercise the fail-closed test, skip every release AAB
claim, and record that external blocker. Do not substitute a reserved hostname
merely to make Gradle green.

- [ ] **Step 3: Write and implement all-or-none external signing**

The four non-empty external values are:

```text
LEDGERLY_UPLOAD_STORE_FILE
LEDGERLY_UPLOAD_STORE_PASSWORD
LEDGERLY_UPLOAD_KEY_ALIAS
LEDGERLY_UPLOAD_KEY_PASSWORD
```

Test all-none and all-four states. Zero values selects an unsigned release
verification build; any one-to-three subset, an empty value, a missing/non-file
keystore, or a repository-contained keystore fails before `bundleRelease`.
Redact all four from diagnostics. Sanitize child environments so npm, Vite,
Capacitor, doctor, debug Gradle tasks, and logs never receive them; only the
`bundleRelease` child receives the complete set, and its Gradle configuration
fails closed if the set becomes partial. Never pass passwords on a printed
command line.

A real API plus no keystore may produce an AAB labeled exactly `unsigned
verification AAB`. All four values may produce only a `signed upload candidate`
until `jarsigner` inspection confirms the expected signer and the report records
its certificate fingerprint. Neither label means Play-deployable or accepted by
Google Play; that requires owner-controlled upload and Play validation.

- [ ] **Step 4: Write `ANDROID_SETUP.md` without overstating prerequisites**

Document Node 24.13.1 and supported `^22.22.0 || >=24.0.0`, npm, JDK 21, SDK
36/build-tools 36.0.0, wrapper-based command-line setup, Bash/PowerShell
entry points, sync/run/debug APK, guarded release AAB, exact local emulator API,
credentialed CORS from `https://localhost`, asset replacement, architecture,
external signing, artifact labels/locations, and recovery procedures. Explain
that CLI builds are supported now; the installed older Android Studio only
blocks supported IDE/open workflows and produces a warning until upgraded to
2025.2.1 or newer.

State that debug without `VITE_API_BASE_URL` is demo-only; local live debug
uses exactly `http://10.0.2.2:8080/api/v1`. Release requires the real owned
HTTPS endpoint and never permits cleartext/mixed content. Keep deep links and
Local Notifications explicitly absent.

- [ ] **Step 5: Run setup twice and prove tracked idempotence**

```powershell
npm run android:setup
git status --short
npm run android:setup
git status --short
```

Compare tracked status plus overlay, wrapper, asset, generated config, and APK
input hashes. The second run must introduce no tracked diff; evidence timestamp
changes alone do not prove idempotence.

- [ ] **Step 6: Run the complete automated and dependency suite**

```powershell
npm ci
npm audit
npm audit --omit=dev
npm run test:scripts
npm run check
npm run android:doctor
npm run android:test
npm run android:build:debug
```

Both npm audits must report zero vulnerabilities, including zero React Router
advisories, with exact `react-router@8.3.0` and no `react-router-dom`. Script
and doctor evidence must show Node 22.13, 22.21, and 23 fail before pipeline
work; Node 22.22+ within major 22, or Node 24+, succeeds. Capture command, exit
code, duration, and relevant hashes.
Run the release setup/build
only when the real owned production API is supplied; otherwise capture the
expected pre-side-effect rejection and list the missing endpoint as a release
blocker rather than an automated-suite failure.

- [ ] **Step 7: Inspect source, merged manifests, and build security**

Inspect the source main manifest separately from merged debug and release
manifests. Expected source permission is INTERNET only; expected merged normal
permissions are exactly INTERNET, ACCESS_NETWORK_STATE, and VIBRATE. Confirm no
dangerous runtime permissions, no deep-link filters, release cleartext and mixed
content false, release WebView debugging false, debug cleartext limited to
`10.0.2.2`, exact identity/SDK values, no embedded server URL, and no tracked
environment, local SDK, keystore, or signing files.

- [ ] **Step 8: Inspect artifacts and write sidecars**

Delete stale outputs before their producing task. For each fresh artifact, use
SDK/JDK tools to inspect package ID, versionName/versionCode, min/target SDK,
debuggable state, permissions, signing state, ZIP integrity, and expected WebView
assets. Run `apksigner verify` plus `aapt2 dump badging` on the debug APK; for
an AAB, inspect bundle entries and run `jarsigner -verify -verbose -certs`,
treating its unsigned result as unsigned rather than signed success. A signed
candidate must match the expected external certificate fingerprint.

Generate ignored sibling `.sha256` and `.metadata.json` sidecars containing
artifact path, SHA-256, byte size, UTC build time, Git commit, app ID, version
values, SDK values, exact permission set, frontend `dist` tree hash, native
overlay hash, validated API origin, signing label, and inspection command results.
Sidecar hash must match a fresh re-hash of the artifact. Record these in the
verification report; do not commit APKs, AABs, sidecars, credentials, or local
paths.

The debug artifact is always expected at
`android/app/build/outputs/apk/debug/app-debug.apk`. The release AAB at
`android/app/build/outputs/bundle/release/app-release.aab` is expected only
after a real owned production API passes validation. With no such endpoint,
missing AAB is the required fail-closed outcome.

- [ ] **Step 9: Commit documentation**

```powershell
git add ANDROID_SETUP.md README.md .env.android.example docs/android scripts native/android
git commit -m "docs: add android development and release guide"
```

Stage implementation files in this commit only when the release/inspection
tests required a documented Task 8 correction; do not commit generated secrets
or artifacts.

---

### Task 9: Emulator QA and final completion audit

**Files:**
- Modify: `docs/android/VERIFICATION_REPORT.md`
- Create: screenshots, UI trees, and logs only in an ignored evidence directory
- Modify: implementation files only for defects proven by QA

**Interfaces:**
- Consumes: exact `Pixel_9` API 36 AVD, fresh debug APK, demo mode, and optional exact local API.
- Produces: UI-tree-driven observed Android behavior and a requirement-by-requirement completion report.

- [ ] **Step 1: Start and validate the exact emulator**

Use the `test-android-apps:android-emulator-qa` skill throughout. Start the
`Pixel_9` AVD, discover its serial with `adb devices`, wait until
`sys.boot_completed=1`, install the fresh debug APK with `adb install -r`,
resolve the launcher activity through `cmd package resolve-activity`, clear app
state for cold-launch cases, and capture both process-scoped and crash logcat.
Do not substitute another AVD without recording why Pixel_9 is unavailable.

- [ ] **Step 2: Drive every tap from the exact UI-tree helpers**

For each multi-step state, dump `uiautomator` XML, then run these installed
skill scripts:

```text
C:\Users\alien\.codex\plugins\cache\openai-curated-remote\test-android-apps\0.1.2\skills\android-emulator-qa\scripts\ui_tree_summarize.py
C:\Users\alien\.codex\plugins\cache\openai-curated-remote\test-android-apps\0.1.2\skills\android-emulator-qa\scripts\ui_pick.py
```

Review the summary, call `ui_pick.py` against the full step-specific XML and
the target's visible label, parse its returned center coordinates, and only
then issue `adb -s $serial shell input tap $x $y`. If a node is missing inside
a scrollable container, perform one safe non-edge swipe, re-dump, and re-search.
Never infer coordinates from screenshots. If a WebView control remains absent
from the accessibility tree, treat it as a semantic accessibility defect, fix
the markup, rerun tests/build/install, and re-dump. Save the full tree, summary,
pick result, screenshot, and relevant log slice for each representative flow.

- [ ] **Step 3: Execute launch, system UI, responsive, and keyboard matrices**

Verify cold/warm launch, splash transition without white/black flash, light/
dark/system themes, status/navigation icon contrast, gesture and three-button
navigation, background/resume, and process termination/reopen. App-selected
theme must work independently of Android system night mode; the platform
contrast scrim must not expose a white strip in dark theme.

Exercise portrait/landscape small phone, Pixel 9, large phone, and tablet
dimensions. Test login, signup, search, current dialogs and bottom sheets,
financial forms, text areas, focus scrolling, keyboard open/close, and mobile
dock visibility. Capture screenshots and UI hierarchy at representative states
and correlate visual findings with the responsive/accessibility matrix.

- [ ] **Step 4: Execute exact root and fallback back checks**

With no overlay, modal URL, or usable prior history, verify back exits only at
`/`, directly entered `/login`, and authenticated `/app/home`. Verify an
unauthenticated `/app/home` and every other non-root route replace-navigate to
`/`; authenticated non-root routes replace-navigate to `/app/home`. With usable
history, back navigates first even from a root. Separately prove one back press
closes only the top shared overlay and then removes `add`/`claim` modal state
while preserving unrelated query order, hash, and location state. Deep links
remain absent and are not used to manufacture direct-entry tests.

- [ ] **Step 5: Execute offline, exact local-debug, and external-link checks**

First verify demo-only behavior with no API URL. Then, only when a local backend
is actually available, build/sync debug with exact
`VITE_API_BASE_URL=http://10.0.2.2:8080/api/v1`; confirm requests work from the
emulator, mixed content is enabled for that debug combination, and other HTTP
hosts remain blocked. Toggle emulator connectivity and verify one nonblocking
offline banner, preserved form input, one reconnect refresh, and no masking of
backend HTTP errors. If the backend is absent, record local live API as a
manual blocker rather than claiming success.

Verify normalized public HTTPS and exact `wa.me` links leave the WebView and
unsafe/lookalike/overlong links do not. When a live API is available, verify
credentialed CORS uses exact `Access-Control-Allow-Origin: https://localhost`,
`Access-Control-Allow-Credentials: true`, allowed methods, and
`Authorization, Content-Type`; cookie sessions additionally require
`SameSite=None; Secure`.

- [ ] **Step 6: Verify authentication behavior honestly**

With actual local or HTTPS credentials, test login and frontend requests. Kill
and reopen the process and record the designed memory-only live-token behavior.
If no live credentials/backend are available, test demo mode and list live
account verification as a manual prerequisite. Never infer it from a successful
APK build.

- [ ] **Step 7: Run the final requirement and repository audit**

Map every approved requirement to a file, command result, artifact sidecar, UI
tree, screenshot, log, or observed emulator result. Mark unavailable physical
device, production API, live account, external signing, Play upload, or updated
Android Studio work as explicit external/manual blockers. A signed upload
candidate is not Play-deployable until owner-controlled Play validation.

```powershell
git status --short
git log --oneline --decorate --max-count=16
git diff main...HEAD --check
git -C .\ledgerly-web status --porcelain=v1
git -C .\ledgerly-api status --porcelain=v1
```

Expected: root changes are committed, both preserved repositories remain clean,
and no whitespace errors, artifacts, sidecars, credentials, or secrets are
tracked.

- [ ] **Step 8: Final commit if evidence changed**

```powershell
git add docs/android/VERIFICATION_REPORT.md
git commit -m "docs: record android verification results"
```

Do not create an empty commit.

---

## Plan self-review checklist

- Every original workflow, Capacitor package, script, Android UX, security,
  build, Git, test, documentation, and final-report requirement maps to a task.
- Local Notifications and its permission/icon are explicitly excluded based on
  the current product contract.
- Deep links are explicitly excluded because no owned verified domain exists.
- Live session persistence is reported as the existing memory-only behavior,
  not silently changed to insecure storage.
- Release API URL and signing inputs are external secure prerequisites.
- Capacitor SystemBars, not custom or third-party navigation/safe-area code,
  owns Android 15/16 icon appearance and injected insets.
- All task interfaces use consistent exported names.
- No step requires modifying either preserved nested repository.
- No step claims an emulator, physical-device, live-account, or signed-release
  result before observing it.
