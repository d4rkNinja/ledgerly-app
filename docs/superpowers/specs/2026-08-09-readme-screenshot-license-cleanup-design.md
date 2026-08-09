# README Screenshot and License Cleanup Design

**Date:** 2026-08-09

**Status:** Approved by the user

## Goal

Remove every product screenshot from the repository, preserve the demonstrated
capabilities as clear README feature text, and update the README to reflect the
new MIT License accurately.

## Approved scope

- Delete the complete `## Screenshots` section from `README.md`.
- Delete all six files under `docs/assets/screenshots/`:
  `welcome.png`, `dashboard.png`, `insights.png`, `add-income.png`,
  `transaction-date.png`, and `saved-names-light.png`.
- Do not generate or substitute any screenshots.
- Keep the Ledgerly logo and real status/technology badges.
- Split the Finance feature copy so categorized entries, user-selected
  transaction dates, and reusable transaction names remain explicit and
  independently scannable.
- Add an MIT badge linked to `LICENSE`.
- Replace the outdated no-license warning with a precise statement: the
  repository is currently private, but the checked-in source is licensed under
  MIT.
- Replace the License section with a link to `LICENSE`, the copyright holder
  and year, the core MIT permissions, and the warranty disclaimer.
- Update the DarkNinjaSolutions attribution so Ledgerly's distribution terms
  point to the MIT License.

## Content design

The README stays product-first: the feature list carries the functional proof
formerly supplemented by screenshots, then flows directly into Architecture.
No application code, commands, ports, environment variables, or behavior
changes.

The three requested Finance capabilities will be described as:

1. Categorized income, expense, transfer, and split entries with the existing
   contact, notes, privacy, and idempotency fields.
2. User-selected transaction occurrence dates that feed monthly dashboards,
   filters, and reporting.
3. Searchable reusable transaction names that can be created, renamed, and
   deleted.

## Validation

- Confirm `README.md` contains no `docs/assets/screenshots` reference or
  deleted screenshot filename; the design and implementation records may name
  the removed assets for auditability.
- Confirm all six PNG files are deleted and no replacement images are added.
- Confirm every remaining local README link resolves, including `LICENSE`.
- Render the README with GitHub's Markdown API and confirm the document contains
  no product screenshot images.
- Run `git diff --check` and inspect the complete scoped diff.
- Commit and push to `main`, then confirm the remote commit and Gitleaks
  workflow result.
