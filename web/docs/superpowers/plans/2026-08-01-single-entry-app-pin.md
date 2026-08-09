# Single-entry App PIN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicate app-PIN fields with one six-slot masked PIN gate and remove PIN collection from registration.

**Architecture:** Keep remembered-session orchestration in `AppProvider`; only the gate owns PIN entry. Reuse the existing controlled `OTPInput` for setup and unlock, and keep hashing/verification in the existing `device-pin` module.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Motion, CSS.

## Global Constraints

- Change frontend code only under `web/`.
- Do not change backend services or anything under `applications/`.
- Keep the existing remembered-session storage and SHA-256 digest behavior.
- PIN format is exactly six numeric digits.

---

### Task 1: Lock the PIN contract to six digits

**Files:**
- Modify: `web/src/platform/device-pin.test.ts`
- Modify: `web/src/platform/device-pin.ts`

**Interfaces:**
- Produces: `validateDevicePin(pin: string): string | null` accepts exactly six digits.
- Preserves: `hashDevicePin(pin: string): Promise<string>` and `verifyDevicePin(pin: string, expectedDigest: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing boundary test**

Change the acceptance test to assert that `2468` and `12345` are rejected while `123456` is accepted, with the public error copy `Use a 6 digit app PIN.`.

- [ ] **Step 2: Run the focused test and verify RED**

Run `npm test -- --run src/platform/device-pin.test.ts` from `web/`. Expect the four-digit assertion to fail because the current pattern accepts 4–6 digits.

- [ ] **Step 3: Implement the exact-length rule**

Set `DEVICE_PIN_PATTERN` to `/^\d{6}$/u` and update the validation message to `Use a 6 digit app PIN.`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run `npm test -- --run src/platform/device-pin.test.ts` and expect all device-PIN tests to pass.

### Task 2: Replace setup and unlock fields with one OTP-style control

**Files:**
- Modify: `web/src/components/device-access-gate.test.tsx`
- Modify: `web/src/components/device-access-gate.tsx`
- Modify: `web/src/index.css`

**Interfaces:**
- Consumes: `OTPInput` with `length={6}`, `mask`, controlled `value`, `status`, `errorMessage`, and `onChange`.
- Preserves: `DeviceAccessGate` props and setup/unlock callbacks.

- [ ] **Step 1: Write failing gate behavior tests**

Render setup mode and assert one accessible `App PIN` input, no `Confirm app PIN` input, short submission displays `Use a 6 digit app PIN.`, and entering `123456` then submitting invokes `onConfigured` exactly once with a 64-character hexadecimal digest. Keep the unlock rejection test with a valid digest produced by `hashDevicePin('123456')`.

- [ ] **Step 2: Run the gate test and verify RED**

Run `npm test -- --run src/components/device-access-gate.test.tsx`. Expect failure because confirmation still exists and four digits are currently accepted.

- [ ] **Step 3: Implement the single control**

Remove confirmation state and mismatch validation. Render `OTPInput` inside a dedicated `device-pin-field` wrapper with `length={6}`, `mask`, mode-specific label/hint, `status={error ? 'error' : 'idle'}`, and the existing controlled PIN state. Disable the submit button until six digits are present or while submitting, while preserving server-independent hashing and verification.

- [ ] **Step 4: Polish the responsive gate**

Add dedicated styles for safe-area padding, centered card width, compact icon surface, balanced copy, a slot row that fits 360 px screens, full-width primary action, quiet secondary action, focus visibility, and narrow-screen slot sizing. Use exact-property transitions and 44 px minimum action heights.

- [ ] **Step 5: Run the gate test and verify GREEN**

Run `npm test -- --run src/components/device-access-gate.test.tsx` and expect all gate tests to pass.

### Task 3: Remove PIN collection from registration and verify the frontend

**Files:**
- Modify: `web/src/pages/auth/OnboardingPage.test.tsx`
- Modify: `web/src/pages/auth/OnboardingPage.tsx`
- Modify: `web/src/pages/auth/OnboardingSteps.tsx`

**Interfaces:**
- Preserves: `completeLogin(nextUserId, name, token, rememberDevice, preferredCurrency)` with no registration-time `appPin` argument.
- Produces: registration UI containing name, email, password, currency, and consent only.

- [ ] **Step 1: Write the failing onboarding test**

Change the setup test to assert that neither `App PIN` nor `Confirm app PIN` appears on the account-creation step while the credential fields remain present.

- [ ] **Step 2: Run the onboarding test and verify RED**

Run `npm test -- --run src/pages/auth/OnboardingPage.test.tsx`. Expect failure because both PIN fields still render.

- [ ] **Step 3: Remove registration PIN state and props**

Delete PIN state, refs, error constants, validation branches, `AboutYouStep` PIN props, PIN fields, and the `appPin` argument passed to `completeLogin`. Remove now-unused `KeyRound` and `validateDevicePin` imports.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run `npm test -- --run src/pages/auth/OnboardingPage.test.tsx src/components/device-access-gate.test.tsx src/platform/device-pin.test.ts` and expect all focused tests to pass.

- [ ] **Step 5: Run the complete frontend verification**

Run `npm run check` from `web/`. Expect tests, TypeScript, lint, and production build to succeed with no errors.

- [ ] **Step 6: Inspect scope**

Run `git status --short -- web applications ledgerly-api` and confirm implementation edits are limited to `web/` and no backend or `applications/` files were changed by this work.
