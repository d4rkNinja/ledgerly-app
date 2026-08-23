# Changelog

All notable changes to Ledgerly are recorded in this file. The format follows
Keep a Changelog, and the project uses an Unreleased section until a versioned
release is cut.

## [Unreleased]

### Added

- **Docker deployment stack.** A root Compose file now runs the whole
  application — MongoDB as a single-node replica set, the API as a distroless
  container, and the web client served by an nginx proxy that forwards
  `/api/v1` same-origin. New `api/Dockerfile` and `web/Dockerfile` builds are
  multi-stage; the README documents self-hosting and what a hardened install
  must still provide.
- **Insights period comparison.** The live Insights page now compares the
  selected period with the previous equivalent period: income, spending, and
  net cash flow each show an up/down percentage badge (spending reductions
  read positively), and category rows note whether spending rose, fell, is
  new, or did not recur. Comparisons render only when the previous-period
  report loads; a failed lookup never blocks the main summary.
- **Insights period selection.** The Insights page gains the same reporting
  period selector as the dashboard — this/last/custom month, custom range,
  this week, last 7 days, and this year — so any bounded period can be
  summarised and compared against its preceding equivalent.
- **CI checks.** A GitHub Actions workflow now runs API checks (formatting,
  vet, tests, build) and web checks (tests, typecheck, lint, build) on every
  pull request and push to main.

## [0.2.0] - 2026-08-23

### Added

- **Bill management.** Bills are no longer read-only: create recurring bills
  manually (name, amount, frequency, next due date, autopay), edit them, or
  stop tracking them. Deleting a bill deactivates it — history, reports, and
  audit evidence stay intact.
- **Recurring payment detection.** Ledgerly now scans the last 180 days of
  your entries for patterns: at least three occurrences of a similar merchant
  at a steady interval with one dominant amount (weekly, fortnightly,
  monthly, quarterly, or yearly). Detected patterns appear on the Bills page
  with their cadence and estimated next due date.
- **Approval required.** Detection never writes anything by itself. You choose
  "Add as bill" to turn a pattern into a tracked bill, or dismiss it forever.
  Accepted bills remember which suggestion they came from, so renaming the
  bill later does not resurrect the suggestion; already-tracked merchants are
  never proposed twice.
- A new `manage_bills` permission gates bill creation and editing
  (owner/administrator/finance manager); members and viewers keep read access.

## [0.1.0] - 2026-08-23

### Added

- **Statement import and reconciliation.** Upload a bank/card CSV, choose an
  account, and map columns (date format, signed/expense-first/debit-credit
  amounts, notes/reference). Ledgerly parses rows server-side, flags exact
  duplicates, likely duplicates, and probable matches against your existing
  entries, and lets you resolve each row (or in bulk) by adding, ignoring, or
  linking it. Committing runs in one atomic transaction; created entries carry
  import provenance and cleared state without exposing internal identifiers,
  and retrying a commit cannot duplicate rows. Accounts gain a reconciliation
  view comparing a statement's closing balance with the ledger as of a
  statement date; completed reconciliations are kept as permanent evidence,
  and differences must be resolved or explicitly acknowledged.
- **Automation rules.** Create rules such as "if the description contains UBER
  and it is an expense, set category Transportation and rename to Uber."
  Conditions combine with AND; rules run once per transaction in priority
  order during statement-import commits and transaction creation. Rules can be
  tested against recent history before saving, paused, reordered by priority,
  and run manually. Every automated change is recorded on the affected entry
  ("Automated by …"), and manual runs never move money between accounts.
- **Cash-flow forecast.** A new Forecast page projects balances 7/30/90 or a
  custom number of days ahead from current balances, recurring bills expanded
  across the horizon, typical daily spending/income from the last 90 days, and
  planned one-off items you add. Scenario toggles change only the projection.
  The lowest projected balance, first negative date, and every day's events
  are shown with a "How this was calculated" explanation.
- **Attention feed.** The home screen now shows compact actionable items —
  overdue bills, past-due goals, budgets near/over limit, pending expense
  claims, draft imports awaiting review, and unresolved reconciliation
  differences — each linking to where action can be taken.
- **Search quick actions.** Workspace search (⌘K) now offers command-style
  quick actions: add an expense, add income, transfer between accounts,
  import a statement, open the forecast, and open this month's report.

### Changed

- Transaction details now show provenance: "Statement import", reconciled
  status, and which automation rule changed what.
- Transaction entry remembers your last-used account and recently used
  categories (per entry type) on this device, so common flows need fewer taps.
- The navigation rail groups Forecast, Statement import, and Automation into
  the money workflow; accounts adds an Import statement shortcut.

## [0.0.2] - 2026-08-20

### Added

- Every transaction now has an easy-to-find numeric ID, with copy actions in
  transaction lists, details, recent activity, editing, sharing, and exports.
- You can use automatically generated IDs or enter your own, and configure the
  next number and digit length separately for expenses, income, transfers, and
  split transactions.
- Categories can now be added, renamed, reordered, enabled, disabled, deleted,
  or replaced from transaction entry and Settings → Transactions.
- Transaction search now combines ID, type, category, account, contact,
  merchant, date, and amount filters.
- Split transactions can be assigned to active workspace members with exact
  share-total validation.
- Shared workspaces now include reporting-period reviews, correction cycles,
  change summaries, and a privacy-aware transaction history showing who changed
  what and when.

### Changed

- The entire application now uses a mobile-first layout that progressively
  adapts to tablets and desktops, with consistent light and dark themes.
- Transaction IDs show `Auto Generated` directly in the ID field by default.
  Typing creates a custom ID; clearing the field restores automatic generation.
- Important actions such as Add Category and ID management are now visible in
  transaction forms, Settings, global search, and help guidance.
- The interface now uses freshly installed official BeUI components for more
  consistent controls, interactions, and visual styling.
- Transaction forms now use the latest workspace categories from the server.
- CSV exports respect the active filters, use readable names and amounts, and
  download with a month-specific filename.

### Fixed

- Removed horizontal overflow and hard-to-reach navigation across public and
  signed-in pages at mobile, tablet, and desktop sizes.
- Form labels, validation messages, invalid states, and first-error focus now
  work consistently, including with keyboard and assistive technology.
- Previously inactive Help and Insights actions now open useful destinations,
  and demo activity correctly identifies its creator.
- Password recovery no longer claims to send an email when no delivery service
  is configured.
- Frontend actions now match the available backend routes and methods, reducing
  failed or incomplete API interactions.
- Backdated and date-only transactions stay in the intended reporting month
  across time zones and daylight-saving changes.
- Exact transaction-ID search, date ranges, split filtering, export labels, and
  browser download filenames now behave consistently.
- Private transaction changes remain hidden from people who can no longer view
  them, while financial totals retain exact precision.
