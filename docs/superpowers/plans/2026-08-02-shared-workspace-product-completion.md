# Shared Workspace Product Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the invitation, member, creator-attribution, dashboard, biometric-removal, account-editing, and CSV-export flows across the Go API and React client with secure workspace scoping and verified empty/loading/error/success states.

**Architecture:** Keep direct invitations and reusable join-code requests as separate capabilities. Add additive API view models and centralized service methods for members, enriched transactions, analytics, and export; connect them to the existing TanStack Query/client route structure. Account editing remains a protected `/me` patch, while export is generated server-side from permission-scoped data.

**Tech Stack:** Go 1.22, MongoDB repository abstraction, chi HTTP router, Go service tests; React 19, TypeScript, Vite, TanStack Query, React Testing Library, Vitest, Capacitor-compatible downloads.

## Global Constraints

- Preserve existing API request/response structures unless an additive field or explicitly required route is needed.
- Never expose passwords, authentication tokens, token hashes, internal secrets, or internal user IDs in client-facing views.
- Enforce workspace membership and permissions in the backend before every member, dashboard, entry, and export read or mutation.
- Keep direct invitation tokens single-use, expiring, hashed at rest, and bound to the invited email when provided.
- Keep reusable join codes as pending access requests; approval must be atomic and re-check permission.
- Do not apply temporary, hardcoded, demo-only fixes to live flows.
- Preserve unrelated existing dirty-worktree changes.

---

### Task 1: Lock down current contracts and shared response models

**Files:**
- Modify: `api/internal/model/models.go`
- Modify: `api/internal/service/collaboration.go`
- Modify: `api/internal/service/insights.go`
- Modify: `web/src/domain/types.ts`
- Modify: `web/src/pages/finance/data.ts`
- Test: `api/internal/service/feature_contracts_test.go`
- Test: `api/internal/service/authorization_regression_test.go`
- Test: `web/src/pages/finance/data.test.ts`

**Interfaces:**
- Produce `model.User.ProfileImageURL`, `model.User.PhoneNumber`, `model.Transaction.Creator`, `model.CreatorSummary`, `service.WorkspaceMember`, and `service.DashboardAnalytics` as additive JSON fields.
- `normalizeFinanceData('transactions', response)` must preserve the existing transaction fields and normalize an optional nested `creator` object.

- [ ] **Step 1: Write failing contract tests**

```go
func TestTransactionJSONIncludesCreatorSummaryWithoutUserID(t *testing.T) {
    transaction := model.Transaction{
        ID: "entry-a",
        CreatedBy: "internal-user-a",
        Creator: &model.CreatorSummary{Name: "Asha Rao", Initials: "AR", Status: "active"},
    }
    payload, err := json.Marshal(transaction)
    if err != nil { t.Fatal(err) }
    if strings.Contains(string(payload), "internal-user-a") { t.Fatal("creator user id leaked") }
    if !strings.Contains(string(payload), "Asha Rao") { t.Fatal("creator name missing") }
}
```

```ts
it('normalizes creator display data without making internal IDs part of the view model', () => {
  const [entry] = normalizeFinanceData<Transaction[]>('transactions', [{
    id: 'entry-a', type: 'expense', amountMinor: 1200, currency: 'INR',
    creator: { name: 'Asha Rao', initials: 'AR', status: 'active', userId: 'hidden' },
  }])
  expect(entry.creator?.name).toBe('Asha Rao')
  expect(entry.creator?.initials).toBe('AR')
  expect(entry.creator).not.toHaveProperty('userId')
})
```

- [ ] **Step 2: Run the focused tests and verify they fail for missing contracts**

Run: `go test ./internal/service -run 'TestTransactionJSONIncludesCreatorSummaryWithoutUserID' -count=1` from `api/`; `npm.cmd test -- --run src/pages/finance/data.test.ts` from `web/`.

Expected: the Go test fails because the creator summary type/field is absent and the web test fails because the normalized view lacks creator data.

- [ ] **Step 3: Add the additive model and normalization contracts**

Add JSON-safe display fields only. Keep `CreatedBy` tagged as storage/API-compatible for existing permission logic, but never copy it into the new creator display object. Normalize missing creator values to `undefined`, and render former members with `status: "former"`.

- [ ] **Step 4: Run the focused tests again**

Run the same Go and Vitest commands. Expected: PASS.

- [ ] **Step 5: Run existing service and data tests**

Run: `go test ./internal/service -count=1`; `npm.cmd test -- --run src/pages/finance/data.test.ts src/pages/finance/home-transactions.test.tsx`.

Expected: PASS with no changed legacy response failures.

---

### Task 2: Repair invitation and workspace-joining semantics

**Files:**
- Modify: `api/internal/service/collaboration.go`
- Modify: `api/internal/service/workspace_access.go`
- Modify: `api/internal/handler/finance.go`
- Modify: `api/internal/router/router.go`
- Modify: `api/internal/handler/api.go`
- Modify: `web/src/app/workspace-management-dialogs.tsx`
- Modify: `web/src/pages/InvitationPage.tsx`
- Modify: `web/src/app/app-context.tsx`
- Test: `api/internal/service/authorization_regression_test.go`
- Test: `api/internal/handler/frontend_contract_test.go`
- Test: `api/internal/router/feature_routes_test.go`
- Test: `web/src/app/workspace-management-dialogs.test.tsx`
- Test: `web/src/pages/InvitationPage.test.tsx`

**Interfaces:**
- Direct acceptance remains `POST /invitations/accept` with `{token}` and returns `{workspaceId, role, permissions}`.
- Join-code redemption remains `POST /workspace-join-requests` with `{code}` and returns `{workspaceId, workspaceName, status: "pending"}`; the client must not treat it as direct membership.
- Do not add a token-resolution endpoint; the accept endpoint is the only operation that can consume a direct invitation token, and neither plaintext tokens nor request IDs are persisted client-side.

- [ ] **Step 1: Add failing tests for the cross-device outcomes**

Cover valid direct token acceptance, expired token, already-used token, invalid token, optional-email token, and join-code pending request. Assert that a successful direct acceptance returns the correct workspace ID and that `refreshWorkspaces(workspaceId)` selects it. Assert that invalid/expired/used capabilities receive the same safe not-found code/message and that a pending join request does not receive a misleading membership success.

- [ ] **Step 2: Run the tests to confirm the failure**

Run: `go test ./internal/service ./internal/handler ./internal/router -run 'Invitation|JoinRequest|FrontendAuthWorkspace' -count=1`; `npm.cmd test -- --run src/app/workspace-management-dialogs.test.tsx src/pages/InvitationPage.test.tsx`.

Expected: the new tests fail on the missing explicit client states and workspace refresh assertions.

- [ ] **Step 3: Implement the smallest root-cause fix**

Normalize and trim token/code input at the handler boundary; make the join dialog call the join-request contract and display “Request sent — approval required” while keeping the user on the current workspace. Make `InvitationPage` retain the token through login, submit it after authentication, refresh with the returned workspace ID, and show distinct messages for `not_found`, `forbidden`, `conflict`, and network failures. Ensure `AcceptInvitation` maps stale races to safe not-found without returning “request record” wording.

- [ ] **Step 4: Verify the focused invitation tests**

Run the commands from Step 2. Expected: PASS.

- [ ] **Step 5: Verify workspace hydration after acceptance**

Run: `npm.cmd test -- --run src/app/app-context.test.tsx src/pages/InvitationPage.test.tsx`; assert that the accepted workspace is present in `availableWorkspaces` and becomes `workspace` before navigation.

---

### Task 3: Add backend member directory, statuses, and permission-checked mutations

**Files:**
- Modify: `api/internal/model/models.go`
- Modify: `api/internal/service/collaboration.go`
- Modify: `api/internal/service/workspace_access.go`
- Modify: `api/internal/handler/finance.go`
- Modify: `api/internal/router/router.go`
- Modify: `api/internal/db/indexes.go`
- Create: `api/internal/service/members_test.go`
- Create: `api/internal/handler/members_contract_test.go`
- Modify: `web/src/domain/types.ts`
- Modify: `web/src/pages/finance/collaboration.tsx`
- Test: `web/src/pages/finance/collaboration.test.tsx`

**Interfaces:**
- `GET /workspaces/{workspaceId}/members` returns `{items: WorkspaceMember[]}` with `name`, `email`, `role`, `permissions`, `status`, `joinedAt`, optional `invitationStatus`, and optional `profileImageUrl`; no `userId` field is emitted.
- `PATCH /workspaces/{workspaceId}/members/{userId}` accepts only `{role?, permissions?}` and returns the updated member view. `DELETE /workspaces/{workspaceId}/members/{userId}` removes a non-owner/non-administrator member only when the actor has `remove_members`.
- `WorkspaceMember.status` is one of `active`, `pending`, `expired`, or `removed`; role changes require `manage_roles` and cannot target an owner/administrator from a regular member.

- [ ] **Step 1: Write failing service tests**

Add tests for active member joins with user data, pending/expired invitation rows, former/removed member labeling, role changes by an administrator, rejection of a regular member changing an administrator, rejection of owner removal, and transaction-scoped re-checks.

- [ ] **Step 2: Run the tests and verify RED**

Run: `go test ./internal/service -run 'Member|Role|Remove' -count=1`.

Expected: FAIL because the member service methods and view types do not exist.

- [ ] **Step 3: Implement member queries and mutations**

Read memberships for the workspace, fetch users by the resulting IDs, merge active membership rows with pending/expired invitations by email, and represent removed members only when a removal record exists. Add audit events for role/permission changes and removal. Reuse the existing repository abstraction and update index specifications for member scans if the new query needs them.

- [ ] **Step 4: Add routes and handlers**

Register the member list and mutation routes under the authenticated workspace router. Decode an allowlisted DTO, reject unknown/protected fields through the existing strict JSON decoder, and return safe service errors.

- [ ] **Step 5: Run the service, handler, and route tests**

Run: `go test ./internal/service ./internal/handler ./internal/router -run 'Member|Role|Remove|Route' -count=1`.

Expected: PASS.

- [ ] **Step 6: Replace the Members placeholder with live UI**

Load the member list with TanStack Query, render name/email/role/access/status/date joined, show image or initials, gate role/access controls by `manage_roles`, gate removal by `remove_members`, show disabled protected rows, and expose loading/error/empty/pending/expired/removed states. Refresh the member and workspace summary queries after mutations.

- [ ] **Step 7: Run the focused web member tests**

Run: `npm.cmd test -- --run src/pages/finance/collaboration.test.tsx`.

Expected: PASS, including the assertion that regular members cannot see enabled owner/admin mutation controls.

---

### Task 4: Enrich entries with creator display data and add server CSV export

**Files:**
- Modify: `api/internal/model/models.go`
- Modify: `api/internal/service/transactions.go`
- Modify: `api/internal/service/collaboration.go`
- Create: `api/internal/service/export.go`
- Modify: `api/internal/handler/finance.go`
- Modify: `api/internal/router/router.go`
- Modify: `web/src/domain/types.ts`
- Modify: `web/src/pages/finance/data.ts`
- Modify: `web/src/pages/finance/home-transactions.tsx`
- Modify: `web/src/pages/settings/PreferenceSections.tsx`
- Create: `web/src/lib/export.ts`
- Test: `api/internal/service/creator_export_test.go`
- Test: `web/src/lib/export.test.ts`
- Test: `web/src/pages/finance/home-transactions.test.tsx`

**Interfaces:**
- Transaction JSON adds `creator: {name, initials, profileImageUrl?, status}` and `createdAt`; no internal creator ID is returned in this view.
- `GET /workspaces/{workspaceId}/export.csv` requires `export_data`, returns `text/csv; charset=utf-8`, and sets `Content-Disposition: attachment; filename="<workspace>-export-YYYY-MM-DD.csv"`.

- [ ] **Step 1: Write failing creator and CSV tests**

Test that entries resolve active user names/images/initials, missing users render `Former member`, timestamps are included, CSV values escape commas/quotes/line breaks, all required sections are present, and sensitive storage fields are absent. Test a member without `export_data` receives forbidden.

- [ ] **Step 2: Run the tests and verify RED**

Run: `go test ./internal/service -run 'Creator|Export|CSV' -count=1`; `npm.cmd test -- --run src/lib/export.test.ts`.

Expected: FAIL because the view enrichment and export service are absent.

- [ ] **Step 3: Implement creator enrichment**

After a transaction page is fetched, collect unique `CreatedBy` values, load only `users` display fields, and attach a summary. If the user lookup misses, emit `Former member`; do not remove the underlying storage value needed by authorization.

- [ ] **Step 4: Implement permission-scoped CSV generation**

Create a reusable CSV writer that takes explicit headers and values, escapes every cell according to commas/quotes/CR/LF, formats timestamps as RFC3339 UTC, and streams/returns the generated bytes. Query only the workspace’s accessible transactions, categories, workspace details, and member display rows; never serialize raw Mongo models.

- [ ] **Step 5: Add the route and response headers**

Require `export_data`, generate the meaningful filename from a sanitized workspace name plus UTC date, and return a failure envelope for service errors before writing any CSV bytes.

- [ ] **Step 6: Update entry list and details**

Render creator avatar/image or initials, name/status, and creation timestamp in each entry row and the existing entry details/share surfaces. Keep privacy mode limited to amounts; creator attribution and timestamps remain visible.

- [ ] **Step 7: Connect Settings “Export Your Data”**

Replace the unavailable badge with a permission-aware button that downloads the server CSV, shows loading/success/failure feedback, and does not expose a client-generated partial export. Keep the existing transaction-page export only as an explicitly labeled filtered export if retained.

- [ ] **Step 8: Run focused API and web tests**

Run: `go test ./internal/service ./internal/handler -run 'Creator|Export|CSV' -count=1`; `npm.cmd test -- --run src/lib/export.test.ts src/pages/finance/home-transactions.test.tsx`.

Expected: PASS.

---

### Task 5: Add real dashboard analytics and responsive charts

**Files:**
- Modify: `api/internal/service/insights.go`
- Modify: `api/internal/handler/finance.go`
- Modify: `api/internal/router/router.go`
- Modify: `web/src/domain/types.ts`
- Modify: `web/src/pages/finance/data.ts`
- Modify: `web/src/pages/finance/home-transactions.tsx`
- Modify: `web/src/index.css`
- Create: `web/src/pages/finance/dashboard-model.ts`
- Test: `api/internal/service/dashboard_test.go`
- Test: `web/src/pages/finance/dashboard-model.test.ts`
- Test: `web/src/pages/finance/home-transactions.test.tsx`

**Interfaces:**
- `GET /workspaces/{workspaceId}/dashboard` remains additive: existing totals remain, and `byCategory`, `cashflow`, `monthlyTrend`, `recentActivity`, and `topCategories` are added as arrays with real workspace currency and timestamps.
- `buildDashboardModel(transactions, now)` returns deterministic category totals/counts, income/expense totals, recent activity, and month/week buckets for demo/live data.

- [ ] **Step 1: Write failing analytics tests**

Cover expense/income/refund categorization, counts versus totals, most-used category ordering, monthly buckets, empty datasets, and permission-scoped access.

- [ ] **Step 2: Run the tests to verify RED**

Run: `go test ./internal/service -run 'Dashboard|Analytics' -count=1`; `npm.cmd test -- --run src/pages/finance/dashboard-model.test.ts`.

Expected: FAIL on missing response fields/model.

- [ ] **Step 3: Implement backend aggregation**

Extend the existing dashboard query with category/type/time aggregations over the same accessible transaction scope. Return zero/empty arrays instead of null and keep the workspace currency explicit.

- [ ] **Step 4: Implement frontend chart model and components**

Add CSS/SVG chart primitives without a new dependency: category bars for count/amount, income-versus-expense comparison, and a responsive trend line/bar view. Provide accessible labels/tables for chart values, preserve reduced-motion behavior, and use real live values rather than generated placeholder bars.

- [ ] **Step 5: Integrate Home loading/error/empty states**

Fetch `/dashboard` alongside existing account/transaction data, render the chart sections, and show a clear empty state when no entries exist while still showing balances and workspace context.

- [ ] **Step 6: Run focused dashboard tests**

Run: `go test ./internal/service -run 'Dashboard|Analytics' -count=1`; `npm.cmd test -- --run src/pages/finance/dashboard-model.test.ts src/pages/finance/home-transactions.test.tsx`.

Expected: PASS at mobile and desktop viewport widths used by the existing tests.

---

### Task 6: Enable account editing and remove biometric unlock completely

**Files:**
- Modify: `api/internal/model/models.go`
- Modify: `api/internal/service/auth.go`
- Modify: `api/internal/handler/auth.go`
- Modify: `web/src/domain/types.ts`
- Modify: `web/src/app/app-state.ts`
- Modify: `web/src/app/app-context.tsx`
- Modify: `web/src/pages/settings/SettingsPage.tsx`
- Modify: `web/src/pages/settings/PreferenceSections.tsx`
- Modify: `web/src/pages/settings/SecuritySections.tsx`
- Modify: `web/src/pages/auth/WelcomePage.tsx`
- Modify: `web/src/pages/finance/more-help.tsx`
- Modify: `web/src/pages/settings/settings-model.ts`
- Keep: `web/src/components/device-access-gate.tsx` and its tests for the existing non-biometric remembered-device PIN path; remove only biometric references from product code and copy.
- Test: `api/internal/service/auth_test.go`
- Test: `web/src/pages/settings/PreferenceSections.test.tsx`
- Test: `web/src/pages/settings/SecuritySections.test.tsx`

**Interfaces:**
- `PATCH /me` accepts only `{name?, email?, phoneNumber?, profileImageUrl?, preferredCurrency?}` and returns the sanitized user. Email changes normalize to lowercase and set `emailVerified: false`; protected fields are rejected by strict decoding/validation.
- `ProfileSection` receives/edits a safe `CurrentUser` view and exposes loading/error/success feedback.

- [ ] **Step 1: Write failing auth and settings tests**

Test valid profile updates, name/email/phone/image validation, email normalization and verification reset, rejection of protected fields, and that Settings contains no “Biometric unlock”, “biometric”, or fingerprint control while account editing remains available.

- [ ] **Step 2: Run the tests and verify RED**

Run: `go test ./internal/service ./internal/handler -run 'Update|Profile|Me' -count=1`; `npm.cmd test -- --run src/pages/settings/PreferenceSections.test.tsx src/pages/settings/SecuritySections.test.tsx`.

Expected: FAIL because only currency updates exist and the biometric UI is present.

- [ ] **Step 3: Implement safe backend profile updates**

Validate each supported field, update only allowed Mongo fields, preserve password/IDs/roles/ownership, and return the updated user. Use a unique email conflict response when another account owns the normalized address.

- [ ] **Step 4: Implement the editable profile UI**

Load `/me` for live users, use controlled fields with inline validation, disable submit while pending, show server field errors and a success notice, update app context name/avatar data, and retain a clearly labeled demo-mode local behavior without pretending to save to the server.

- [ ] **Step 5: Remove biometric code and copy**

Delete biometric state/props/icon/toggle and all biometric wording from Settings, welcome/help copy, permissions/configuration, and unused imports. Keep ordinary login and the existing non-biometric remembered-device path working.

- [ ] **Step 6: Run focused account/security tests**

Run the commands from Step 2 plus `rg -n -i "biometric|fingerprint|face.?id" api web/src applications/android` and confirm no product code/config match remains.

---

### Task 7: Full verification and integration checks

**Files:**
- Modify only files required by Tasks 1–6.
- Test: all existing Go and web test files.

- [ ] **Step 1: Format and run focused regression suites**

Run: `gofmt -w internal/model internal/service internal/handler internal/router internal/db` from `api/`; focused invitation/member/creator/dashboard/auth tests from prior tasks; and focused web Vitest files.

- [ ] **Step 2: Run complete backend verification**

Run: `go test ./...`, `go test -race ./...`, `go vet ./...`, and `go build ./...` from `api/`.

Expected: all pass; if Mongo-dependent tests are unavailable, record the exact environment limitation rather than skipping unit/contract coverage.

- [ ] **Step 3: Run complete web verification**

Run: `npm.cmd run check` from `web/`.

Expected: tests, typecheck, lint, and production build all pass with no new warnings.

- [ ] **Step 4: Verify sensitive-field and biometric scans**

Run: `rg -n -i "passwordHash|tokenHash|joinCodeHash|internal.?user.?id|biometric|fingerprint|face.?id" api/internal/handler api/internal/service web/src`; inspect only intentional storage/auth code and confirm none is emitted or presented as a product field.

- [ ] **Step 5: Verify multi-account/device behavior from automated contracts**

Run the invitation acceptance and `AppProvider` hydration tests with two user fixtures and two token/session contexts. Confirm invalid/expired/used tokens, unauthorized member mutations, empty dashboard/export sets, and success/error/loading paths are all covered. If a live Mongo replica set and Android emulator are available, run the documented API and emulator flows; otherwise report that those external checks remain environment-limited.

- [ ] **Step 6: Review the final diff for scope**

Run: `git status --short`, `git diff --stat`, and targeted `git diff --` for modified files. Confirm unrelated pre-existing deletions/untracked reorganization changes were not reverted or overwritten.
