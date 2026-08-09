# Workspace access and invitations design

## Approved behavior

- Every newly created workspace is private and its creator is the owner.
- The workspace switcher exposes **Create workspace**, **Join workspace**, and **Set as default**.
- The default workspace is a per-device preference and is selected after login and app restart when the user still has access.
- A direct invitation produces a random, single-use, seven-day token. Email is optional because Ledgerly does not depend on an email provider. When email is supplied, only that account can redeem it; without email, whoever securely receives the token can redeem it once.
- A workspace join code is reusable and never grants access immediately. Redeeming it creates one pending request for the authenticated user. Workspace owners or administrators with `invite_members` permission approve or reject that request.
- Approval creates membership atomically, closes the request, writes an audit event, and notifies the requester. New requests notify eligible workspace approvers.
- The former Family demo page becomes a real Members and invitations surface. Fake members, fake QR requests, QR generation, and unrelated social-sharing controls are removed.
- Select controls keep motion, but option visibility and clickability cannot depend on an animation frame or a height measurement completing.

## API contract

- `POST /workspaces` creates a private workspace.
- `POST /workspaces/{workspaceId}/invitations` accepts `{ email?: string, role, permissions? }` and returns the one-time token.
- `POST /invitations/accept` keeps direct-token redemption and permits an empty invitation email.
- `POST /workspaces/{workspaceId}/join-code` rotates the private reusable code and returns its plaintext value once.
- `POST /workspace-join-requests` accepts `{ code }` and returns a pending request (or the existing pending request).
- `GET /workspaces/{workspaceId}/join-requests` lists pending requests for authorized approvers.
- `PATCH /workspaces/{workspaceId}/join-requests/{requestId}` accepts `{ status: "approved" | "rejected" }`.

Only token/code hashes are stored. A workspace is not discoverable by name or identifier.

## UI flow

The workspace menu owns the create/join/default actions on desktop and Android. Create collects name, type, currency, and financial-month start. Join collects one code and clearly reports “pending approval” rather than switching workspaces. Members lets an authorized user choose a workspace, optionally restrict an invitation by email, choose a role, copy the one-time token, rotate/copy the workspace join code, and action real pending requests.

## Failure and security handling

Invalid, expired, or unauthorized capabilities return generic not-found/forbidden responses. Duplicate membership is idempotent. Duplicate pending join requests return the existing request. Approval re-checks reviewer permission and request status inside the transaction. All writes are tenant-scoped and audited.

## Verification

Service tests cover email-less invitations, restricted invitations, private workspace creation, join request creation, approval, rejection, and authorization. Web tests cover default selection, workspace actions, real invitation submissions, and select opening when animation frames are delayed. The release web bundle is copied into Android, a signed release APK is built against the live HTTP API, then the named Android QA workflow exercises create, join, invite, request approval, tab navigation, scrolling, and select interaction with screenshots, UI dumps, and logcat checks.
