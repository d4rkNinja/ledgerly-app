# Finance and Auth Flow Polish Design

## Goal

Make the Android/web finance flows usable on small screens and make remembered-device authentication restore the session without asking for the login password on every restart.

## Scope

- Make account and transaction select lists bounded and touch-scrollable inside bottom sheets, without hiding the form actions.
- Provide transaction categories appropriate to expense, income, transfer, and split modes.
- Keep currency selection as a select control, but render it as an icon-only trigger inside amount fields with an accessible name and synchronized account currency.
- Restore the bearer token after native preferences hydrate, route an authenticated restart into the app, and protect remembered sessions with a local numeric app PIN.

## Design

### Finance controls

`SelectContent` will expose a bounded list viewport with vertical scrolling and touch overscroll containment. The list will remain inside the existing select component so account type, visibility, account, category, destination, and currency selectors share the same behavior. The bottom-sheet content remains independently scrollable, and dialog actions remain part of that scroll surface so they can always be reached.

Transaction categories will be defined by `AddMode`. Expense options include common spending categories; income options include salary, freelance, business, bonus, interest, investment, refund, gift, and other income; transfer uses no user category; split uses the existing participant behavior. When the mode changes, an invalid category is replaced with that mode’s first valid category.

`CurrencySelect` will add an icon-only variant. The trigger keeps `aria-label="Change currency"`, an icon, and the native select popup behavior, while the amount input reserves only the compact trigger width. Full-width currency selectors in onboarding and settings keep their existing label/value presentation.

### Remembered session and app PIN

The app will hydrate native preferences before constructing `AppProvider`, then set the in-memory API token from the hydrated remembered token in an effect/initialization path that runs after hydration. The root route will redirect remembered authenticated users to `/app/home`.

Account creation will request a 4–6 digit app PIN and confirmation. The server registration contract remains unchanged; the PIN is hashed locally with Web Crypto and stored only in the native preference adapter/localStorage mirror. A remembered login without a PIN will show a one-time setup screen after the server session is established so existing accounts migrate safely.

On a cold start with a remembered token and PIN hash, the app renders an unlock screen before protected data. A correct PIN restores the protected app state; an incorrect PIN shows an error and never sends a request. Sign-out removes the remembered token, remember flag, user id, and PIN hash. If the user disables Remember this device, no PIN gate is persisted.

### Error handling

- A missing or invalid remembered token falls back to the normal welcome/login route.
- A missing PIN for a remembered session triggers the one-time PIN setup flow, not a full login prompt.
- PIN hashing/verification failures fail closed and show a recoverable sign-in path.
- Currency changes only select an account with that currency; no transaction is submitted until a valid account is selected.

## Testing

- Unit tests for mode category options, category reset rules, PIN validation/hash/verification, and preference allowlisting.
- Component tests for scrollable select content, icon-only currency trigger accessibility, and mode-specific category options.
- App-context/startup tests for remembered token restoration, root-route handoff, PIN setup, unlock, and sign-out cleanup.
- Android emulator QA on a release APK: open and scroll Add account, switch income/expense categories, open the amount currency icon and submit real values, force-stop/reopen, unlock with the app PIN, and inspect crash/network logs.
