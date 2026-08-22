# Changelog

All notable changes to Ledgerly are recorded in this file. The format follows
Keep a Changelog, and the project uses an Unreleased section until a versioned
release is cut.

## [Unreleased]

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
