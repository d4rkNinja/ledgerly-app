# README Screenshot and License Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all product screenshots and their repository assets while making the README's Finance feature copy and MIT licensing accurate.

**Architecture:** Keep the README's existing structure and remove the Screenshots section so Features flows directly into Architecture. Treat the root `LICENSE` file as the licensing source of truth; do not change application code or replace the deleted imagery.

**Tech Stack:** Markdown, HTML badges, Git, GitHub Markdown API.

## Global Constraints

- Delete all six files under `docs/assets/screenshots/`; add no replacement images.
- Keep `applications/android/assets/logo.svg` and all non-screenshot badges.
- Preserve current commands, ports, environment variables, architecture, and behavior.
- State that the checked-in source is MIT licensed under `LICENSE` and that repository access remains private.
- Keep the internal DarkNinjaSolutions harness and skills outside Ledgerly's MIT licensing claim.
- Work directly on `main` because the user explicitly requested the update and push there.

---

### Task 1: Update README content and remove screenshot assets

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-09-readme-screenshot-license-cleanup-design.md`
- Delete: `docs/assets/screenshots/welcome.png`
- Delete: `docs/assets/screenshots/dashboard.png`
- Delete: `docs/assets/screenshots/insights.png`
- Delete: `docs/assets/screenshots/add-income.png`
- Delete: `docs/assets/screenshots/transaction-date.png`
- Delete: `docs/assets/screenshots/saved-names-light.png`

**Interfaces:**
- Consumes: the approved design and root MIT `LICENSE`.
- Produces: a screenshot-free README with explicit Finance capabilities and accurate license status.

- [x] **Step 1: Rewrite the Finance feature bullets.**

  Give categorized entries, transaction occurrence dates, and searchable reusable transaction names separate bullets. Preserve the existing accounts, dashboards, budgets, goals, bills, and contacts claims.

- [x] **Step 2: Remove the Screenshots section.**

  Delete the `## Screenshots` heading and its complete HTML table so `## Architecture` follows the Applications feature bullets.

- [x] **Step 3: Update every license statement.**

  Add an MIT badge linked to `LICENSE`; replace the no-license warning with a private-access/MIT-license notice; replace the License section with the actual 2026 d4rkninja MIT terms and link; update the DarkNinjaSolutions section so only Ledgerly's checked-in source is described as MIT licensed.

- [x] **Step 4: Delete the screenshot assets.**

  Resolve each exact path under `docs/assets/screenshots/`, verify it is inside the workspace, and remove only the six approved PNG files.

### Task 2: Verify, commit, and publish

**Files:**
- Verify: `README.md`
- Verify: `LICENSE`
- Verify: `docs/assets/screenshots/`

**Interfaces:**
- Consumes: Task 1's updated documentation tree.
- Produces: a clean, pushed `main` commit with passing remote secret scanning.

- [x] **Step 1: Validate repository references and diff.**

  Confirm `README.md` contains no screenshot heading, screenshot path, or deleted filename; confirm the six PNGs are absent; validate every remaining local README link; run `git diff --check`; and confirm the diff contains only approved documentation and asset changes.

- [x] **Step 2: Validate GitHub rendering.**

  Render `README.md` through GitHub's Markdown API, confirm no product screenshot image source remains, and confirm the logo, workflow/technology badges, and MIT badge render as the only images.

- [x] **Step 3: Commit and push.**

  Commit the implementation as `docs: remove screenshots and document MIT license`, push `main` to `origin`, confirm local and remote hashes match, and confirm the Gitleaks workflow succeeds.
