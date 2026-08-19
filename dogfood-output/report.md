# Dogfood Report: Ledgerly

| Field | Value |
|---|---|
| **Date** | 2026-08-20 |
| **App URL** | http://127.0.0.1:5173 |
| **Session** | ledgerly-qa |
| **Scope** | Every top-level application route, mobile responsiveness, representative desktop layouts, theme switching, and transaction entry |

## Summary

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| **Total unresolved reproducible issues** | **0** |

## Coverage

- Tested Home, Transactions, Accounts, Contacts, Saved names, Budgets, Goals, Bills, Insights, Members, Office expenses, and Settings in the demo workspace at 390 × 844.
- Verified `document.documentElement.scrollWidth === clientWidth` on every route above.
- Captured representative 1440 × 1000 screenshots for Home, Transactions, Settings, and Office expenses.
- Verified dark and light theme rendering on mobile Settings and Home.
- Opened transaction entry at mobile width and verified the single Transaction ID field, `Auto Generated` default, visible ID settings shortcut, and visible Add category shortcut.
- Checked browser page errors after route traversal; no application exceptions were reported.
- Follow-up automated checks cover disabled automatic-ID settings, Android emulator API resolution, and bottom-sheet focus isolation.

## Evidence

Screenshots are stored in `dogfood-output/screenshots/`. This report records the post-fix verification pass; defects found during implementation were fixed and covered by the automated regression suite before this pass.

## Limitations

Live authenticated browser/API integration could not be started because the available local MongoDB listener is a standalone deployment and the API correctly requires a replica set or sharded cluster for transactional writes. Backend handler, router, service, repository, model, database, and configuration tests were used for API verification instead.
