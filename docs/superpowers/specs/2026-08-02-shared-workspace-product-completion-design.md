# Shared Workspace Product Completion Design

## Goal

Complete the shared-workspace product slice so invitations, member administration, creator attribution, dashboard insights, account editing, and CSV export all use the same authenticated workspace boundaries, while removing biometric-unlock copy and code paths.

## Current context and root cause

The repository contains a Go/MongoDB API under `api/` and a React/TypeScript client under `web/`. The API already has two access capabilities:

- Direct invitations create a hashed, expiring, single-use token at `POST /workspaces/{workspaceId}/invitations`; signed-in recipients redeem it at `POST /invitations/accept`, which atomically creates membership and consumes the invitation.
- Reusable workspace join codes are rotated at `POST /workspaces/{workspaceId}/join-code`; redeeming a code at `POST /workspace-join-requests` creates a pending request that an authorized workspace administrator approves.

The client presents both paths, but the join dialog describes a code as an invitation and the Members page does not load real members. The generic not-found response therefore looks like a broken invitation when the wrong capability or stale request path is used. The implementation will keep both security models, label them distinctly, and make every success response refresh the authenticated workspace list immediately.

## Architecture

1. Add small API response/view models rather than leaking storage models or internal IDs into new UI fields. A workspace member response joins a membership with the corresponding user and pending invitation state; transaction responses include a nested creator summary with name, avatar URL when present, initials fallback, and former-member handling.
2. Extend `FinanceService` with tenant-scoped member management, dashboard analytics, and CSV export services. Each method starts with `AccessService.Require`; role changes and member removal re-check the target and actor inside the same transaction, preventing ordinary members from changing owners or administrators.
3. Keep the existing `/workspaces`, `/transactions`, `/dashboard`, `/me`, invitation, and join-request response shapes compatible. New fields are additive. Add dedicated `/workspaces/{workspaceId}/members`, `/workspaces/{workspaceId}/members/{userId}`, and `/workspaces/{workspaceId}/export.csv` routes.
4. Let the React client consume normalized live data through shared query helpers. The Home dashboard will render real category/type/time-series values and explicit loading, error, and empty states; Entries and entry details will render the nested creator summary; Members and Settings will use mutations with feedback and permission gates.

## Capability decisions

- Direct invitations remain the cross-device invitation mechanism. The token is the only bearer secret, is never persisted client-side, and is accepted only for the invited email when an email restriction exists.
- Join codes remain reusable pending-access requests. The join dialog will say “request access” and will not imply immediate membership; the approval response and subsequent workspace refresh make the transition explicit.
- CSV export is server-generated from all accessible records, not the currently loaded page. It includes display fields only, uses RFC-style escaping, a stable UTF-8 header, and a workspace/date filename. Passwords, tokens, hashes, and internal IDs are excluded.
- Account editing supports name, profile image URL, phone number, email, and preferred currency. Email changes are normalized and marked unverified until a supported verification flow is completed; immutable IDs, roles, memberships, and ownership never enter the update DTO.
- Biometric unlock is removed from settings, auth copy, and client/runtime references. The existing local application-PIN path is not described as biometric and remains independent.

## Testing strategy

- Go service tests cover invitation code/token creation, invalid/expired/used capabilities, membership refresh data, creator joins and former members, member permissions/role restrictions, analytics aggregation, account validation, and export privacy/CSV escaping.
- React tests cover invitation and join-code copy/error states, live member rendering and mutation restrictions, creator metadata in entries, chart empty/loading/error states, account edit success/error states, CSV download feedback, and the absence of biometric controls.
- Run focused Go and web tests first, then `go test ./...`, `go vet ./...`, `go build ./...`, and `npm run check` from `web/`. Where a live Mongo replica set or Android emulator is unavailable, report that limitation and still verify route contracts, service behavior, client build, and file contents locally.

## Scope boundaries

No passwords, authentication tokens, invitation hashes, membership ownership fields, or system-managed roles are added to client-visible payloads. Existing unrelated dirty-worktree changes are preserved. No temporary, hardcoded, or demo-only live fixes are used.
