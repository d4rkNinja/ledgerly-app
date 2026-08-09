# Ledgerly Public Community Setup Design

**Date:** 2026-08-09
**Status:** Approved

## Context

Ledgerly is now a public MIT-licensed repository. The README still says the
repository is private, GitHub Discussions is disabled, repository metadata is
empty, and GitHub's community profile reports that contribution, conduct,
security, and issue-template guidance is missing.

The maintainer approved a complete public open-source community setup and
waived further approval pauses. The implementation must stay practical for a
single-maintainer project and must not invent contact details, funding links,
or project governance that do not exist.

## Selected approach

Use a focused public open-source baseline rather than a README-only correction
or a heavyweight governance stack. GitHub Issues will track actionable bugs and
feature work. GitHub Discussions will serve questions, support, ideas, and
general community conversation. Private vulnerability reporting will handle
security disclosures.

## Repository content

### README

- Remove the complete private-repository important notice and the separate
  cloning sentence that says authorized GitHub access is required.
- Replace stale statements that contribution and security files do not exist.
- Link contributors to `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`,
  `SUPPORT.md`, GitHub Issues, and GitHub Discussions.
- Keep the existing project, architecture, setup, testing, security-control,
  and MIT-license details intact.

### Community health files

- `CONTRIBUTING.md` will explain the contribution workflow, development setup,
  scoped verification commands, commit and pull-request expectations, security
  boundaries, and conduct requirements.
- `CODE_OF_CONDUCT.md` will establish concise participation and enforcement
  standards. It will use GitHub's content-reporting path for abusive content
  instead of publishing or inventing a maintainer email address.
- `SECURITY.md` will define supported code, private reporting through GitHub
  Security Advisories, required report details, response expectations without
  hard service-level promises, and coordinated disclosure rules.
- `SUPPORT.md` will route usage questions and troubleshooting to Discussions,
  reproducible defects to Issues, and vulnerabilities to private reporting.

### Contribution templates

- `.github/ISSUE_TEMPLATE/bug_report.yml` will collect affected component,
  environment, reproduction steps, expected behavior, actual behavior, logs,
  and a secret-redaction confirmation.
- `.github/ISSUE_TEMPLATE/feature_request.yml` will collect the problem,
  proposed outcome, alternatives, affected area, and willingness to contribute.
- `.github/ISSUE_TEMPLATE/config.yml` will disable unstructured public issue
  creation and route questions and security reports to the correct channels.
- `.github/pull_request_template.md` will request a change summary, motivation,
  testing evidence, risk, screenshots only when a UI changed, and a focused
  contributor checklist.

The forms will use only labels that already exist: `bug` and `enhancement`.

## GitHub repository configuration

- Keep repository visibility public and retain Issues and Projects.
- Enable GitHub Discussions and verify the categories GitHub provisions.
- Create one welcome discussion in Announcements when available, otherwise in
  General. The post will route questions, ideas, bug reports, and security
  reports to their correct locations and reference the conduct guidelines.
- Set the repository description to: "Shared finance platform for tracking
  money, planning goals, and coordinating financial activity across web and
  Android."
- Add focused topics: `personal-finance`, `expense-tracker`, `budgeting`,
  `golang`, `react`, `typescript`, `android`, `capacitor`, `mongodb`, and
  `monorepo`.
- Leave the homepage empty because no Ledgerly-specific public deployment or
  documentation site has been verified.

## Security configuration

- Enable GitHub private vulnerability reporting.
- Enable dependency vulnerability alerts and automated security updates.
- Enable GitHub secret scanning and push protection while retaining the
  existing Gitleaks workflow.
- Do not enable unrelated branch restrictions, funding configuration, CodeQL,
  or organization governance as part of this community-focused change.

## Validation

- Parse every YAML file and confirm the issue-form schema's required top-level
  fields and unique input IDs.
- Validate Markdown links and render the changed Markdown through GitHub's
  Markdown API.
- Run `git diff --check` and inspect the complete staged scope.
- After pushing, verify the repository is public, metadata/topics are correct,
  Issues and Discussions are enabled, security settings are enabled, and the
  welcome discussion exists.
- Re-read GitHub's community-profile API until the default branch recognizes
  the new community files and templates.
- Confirm the Gitleaks workflow succeeds for the pushed commit.

## Failure handling

File changes are committed and pushed before configuration that depends on
those files. Every external setting is read back after mutation. If GitHub does
not provide an Announcements category, the welcome post falls back to General.
No successful setting or file change is claimed without a read-back check.
