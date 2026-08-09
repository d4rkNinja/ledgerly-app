# Ledgerly Main Branch Ruleset Design

**Date:** 2026-08-09
**Status:** Approved

## Context

Ledgerly is a public, single-maintainer repository. The default branch is
`main`, repository administrator access is held by `d4rkNinja`, and no branch
ruleset or legacy branch protection currently applies. The existing secret-scan
workflow runs on pushes and pull requests and publishes a successful check named
`Gitleaks` through the GitHub Actions app.

The maintainer requested the branch ruleset shown in GitHub settings when it is
appropriate and authorized browser access if needed. The standing instruction
is to complete required repository setup without additional confirmation pauses.

## Selected approach

Create one active repository branch ruleset named `Protect main`. It will
protect the default branch while preserving a workable solo-maintainer flow.
Changes must use pull requests, but no outside approval is required because the
repository currently has only one maintainer. The owner receives pull-request-
only bypass permission for emergency merges; this does not permit routine
direct pushes and preserves a pull-request audit trail.

## Target and bypass

- Target: `branch`
- Enforcement: `active`
- Included refs: `~DEFAULT_BRANCH`
- Excluded refs: none
- Bypass actor: GitHub user `d4rkNinja`, actor ID `107983953`
- Bypass mode: `pull_request`

## Rules

1. Restrict deletion of the default branch.
2. Block non-fast-forward updates and force pushes.
3. Require linear history.
4. Require a pull request before changes reach `main`.
5. Require all review threads to be resolved.
6. Require zero approving reviews so a solo maintainer is not deadlocked.
7. Permit only squash and rebase pull-request merge methods.
8. Require the `Gitleaks` status check from GitHub Actions app ID `15368`.
9. Use strict status checks so the pull-request branch must be current with
   `main` before merging.

The pull-request rule will not require CODEOWNERS, approval of the last push, or
signed commits. Full application CI, merge queue, deployments, code scanning
results, and metadata restrictions are outside this ruleset because those
required checks and governance structures do not currently exist.

## Expected workflow

Contributors and the maintainer create a branch, push changes to that branch,
open a pull request, wait for `Gitleaks`, resolve review threads, update the
branch if `main` has moved, and merge using squash or rebase. A direct push to
`main`, branch deletion, or force push is rejected.

Dependabot continues to work through pull requests. The maintainer may choose a
ruleset bypass only from a pull request when an exceptional merge is necessary.

## Implementation

Use GitHub's repository rules REST endpoint instead of manually filling the web
form. Before creation, query existing rulesets by name to prevent duplicates.
Create the ruleset only when `Protect main` is absent. Browser access is used
only if REST read-back cannot verify the resulting configuration.

No source file or workflow change is required. The design and execution plan
are committed before the ruleset is activated so the protected workflow does
not block its own setup record.

## Validation

- Read the created ruleset back by ID and compare its name, enforcement,
  target, conditions, bypass actor, rules, check context, and integration ID.
- Query the rules that apply to `main` and confirm all five rule types are
  active there.
- Confirm the repository remains public and `main` remains the default branch.
- Confirm the latest `Gitleaks` check still has GitHub Actions app ID `15368`.
- Confirm local and remote `main` match and the worktree is clean before
  activation.

## Failure and rollback

If GitHub rejects the payload, no partial ruleset is claimed; correct the
payload from the API error and retry only after confirming no ruleset was
created. If read-back differs from the approved design, disable the ruleset
immediately and investigate. The ruleset can be disabled through the REST API
without deleting its configuration.
