# Changelog

All notable changes to Ledgerly are recorded in this file. The format follows
Keep a Changelog, and the project uses an Unreleased section until a versioned
release is cut.

## [Unreleased]

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
