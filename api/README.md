# MoneyTracking Go API

Production-oriented Go 1.26.5 and MongoDB API for personal, family, and office finance. The backend owns identity, tenant resolution, permissions, private-vault visibility, monetary precision, idempotency, and audit history; clients cannot override those controls.

## Run locally with the React client

From the workspace root, start the API in one terminal:

```bash
cd api
cp .env.example .env
docker compose up -d --wait
set -a; . ./.env; set +a; go run ./cmd/api
```

Then start the Vite client in a second terminal:

```bash
cd web
npm install
npm run dev
```

The client uses relative `/api/v1` requests, which the Vite development server
proxies to `http://127.0.0.1:8080` by default. The development CORS allowlist
includes both `http://localhost:5173` and `http://127.0.0.1:5173` for direct
browser-to-API requests. Keep deployed origins explicit; credentialed CORS does
not use a wildcard. API startup requires an explicit `APP_ENV`; staging and
production additionally fail unless both
`CORS_ALLOWED_ORIGINS` and `MONGO_URI` are explicit, so localhost development
defaults cannot be enabled accidentally.

Seed realistic development data (requires an explicit `APP_ENV=development`):

```bash
cd api
set -a; . ./.env; set +a; go run ./cmd/seed
```

The canonical reusable QA login is `ananya@example.test` /
`MoneyTracking!2026` (Android app PIN: `246810`). Do not register a new account
for routine QA. The seed uses fixed IDs and safely tolerates duplicate inserts,
so rerunning it keeps the same deterministic records instead of creating random
test users. Other fixed users exist only as collaboration/permission fixtures;
Ananya is the interactive test identity.

Verify:

```bash
gofmt -w cmd internal
go test ./...
go test -race ./...
go vet ./...
go build ./...
```

MongoDB must run as a replica set because transaction creation atomically inserts the immutable financial record, claims its idempotency key, and adjusts account balances. Startup and `/ready` inspect the Mongo topology and reject a standalone server that cannot execute those transactions. The included Compose file initialises a loopback-only single-node development replica set.

## Architecture

```text
cmd/api        dependency wiring and graceful shutdown
cmd/seed       development-only deterministic sample data
internal/model central domain and permission vocabulary
internal/handler domain-grouped HTTP handlers, decoding, auth context, safe envelopes
internal/service domain-grouped validation, tenancy, RBAC, workflows, reporting
internal/repository generic persistence, normalized errors, atomic Mongo transactions
internal/db     Mongo connection and deterministic production index definitions
internal/router route graph, trusted-proxy handling, CORS, logging, security headers
```

Amounts are signed or unsigned `int64` minor units according to the field contract (for example INR 12.99 is `1299`). Every financial record stores its ISO 4217 currency. User and owner IDs are never accepted by mutation DTOs; the actor always comes from the bearer session.

Workspace dashboard and report totals are denominated in the workspace currency.
Accounts and transactions in other currencies remain individually accessible
but are never arithmetically combined without a future conversion snapshot.
Vault and account balances are separate ledger dimensions: a vault tracks an
allocation/envelope while an account tracks a funding source. Their opening
balances are intentionally independent, and a categorized transaction adjusts
both atomically; a vault balance is not defined as the sum of child accounts.

## Core API

All paths are under `/api/v1`. Protected routes require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | Create or authenticate an account |
| POST | `/auth/logout`, `/auth/logout-all` | Revoke sessions |
| GET | `/auth/sessions`, `/me` | Session/device list and profile |
| GET/POST | `/workspaces` | List memberships or create a workspace |
| GET/POST | `/workspaces/{workspaceID}/vaults` | Visible vaults or create a vault |
| GET/POST | `/workspaces/{workspaceID}/accounts` | Visible accounts or create one |
| GET/POST | `/workspaces/{workspaceID}/transactions` | Filtered history or atomic mutation |
| GET | `/workspaces/{workspaceID}/transaction-sequences` | Read expense, income, transfer, and split numbering settings |
| PATCH | `/workspaces/{workspaceID}/transaction-sequences/{transactionType}` | Configure one transaction sequence safely |
| GET/POST | `/workspaces/{workspaceID}/transaction-categories` | List or create configurable transaction categories |
| PATCH/DELETE | `/workspaces/{workspaceID}/transaction-categories/{categoryID}` | Update, disable, replace, or delete a category safely |
| POST | `/workspaces/{workspaceID}/transaction-categories/reorder` | Persist the complete category order for one transaction type |
| GET | `/workspaces/{workspaceID}/export.csv` | Export the authorized, filtered transaction result as CSV |
| GET | `/workspaces/{workspaceID}/bills` | Visible bills due today through the next 30 UTC calendar days |
| GET/POST | `/workspaces/{workspaceID}/budgets` | Budgets |
| GET/POST | `/workspaces/{workspaceID}/goals` | Goals |
| POST | `/workspaces/{workspaceID}/invitations` | Issue expiring invitation |
| POST | `/invitations/accept` | Accept invitation for signed-in email |
| GET/POST | `/workspaces/{workspaceID}/expense-claims` | Approval queue and submission |
| PATCH | `/workspaces/{workspaceID}/expense-claims/{claimID}/review` | Approve/reject/request correction |
| GET | `/workspaces/{workspaceID}/dashboard` | Accessible financial summary |
| GET | `/workspaces/{workspaceID}/search?q=` | Permission-filtered search |
| GET | `/workspaces/{workspaceID}/reports/summary?from=&to=` | Factual period report |
| GET | `/workspaces/{workspaceID}/audit` | Immutable sensitive action history |
| GET | `/notifications` | Current user's notifications |
| GET | `/notifications/unread-count` | Current user's unread notification count |
| PATCH | `/notifications/{notificationID}/read` | Mark one owned notification as read |
| PATCH | `/notifications/read-all` | Mark all current user's unread notifications as read |

Transaction creation requires an `Idempotency-Key` header (8–128 characters).
A retry with the same key and request resolves to the first committed response,
including when the server supplied an omitted `occurredAt`. Each workspace has
independent numeric sequences for expense, income, transfer, and split entries.
Automatic IDs default to `0001`; clients may explicitly request a unique manual
numeric ID. Sequence allocation is atomic and does not reuse deleted IDs.

Pagination uses bounded `limit` and `skip`. The transaction list and CSV export
share filters for `transactionId`, `search`, `vaultId`, `accountId`, `contactId`,
`type`, `category`, `merchant`, `minAmountMinor`, `maxAmountMinor`, `from`, and
`to`. The dedicated transaction-ID filter is exact, while general search can
match a safe partial numeric ID. Date-only `to` values are inclusive.

Category definitions are scoped by workspace and transaction type. Defaults are
seeded lazily as ordinary editable rows. Transactions retain a category-name
snapshot, so disabling or replacing a category does not make historical records
unreadable.

Notification read mutations are bodyless. Marking one notification returns the
updated notification object. Marking all returns
`{"updatedCount":3,"readAt":"2026-07-29T12:00:00Z"}`; both operations are
scoped to the authenticated user, and an unowned notification is reported with
the same `not_found` response as a missing notification. The unread-count route
returns `{"unreadCount":3}` and applies the same authenticated-user scope.

Errors never expose database details:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "request validation failed",
    "fields": {"amountMinor": "must be greater than zero"}
  }
}
```

## Security and privacy

- Passwords use salted PBKDF2-HMAC-SHA256 with 210,000 iterations.
- Only random bearer tokens leave the server; SHA-256 token hashes are persisted.
- Session and idempotency records have TTL indexes.
- Authentication and invitation attempts are process-rate-limited.
- All protected data operations require workspace membership plus a server-side permission.
- Private vaults and their accounts/transactions are visible only to their owner.
- Bill privacy fails closed: a record must be explicitly workspace-visible or owned by the requesting actor.
- Search and reports first derive the actor's accessible vault set.
- Invitation tokens are random, expiring, single-use values bound to the
  intended account email. Consuming a securely delivered token atomically
  verifies that matching account email.
- Expense claims require a workspace-visible vault so a second authorized actor can review them; submitters cannot approve their own pending claim.
- CORS is an explicit environment allowlist; wildcard credentials are never enabled.
- Staging and production require explicit `CORS_ALLOWED_ORIGINS` and `MONGO_URI` values and never inherit localhost deployment defaults.
- Registration, workspace provisioning, invitation consumption, and financial mutations use Mongo transactions.
- Critical audit events commit atomically with their associated mutation.
- Financial summaries use Mongo aggregation and do not silently truncate high-volume periods.
- Financial mutations update account and vault balances atomically and enforce monetary bounds.
- Startup rejects explicitly invalid limits, timeout values, origins, and trusted-proxy entries.
- Pending invitations and idempotency keys are protected by unique indexes;
  startup expires stale invitations and deterministically cancels legacy
  duplicates before building the invitation index.
- Expired pending invitations are marked before replacement, and acceptance revalidates the inviter's current authority.

Role defaults are defined centrally in `internal/model/permissions.go`; a membership may add explicitly granted custom permissions. Owner, administrator, finance manager, approver, member, and viewer defaults cover workspace, vault, transaction, budget, goal, approval, reimbursement, export, and audit operations.

## Current boundaries

The cohesive implemented slice covers authentication/session management,
workspace tenancy, RBAC, private/shared vaults, accounts, atomic
transactions/transfers, configurable transaction sequences and categories,
budgets, goals, invitations, expense review, notifications, audit, dashboard,
search, filtered CSV export, indexes, and development data.

Receipt object storage, email/SMS delivery, OAuth, password-reset delivery, recurring-payment execution, data-export workers, file malware scanning, push delivery, bank synchronisation, and multi-currency conversion require external providers and are intentionally not faked. Production deployments should use a multi-node Mongo replica set, an external distributed rate limiter, TLS termination, secret management, and background job infrastructure.

Production must deliver invitation tokens to the intended mailbox through a
trusted email adapter. Development may hand the returned token to the intended
recipient; accepting it consumes the bearer capability and verifies the
matching account atomically.
