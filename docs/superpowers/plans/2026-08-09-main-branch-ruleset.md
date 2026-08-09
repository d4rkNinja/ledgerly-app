# Ledgerly Main Branch Ruleset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate and verify a solo-maintainer-safe GitHub ruleset protecting Ledgerly's default branch.

**Architecture:** GitHub's repository rules REST API creates one idempotently named ruleset targeting `~DEFAULT_BRANCH`. The ruleset requires pull requests and the existing GitHub Actions `Gitleaks` check, while a pull-request-only owner bypass prevents emergency lockout without permitting routine direct pushes.

**Tech Stack:** GitHub REST API version `2026-03-10`, GitHub CLI, PowerShell, GitHub Actions, Git.

## Global Constraints

- Keep the repository public and keep `main` as the default branch.
- Create exactly one active ruleset named `Protect main`.
- Give only GitHub user `d4rkNinja` (`107983953`) pull-request-only bypass.
- Require the `Gitleaks` check from GitHub Actions app `15368`.
- Require zero approving reviews; this is currently a single-maintainer repository.
- Do not require signed commits, CODEOWNERS, merge queue, deployments, or checks that do not exist.
- Push the design and plan to `main` before activating the ruleset.
- Do not use browser credentials unless REST read-back cannot verify the result.

---

### Task 1: Publish the ruleset records before protection activates

**Files:**
- Existing: `docs/superpowers/specs/2026-08-09-main-branch-ruleset-design.md`
- Create: `docs/superpowers/plans/2026-08-09-main-branch-ruleset.md`

**Interfaces:**
- Consumes: the approved design and verified GitHub actor/check IDs
- Produces: a default-branch audit record that predates enforcement

- [x] **Step 1: Validate the local and remote preconditions**

Confirm the worktree has only this untracked plan, `main` is the current and
default branch, no ruleset exists, no legacy branch protection exists, and the
latest `Gitleaks` check comes from app ID `15368`.

- [x] **Step 2: Review and stage the plan**

Run `git diff --check`, stage only this plan, then run
`git diff --cached --check`, `git diff --cached --stat`, and
`git diff --cached --name-status`.

- [x] **Step 3: Commit and push the records**

```powershell
git commit -m "docs: plan main branch ruleset"
git push origin main
```

Expected: both the design commit and plan commit reach `origin/main`, local and
remote SHAs match, the Gitleaks workflow succeeds, and the worktree is clean.

---

### Task 2: Create, verify, and exercise the ruleset

**Files:**
- Modify after activation: `docs/superpowers/plans/2026-08-09-main-branch-ruleset.md`

**Interfaces:**
- Consumes: GitHub user ID `107983953`, GitHub Actions app ID `15368`, check context `Gitleaks`
- Produces: one active `Protect main` ruleset and a pull-request-based completion record

- [x] **Step 1: Construct and validate the exact payload**

Use this JSON payload and parse it locally before sending it:

```json
{
  "name": "Protect main",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [
    {
      "actor_id": 107983953,
      "actor_type": "User",
      "bypass_mode": "pull_request"
    }
  ],
  "conditions": {
    "ref_name": {
      "include": ["~DEFAULT_BRANCH"],
      "exclude": []
    }
  },
  "rules": [
    {"type": "deletion"},
    {"type": "non_fast_forward"},
    {"type": "required_linear_history"},
    {
      "type": "pull_request",
      "parameters": {
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_approving_review_count": 0,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["squash", "rebase"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          {"context": "Gitleaks", "integration_id": 15368}
        ],
        "strict_required_status_checks_policy": true
      }
    }
  ]
}
```

Assert the payload contains exactly five rule types, one default-branch target,
one pull-request-only bypass actor, and one required status check.

- [x] **Step 2: Create the ruleset idempotently**

Query `GET /repos/d4rkNinja/ledgerly-app/rulesets`. If `Protect main` is absent,
send the payload to `POST /repos/d4rkNinja/ledgerly-app/rulesets` with API
version `2026-03-10`. If it is present, do not create a duplicate; compare the
existing rule instead.

- [x] **Step 3: Verify the complete REST read-back**

Read the ruleset by ID and query
`GET /repos/d4rkNinja/ledgerly-app/rules/branches/main`. Assert active
enforcement, default-branch targeting, the exact user bypass, all five rule
types, PR parameters, strict `Gitleaks` check, app ID `15368`, public visibility,
and default branch `main`. Disable the ruleset immediately if any material value
differs.

- [x] **Step 4: Record completion through the protected workflow**

Create branch `docs/verify-main-ruleset`, mark all plan checkboxes complete,
commit with `docs: record main ruleset activation`, and push the branch. Open a
pull request against `main`, wait for `Gitleaks`, then squash-merge and delete
the branch. Do not use bypass unless GitHub incorrectly blocks a verified PR.

- [x] **Step 5: Perform final verification**

Confirm the pull request merged, the merge commit is linear, the final
`Gitleaks` run succeeded, the ruleset still applies to `main`, local `main` is
fast-forwarded to the remote, and the worktree is clean.
