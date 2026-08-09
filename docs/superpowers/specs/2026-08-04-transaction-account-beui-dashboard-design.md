# Transaction dates, account management, and filtered Home design

## Decisions

- Treat a transaction date as a calendar date chosen by the user. The client serialises `YYYY-MM-DD` as midnight UTC and every date-only display groups/formats in UTC, preventing device timezone shifts.
- Creation defaults to the device's current local calendar date. Empty or invalid values are rejected by both client and API. Past and future dates are accepted.
- Keep account removal ledger-safe: DELETE archives the account and preserves every associated transaction, balance-history record, report, and audit record. The confirmation states this explicitly.
- Extend account metadata without changing route shapes: bank name, masked identifier, colour, icon, notes, and active/inactive status. Current balance remains derived and read-only; opening-balance edits rebase the current balance through the existing atomic service logic.
- Inactive accounts remain manageable and visible in account history but cannot be selected for newly-created transactions. Archived accounts remain excluded from active account lists.
- Replace native selects and date inputs with the local BeUI-style Select and a reusable calendar/date-picker built on the existing Popover/Dialog primitives. It supports keyboard navigation, labelled errors, focus restoration, disabled/loading states, and viewport-safe mobile presentation.
- Home starts with available-across-accounts, then filter/export actions and operational content. Analytics charts are grouped at the end. The old monthly-summary card is replaced by an income-versus-spending chart.
- Dashboard and CSV export accept optional inclusive `from`/`to` date keys. The API converts them to `[from 00:00 UTC, day-after-to 00:00 UTC)`. Existing `month=YYYY-MM` remains compatible.

## Verification

- Go service/handler tests cover date validation and future/past dates, UTC boundaries, account metadata, permissions, inactive-account creation guards, archival preservation, cancellation semantics at UI level, and filtered export/dashboard ranges.
- Vitest covers date-picker keyboard/mobile behaviour, transaction create/edit payload dates, account edit/archive flows, native-control removal, Home presets/export/error states, and UTC-safe formatting.
- Full Go and web checks run before Android emulator QA at phone widths.
