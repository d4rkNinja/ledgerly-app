# Ledgerly Repository Organization Design

**Date:** 2026-08-01

## Goal

Organize the Ledgerly workspace around three product directories—`api`, `web`, and `applications`—while keeping the current Capacitor-enabled web application buildable, keeping the API repository's independent Git history, and removing duplicate or generated workspace material.

## Current context

The root Git repository is the current Capacitor Android application branch. Its tracked files combine the React client, Android project, native Android overlay, Android asset tooling, and documentation. `ledgerly-api/` and `ledgerly-web/` are ignored nested reference repositories. The API reference is a separate Git repository; the web reference duplicates an older frontend snapshot. The working tree also contains generated caches, build output, logs, IDE metadata, and existing user modifications in Android overlay metadata, native Gradle state, and Android environment checks.

## Target boundaries

```text
api/
  cmd/
  internal/
  go.mod
  go.sum
  docker-compose.yml

web/
  src/
  public/
  package.json
  package-lock.json
  capacitor.config.ts
  vite.config.js
  web test and build configuration

applications/
  android/
    Android Gradle project files
    native/android/        # source overlay applied to the generated project
    assets/                # canonical Android source/generated artwork
    resources/             # platform store artwork
    scripts/               # Android orchestration and contract tests
    docs/                  # Android and repository planning documentation
```

The root keeps repository metadata and entry-point documentation: `.git`, `.gitattributes`, `.gitignore`, `.node-version`, `.nvmrc`, and `README.md`. No web source, API source, Android source, or Android-specific tooling remains directly at the root.

`api/` is the existing `ledgerly-api/` repository renamed in place so its nested `.git` directory and independent history remain intact. The untracked compiled `api.exe` is generated output and is removed. The ignored `ledgerly-web/` reference repository is an older duplicate of the current tracked frontend and is removed rather than creating a second web source of truth.

## Build and path contracts

- The tracked frontend moves under `web/`; its package commands run with `web/` as the working directory.
- `web/capacitor.config.ts` points to `../applications/android` for the native Android project.
- Android tooling launched from `web/package.json` resolves the web root, Android project root, native overlay root, and Android asset output root explicitly. Test fixtures retain isolated temporary roots and continue to test the same safety contracts.
- The Android project remains directly buildable from `applications/android` with its Gradle wrapper.
- The native overlay remains source-controlled under `applications/android/native/android` and is copied into the generated Android project using the existing ownership manifest and traversal protections.
- Web branding is read from `web/public/logo.svg`; generated Android artwork is written under `applications/android/assets`, `applications/android/resources`, and the native overlay resource tree.
- Documentation and commands use `api`, `web`, and `applications/android` paths. No application behavior, API contract, package identity, or security policy changes are part of this organization work.

## Cleanup policy

Remove only confirmed generated or duplicate material:

- root caches and build output: `.cache-go`, `.gobuildcache`, `.gocache`, `.gomodcache`, `.gopath`, `.npm-cache`, `.runtime-logs`, `coverage`, `dist`, `node_modules`, `.idea`, and `.superpowers`;
- generated Android build state and untracked outputs after relocation;
- `ledgerly-web/` as the superseded duplicate reference repository;
- `ledgerly-api/api.exe` as a compiled binary.

Tracked source and configuration files are moved without content loss. Existing tracked user modifications are preserved; generated Gradle files that are already tracked are moved as-is rather than silently rewritten. Ignore rules are updated for the new locations and for future generated state.

## Verification and acceptance

The reorganization is accepted only when all of the following have fresh evidence:

1. `cd web; npm run test:run; npm run typecheck; npm run lint; npm run build; npm run test:scripts` pass.
2. `cd api; go test ./...` passes in the independent API repository.
3. Android environment and project checks pass from the new paths; Gradle unit tests and debug lint pass; a fresh debug APK is produced, and a release bundle is produced when the local release configuration permits it.
4. The latest debug APK installs on an available emulator, resolves the Ledgerly activity, launches, and is exercised through the available authentication/demo, navigation, finance, settings, sharing, and back-navigation flows using UI-tree-derived coordinates. Screenshots, UI trees, and logcat are captured only in ignored QA evidence storage.
5. The final root layout contains the three product directories and no stale `android`, `native`, `scripts`, `src`, `public`, `assets`, `resources`, `ledgerly-web`, or `ledgerly-api` directories at the old paths.
6. `git diff --check`, repository status, and all pre-existing modified-file paths are reviewed before reporting completion.
