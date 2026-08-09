# Finance record actions and mobile dashboard design

## Purpose

Make finance records easy to inspect and act on without crowding lists, make the Home dashboard genuinely useful for a selected month, and ensure fixed mobile navigation never obscures content.

## Scope and decisions

### Record details and actions

Introduce one responsive `RecordDetailSurface` for transactions, accounts, budgets, and goals. It is a right-side drawer on desktop and an accessible, scrollable bottom sheet on touch-sized screens. A record card or list row is the primary tap target; compact lists do not expose direct share or delete controls.

Each surface shows readable, labelled record data and exposes only actions the current workspace permissions allow:

- Transactions: full details, creator, creation time, edit, share, and delete.
- Accounts: balance, account properties, edit, share, and archive. The destructive action is labelled `Archive account` because accounts with historic entries must remain in the ledger; archived accounts disappear from active lists but retain financial history.
- Budgets and goals: full planning data, edit, share, and delete.

Direction is communicated with one small, colour-coded income/expense marker and accessible text. Amounts use neutral, tabular figures; duplicate inline arrows and icon-button actions are removed. Tapping a related transaction inside any surface opens the transaction detail surface.

### Backend contract

Keep collection-list contracts stable. Add record-specific routes under the existing workspace resource tree:

- `GET`, `PATCH`, `DELETE`, and `POST /share` for transactions, accounts, budgets, and goals.
- Detail routes return the complete record state required for the drawer and edit form rather than expanding every list response.
- Share routes require `export_data`, return a sanitised title/text payload, and record an audit event. The client opens the OS share sheet; no public URL, internal identifier, token, or private note is included.

Authorisation remains server-enforced:

- Transactions use existing edit-own/edit-all and delete-own/delete-all checks. A transaction edit changes balances atomically: reverse the original financial effect, validate the proposed record, apply the new effect to each affected account and vault, persist the record, and write one audit event.
- Account updates and archival require `edit_vault`; immutable currency and historical ownership are not silently rewritten. Changing an opening balance adjusts the current balance atomically.
- Budget and goal actions require their existing management permissions.
- Detail reads respect vault, account, and private-record visibility filters.

### Monthly Home dashboard and chart interaction

Home receives a direct, server-backed monthly summary with a current-month default and previous/next month controls. The selected month updates the summary totals, category data, daily cashflow, and entry navigation. The selection is represented in the route query so it can be shared or revisited.

The cashflow chart changes from a decorative image to accessible buttons. Selecting a daily bar opens:

- The selected date and income, spending, and net totals.
- A loading, empty, and error state.
- The latest accessible transactions for that date, with creator and amount information.
- A `View all` action that opens Entries filtered to the selected day.

Desktop uses an anchored popover. Mobile uses a bottom sheet so it remains reachable above the navigation dock. The filtered transaction request reuses the existing permission-scoped transaction query rather than trusting client-side aggregate data.

The dashboard endpoint accepts a validated month filter and calculates all aggregate results from the selected UTC calendar-month range. It does not return hidden or private entries.

### Responsive layout

Replace the hard-coded mobile content clearance with shared dock geometry tokens. The root content stage, toast placement, chart popover/sheet, and any page-end action area derive their bottom clearance from the dock size, its offset, and safe-area inset. The same contract applies across Home, Entries, Accounts, Budgets, Goals, Bills, Insights, and Settings.

Mobile grids collapse without horizontal overflow. Charts remain scrollable within their own chart region when a month has many active days; page scrolling remains available, and every tap target is at least 44px.

## Error handling

The UI keeps the detail surface open after failed updates, displays field errors beside the affected controls, and preserves unsaved values. Delete/archive confirmations explain the effect. A forbidden response removes the unavailable action and displays a clear permission message. A stale or missing record closes the surface only after a visible notice and data refresh.

## Verification

- Go service and handler tests cover scoped detail reads, validation, permissions, audit records, transaction rebalance edits, account archival, budget/goal mutation, and sanitised shares.
- Frontend tests cover action visibility, detail open/close behaviour, mutation/error states, monthly selection, filtered chart-popover transactions, keyboard operation, and query navigation.
- Responsive checks cover 320px, 360px, 390px, and 412px widths with safe-area navigation.
- Android emulator QA validates the Home summary, cashflow detail surface, record actions, scrolling below the dock, and release startup against the deployed API.
