# Changelog

All notable changes to Ledgerly are recorded in this file. The format follows
Keep a Changelog, and the project uses an Unreleased section until a versioned
release is cut.

## [Unreleased]

### Added

- Reviewed member-view and closed shared-workspace reporting-period snapshots
  with explicit scope, currency, civil-date bounds, and IANA-timezone evidence.
- Persistent dashboard markers, cumulative post-review deltas, and paginated
  privacy-aware transaction revision drill-downs with occurrence, available
  creation/edit timestamps, editor attribution, split-change signals, and
  workflow-state history.
- Workspace ledger versions and atomic before/after transaction audits for
  creates, edits, deletes, and category rename/replacement migrations.
- Immutable re-review cycles that preserve earlier checkpoints while resetting
  the latest period marker after corrections have been acknowledged.
- Workspace-scoped numeric transaction IDs with no prefixes and a default
  `0001` format.
- Independent atomic sequences for expense, income, transfer, and split
  transactions, including automatic or manual IDs, configurable next numbers,
  digit widths, previews, and conflict validation.
- Idempotent startup backfill for existing transactions and supporting MongoDB
  uniqueness, lookup, ordering, and sequence indexes.
- Configurable workspace categories for all four transaction modes, with
  default seeding, add, rename, enable/disable, reorder, unused deletion, and
  replacement of categories already in use.
- Settings → Transactions UI for sequence and category management.
- Transaction-ID display and copy actions across transaction list, detail,
  recent activity, edit, share, and export surfaces.
- Production split-transaction entry with active workspace-member shares and
  exact minor-unit total validation.
- Combined transaction filters for ID, type, category, account, contact,
  merchant, date, and amount.

### Changed

- Transaction creation and editing now load category definitions from the API
  instead of relying on permanent frontend arrays.
- CSV export now shares the transaction query contract, respects active
  filters, uses display names and major-unit amounts, emits UTF-8, and returns a
  month-specific filename.
- Dashboard activity exposes transaction IDs, and period verification confirms
  financial totals use the declared transaction date.

### Fixed

- Backdated and date-only transactions now remain in the intended civil
  reporting month across positive and negative UTC offsets and DST changes.
- Private or no-longer-visible transaction revisions are redacted from period
  review details, and revision totals retain exact integer precision.
- Exact transaction-ID workspace search is no longer lost behind a bounded set
  of prefix matches.
- Date-only transaction and export bounds are parsed consistently, with an
  inclusive end date.
- Split and expense filtering now use the current split data rather than an
  immutable numbering scope; CSV type labels follow the same rule.
- Browser clients can read the server-provided export filename through CORS.
