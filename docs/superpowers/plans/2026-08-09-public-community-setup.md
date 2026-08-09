# Ledgerly Public Community Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Ledgerly's public GitHub repository into a clear, secure, and contributor-ready open-source project.

**Architecture:** Repository Markdown and YAML files define the contributor-facing contract, while GitHub repository settings provide Discussions, metadata, and private security channels. Issues track actionable work, Discussions handle support and community conversation, and GitHub Security Advisories handle vulnerabilities.

**Tech Stack:** GitHub Markdown, GitHub issue-form YAML, GitHub CLI/REST/GraphQL APIs, PowerShell, Python with PyYAML, Git.

## Global Constraints

- Keep the repository public and retain Issues and Projects.
- Do not invent contact details, funding destinations, websites, or governance roles.
- Use only existing issue labels: `bug` and `enhancement`.
- Keep vulnerabilities out of Issues and Discussions; use private vulnerability reporting.
- Retain the Gitleaks workflow when native secret scanning and push protection are enabled.
- Do not add funding, branch restrictions, CODEOWNERS, CodeQL, or organization governance.
- Preserve all unrelated source code and documentation.

---

### Task 1: Correct the README and add community policies

**Files:**
- Modify: `README.md`
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `SECURITY.md`
- Create: `SUPPORT.md`

**Interfaces:**
- Consumes: existing setup and verification commands in `README.md`
- Produces: policy links consumed by README and GitHub templates

- [x] **Step 1: Update README public-access and community copy**

Remove the opening `[!IMPORTANT]` block and the separate clone-section sentence
that says authorized access is required. Replace stale Security and Contributing
copy with links to the four new policy files, Discussions, issue forms, and the
private advisory form. State this exact routing contract:

```text
Questions/troubleshooting -> GitHub Discussions
Reproducible defects       -> issue forms
Security vulnerabilities   -> SECURITY.md and private advisories
Code changes               -> CONTRIBUTING.md and pull requests
```

- [x] **Step 2: Create `CONTRIBUTING.md`**

Define channel selection; fork-and-branch workflow from `main`; root README
setup; focused changes; behavior tests; documentation updates; and PR evidence.
List the exact relevant checks:

```text
api/: go test ./...; go vet ./...; go build ./...
web/: npm run check
web/: npm run test:scripts
web/: npm run android:test
```

Require compliance with `CODE_OF_CONDUCT.md` and prohibit secrets, credentials,
production data, personal financial data, and signing material.

- [x] **Step 3: Create `CODE_OF_CONDUCT.md`**

Define welcoming behavior, unacceptable harassment, maintainer enforcement,
scope across repository spaces, and proportionate consequences. Route abusive
content to GitHub's Report content/abuse flow and state that visible repository
content may be moderated. Do not invent an email address or private contact.

- [x] **Step 4: Create `SECURITY.md` and `SUPPORT.md`**

`SECURITY.md` supports `main`, treats other releases/snapshots as unsupported
unless documented otherwise, and links:

```text
https://github.com/d4rkNinja/ledgerly-app/security/advisories/new
```

Request impact, reproduction, affected component/version, and remediation
ideas; prohibit public disclosure before coordination; make no response-time
guarantee. `SUPPORT.md` routes questions to Discussions, defects/features to
issue forms, vulnerabilities to the private advisory form, and says never to
publish sensitive financial data.

- [x] **Step 5: Validate Task 1**

Run `rg` for `currently private`, `authorized GitHub access`,
`does not yet include`, and `There is no SECURITY` across the five files.
Expected: no match. Confirm all relative Markdown links resolve and run
`git diff --check`; expected: no errors.

---

### Task 2: Add structured contribution templates

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/pull_request_template.md`

**Interfaces:**
- Consumes: Task 1 policies and existing `bug`/`enhancement` labels
- Produces: GitHub's issue chooser and default pull-request body

- [x] **Step 1: Create the bug issue form**

Set `name: Bug report`, `description: Report a reproducible problem in
Ledgerly`, `title: "[Bug]: "`, and `labels: ["bug"]`. Use unique IDs for
acknowledgements, component, environment, description, steps, expected, actual,
logs, and context. Require confirmation that existing issues were searched and
secrets/sensitive financial data were removed. Component options are API, Web
application, Android application, Documentation, and Other.

- [x] **Step 2: Create the feature issue form**

Set `name: Feature request`, `description: Propose a scoped improvement to
Ledgerly`, `title: "[Feature]: "`, and `labels: ["enhancement"]`. Use unique IDs
for acknowledgements, problem, outcome, alternatives, component, context, and
contribution willingness. Require the problem and desired outcome.

- [x] **Step 3: Create chooser configuration and PR template**

Use this exact chooser configuration:

```yaml
blank_issues_enabled: false
contact_links:
  - name: Questions and support
    url: https://github.com/d4rkNinja/ledgerly-app/discussions
    about: Ask usage questions and get troubleshooting help from the community.
  - name: Report a security vulnerability
    url: https://github.com/d4rkNinja/ledgerly-app/security/advisories/new
    about: Send vulnerability details privately to the maintainers.
```

The PR template includes Summary, Motivation, Changes, Testing, Risk and
rollback, UI evidence only when applicable, and checks for scope, tests, docs,
secrets/sensitive data, and breaking changes.

- [x] **Step 4: Validate Task 2**

Use Python/PyYAML to load all three YAML files. Assert the two forms contain
`name`, `description`, and `body`; every body ID is unique within its form; and
`blank_issues_enabled` is false. Run `git diff --check`. Expected: all checks
pass.

---

### Task 3: Validate, commit, and publish repository files

**Files:**
- Modify: `docs/superpowers/plans/2026-08-09-public-community-setup.md`

**Interfaces:**
- Consumes: Tasks 1 and 2 files
- Produces: default-branch files GitHub can recognize

- [x] **Step 1: Validate Markdown and GitHub rendering**

Assert every local relative Markdown link exists. Render README and the four
community files through GitHub's Markdown API with context
`d4rkNinja/ledgerly-app`; assert every response is non-empty HTML.

- [x] **Step 2: Review and stage the exact scope**

Run `git diff --check`, `git status --short`, and `git diff --stat`. Stage only
README, four root community files, three issue-template YAML files, the PR
template, and this plan; the design specification is already committed. Review
`git diff --cached --check`, `--stat`, and `--name-status`.

- [x] **Step 3: Commit and push**

```powershell
git commit -m "docs: prepare public open-source community"
git push origin main
```

Expected: `origin/main` advances and its SHA equals local `HEAD`.

---

### Task 4: Configure and verify the GitHub community

**Files:**
- No repository file changes

**Interfaces:**
- Consumes: pushed default-branch files from Task 3
- Produces: Discussions, welcome post, metadata/topics, and security controls

- [ ] **Step 1: Enable Discussions and set metadata**

Use `gh repo edit d4rkNinja/ledgerly-app` to keep Issues and Projects enabled,
enable Discussions, set the design's exact description, and add these topics:
`personal-finance`, `expense-tracker`, `budgeting`, `golang`, `react`,
`typescript`, `android`, `capacitor`, `mongodb`, and `monorepo`. Leave homepage
empty.

```powershell
gh repo edit d4rkNinja/ledgerly-app --enable-discussions --enable-issues --enable-projects --description "Shared finance platform for tracking money, planning goals, and coordinating financial activity across web and Android." --add-topic personal-finance,expense-tracker,budgeting,golang,react,typescript,android,capacitor,mongodb,monorepo
```

- [ ] **Step 2: Enable the security baseline**

Use GitHub REST to enable private vulnerability reporting, vulnerability
alerts, and automated security fixes. Enable secret scanning first and then
push protection. Treat unsupported capabilities as limitations; claim enabled
only after a read-back says `enabled`.

```powershell
gh api --method PUT repos/d4rkNinja/ledgerly-app/private-vulnerability-reporting
gh api --method PUT repos/d4rkNinja/ledgerly-app/vulnerability-alerts
gh api --method PUT repos/d4rkNinja/ledgerly-app/automated-security-fixes
gh repo edit d4rkNinja/ledgerly-app --enable-secret-scanning
gh repo edit d4rkNinja/ledgerly-app --enable-secret-scanning-push-protection
```

- [ ] **Step 3: Create the welcome discussion idempotently**

Query repository/category/discussion IDs with GraphQL. If
`Welcome to Ledgerly Discussions` does not exist, create it in Announcements,
falling back to General. Link the conduct guide; route Q&A/support to
Discussions, bugs/features to issue forms, and vulnerabilities to private
reporting. Never create a duplicate title.

Use `repository.discussionCategories` and `repository.discussions` for the
read query, then use this mutation only when the title is absent:

```graphql
mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
  createDiscussion(input: {
    repositoryId: $repositoryId,
    categoryId: $categoryId,
    title: $title,
    body: $body
  }) {
    discussion { id title url }
  }
}
```

- [ ] **Step 4: Verify GitHub read-back state**

Assert: PUBLIC visibility; Issues, Projects, and Discussions enabled; MIT
license; exact description; exact ten topics; private vulnerability reporting,
vulnerability alerts, automated fixes, secret scanning, and push protection
enabled; and exactly one welcome discussion. Confirm GitHub's community-profile
API detects README, license, contributing guide, code of conduct, issue
template, PR template, and security policy. Confirm Gitleaks succeeds for the
pushed SHA and the local worktree is clean.
