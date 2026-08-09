# Member Access and Join-Code Expiry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make member management reliable and make every workspace join code valid for a server-enforced three-minute window.

**Architecture:** The Go API remains the authority for code generation and expiry. It stores an expiry with the existing hashed code and only resolves a join request when that expiry is still in the future. The React Members page consumes the returned expiry, presents the join-code and direct-invitation flows distinctly, and uses a responsive member-specific layout rather than a generic single-line list row.

**Tech Stack:** Go 1.22, MongoDB repository layer, React 19, TypeScript, TanStack Query, Vitest, Go test.

## Global Constraints

- A workspace join code has a lifetime of **at least 180 seconds** from its successful creation response; the API is authoritative for expiry.
- Expired or legacy join codes must not grant access, even if a client countdown is stale.
- Direct invitation tokens remain single-use and retain their existing invitation expiry rules; they are not workspace join codes.
- Keep membership approval after a valid workspace-code request.
- Preserve the remote `/home/ubuntu/ledgerly/.env` during deployment.
- Do not expose Mongo identifiers, hashes, or tokens in member-list responses.

---

### Task 1: Enforce and expose workspace-code expiry in the API

**Files:**
- Modify: `api/internal/model/models.go`
- Modify: `api/internal/service/workspace_access.go`
- Modify: `api/internal/db/indexes.go`
- Modify: `api/internal/db/migrations.go`
- Modify: `api/internal/handler/frontend_contract_test.go`
- Create or modify: `api/internal/service/workspace_access_test.go`

**Interfaces:**
- Consumes: `POST /api/v1/workspaces/{workspaceID}/join-code` and `POST /api/v1/workspace-join-requests`.
- Produces: `WorkspaceJoinCodeResult{Code string, ExpiresAt time.Time}` and a workspace document field `join_code_expires_at`.

- [ ] **Step 1: Write failing expiry contract tests.**

```go
func TestRotateWorkspaceJoinCodeReturnsExpiryAtLeastThreeMinutesAhead(t *testing.T) {
    result, err := finance.RotateWorkspaceJoinCode(ctx, "workspace-a", "owner-a")
    if err != nil { t.Fatal(err) }
    if result.ExpiresAt.Sub(before) < 3*time.Minute { t.Fatalf("expiry too short: %s", result.ExpiresAt.Sub(before)) }
}

func TestRequestWorkspaceJoinRejectsExpiredOrLegacyCode(t *testing.T) {
    _, err := finance.RequestWorkspaceJoin(ctx, actor, WorkspaceJoinRequestInput{Code: expiredCode})
    if !errors.Is(err, ErrNotFound) { t.Fatalf("error = %v, want ErrNotFound", err) }
}
```

- [ ] **Step 2: Run the focused Go tests and verify they fail because expiry is not persisted or checked.**

Run: `go test ./internal/service ./internal/handler -run 'JoinCode|WorkspaceJoin' -count=1`

Expected: FAIL until `ExpiresAt` is returned and `join_code_expires_at` is applied to lookup.

- [ ] **Step 3: Implement the minimum server-side expiry contract.**

```go
const workspaceJoinCodeLifetime = 3 * time.Minute

type WorkspaceJoinCodeResult struct {
    Code      string    `json:"code"`
    ExpiresAt time.Time `json:"expiresAt"`
}

expiresAt := now.Add(workspaceJoinCodeLifetime)
// Persist join_code_hash and join_code_expires_at together.
// Resolve a join request only when join_code_expires_at is strictly after now.
```

Add a migration that invalidates legacy hash-only workspace codes by setting their expiry to the migration time, and add the compound lookup index used by the request filter.

- [ ] **Step 4: Run focused tests and the complete API suite.**

Run: `go test ./... -count=1 && go vet ./...`

Expected: PASS. Verify the response exposes `code` and `expiresAt`, but never a hash or internal workspace member id.

### Task 2: Repair the Members-page code and member-management UX

**Files:**
- Modify: `web/src/pages/finance/collaboration.tsx`
- Modify: `web/src/pages/finance/collaboration.test.tsx`
- Modify: `web/src/app/workspace-management-dialogs.tsx`
- Modify: `web/src/app/workspace-management-dialogs.test.tsx`
- Modify: `web/src/index.css`

**Interfaces:**
- Consumes: `WorkspaceJoinCodeResult` from `POST /workspaces/{workspaceID}/join-code` with `code` and ISO `expiresAt`.
- Produces: a responsive member directory, a clear three-minute join-code panel, and distinct copy for invitation tokens versus join codes.

- [ ] **Step 1: Write failing UI tests.**

```tsx
it('shows a newly created workspace code with its remaining validity', async () => {
  apiMocks.post.mockResolvedValue({ code: 'join-code', expiresAt: futureIso })
  renderFamily()
  await user.click(screen.getByRole('button', { name: /create new join code/i }))
  expect(await screen.findByText(/valid for/i)).toBeInTheDocument()
})

it('sends a member removal request after explicit confirmation', async () => {
  renderFamily()
  await user.click(await screen.findByRole('button', { name: 'Remove Bina Rao' }))
  await user.click(screen.getByRole('button', { name: /confirm removal/i }))
  expect(apiMocks.delete).toHaveBeenCalledWith('/workspaces/workspace-a/members/bina%40example.test')
})
```

- [ ] **Step 2: Run the focused Vitest files and verify they fail.**

Run: `npm.cmd run test:run -- src/pages/finance/collaboration.test.tsx src/app/workspace-management-dialogs.test.tsx`

Expected: FAIL because there is no expiry copy or removal confirmation flow.

- [ ] **Step 3: Implement the page repair.**

Use a member-specific responsive row/card structure with identity, status, metadata, role control, and remove control in separate layout regions. Show a generated join code with its expiry/countdown, hide or mark it expired locally after the returned expiry, and tell users that it creates an approval request. Keep direct invitation tokens on their dedicated acceptance path and restore only safe external sharing when a configured public HTTPS app origin is available.

- [ ] **Step 4: Run focused UI tests and the full web check.**

Run: `npm.cmd run test:run -- src/pages/finance/collaboration.test.tsx src/app/workspace-management-dialogs.test.tsx && npm.cmd run check`

Expected: PASS.

### Task 3: Integrate, deploy, and verify the Android release

**Files:**
- Modify only the files produced by Tasks 1 and 2; do not overwrite unrelated dirty-worktree changes.

**Interfaces:**
- Consumes: server expiry response and frontend countdown presentation.
- Produces: deployed API binary at `/home/ubuntu/ledgerly/bin/api` and a release APK pointed at `http://80.225.194.189:3001/api/v1`.

- [ ] **Step 1: Verify the joined backend/frontend contract.**

Run: `go test ./... -count=1`, then `npm.cmd run check` from `web`.

- [ ] **Step 2: Package and deploy the backend without replacing `/home/ubuntu/ledgerly/.env`.**

Build on the ARM64 host with `go test ./...`, `go vet ./...`, and `GOOS=linux GOARCH=arm64 go build -o /home/ubuntu/ledgerly/bin/api ./cmd/api`; restart `ledgerly-api` through PM2 and save the process list.

- [ ] **Step 3: Verify the server contract after restart.**

Run: `curl http://80.225.194.189:3001/health` and `curl http://80.225.194.189:3001/ready`.

Expected: both return HTTP 200; an expired or legacy code yields the safe not-found response.

- [ ] **Step 4: Build the release APK against the deployed HTTP API.**

Run from `web`: `$env:VITE_API_BASE_URL='http://80.225.194.189:3001/api/v1'; npm.cmd run android:build:release`.

- [ ] **Step 5: Install the generated APK and exercise the Members workflow on the emulator.**

Use the Android emulator QA workflow to open Members, generate a code, verify expiry copy, and verify there is no crash. Do not claim a successful user login without valid supplied credentials.

## Self-Review

- The plan covers API expiry, legacy invalidation, UI clarity, member-removal confirmation, tests, deployment, and Android release verification.
- No task permits client-only expiry enforcement or conflates workspace join codes with invitation tokens.
- API response and frontend property names match: `code` and `expiresAt`.
