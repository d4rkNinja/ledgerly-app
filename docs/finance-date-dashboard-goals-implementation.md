# Finance dates, dashboard periods, and financial goals

Implementation record for the additive finance/date/dashboard/goals work completed in the shared Ledgerly workspace on 2026-08-07.

## Transaction-date contract

`Transaction.OccurredAt` is the declared financial date. It is stored as BSON `occurred_at` and exposed as JSON `occurredAt`. A non-zero declared value always wins over `CreatedAt` and `UpdatedAt`. Create and update paths preserve an explicit date, and reporting, filtering, activity, dashboard analytics, sharing, CSV export, and date-range drilldowns use the same effective-date helper.

The API treats date-only dashboard and export values as civil UTC dates. An inclusive user-facing `from=YYYY-MM-DD`/`to=YYYY-MM-DD` selection becomes the half-open interval `[from 00:00 UTC, (to + 1 day) 00:00 UTC)`. Month selection uses `[first day of month, first day of next month)`. RFC3339 transaction-list bounds remain compatible with the existing transactions endpoint. Invalid client dates are field validation errors; transaction creation requires an explicit valid `occurredAt`.

Legacy stored rows with an absent or BSON-zero `occurred_at` remain readable through the documented compatibility fallback to UTC `created_at`. A startup migration scans those rows in batches of 500 and sets only the missing/zero field to the existing `created_at` value. The update predicate is repeated during the write, so the migration is idempotent and cannot overwrite a valid user-selected date. `createdAt` and `updatedAt` remain audit metadata. A July 15 declared transaction created on August 6 is therefore included in July and excluded from August; the focused service test proves this explicitly.

## Dashboard and analytics

Home accepts additive period state in the URL: this month, last month, custom month, custom range, this week, last 7 days, this year, and all time. Month mode has previous/next controls, a month picker, jump-to-current, and clear. Date-only links are used for dashboard queries; transaction drilldowns convert the selected civil range to the existing RFC3339 transaction endpoint and preserve exact category, type, contact, merchant, and account filters.

The dashboard response retains all existing fields and adds transaction count, average value, largest income/expense, received/paid totals, pending/achieved goal totals, previous-equivalent-period comparison, source/contact/account/type breakdowns, richer activity, daily/monthly cashflow, month details, largest records, active day, top category/contact, deterministic insights, and goal summaries/highlights. Income-like types are income, refund, and reimbursement; expense is expense; transfer and adjustment records remain visible in type/count/average views and neutral in income/expense net cashflow. Planned goals are never included in actual transaction income or expense totals. Empty states return zero metrics and empty arrays.

All permission, workspace, vault, account, privacy, and creator scoping is applied before dashboard reads. Production Mongo uses one `$facet` aggregation over the authorized transaction query for summaries, comparisons, categories, sources, contacts, accounts, types, daily/monthly series, largest records, and repeated candidates. Grouping stages consume the complete authorized period; `$limit` is used only after aggregation for recent rows, largest-row selection, repeated display candidates, and goal highlight rows. The browser never receives the transaction history used to calculate a metric. Test doubles retain a bounded fixture fallback only.

`allTime=true` is an explicit dashboard query contract. It omits date predicates entirely, so valid declared dates before 1970 and after the current day are included. Month and custom ranges remain half-open after handler normalization, and previous comparisons use the same exact server aggregation over the equivalent preceding interval. Account and transaction-type rows carry the selected-period filters into exact transaction drilldowns.

Goal summaries use a server `$facet` with an all-active branch and a selected-period branch. A period branch includes goals whose due, start, or completion date intersects the selected range; `allActiveGoals` remains a separate all-time view. Goal highlights are bounded only as a presentation list after the period filter; active/expected/due/overdue/achieved/partial totals and completion percentage are grouped without a goal-count cap. Historical opening/closing balances remain nullable because account balance snapshots and a complete immutable balance ledger are not available to reconstruct those values safely.

## Goals and commitments

Goal records preserve the legacy `id`, `name`, target/current amounts, currency, target date, visibility, and audit fields. New optional fields are description, predefined type, custom type label, direction, remaining amount, start/due dates, derived status, contact/contact name and summary, account, category, reminder, notes, completion date, linked transaction IDs, creator summary, and history entries.

Supported types are `receive_payment`, `pay_someone`, `savings_target`, `debt_repayment`, `bill_payment`, `purchase_target`, `monthly_budget_target`, `emergency_fund`, and `custom`. Directions are receive, pay, save, and neutral. Status is derived as `not_started`, `in_progress`, `due_soon`, `due_today`, `overdue`, or `achieved`, with durable `cancelled`. Passing a due date never achieves a goal. Cancellation and reopen are explicit actions; completed progress remains history.

Create and edit forms accept the expanded metadata, use the existing select/date/currency components, and offer a searchable existing-contact picker with contact details plus inline contact creation. Goal details expose progress, remaining amount, type/direction, dates, related records, and actions for partial progress, linked transaction creation, existing-transaction linking, rescheduling, edit, cancel, and reopen. Real transaction creation requires a separate confirmation step and uses the user-declared completion date.

The additive routes are:

- `POST /workspaces/{workspaceId}/goals/{goalId}/progress`
- `POST /workspaces/{workspaceId}/goals/{goalId}/transactions`
- `POST /workspaces/{workspaceId}/goals/{goalId}/link-transaction`
- `POST /workspaces/{workspaceId}/goals/{goalId}/cancel`
- `POST /workspaces/{workspaceId}/goals/{goalId}/reopen`
- `POST /workspaces/{workspaceId}/goals/{goalId}/reschedule`

Every action checks the existing goal-management permission and transaction creation permission where applicable, validates workspace/vault/account/contact ownership and currency, rejects cancelled or invalid transitions, and records an audit/history entry. Idempotency keys are required for progress, link, and transaction actions. A goal-scoped SHA-256-derived transaction key is bounded below the transaction key limit, and a workspace key lookup prevents reuse for a different goal. Mongo-backed transaction completion is wrapped in one outer `WithTransaction`: financial transaction/account/vault/audit effects, goal progress/history/linking, goal action idempotency, and goal audit all receive the same session context. `MongoStore.WithTransaction` joins an existing `mongo.SessionContext` instead of nesting a transaction. A canonical JSON fingerprint covers every effect-bearing transaction field (amount, declared date, account/destination, type, category, description, notes, contact, currency, privacy, vault, and goal); link/progress fingerprints cover their complete effect payload. Same-key identical retries return the prior result, while changed payloads return conflict. The service test-double transaction boundary snapshots and rolls back all writes to exercise failure consistency; production Mongo relies on the atomic transaction.

## Storage and indexes

Goal action history is stored in `goal_action_idempotency` with the existing unique `(workspace_id, goal_id, idempotency_key)` index, an additive `(workspace_id, idempotency_key)` lookup index, and a history index. Transactions retain occurred-date history indexes and now include created-date compatibility history, account/type/category/contact/goal relationship indexes. Goals include due-date, type/due-date, and contact/account relationship indexes. Contacts retain the existing name index and add a partial unique normalized-name index for inline contact creation; legacy exact-name matching is still checked before insert.

## Verification

Focused coverage includes:

- `api/internal/service/effective_date_test.go`: valid declared date precedence, legacy fallback, half-open bounds, July-created-in-August proof, and invalid/reversed ranges.
- `api/internal/db/migrations_test.go`: legacy backfill filter shape.
- `api/internal/model/goal_test.go`: every predefined/custom type direction, legacy defaults, civil-date statuses, achieved/cancelled behavior.
- `api/internal/service/goal_actions_contract_test.go`: idempotency key bounds/stability, fingerprints, and direction/type validation.
- `api/internal/service/insights_aggregation_contract_test.go`: exact `$facet` coverage, no pre-aggregation metric caps, full repeated grouping before display limits, exact all/period goal groups, and unbounded all-time pipeline shape.
- `api/internal/repository/unit_of_work_test.go`: existing Mongo session context is joined rather than nested.
- `api/internal/handler/query_test.go`: explicit `allTime=true` parsing and invalid/mixed period rejection.
- `api/internal/router/feature_routes_test.go`: additive goal action route contracts.
- `web/src/pages/finance-writes/BudgetGoalDialogs.test.tsx`: calendar controls, visibility select, BeUI checkbox, commitment types, and inline contact creation.
- `web/src/pages/finance/dashboard-model.test.ts`: deterministic analytics and empty arrays.
- `web/src/pages/finance/period-selector.test.tsx`: period options, previous/next/current month navigation, and all-time selection.
- `web/src/pages/finance/home-transactions.test.tsx`: all-time request, exact account/goal drilldown propagation, goal/insight/account/type sections, URL-selected transaction details, missing-ID handling, empty-state and responsive safety coverage.
- `web/src/pages/finance/budgets-goals.test.tsx`: URL-selected goal details, contact/creator/completion/day-state/history rendering, linked-transaction navigation, keyboard selection, progress and transaction confirmation with declared dates and idempotency keys, duplicate-click prevention, link/reschedule/cancel/reopen actions, and safe missing-ID handling.

Commands run after the final source changes:

- `cd D:\Codeverse\ledgerly\api && gofmt -l` over the changed Go files -- no files reported.
- `cd D:\Codeverse\ledgerly\api && go test ./...` — all packages passed.
- `cd D:\Codeverse\ledgerly\api && go test ./internal/service -run 'Test(CreateGoalTransaction|Goal.*Fingerprint|DashboardAggregation|DashboardGoalAggregation|DashboardAllTime|GoalVisibilityFilter)' -count=1` — focused atomic/idempotency/aggregation tests passed.
- `cd D:\Codeverse\ledgerly\web && npx vitest run src/pages/finance/home-transactions.test.tsx src/pages/finance/period-selector.test.tsx src/pages/finance/dashboard-model.test.ts src/pages/finance/data.test.ts src/pages/finance-writes/BudgetGoalDialogs.test.tsx src/pages/finance/budgets-goals.test.tsx` -- focused finance/goal files passed: 6 files, 40 tests.
- `cd D:\Codeverse\ledgerly\web && npm run test:run -- --reporter=dot` -- 46 files, 298 tests passed.
- `cd D:\Codeverse\ledgerly\web && npm run typecheck` — passed.
- `cd D:\Codeverse\ledgerly\web && npm run lint` -- passed with one existing Fast Refresh warning in `home-transactions.tsx`.
- `cd D:\Codeverse\ledgerly\web && npm run build` -- Vite production build passed.

## Final correction verification

- `cd D:\Codeverse\ledgerly\api && go test ./...` passed after exact aggregation, atomic completion, adjustment support, and fingerprint changes.
- `cd D:\Codeverse\ledgerly\api && go test ./internal/service -run 'Test(CreateGoalTransaction|Goal.*Fingerprint|DashboardAggregation|DashboardGoalAggregation|DashboardAllTime|GoalVisibilityFilter)' -count=1` passed: 21 focused test events.
- `cd D:\Codeverse\ledgerly\api && go test ./internal/handler -run 'TestDashboardAllTimeQuery' -count=1` passed: 1 focused test.
- `cd D:\Codeverse\ledgerly\api && go test ./internal/repository -run 'TestWithTransactionJoinsAnExistingSessionContext|TestTransactionSourceDeltaValidation' -count=1` passed: 9 focused test events.
- `cd D:\Codeverse\ledgerly\web && npm run check` passed: 46 files, 298 tests, TypeScript, oxlint (one existing Fast Refresh warning), and Vite build.
- `cd D:\Codeverse\ledgerly\web && npx vitest run src/pages/finance/home-transactions.test.tsx src/pages/finance/period-selector.test.tsx src/pages/finance/dashboard-model.test.ts src/pages/finance/data.test.ts src/pages/finance-writes/BudgetGoalDialogs.test.tsx src/pages/finance/budgets-goals.test.tsx` passed: 6 files, 40 tests.

## Known limitations and remaining risk

The production exact aggregation response intentionally limits presentation-only recent/highlight/repeated rows; their totals and ranking are calculated before those display limits. Opening/closing historical balances remain nullable because account balance snapshots and a complete immutable balance ledger are not available to reconstruct those values safely. Goal and transaction detail deep links perform an authorized lookup after the list query and clear inaccessible or deleted IDs without exposing data. Browser visual verification could reach only the unauthenticated local `/login` route because no test credentials/session were available; the responsive, keyboard, reduced-motion, light/dark, and empty/error behavior was verified through the existing DOM/unit/type/lint/build suite, not by an authenticated rendered dashboard session.

## Attributable implementation files

Backend: `api/internal/model/models.go`, `api/internal/model/goal.go`, `api/internal/model/goal_test.go`, `api/internal/service/date_range.go`, `transactions.go`, `insights.go`, `insights_aggregation.go`, `planning.go`, `record_actions.go`, `deletions.go`, `goal_actions.go`, `contacts.go`, `export.go`, `finance_helpers.go`, focused finance/date/goal tests, `api/internal/handler/finance.go`, `api/internal/handler/transaction_date_contract_test.go`, `api/internal/handler/query_test.go`, `api/internal/router/router.go`, `api/internal/router/feature_routes_test.go`, `api/internal/db/indexes.go`, `index_order_contract_test.go`, `migrations.go`, migration tests, `api/internal/repository/store.go`, `transaction.go`, `unit_of_work.go`, and repository tests.

Frontend: `web/src/domain/types.ts`, `web/src/lib/date-only.ts`, `web/src/pages/finance/data.ts`, `dashboard-model.ts`, `period-selector.tsx`, `home-transactions.tsx`, `home-transactions.test.tsx`, `budgets-goals.tsx`, `budgets-goals.test.tsx`, `record-action-drawer.tsx`, `record-edit-dialogs.tsx`, `web/src/pages/finance-writes/BudgetGoalDialogs.tsx`, related tests, and the scoped dashboard/goal-detail additions in `web/src/index.css`.

No commit or push was created. Existing unrelated changes, generated artifacts, and other documentation were preserved.
