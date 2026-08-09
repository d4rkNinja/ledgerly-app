# Ledgerly frontend baseline

Verified on 2026-07-30 before any Capacitor or Android change.

## Authoritative source

- Repository: `https://github.com/d4rkNinja/ledgerly-web.git`
- Branch: `main`
- Approved starting commit: `e934a3d48718db961a17b0db1b4514ea25e00fa7`
- Remote `refs/heads/main` at verification: `e934a3d48718db961a17b0db1b4514ea25e00fa7`
- Fresh clone: `C:\tmp\ledgerly-frontend-e934a3d`, checked out detached at the approved commit
- Local reference repositories were clean before import:
  - `ledgerly-web`: `e934a3d48718db961a17b0db1b4514ea25e00fa7`
  - `ledgerly-api`: `ba74f3e75964bc3af4dc3ac93959c6214b1b93ea`

## Untouched frontend verification

Environment:

- Node.js `24.13.1`
- npm `11.8.0`

Commands:

```powershell
npm ci
npm run check
npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
```

Results:

- `npm ci`: passed; 70 packages installed from the v3 lockfile.
- npm audit reported two high-severity transitive findings. No automatic or
  breaking audit fix was applied to the pinned baseline.
- TypeScript: passed.
- Oxlint: passed.
- Vite production build: passed; 2,392 modules transformed and
  `dist/index.html` produced.
- Local HTTP smoke: `GET http://127.0.0.1:4173/` returned `200` and Ledgerly
  HTML.
- Phone render at `360 × 800`: title `Money clarity | Ledgerly`, no page
  errors, document width `360`, scroll width `360`.
- Desktop render at `1280 × 800`: same title, no page errors, document width
  `1280`, scroll width `1280`.
- Temporary screenshots:
  `C:\tmp\ledgerly-baseline-mobile.png` and
  `C:\tmp\ledgerly-baseline-desktop.png`.
- The recorded Vite process and all of its child processes were stopped after
  verification.

No backend or environment file was required for the welcome/demo smoke. Live
API and authentication flows require an API endpoint.

## Import verification

The fresh clone was exported with `git archive` and extracted into
`D:\Codeverse\ledgerly` without its `.git` directory. The source contains 198
tracked files. All 197 imported files other than `.gitignore` matched their
upstream Git blob SHA exactly. The upstream `.gitignore` was intentionally
replaced by the root repository's comprehensive Node, Capacitor, Android,
secret, signing, artifact, IDE, reference-repository, and QA-evidence rules.

Neither preserved nested repository was modified or absorbed into the new
root history.
