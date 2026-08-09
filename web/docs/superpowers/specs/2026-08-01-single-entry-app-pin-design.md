# Single-entry app PIN design

## Goal

Replace the duplicated app-PIN setup fields with one polished, masked, six-slot PIN control. Ask for the PIN only at the remembered-device gate, then reuse the stored digest for later unlocks.

## Scope

- Change frontend code only under `web/`.
- Do not change backend services or anything under `applications/`.
- Keep the existing remembered-session storage and SHA-256 digest behavior.

## User flow

1. Account registration collects account credentials and preferences, but no app PIN.
2. Signing in or registering with remembered-device behavior enabled completes authentication.
3. If that account does not already have a PIN digest on the device, Ledgerly shows the app-PIN setup gate once.
4. The user enters one six-digit PIN in masked OTP-style slots and selects **Save app PIN**.
5. The digest is saved and the workspace opens immediately.
6. On a later app restart, the same six-slot control appears in unlock mode and verifies the PIN locally.
7. **Use another account** signs out and clears remembered credentials through the existing callback.

## Interface

The gate uses the existing `OTPInput` component as the interaction primitive. It renders six fixed slots, masks entered digits, accepts numeric keyboard input and paste, and exposes errors accessibly. The primary action remains explicit rather than auto-submitting when the sixth digit is entered, preventing accidental saves and making the security action clear.

The screen uses a centered, mobile-first card with safe-area-aware padding, a compact security icon, balanced heading copy, and a constrained content width. The slot row must fit a 360 px mobile viewport without horizontal overflow. Actions stack on narrow screens and preserve at least 44 px touch targets. Focus, error, loading, and reduced-motion behavior remain visible and accessible.

## State and validation

- PIN format is exactly six numeric digits for this UI.
- Setup mode calls `onConfigured` once per submit with the hashed PIN.
- Unlock mode calls `onUnlocked` only after digest verification succeeds.
- Submission is ignored while a previous submission is pending.
- Editing the PIN clears the current error.
- Missing or invalid stored digests continue to show the existing recovery guidance.

## Component changes

- `DeviceAccessGate`: replace both password inputs with one controlled masked `OTPInput`; remove confirmation state and mismatch validation; add mode-specific labels and six-digit validation.
- `OnboardingPage` and `OnboardingSteps`: remove app-PIN fields, state, validation, refs, and the PIN argument passed to `completeLogin`.
- `device-pin`: make the validation contract exactly six digits so setup and unlock use one consistent rule.
- `index.css`: add dedicated gate layout, card, slot, message, and responsive rules without changing unrelated application surfaces.

## Testing

- Update device-PIN unit tests to reject four- and five-digit values and accept six digits.
- Update gate tests to prove there is only one PIN control, a short PIN is rejected, and a valid PIN configures exactly once.
- Update onboarding tests to prove registration no longer asks for an app PIN.
- Run the focused tests first, then the full frontend check (`test`, typecheck, lint, and build).

## Success criteria

- No app-PIN confirmation field exists.
- Registration does not ask for an app PIN.
- First-time remembered-device setup asks once using six masked OTP-style slots.
- Returning unlock uses the same visual control.
- The gate is visually balanced and does not overflow at the screenshot's mobile width.
- No backend or `applications/` files are modified.
