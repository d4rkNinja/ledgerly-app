# Professional Ledgerly README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the root README with an accurate, polished guide to Ledgerly's product, monorepo, local development, verification, deployment boundaries, and engineering experiment.

**Architecture:** Treat tracked source, manifests, scripts, tests, and current GitHub metadata as the evidence of record. Keep the root README approachable, link only to documentation that exists, and disclose the private-repository, missing-license, database-only Docker, and debug-signed Android release boundaries.

**Tech Stack:** Markdown, Go 1.22, Chi 5.2, MongoDB 7, React 19, TypeScript 5.9, Vite 8, Capacitor 8, Android SDK 36, Docker Compose, GitHub Actions.

## Global Constraints

- Modify only `README.md` and this plan document.
- Use `git@github.com:d4rkNinja/ledgerly-app.git` and the matching HTTPS URL.
- Do not claim that the repository is legally open source while it is private and has no `LICENSE` file.
- Do not claim that Docker starts the API or web app; `api/docker-compose.yml` provisions only MongoDB 7 as replica set `rs0`.
- Do not claim that the Android release APK is Play-ready; `applications/android/app/build.gradle` uses debug signing for `release`.
- Explain that the approximately two-hour figure covers the initial implementation session only, after the engineering harness, skills, conventions, and testing workflow existed.
- Use only the six curated images under `docs/assets/screenshots/` plus the tracked Ledgerly logo.
- Keep secrets and ignored local environment files out of the README.

---

### Task 1: Replace the root project guide

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: repository evidence from `api/`, `web/`, `applications/android/`, `docs/`, and `.github/workflows/secret-scan.yml`.
- Produces: the primary onboarding and evaluation document for GitHub visitors and contributors.

- [x] **Step 1: Write the project header and product overview.**

  Use the tracked SVG logo, the real secret-scan workflow badge, and stack badges whose versions are pinned by repository manifests. Omit a license badge. Describe the implemented finance, collaboration, reporting, web, API, and Capacitor Android surfaces.

- [x] **Step 2: Document the experiment without inflating the claim.**

  Explain specification-driven development, the reusable DarkNinjaSolutions harness and skills, the high-level implementation workflow, and the exact boundary of the approximately two-hour initial implementation session.

- [x] **Step 3: Present the curated screenshots, architecture, stack, and tree.**

  Render the six tracked screenshots in a compact table. Add a Mermaid flow from the React web bundle and Capacitor Android shell to the Go REST API and MongoDB replica set. Show the actual root directories: `.github/`, `api/`, `applications/android/`, `docs/`, and `web/`.

- [x] **Step 4: Add executable local setup instructions.**

  Document Git, Go 1.22+, Node `^22.22.0 || >=24`, npm 10+, MongoDB replica-set support, Docker Compose for the database, and JDK 21/Android SDK 36 for Android. Include `api/.env.example`, `web/.env.local` with `VITE_API_BASE_URL=/api/v1`, `VITE_API_PROXY_TARGET=http://127.0.0.1:8080`, Mongo startup, API seed/run commands, `npm ci`, `npm run dev`, and the emulator URL `http://10.0.2.2:8080/api/v1` for Android debug builds.

- [x] **Step 5: Add development, deployment, API, security, contribution, license, and attribution sections.**

  List only real service-level commands because no root runner exists. Include Go and web verification, Gradle/Android checks, build artifacts, generic manual deployment requirements, `/health` and `/ready`, REST base `/api/v1`, bearer sessions, query pagination, the existing design/spec links, secret hygiene, the absent policy/contribution/license files, and DarkNinjaSolutions attribution.

### Task 2: Validate and publish the README

**Files:**
- Verify: `README.md`
- Verify: `docs/assets/screenshots/*.png`
- Verify: `.github/workflows/secret-scan.yml`

**Interfaces:**
- Consumes: the completed README and current repository state.
- Produces: a committed README whose local references and documented checks have been verified.

- [x] **Step 1: Run source verification.**

  From `api/`, run `go test ./...`, `go vet ./...`, and `go build ./...`. From `web/`, run `npm run check`, `npm run test:scripts`, `npm run android:doctor`, and `npm run android:test`.

- [x] **Step 2: Validate README-local references.**

  Parse Markdown and HTML targets, confirm every relative file exists, verify all six screenshot paths and the logo, check Mermaid fences, and scan for placeholder text, stale repository names, unsupported commands, or secret-shaped content.

- [x] **Step 3: Review the diff and repository status.**

  Confirm only `README.md` and this plan changed, and verify that generated `web/dist/` and build artifacts remain ignored.

- [x] **Step 4: Commit and push.**

  Run `git add README.md docs/superpowers/plans/2026-08-09-professional-readme.md`, commit with `docs: add professional project README`, push `main` to `origin`, and confirm the remote commit and secret-scan workflow result.
