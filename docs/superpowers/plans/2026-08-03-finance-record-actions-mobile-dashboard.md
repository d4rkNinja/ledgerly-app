# Finance Record Actions and Mobile Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver permission-safe record drawers and actions, a selectable monthly Home summary with interactive cashflow details, and a mobile layout that always clears the navigation dock.

**Architecture:** The Go API gains record detail/action routes while preserving collection responses. The React client gains a small record-action domain layer and a reusable responsive detail surface, then composes it into transactions, accounts, budgets, goals, and Home. Mobile layout uses shared dock geometry tokens rather than per-page padding constants.

**Tech Stack:** Go, Chi, Mongo repository abstraction, React, TypeScript, TanStack Query, Motion, Vitest, Capacitor Android.

## Global Constraints

- Preserve existing collection request and response shapes; use detail routes for edit-only state.
- Enforce all permissions and private/vault scopes on the server; never trust a hidden client action.
- Share payloads require `export_data`, are audit logged, and contain no raw IDs, tokens, public links, or private notes.
- Account removal is archival, not ledger-destructive deletion.
- Transaction edits must update balances atomically and audit the outcome.
- All touch interactions are at least 44px and work by keyboard.
- Do not commit automatically; this worktree contains unrelated user changes and no commit was requested.
- Deploy changed backend code before producing the Android release APK, then validate the release with the Android emulator workflow.

## File structure

- `api/internal/service/record_actions.go`: scoped detail reads, input validation, update/archive/delete/share business logic.
- `api/internal/service/record_actions_test.go`: service contract tests for permissions, mutations, auditing, and balance invariants.
- `api/internal/handler/record_actions.go`: request decoding and HTTP response wiring for individual records.
- `api/internal/handler/record_actions_test.go`: route-level status and payload contracts.
- `api/internal/service/insights.go`, `api/internal/handler/finance.go`, `api/internal/router/router.go`: month-filtered dashboard contract and routes.
- `web/src/domain/types.ts`, `web/src/pages/finance/data.ts`: complete detail/action models and normalisation helpers.
- `web/src/pages/finance/record-details.tsx`: reusable desktop-drawer/mobile-sheet record surface, action forms, confirmation UI, and share bridge.
- `web/src/pages/finance/record-details.test.tsx`: drawer accessibility, action visibility, and mutation behaviour.
- `web/src/pages/finance/home-transactions.tsx`: month controls, monthly summary, interactive cashflow triggers, and chart detail presentation.
- `web/src/pages/finance/home-transactions.test.tsx`: Home data selection, chart detail, and route navigation tests.
- `web/src/pages/finance/accounts.tsx`, `web/src/pages/finance/budgets-goals.tsx`: clickable record cards and attached record surfaces.
- `web/src/components/motion/drawer.tsx`, `web/src/index.css`: accessible drawer behaviour and shared responsive/dock/chart styles.

### Task 1: Prove and implement scoped record reads and record mutations

**Files:**
- Create: `api/internal/service/record_actions.go`
- Create: `api/internal/service/record_actions_test.go`
- Modify: `api/internal/service/transactions.go`
- Modify: `api/internal/service/workspaces.go`
- Modify: `api/internal/service/planning.go`

**Interfaces:**
- Produces `GetTransaction`, `GetAccount`, `GetBudget`, `GetGoal` methods that accept `(context.Context, workspaceID, actorID, recordID)`.
- Produces `UpdateTransaction`, `UpdateAccount`, `UpdateBudget`, `UpdateGoal` and `ArchiveAccount` methods with typed inputs.
- Produces `RecordSharePayload { Title string; Text string }` and record-specific share methods.

- [ ] **Step 1: Write failing service tests for the immutable security and accounting rules.**

```go
func TestUpdateTransactionRebalancesChangedAccountsAndAudits(t *testing.T) {
    finance, store := testFinance()
    beforeSource := store.accounts["account-a"].BalanceMinor
    beforeDestination := store.accounts["account-b"].BalanceMinor

    updated, err := finance.UpdateTransaction(context.Background(), "workspace-a", "user-a", "transaction-a", TransactionInput{
        AccountID: "account-b", Type: "expense", AmountMinor: 2500,
        Currency: "INR", Merchant: "Groceries", OccurredAt: time.Now().UTC(),
    })

    if err != nil { t.Fatal(err) }
    if updated.AccountID != "account-b" { t.Fatalf("accountID = %q", updated.AccountID) }
    if store.accounts["account-a"].BalanceMinor == beforeSource { t.Fatal("old account was not reversed") }
    if store.accounts["account-b"].BalanceMinor == beforeDestination { t.Fatal("new account was not updated") }
    if store.audits[len(store.audits)-1].Action != "transaction.updated" { t.Fatal("missing audit") }
}

func TestArchiveAccountPreservesHistoricalTransactions(t *testing.T) {
    finance, store := testFinance()
    if err := finance.ArchiveAccount(context.Background(), "workspace-a", "user-a", "account-a"); err != nil { t.Fatal(err) }
    if !store.accounts["account-a"].Archived { t.Fatal("account was not archived") }
    if _, ok := store.transactions["transaction-a"]; !ok { t.Fatal("transaction history was removed") }
}
```

- [ ] **Step 2: Run the focused service test to establish the missing implementation.**

Run: `go test ./internal/service -run 'Test(UpdateTransactionRebalancesChangedAccountsAndAudits|ArchiveAccountPreservesHistoricalTransactions)' -count=1`

Expected: compile or assertion failure because the action methods do not exist.

- [ ] **Step 3: Implement a scoped record loader and typed validation helpers.**

```go
func (s *FinanceService) GetTransaction(ctx context.Context, workspaceID, actorID, id string) (*model.Transaction, error) {
    filter, empty, err := s.transactionQuery(ctx, workspaceID, actorID, TransactionFilter{})
    if err != nil || empty { return nil, errOrNotFound(err, empty) }
    filter["_id"] = id
    var item model.Transaction
    if err := s.store.FindOne(ctx, "transactions", filter, &item); err != nil { return nil, err }
    if err := s.hydrateTransactionCreators(ctx, actorID, []model.Transaction{item}); err != nil { return nil, err }
    return &item, nil
}
```

Use equivalent scoped filters for accounts, budgets, and goals. Reuse create-input validation so PATCH accepts the same safe field set. Preserve IDs, workspace IDs, owners, creator IDs, and immutable account currency.

- [ ] **Step 4: Implement atomic mutation and audit paths.**

```go
func (s *FinanceService) UpdateTransaction(ctx context.Context, workspaceID, actorID, id string, input TransactionInput) (*model.Transaction, error) {
    result, err := s.store.WithTransaction(ctx, func(tx context.Context) (any, error) {
        current, err := s.loadTransactionForUpdate(tx, workspaceID, actorID, id)
        if err != nil { return nil, err }
        if err := s.requireTransactionEditPermission(tx, workspaceID, actorID, *current); err != nil { return nil, err }
        next, err := s.validatedReplacement(tx, workspaceID, actorID, *current, input)
        if err != nil { return nil, err }
        if err := s.applyTransactionDelta(tx, *current, -1); err != nil { return nil, err }
        if err := s.applyTransactionDelta(tx, next, 1); err != nil { return nil, err }
        if err := s.replaceTransactionWithAudit(tx, *current, next, actorID); err != nil { return nil, err }
        return &next, nil
    })
    if err != nil { return nil, err }
    return result.(*model.Transaction), nil
}
```

Archive an account with `$set: { archived: true, updated_at: now }`; delete budgets and goals with their workspace and visibility filters; create a sanitised share summary only after the `export_data` check and insert an action audit record.

- [ ] **Step 5: Run the complete service suite.**

Run: `go test ./internal/service -count=1`

Expected: PASS.

### Task 2: Expose record actions and a validated monthly dashboard filter

**Files:**
- Create: `api/internal/handler/record_actions.go`
- Create: `api/internal/handler/record_actions_test.go`
- Modify: `api/internal/router/router.go`
- Modify: `api/internal/handler/finance.go`
- Modify: `api/internal/service/insights.go`
- Modify: `api/internal/service/insights_test.go`

**Interfaces:**
- Produces `/transactions/{id}`, `/accounts/{id}`, `/budgets/{id}`, and `/goals/{id}` GET/PATCH/DELETE routes, plus their `/share` POST routes.
- Produces `DashboardFilter { Month *time.Time }`; `Dashboard` accepts it and returns only the selected calendar-month aggregates.

- [ ] **Step 1: Write failing HTTP and month-filter tests.**

```go
func TestAccountActionRoutesRequirePermissions(t *testing.T) {
    request := httptest.NewRequest(http.MethodPatch, "/api/v1/workspaces/workspace-a/accounts/account-a", strings.NewReader(`{"name":"Travel"}`))
    request.Header.Set("Content-Type", "application/json")
    response := httptest.NewRecorder()
    router.ServeHTTP(response, request)
    if response.Code != http.StatusForbidden { t.Fatalf("status = %d", response.Code) }
}

func TestDashboardMonthOnlyCountsSelectedMonth(t *testing.T) {
    dashboard, err := finance.Dashboard(context.Background(), "workspace-a", "user-a", DashboardFilter{Month: month("2026-08")})
    if err != nil { t.Fatal(err) }
    if dashboard.IncomeMinor != 12000 { t.Fatalf("income = %d", dashboard.IncomeMinor) }
}
```

- [ ] **Step 2: Run the focused route and analytics tests.**

Run: `go test ./internal/handler ./internal/service -run 'Test(AccountActionRoutesRequirePermissions|DashboardMonthOnlyCountsSelectedMonth)' -count=1`

Expected: FAIL because routes and `DashboardFilter` do not exist.

- [ ] **Step 3: Add precise Chi routes and handlers.**

```go
r.Route("/workspaces/{workspaceID}", func(r chi.Router) {
    r.Get("/accounts/{accountID}", api.Account)
    r.Patch("/accounts/{accountID}", api.UpdateAccount)
    r.Delete("/accounts/{accountID}", api.ArchiveAccount)
    r.Post("/accounts/{accountID}/share", api.ShareAccount)
})
```

Decode each typed body, call the corresponding service method with `workspaceID(r)` and `currentUser(r).ID`, map service errors through `serviceError`, and use 204 only for successful archive/delete.

- [ ] **Step 4: Implement the dashboard month parser and scoped query.**

```go
func dashboardMonth(r *http.Request) (*time.Time, error) {
    raw := strings.TrimSpace(r.URL.Query().Get("month"))
    if raw == "" { return nil, nil }
    value, err := time.Parse("2006-01", raw)
    if err != nil { return nil, &service.FieldError{Field: "month", Message: "must use YYYY-MM"} }
    return &value, nil
}
```

Use `month.UTC()` as the inclusive start and the first instant of the next month as the exclusive end in the dashboard transaction query. Preserve the unfiltered response when `month` is absent.

- [ ] **Step 5: Run the API tests and full Go verification.**

Run: `go test ./... -count=1; go vet ./...`

Expected: PASS.

### Task 3: Create the client record-action model and accessible responsive surface

**Files:**
- Modify: `web/src/domain/types.ts`
- Modify: `web/src/pages/finance/data.ts`
- Create: `web/src/pages/finance/record-details.tsx`
- Create: `web/src/pages/finance/record-details.test.tsx`
- Modify: `web/src/components/motion/drawer.tsx`
- Modify: `web/src/lib/share/types.ts`

**Interfaces:**
- Produces `FinanceRecordDetail`, `RecordAction`, and `RecordSharePayload` TypeScript types.
- Produces `<RecordDetailSurface record={...} open={...} onOpenChange={...} />`.
- Produces `loadRecordDetail`, `updateRecord`, `deleteRecord`, and `prepareRecordShare` request functions.

- [ ] **Step 1: Write failing UI tests for drawer permissions and mobile semantics.**

```tsx
it('shows edit, share, and archive only when account permissions allow them', async () => {
  render(<RecordDetailSurface open record={accountDetail} permissions={['edit_vault', 'export_data']} onOpenChange={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Edit account' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Share account' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Archive account' })).toBeVisible()
})

it('uses a bottom sheet at the mobile breakpoint', () => {
  setViewport(390)
  render(<RecordDetailSurface open record={transactionDetail} onOpenChange={vi.fn()} />)
  expect(screen.getByRole('dialog', { name: /transaction details/i })).toHaveAttribute('data-bottom-sheet', 'true')
})
```

- [ ] **Step 2: Run the focused frontend test to verify it fails.**

Run: `npm.cmd run test -- record-details.test.tsx --run`

Expected: FAIL because the surface and action types do not exist.

- [ ] **Step 3: Preserve full detail data separately from compact list normalisation.**

```ts
export async function loadRecordDetail<T extends FinanceRecordDetail>(
  workspaceId: string, kind: RecordKind, id: string,
) {
  return api.get<T>(`/workspaces/${workspaceId}/${kind}/${id}`)
}

export async function prepareRecordShare(workspaceId: string, kind: RecordKind, id: string) {
  return api.post<RecordSharePayload, undefined>(`/workspaces/${workspaceId}/${kind}/${id}/share`)
}
```

Keep compact `Account`, `Budget`, `Goal`, and `Transaction` list types compatible with current page consumers.

- [ ] **Step 4: Implement the shared surface and harden the desktop drawer.**

```tsx
return mobile ? (
  <BottomSheet open={open} onOpenChange={onOpenChange} title={title} snapPoints={[0.82, 0.94]} className="app-bottom-sheet record-detail-sheet">
    {content}
  </BottomSheet>
) : (
  <Drawer open={open} onOpenChange={onOpenChange} ariaLabel={`${title} details`} className="record-detail-drawer">
    {content}
  </Drawer>
)
```

Make the drawer register the Android back layer, isolate page siblings, restore focus, trap focus, and lock body scroll with the same behaviour expected of the existing bottom sheet. Render labelled detail rows, a mode switch from view to edit, mutation feedback, a confirmation dialog, and a `ShareSheet` fed only by the server sanitised payload.

- [ ] **Step 5: Run the focused surface test.**

Run: `npm.cmd run test -- record-details.test.tsx --run`

Expected: PASS.

### Task 4: Turn Home into a selected-month dashboard with interactive cashflow

**Files:**
- Modify: `web/src/pages/finance/home-transactions.tsx`
- Modify: `web/src/pages/finance/home-transactions.test.tsx`
- Modify: `web/src/pages/finance/data.ts`
- Modify: `web/src/domain/types.ts`

**Interfaces:**
- Produces `useDashboardMonth()` based on `?month=YYYY-MM`.
- Produces `<CashflowPeriodDetail />` using `GET /transactions?from=...&to=...`.

- [ ] **Step 1: Write failing month selection and chart-detail tests.**

```tsx
it('requests the selected month and changes the URL when the next-month control is pressed', async () => {
  renderHome('/app?month=2026-08')
  await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
  expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/dashboard?month=2026-09'))
  expect(location.search).toContain('month=2026-09')
})

it('opens a daily cashflow detail with matching transactions', async () => {
  renderHome('/app?month=2026-08')
  await userEvent.click(screen.getByRole('button', { name: /cashflow for 2026-08-03/i }))
  expect(await screen.findByText('Transactions on Aug 3, 2026')).toBeVisible()
  expect(api.get).toHaveBeenCalledWith(expect.stringContaining('from=2026-08-03'))
})
```

- [ ] **Step 2: Run the focused Home tests to verify they fail.**

Run: `npm.cmd run test -- home-transactions.test.tsx --run`

Expected: FAIL because chart bars are decorative spans and month selection does not exist.

- [ ] **Step 3: Add compact monthly controls and summary values.**

```tsx
<section className="monthly-summary" aria-labelledby="monthly-summary-title">
  <div className="month-picker">
    <IconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft /></IconButton>
    <strong id="monthly-summary-title">{formatMonth(month)}</strong>
    <IconButton label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight /></IconButton>
  </div>
  <SummaryMetric label="Income" money={income} />
  <SummaryMetric label="Spending" money={spending} />
  <SummaryMetric label="Net" money={net} />
</section>
```

Pass the selected month to the dashboard query key and request path. Preserve a current-month fallback for malformed or absent URL values.

- [ ] **Step 4: Replace decorative bars with semantic buttons and details.**

```tsx
<button type="button" className="cashflow-bar" aria-label={`Cashflow for ${point.period}`} onClick={() => setSelectedCashflow(point)}>
  <motion.span aria-hidden="true" style={{ height: `${height}%` }} />
</button>
```

Use an anchored desktop popover and the existing bottom-sheet surface under the mobile breakpoint. Its query computes UTC day bounds, fetches a limited permission-scoped transaction list, renders loading/empty/error states, and navigates `View all` to `/app/transactions?from=<start>&to=<end>`.

- [ ] **Step 5: Run the Home test file.**

Run: `npm.cmd run test -- home-transactions.test.tsx --run`

Expected: PASS.

### Task 5: Connect record cards and transaction lists to the shared action surface

**Files:**
- Modify: `web/src/pages/finance/home-transactions.tsx`
- Modify: `web/src/pages/finance/accounts.tsx`
- Modify: `web/src/pages/finance/budgets-goals.tsx`
- Modify: `web/src/pages/finance/record-details.tsx`
- Modify: `web/src/pages/finance/record-details.test.tsx`

**Interfaces:**
- Consumes compact record IDs from existing list/card data.
- Produces a single selected-record state per page and refetch/invalidation after a successful action.

- [ ] **Step 1: Write failing page integration tests.**

```tsx
it('opens transaction details from a compact list without rendering inline delete controls', async () => {
  renderTransactions()
  expect(screen.queryByRole('button', { name: /delete pnb-bank transfer/i })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /pnb-bank transfer/i }))
  expect(await screen.findByRole('dialog', { name: /pnb-bank transfer details/i })).toBeVisible()
})

it('opens a goal drawer when a goal card is pressed', async () => {
  renderGoals()
  await userEvent.click(screen.getByRole('button', { name: /emergency fund/i }))
  expect(await screen.findByRole('dialog', { name: /emergency fund details/i })).toBeVisible()
})
```

- [ ] **Step 2: Run the focused record-surface tests.**

Run: `npm.cmd run test -- record-details.test.tsx home-transactions.test.tsx --run`

Expected: FAIL because list/card selection is not wired.

- [ ] **Step 3: Make list rows and cards clear primary actions.**

```tsx
<ListRow
  onClick={() => setSelectedRecord({ kind: 'transactions', id: transaction.id })}
  leading={<TransactionDirectionMarker direction={transaction.direction} />}
  title={transaction.merchant}
  subtitle={transactionSubtitle(transaction)}
  trailing={<MoneyText money={transaction.amount} signed={undefined} />}
/>
```

Use a button wrapper with an accessible name around account, budget, and goal cards. Remove disabled `MoreHorizontal` controls and all direct list share/delete icon buttons. Preserve creator attribution in the transaction summary and detail screen.

- [ ] **Step 4: Bind mutations to TanStack Query invalidation and demo state.**

```ts
await queryClient.invalidateQueries({ queryKey: ['transactions', workspace.id] })
await queryClient.invalidateQueries({ queryKey: ['accounts', workspace.id] })
await queryClient.invalidateQueries({ queryKey: ['budgets', workspace.id] })
await queryClient.invalidateQueries({ queryKey: ['goals', workspace.id] })
await queryClient.invalidateQueries({ queryKey: ['dashboard', workspace.id] })
```

For demo mode, use the established session collection helpers to apply equivalent edit/archive/delete results locally and keep server-only notices accurate.

- [ ] **Step 5: Run affected frontend tests.**

Run: `npm.cmd run test -- record-details.test.tsx home-transactions.test.tsx --run`

Expected: PASS.

### Task 6: Apply shared responsive layout and interaction polish

**Files:**
- Modify: `web/src/index.css`
- Modify: `web/src/components/motion/drawer.tsx`
- Modify: `web/src/pages/finance/home-transactions.tsx`
- Modify: `web/src/pages/finance/accounts.tsx`
- Modify: `web/src/pages/finance/budgets-goals.tsx`

**Interfaces:**
- Produces `--mobile-dock-item-size`, `--mobile-dock-height`, and `--mobile-dock-clearance` CSS contracts.
- Produces `.record-detail-drawer`, `.monthly-summary`, `.cashflow-bar`, and `.cashflow-period-detail` styles.

- [ ] **Step 1: Capture the existing obscured-last-card state as the visual regression baseline.**

Use the Android emulator at 320px and 390px widths, scroll the Home dashboard to its final card, and record screenshots/UI trees showing the fixed dock obscuring the final content. This is the failing visual reproduction for the shared layout defect; do not add a source-text test for CSS.

- [ ] **Step 2: Run the focused component tests before styling.**

Run: `npm.cmd run test -- record-details.test.tsx home-transactions.test.tsx --run`

Expected: PASS for the behaviour supplied by Tasks 3-5 before the shared layout styling changes.

- [ ] **Step 3: Replace fixed clearance with dock geometry.**

```css
:root {
  --mobile-dock-item-size: 58px;
  --mobile-dock-height: calc(var(--mobile-dock-item-size) + var(--space-3));
  --mobile-dock-clearance: calc(var(--mobile-dock-height) + var(--space-5) + var(--safe-bottom));
}

@media (max-width: 980px) {
  .content-stage {
    padding-bottom: max(var(--space-page-bottom), var(--mobile-dock-clearance));
    scroll-padding-bottom: var(--mobile-dock-clearance);
  }
}
```

Use a narrower `--mobile-dock-item-size` at 360px. Give chart bars a 44px hit area, constrain chart overflow to its scrollable region, preserve page vertical scrolling, apply tabular numbers to financial values, and ensure sheet/drawer footer buttons clear the safe area.

- [ ] **Step 4: Run lint, typecheck, and all frontend tests.**

Run: `npm.cmd run check`

Expected: PASS.

### Task 7: Deploy, build, and verify the Android release

**Files:**
- Modify only implementation files from Tasks 1-6.
- Output: `applications/android/app/build/outputs/apk/release/app-release.apk`

**Interfaces:**
- Consumes the deployed HTTP API at `http://80.225.194.189:3001/api/v1`.
- Produces an installable Android release APK connected to the updated API.

- [ ] **Step 1: Verify source checks before deployment.**

Run: `go test ./... -count=1; go vet ./...; Set-Location web; npm.cmd run check`

Expected: PASS.

- [ ] **Step 2: Deploy only the changed backend source and restart its existing PM2 process.**

Run a scoped `rsync`/`scp` deployment to `ubuntu@80.225.194.189:/home/ubuntu/ledgerly/`, then use `pm2 restart ledgerly-api --update-env` remotely. Confirm `/api/v1/health` responds before building.

- [ ] **Step 3: Build the release against the deployed HTTP API.**

```powershell
Set-Location D:\Codeverse\ledgerly\web
$env:VITE_API_BASE_URL = 'http://80.225.194.189:3001/api/v1'
npm.cmd run android:setup -- --release
npm.cmd run android:build:release
```

- [ ] **Step 4: Install and verify with the Android emulator QA workflow.**

Use `adb install -r applications/android/app/build/outputs/apk/release/app-release.apk`, launch the app, and validate Home month controls, a cashflow period sheet, transaction detail, an authorized record action, and the ability to scroll the final dashboard card fully above the dock. Capture screenshots and UI trees only in local `.qa` files.

- [ ] **Step 5: Report the APK path, checksum, test outcomes, deployment state, and any limitation.**

Do not report credentials or copy locally captured personal data into the handoff.
