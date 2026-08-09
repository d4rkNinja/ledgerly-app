# Data deletion design

## Scope

Add deliberate deletion flows for workspaces and transactions without weakening
tenant isolation or leaving finance balances out of sync.

## Backend contract

- `DELETE /api/v1/workspaces/{workspaceID}` is owner-only. The service loads the
  workspace and requires the authenticated actor to match `OwnerID`.
- Workspace deletion runs in the store transaction and removes the workspace,
  memberships, vaults, accounts, transactions, planning records, claims,
  invitations, join requests, notifications, and audit records scoped to that
  workspace. It is not a soft delete because the user explicitly requested a
  permanent workspace removal flow.
- `DELETE /api/v1/workspaces/{workspaceID}/transactions/{transactionID}`
  requires `delete_all_transactions`, or `delete_own_transactions` when the
  transaction was created by the actor.
- Transaction deletion runs in the store transaction. It reverses the source
  account and vault balance changes, reverses both accounts for a transfer,
  removes the transaction and its idempotency record, and records a deletion
  audit event. A missing or unauthorized transaction cannot mutate balances.

## Frontend contract

- The workspace switcher exposes “Delete workspace” only for the current
  owner. The dialog requires typing the workspace name before submitting and
  clearly states that all workspace data is permanent.
- After deletion, the app refreshes the workspace list, selects another
  available workspace, or signs out cleanly if no workspace remains.
- The transactions page exposes a delete icon only when the permission allows
  the specific row. The confirmation dialog names the transaction and reports
  server errors without removing the row optimistically.
- Successful transaction deletion invalidates transactions, accounts, vaults,
  dashboard, budget, and insight queries.

## Verification

Add service tests for owner/member authorization, cascade coverage, balance
reversal, and transfer reversal; add web tests for confirmation and mutation
visibility. Run all API, web, script, and type/lint checks, build a release
APK, and exercise create/delete/reopen flows against the deployed API with the
Android QA skill.
