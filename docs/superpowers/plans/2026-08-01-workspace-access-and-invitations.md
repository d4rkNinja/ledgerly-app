# Workspace access and invitations implementation plan

1. Add failing Go tests for private workspace creation, optional-email tokens, reusable join requests, approval/rejection, authorization, and Mongo indexes.
2. Extend workspace and join-request models, indexes, collaboration service methods, handlers, and routes. Keep direct invitations backward-compatible.
3. Add failing React tests for device-default workspace selection, menu management actions, invitation form behavior, approval requests, and select resilience when `requestAnimationFrame` is delayed.
4. Add default-workspace state/persistence and workspace create/join dialogs shared by desktop and mobile switchers.
5. Replace fake Family/QR collaboration UI with live members, optional-email tokens, join-code rotation, and pending-request actions.
6. Simplify the animated select panel so content has layout immediately while opacity/transform retain motion.
7. Run Go tests, web unit/integration tests, typecheck/lint/build, and inspect the patch for unintended changes.
8. Build web with `VITE_API_BASE_URL=http://80.225.194.189:3001/api/v1`, sync Capacitor, assemble the release APK, then run emulator QA against the release artifact and inspect logcat/network behavior.
