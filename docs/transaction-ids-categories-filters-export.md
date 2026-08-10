# Transaction IDs, categories, filters, and CSV export

Implementation record for the workspace-scoped transaction numbering,
configurable categories, query, and export work completed on 2026-08-10.

## Transaction ID contract

`Transaction.TransactionID` is the user-facing reference. It is a digit-only
string so leading zeroes remain visible; MongoDB `_id` remains the internal
record identifier. IDs have no type prefix. The default sequence starts at
`0001`, uses a minimum width of four, and grows without truncation after the
configured width is exceeded.

The four user-facing scopes are `expense`, `income`, `transfer`, and `split`.
Internal adjustment records use the expense scope, refunds and reimbursements
use the income scope, and any record with current split rows uses the split
scope. Each scope is independent within a workspace.

Automatic allocation uses an atomic MongoDB counter update. It never derives a
number by reading the latest transaction. Manual numeric IDs are allowed when
requested explicitly. A unique manual number below the current high-water mark
does not rewind the counter; a higher manual number advances it. Deleted IDs are
not reused automatically.

## Sequence settings

The `transaction_sequences` collection stores one row per workspace and
transaction type:

- `auto_generate`
- `next_number`
- `minimum_digits`

The row ID is deterministic and a unique `(workspace_id, transaction_type)`
index also protects the scope. The API returns a formatted preview and the
minimum available next number. Lowering `next_number` below the safe high-water
mark is rejected with a field-level validation error.

Routes under `/api/v1/workspaces/{workspaceID}`:

| Method | Path | Contract |
| --- | --- | --- |
| `GET` | `/transaction-sequences` | Return all four settings, creating defaults when absent |
| `PATCH` | `/transaction-sequences/{transactionType}` | Update auto-generation, next number, and minimum digits safely |

## Migration and indexes

Startup backfills only transactions that do not already have a user-facing ID.
Rows are ordered by `occurred_at`, then `created_at`, then `_id`, and numbered
independently per workspace and scope. The migration also raises counters to the
observed high-water mark. Re-running it does not renumber existing rows.

The backfill runs before the partial unique transaction-ID index is created.
Relevant indexes are:

- unique partial `(workspace_id, sequence_scope, transaction_id)`;
- lookup `(workspace_id, transaction_id)`;
- unique sequence `(workspace_id, transaction_type)`;
- unique category `(workspace_id, transaction_type, normalized_name)`; and
- category ordering `(workspace_id, transaction_type, sort_order, name, _id)`.

## Category contract

`transaction_categories` contains workspace-owned definitions for all four
transaction modes. Defaults are lazily seeded as normal rows and can be renamed,
reordered, disabled, or deleted under the same rules as custom categories.
Names are unique case-insensitively within a workspace and transaction type.

Transactions retain the category name as a historical snapshot. A rename
migrates matching snapshots only within the same workspace and mode. An unused
category can be deleted directly. A used category must either remain disabled
or be deleted with an active replacement from the same mode. Disabled category
snapshots remain valid on edits but are not accepted for new selections.

Routes under `/api/v1/workspaces/{workspaceID}`:

| Method | Path | Contract |
| --- | --- | --- |
| `GET` | `/transaction-categories?transactionType=` | List ordered category definitions and usage counts |
| `POST` | `/transaction-categories` | Create a category |
| `PATCH` | `/transaction-categories/{categoryID}` | Rename or update active state and optional metadata |
| `DELETE` | `/transaction-categories/{categoryID}` | Delete unused or replace a used category |
| `POST` | `/transaction-categories/reorder` | Persist a complete order for one mode |

## Transaction query and export

The list and CSV export paths share one backend query contract. Supported
fields are `transactionId`, `search`, `vaultId`, `accountId`, `contactId`,
`type`, `category`, `merchant`, `minAmountMinor`, `maxAmountMinor`, `from`, and
`to`. The dedicated ID field is exact. General search safely escapes regular
expression characters and supports partial IDs; an exact ID lookup is performed
first so it cannot be hidden by the prefix result limit.

The web form accepts major-unit amount bounds, validates at most two decimal
places, and converts each value once to integer minor units. Date-only bounds
are civil UTC dates, and the `to` date is inclusive.

`GET /api/v1/workspaces/{workspaceID}/export.csv` emits transaction rows only.
It includes the user-facing transaction ID, display names for accounts and
contacts, major-unit amounts, escaped UTF-8 values with a BOM, declared and
audit dates, and no raw MongoDB IDs. `Content-Disposition` supplies a filename
such as `ledgerly-transactions-2026-08.csv`; CORS exposes that header to the
browser.

Payment method is not stored on the current transaction model and is therefore
not invented as a query or CSV field.

## Frontend behavior

Settings → Transactions contains responsive ID & Sequence and Categories tabs.
Transaction create/edit forms load live categories, retain a disabled historical
selection while editing, and support automatic or manual transaction IDs. IDs
are rendered in existing transaction reference surfaces with an accessible copy
action.

The live split form loads active workspace members only while open, accepts
`{memberEmail, amountMinor}` shares, requires at least one positive share, and
requires the exact minor-unit total. Pending and removed members are excluded.

## Verification

Automated coverage includes sequence independence, custom starts and widths,
manual duplicates, no reuse after deletion, migration ordering/idempotency,
index contracts, categories for every mode, filter composition, exact-first
search, CSV serialization, dashboard transaction IDs, sharing, settings, and
split-entry behavior.

Final verification commands:

- `cd api && go test ./... -count=1`
- `cd api && go vet ./...`
- `cd web && npm run check`
- `git diff --check`

An isolated MongoDB replica-set run also verified concurrent allocation, manual
high-water advancement, deletion non-reuse, migration restart safety, category
replacement, filtered export, and transaction-date month attribution. Desktop
and 390-pixel browser flows were checked without console errors.

## Known boundary

Category validation currently occurs before the financial repository resolves
idempotency and opens its MongoDB transaction. A category renamed or disabled
between an original commit and a later retry can cause that retry to fail
validation, and a simultaneous category mutation can race a create. Stored
category snapshots keep committed history readable. Eliminating this narrow
edge requires transactional category versioning or moving category validation
into the financial unit of work.
