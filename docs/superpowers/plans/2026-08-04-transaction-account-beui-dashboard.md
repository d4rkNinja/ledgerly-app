# Transaction Date, Account Management, BeUI, and Home Implementation Plan

**Goal:** Add timezone-safe transaction dates, complete ledger-safe account management, remove native form controls, and deliver a filtered/exportable chart-led Home dashboard.

## 1. Backend contracts (TDD)

- Add failing service tests for past/future/missing/invalid transaction dates and UTC date boundaries.
- Remove the future-date restriction while keeping explicit required-date validation at HTTP boundaries.
- Extend account model/input validation with bank metadata and active/inactive state; keep current balance derived.
- Add tests for edit permission, inactive accounts, empty-account archive, archive with transactions, and history preservation.
- Add date-range parsing/tests for dashboard and CSV export while preserving existing month/all-data contracts.

## 2. Shared frontend controls (TDD)

- Add date-only helpers and tests for local-today creation, UTC serialisation, UTC formatting, and invalid values.
- Build a BeUI-style DatePicker calendar with keyboard, screen-reader, focus, mobile, error, and viewport behaviour tests.
- Replace every native select/date control in transactions, budgets, goals, and collaboration.

## 3. Transaction and account flows (TDD)

- Add date to transaction create/edit state, validation, demo payload, and live payload.
- Extend account create/edit/detail models and forms; filter inactive accounts from new-entry selectors.
- Keep archive confirmation explicit about preserved transactions and invalidate all financial views immediately.
- Test loading, validation, API errors, permissions, edit, archive, and cancel.

## 4. Home filters, export, and layout (TDD)

- Add Today/This week/This month/Custom date filters backed by URL and API range queries.
- Add export actions for selected range, this month, and all accessible data.
- Place available balance first, operational content next, and all analytics charts last.
- Replace the monthly-summary card with income/spending/net chart content and preserve interactive cashflow details.

## 5. Verification

- Run focused red/green tests during each change.
- Run `go test ./... -count=1`, `go vet ./...`, and the complete web check.
- Use the Android emulator QA skill to validate phone date-picker/dropdown/account/Home flows and viewport overflow.
