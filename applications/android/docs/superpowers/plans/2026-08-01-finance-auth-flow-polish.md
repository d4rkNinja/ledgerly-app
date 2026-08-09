# Finance and Auth Flow Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mobile finance sheets reachable and mode-aware, and make remembered Android sessions reopen behind a short numeric app PIN instead of the full login form.

**Architecture:** Keep finance controls inside the existing shared `Select`, `Dialog`, and `BottomSheet` primitives. Add a small pure transaction-category module and a pure Web Crypto app-PIN module, then connect them to `AppProvider` and the auth pages through the existing preference adapter. The startup bootstrap restores the token after native hydration before React renders protected queries; `AppProvider` owns the locked/setup/unlocked gate and renders children only after access is granted.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Motion, Capacitor Preferences, Web Crypto, Vite, Capacitor Android, adb emulator QA.

## Global Constraints

- Preserve the three-root-folder organization: `api`, `web`, and `applications`.
- Keep the internal legacy vault compatibility in the API client, but expose no vault controls in user-facing forms.
- Never send the app PIN to the API; persist only its Web Crypto SHA-256 digest through the existing native preference adapter.
- Keep full-width currency selectors in onboarding/settings; only amount-field selectors use the icon-only trigger.
- Do not stage or reset unrelated repository-organization changes already present in the worktree.
- Run each focused test after its failing assertion is written and before moving to the next behavior.

---

### Task 1: Add tested category and app-PIN primitives

**Files:**
- Create: `web/src/domain/transaction-categories.ts`
- Create: `web/src/domain/transaction-categories.test.ts`
- Create: `web/src/platform/device-pin.ts`
- Create: `web/src/platform/device-pin.test.ts`
- Modify: `web/src/platform/preferences.ts:4-14`
- Modify: `web/src/platform/preferences.test.ts:32-42`

**Interfaces:**
- `categoriesForTransactionMode(mode: 'expense' | 'income' | 'transfer' | 'split'): readonly string[]` returns the selectable category labels for that mode.
- `categoryForTransactionMode(mode, current): string` keeps `current` when valid and otherwise returns the first valid category.
- `validateDevicePin(pin: string): string | null` returns a user-facing validation error or `null` for a 4–6 digit PIN.
- `hashDevicePin(pin: string): Promise<string>` returns a lowercase SHA-256 hex digest.
- `verifyDevicePin(pin: string, digest: string): Promise<boolean>` compares a PIN digest without sending the PIN anywhere.

- [ ] **Step 1: Write the failing category tests**

  Assert that expenses include `Groceries` and `Utilities`, income includes `Salary` and `Freelance` but not `Groceries`, transfers return an empty list, and an invalid income category resets to `Salary` while a valid one is retained.

- [ ] **Step 2: Run the category test to verify RED**

  Run: `npm.cmd test -- --run src/domain/transaction-categories.test.ts`

  Expected: FAIL because `web/src/domain/transaction-categories.ts` does not exist.

- [ ] **Step 3: Implement the minimal category map**

  Export immutable arrays for expense, income, and split; return an empty array for transfer; implement the reset helper with strict membership checks.

- [ ] **Step 4: Run the category test to verify GREEN**

  Run: `npm.cmd test -- --run src/domain/transaction-categories.test.ts`

  Expected: all category assertions pass.

- [ ] **Step 5: Write the failing PIN tests**

  Assert that 3 digits, 7 digits, letters, and mismatched verification are rejected, while `2468` hashes to a non-plaintext digest and verifies only against `2468`.

- [ ] **Step 6: Run the PIN test to verify RED**

  Run: `npm.cmd test -- --run src/platform/device-pin.test.ts`

  Expected: FAIL because the device-PIN module does not exist.

- [ ] **Step 7: Implement the minimal Web Crypto PIN module**

  Validate with `/^\d{4,6}$/`, encode with `TextEncoder`, digest with `crypto.subtle.digest('SHA-256', ...)`, and compare digests in constant-length byte loops. Reject invalid PINs before hashing.

- [ ] **Step 8: Run the PIN test to verify GREEN**

  Run: `npm.cmd test -- --run src/platform/device-pin.test.ts`

  Expected: all PIN assertions pass.

- [ ] **Step 9: Extend the native preference allowlist**

  Add `mt-app-pin-hash` to `NATIVE_PREFERENCE_KEYS` and the allowlist test fixture; add an assertion that it mirrors to Capacitor Preferences and is removed with the remembered session.

- [ ] **Step 10: Run the preference tests**

  Run: `npm.cmd test -- --run src/platform/preferences.test.ts`

  Expected: all preference tests pass with the new key included.

### Task 2: Make every select list bounded, scrollable, and amount currency icon-only

**Files:**
- Modify: `web/src/components/motion/select.tsx:266-377`
- Modify: `web/src/components/currency-select.tsx:16-66`
- Modify: `web/src/index.css:1592-1628`
- Create: `web/src/components/currency-select.test.tsx`
- Create: `web/src/components/motion/select.test.tsx`

**Interfaces:**
- `CurrencySelect` accepts `iconOnly?: boolean`; when true its trigger renders the `Coins` icon and no `SelectValue`, while retaining the caller’s `ariaLabel`.
- `SelectContent` exposes `role="listbox"`, a bounded `max-height`, and `overflow-y: auto` so long option sets can be scrolled without closing the select.

- [ ] **Step 1: Write the failing select-scroll test**

  Render a select with enough options to exceed the bounded viewport, open it, and assert the listbox has a scrollable style/class and remains in the DOM with all options.

- [ ] **Step 2: Run the select test to verify RED**

  Run: `npm.cmd test -- --run src/components/motion/select.test.tsx`

  Expected: FAIL because the listbox has no scroll viewport contract.

- [ ] **Step 3: Implement the bounded list viewport**

  Add a stable `select-content-list` class to the inner list wrapper and CSS `max-height: min(18rem, 42dvh); overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch;`. Keep the transition wrapper’s animation but do not let it hide the inner scroller’s content.

- [ ] **Step 4: Run the select test to verify GREEN**

  Run: `npm.cmd test -- --run src/components/motion/select.test.tsx`

  Expected: the listbox exposes the scrollable viewport and all option nodes remain selectable.

- [ ] **Step 5: Write the failing currency-trigger test**

  Render `CurrencySelect` with `iconOnly`, assert the trigger has `aria-label="Change currency"`, contains the currency icon, and does not render the selected currency text until its listbox is opened.

- [ ] **Step 6: Run the currency test to verify RED**

  Run: `npm.cmd test -- --run src/components/currency-select.test.tsx`

  Expected: FAIL because `iconOnly` is not a supported prop.

- [ ] **Step 7: Implement the icon-only currency variant**

  Add the prop, omit `SelectValue` in that branch, add an `aria-hidden` icon-only class, and leave the default/full-width branch unchanged.

- [ ] **Step 8: Update amount-field spacing and callers**

  Use `iconOnly` in `home-transactions.tsx` and `AccountDialogs.tsx`; change the amount input padding to the icon trigger width and give the trigger a 44px touch target. Keep `aria-label="Change currency"` and account synchronization.

- [ ] **Step 9: Run focused currency and integration tests**

  Run: `npm.cmd test -- --run src/components/currency-select.test.tsx src/App.integration.test.tsx`

  Expected: the icon-only trigger is accessible and no user-facing vault field appears.

### Task 3: Add mode-specific transaction categories and keep account-sheet actions reachable

**Files:**
- Modify: `web/src/pages/finance/home-transactions.tsx:423-455,706-709,868-903`
- Modify: `web/src/pages/finance-writes/AccountDialogs.tsx:168-292`
- Modify: `web/src/index.css:1470-1518,3723-3737,4143-4159`
- Modify: `web/src/domain/transaction-categories.ts`
- Create: `web/src/pages/finance/home-transactions.test.tsx`

**Interfaces:**
- The transaction dialog uses `categoriesForTransactionMode` and `categoryForTransactionMode` for its category select and mode transitions.
- The account and transaction forms remain inside the existing bottom-sheet scroller; the new select viewport prevents an option list from being clipped by the sheet.

- [ ] **Step 1: Write the failing transaction category UI tests**

  Render the transaction dialog test harness or the live page fixture, assert expense options contain `Groceries`, click the Income tab, assert `Salary` and `Freelance` are present, assert `Groceries` is absent, and assert the selected category is reset to `Salary` when the mode changes.

- [ ] **Step 2: Run the category UI test to verify RED**

  Run: `npm.cmd test -- --run src/pages/finance/home-transactions.test.tsx`

  Expected: FAIL because all non-split modes currently render the same five options and do not reset state.

- [ ] **Step 3: Implement mode-derived category state**

  Initialize with `categoryForTransactionMode(initialMode, '')`; on tab click and keyboard mode change update `mode` and `categoryForTransactionMode(nextMode, values.category)`; render the returned list for non-transfer modes and preserve split’s participant behavior.

- [ ] **Step 4: Run the transaction category test to verify GREEN**

  Run: `npm.cmd test -- --run src/pages/finance/home-transactions.test.tsx`

  Expected: expense and income assertions pass and the existing transfer/split validation remains intact.

- [ ] **Step 5: Add a regression assertion for the account sheet**

  Assert the add-account form has one scroll owner and that Cancel/Create account remain inside that owner after the account-type selector is opened.

- [ ] **Step 6: Verify the sheet regression test before CSS changes**

  Run: `npm.cmd test -- --run src/pages/finance/home-transactions.test.tsx`

  Expected: the new structural assertion fails against the current clipped select implementation.

- [ ] **Step 7: Make the form scroll boundary explicit**

  Add a `finance-write-sheet-form` class to account and transaction forms; use `min-height: 0`, `padding-bottom` for the safe area, and preserve the bottom-sheet child’s `overflow-y: auto` as the single form scroll owner. Do not make the action bar fixed over form fields.

- [ ] **Step 8: Re-run the focused finance tests**

  Run: `npm.cmd test -- --run src/pages/finance/home-transactions.test.tsx src/App.integration.test.tsx`

  Expected: all category and action-reachability assertions pass.

### Task 4: Restore remembered sessions and add the numeric device-PIN gate

**Files:**
- Modify: `web/src/app/app-context.tsx:53-64,66-213,234-251,327`
- Modify: `web/src/app/app-state.ts:7-32`
- Modify: `web/src/main.tsx:1-48`
- Modify: `web/src/App.tsx:150-153,232-262`
- Modify: `web/src/pages/auth/OnboardingPage.tsx:31-179`
- Modify: `web/src/pages/auth/OnboardingSteps.tsx:11-113`
- Create: `web/src/components/device-access-gate.tsx`
- Create: `web/src/components/device-access-gate.test.tsx`
- Modify: `web/src/index.css` auth styles near the existing `.auth-layout` rules
- Modify: `web/src/app/app-context.test.tsx`
- Modify: `web/src/platform/startup.test.ts`

**Interfaces:**
- `restoreRememberedApiToken(): boolean` reads hydrated `mt-auth-token`/`mt-remember`, calls `setApiToken`, and returns whether a remembered live session exists.
- `completeLogin(..., rememberDevice?: boolean, preferredCurrency?: string, appPin?: string): Promise<void>` persists `mt-app-pin-hash` when a valid PIN is supplied and sets the gate to unlocked; a remembered session without a PIN enters setup.
- `DeviceAccessGate` accepts `mode: 'setup' | 'unlock'`, an optional digest, `onConfigured`, `onUnlocked`, and `onSignOut`, and renders numeric inputs with accessible error text.

- [ ] **Step 1: Write the failing device-gate tests**

  Render setup mode and assert that invalid/mismatched PINs do not call `onConfigured`; submit matching `2468` values and assert it calls `onConfigured` with a digest. Render unlock mode with the digest and assert the wrong PIN shows an error without calling `onUnlocked`, while the correct PIN calls it.

- [ ] **Step 2: Run the device-gate test to verify RED**

  Run: `npm.cmd test -- --run src/components/device-access-gate.test.tsx`

  Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the focused device access component**

  Use `validateDevicePin`, `hashDevicePin`, and `verifyDevicePin`; use `inputMode="numeric"`, `autoComplete="off"`, `maxLength={6}`, no server mutation, and a sign-out action for remembered-session recovery.

- [ ] **Step 4: Run the device-gate test to verify GREEN**

  Run: `npm.cmd test -- --run src/components/device-access-gate.test.tsx`

  Expected: setup and unlock assertions pass.

- [ ] **Step 5: Write the failing remembered-startup tests**

  Seed localStorage with a remembered token, user id, workspace, and PIN hash; assert `restoreRememberedApiToken` sets the API token only after it is called, and assert `AppProvider` starts in authenticated setup/locked state rather than the login state. Assert sign-out removes the token, remember flag, user id, and PIN hash.

- [ ] **Step 6: Run the app-context tests to verify RED**

  Run: `npm.cmd test -- --run src/app/app-context.test.tsx src/platform/startup.test.ts`

  Expected: FAIL because the token restoration helper and PIN state do not exist.

- [ ] **Step 7: Implement post-hydration token restoration and gate state**

  Remove the module-evaluation-only token restore, export the synchronous restoration helper, call it in `bootstrap()` immediately after `startup.hydratePreferences()`, and initialize AppProvider’s gate from hydrated preferences. Persist/remove the PIN digest with the remembered-session branch and render `DeviceAccessGate` instead of children while setup or locked.

- [ ] **Step 8: Pass the app PIN through account creation**

  Add `appPin` and `appPinConfirmation` state to `OnboardingPage`, render both fields in `AboutYouStep`, validate them before the final register request, and pass the PIN only to `completeLogin` after the server returns. Keep `RegisterRequest` unchanged so the API never receives the PIN.

- [ ] **Step 9: Add the authenticated root redirect**

  Wrap `/`, `/login`, and `/onboarding` in a public-route guard that redirects an authenticated context to `/app/home`; keep the device gate mounted above route content so a remembered restart cannot show the welcome or login screen while locked.

- [ ] **Step 10: Run the auth-focused tests**

  Run: `npm.cmd test -- --run src/components/device-access-gate.test.tsx src/app/app-context.test.tsx src/platform/startup.test.tsx src/pages/auth`

  Expected: all PIN setup/unlock, token restoration, route handoff, and sign-out assertions pass.

### Task 5: Full verification, release build, and emulator QA

**Files:**
- Modify only files proven necessary by the preceding tasks.
- Create: `applications/android/evidence/finance-auth-flow-*.png` during QA.

**Interfaces:**
- Release APK: `applications/android/app/build/outputs/apk/release/app-release.apk`.

- [ ] **Step 1: Run the complete web test suite**

  Run: `npm.cmd test -- --run`

  Expected: zero failed tests.

- [ ] **Step 2: Run web typecheck, lint, and build**

  Run: `npm.cmd run typecheck; npm.cmd run lint; npm.cmd run build`

  Expected: all commands exit 0 with no TypeScript or lint errors.

- [ ] **Step 3: Run Android script and Go tests**

  Run: `npm.cmd run test:scripts` from `web`; run `go test ./...` from `api` with a task-scoped temporary `GOCACHE`, then remove that temporary cache.

  Expected: all Node and Go packages pass.

- [ ] **Step 4: Build the HTTP-authorized release variant**

  Run: `$env:VITE_API_BASE_URL='http://80.225.194.189:3001/api/v1'; npm.cmd run android:build:release`

  Expected: `app-release.apk` is generated under `applications/android/app/build/outputs/apk/release/`.

- [ ] **Step 5: Install and launch the exact release APK**

  Run: `adb -s emulator-5554 install -r applications/android/app/build/outputs/apk/release/app-release.apk`; resolve `io.github.d4rkninja.ledgerly/.MainActivity`; launch it and capture the initial UI tree.

  Expected: the release app starts without a WebView blank screen after startup hydration.

- [ ] **Step 6: Exercise the add-account sheet**

  Use UI-tree bounds to open Accounts → Add account → Account type, swipe the option list, choose a lower option, swipe the form to the bottom, and confirm both Cancel and Create account are visible/reachable.

- [ ] **Step 7: Exercise expense, income, and currency submissions**

  Open Add transaction, inspect expense categories, switch to Income and inspect income-specific categories, open the icon-only currency trigger, choose the available account currency, enter real merchant and amount values, submit, and verify the saved row plus backend refresh.

- [ ] **Step 8: Exercise remembered restart and PIN unlock**

  Log in or create a test account with Remember this device and a 4-digit PIN, force-stop and relaunch, verify the app does not show the login form, enter a wrong PIN and verify no protected data appears, then enter the correct PIN and verify the live home data loads.

- [ ] **Step 9: Inspect crash, network, and release evidence**

  Run `adb -s emulator-5554 logcat -b crash -d` and scan logcat for `FATAL EXCEPTION`, cleartext/network-security failures, service-unavailable errors, and `net::ERR`; calculate the APK SHA-256 and record screenshot paths.

- [ ] **Step 10: Re-run the complete verification commands after any QA-driven fix**

  Repeat the full web suite, typecheck, lint, build, Android script tests, Go tests, release build, install, and the relevant emulator flow before reporting completion.
