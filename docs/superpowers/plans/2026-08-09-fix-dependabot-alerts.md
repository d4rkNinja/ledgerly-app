# Dependabot Alert Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve every open Dependabot alert in `api/go.mod` through patched direct dependencies and deliver the result through the protected pull-request workflow.

**Architecture:** Keep the application code unchanged. Upgrade only the three vulnerable direct Go modules, allow Go to update their required indirect modules, raise the module's Go floor required by `golang.org/x/crypto`, and synchronize current user-facing version documentation.

**Tech Stack:** Go modules, Go 1.25, GitHub Dependabot, GitHub pull requests, existing repository verification commands.

## Global Constraints

- Upgrade `golang.org/x/crypto` from `v0.26.0` to the first fully patched version `v0.52.0`.
- Upgrade `github.com/go-chi/chi/v5` from `v5.2.0` to the first patched version `v5.2.2`.
- Upgrade `go.mongodb.org/mongo-driver` from `v1.17.3` to the first patched version `v1.17.7`.
- Set the API module Go version to `1.25.0`, the minimum required by `golang.org/x/crypto v0.52.0`.
- Do not change application behavior or historical planning documents.
- Require the complete repository test and build matrix plus GitHub's `Gitleaks` check before merging.

---

### Task 1: Upgrade the vulnerable Go dependencies

**Files:**
- Modify: `api/go.mod`
- Modify: `api/go.sum`
- Modify: `README.md`
- Modify: `api/README.md`
- Modify: `.github/ISSUE_TEMPLATE/bug_report.yml`

**Interfaces:**
- Consumes: Existing Go module dependency graph and current version documentation.
- Produces: A Go 1.25-compatible dependency graph containing all Dependabot patched-version floors.

- [ ] **Step 1: Apply exact security floors**

Run from `api/`:

```bash
go get github.com/go-chi/chi/v5@v5.2.2 go.mongodb.org/mongo-driver@v1.17.7 golang.org/x/crypto@v0.52.0
go mod tidy
```

- [ ] **Step 2: Verify resolved versions**

Run:

```bash
go list -m github.com/go-chi/chi/v5 go.mongodb.org/mongo-driver golang.org/x/crypto
```

Expected versions are `v5.2.2`, `v1.17.7`, and `v0.52.0` respectively.

- [ ] **Step 3: Update current Go-version documentation**

Change active Go 1.22 references in the root README, API README, and bug-report environment example to Go 1.25. Do not rewrite historical implementation plans.

- [ ] **Step 4: Verify the API**

Run from `api/`:

```bash
go test ./...
go vet ./...
go build ./...
```

- [ ] **Step 5: Commit the remediation**

```bash
git add api/go.mod api/go.sum README.md api/README.md .github/ISSUE_TEMPLATE/bug_report.yml
git commit -m "fix(deps): resolve Dependabot security alerts"
```

### Task 2: Validate and deliver the consolidated security PR

**Files:**
- Modify: `docs/superpowers/plans/2026-08-09-fix-dependabot-alerts.md`

**Interfaces:**
- Consumes: The updated dependency graph from Task 1 and GitHub's open-alert API.
- Produces: A passing, approved, merged Dependabot pull request and zero open alerts after GitHub processes `main`.

- [ ] **Step 1: Run the repository verification matrix**

Run API tests, vet, and build; web check and script tests; and the Android test task using the repository's documented commands.

- [ ] **Step 2: Verify the dependency graph against every advisory floor**

Query the open Dependabot alerts through GitHub's API and assert the branch's selected versions are greater than or equal to every `first_patched_version` for the affected package.

- [ ] **Step 3: Update and push Dependabot PR #2**

Merge the existing Dependabot head into this branch so its remote commit remains an ancestor, push the consolidated commits to `dependabot/go_modules/api/golang.org/x/crypto-0.52.0`, and update the PR title and description to enumerate all remediated modules and verification evidence.

- [ ] **Step 4: Approve and merge through branch protection**

Approve PR #2 as the repository owner, wait for the required `Gitleaks` check, then squash-merge without admin bypass.

- [ ] **Step 5: Verify the final GitHub state**

Confirm PR #2 is merged, local and remote `main` match, the final workflow succeeded, and GitHub reports zero open Dependabot alerts after its security analysis refresh.
