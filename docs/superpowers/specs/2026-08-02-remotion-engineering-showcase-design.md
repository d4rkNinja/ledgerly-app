# Remotion Engineering Showcase Video Design

**Date:** 2026-08-02

**Status:** Approved by the user

## Goal

Rebuild the complete vertical Remotion video as a transparent showcase of one developer's AI-assisted engineering workflow: approximately two hours of work, approximately $20 of AI-related cost, a real Go backend, a real web client, a real Android experience, and evidence-backed testing. The application is proof of the engineering process, not the product being advertised.

## Audience and tone

The narration is confident, clever, slightly arrogant, humorous, self-aware, calm, and technically credible. It must not sound corporate, motivational, or like a course advertisement. Humor is used as punctuation, while real evidence carries the confidence.

The approved phrases that remain in the narration are: “Wait, wait, wait.”, “Simple. Simple. Simple.”, “Cute, right?”, “Not too cute.”, “Sol stood there with a clipboard.”, “The comments section also deserves employment.”, “If a company wants to hire this ninja…”, and “Aabhar.”

## Authenticity boundary

Technical claims use only evidence that exists in the project or is captured from the real running application during the implementation pass:

- Go source from `api/`, including authentication, authorization, handlers, services, repository transactions, and indexes.
- Real Go test commands and their captured output.
- Real web source, web tests, test output, and API client contracts from `web/`.
- Real Android release build output, emulator UI-tree evidence, logcat, and live screen recordings.
- Real API request/response evidence captured without showing credentials, tokens, private identifiers, or raw secrets.
- Real project structure and implementation files.
- Real validation and error states captured from the application or represented by actual test output.

No fabricated source code, terminal sessions, test results, API responses, AI chat logs, or reconstructed model footage may appear.

There is no Luna/Sol development-session recording. Model orchestration is therefore shown only as a clearly labeled animated diagram:

```text
CUSTOM HARNESS
    ↓
Context + skills + task planning
    ↓
GPT-LUNA
Primary implementation and fixes
    ↓
SOL
Planning, difficult decisions, and review
    ↓
Tests + verification
    ↓
Working application
```

The diagram carries one of these persistent labels while visible:

`Workflow visualization — reconstructed from the actual development process`

or:

`Conceptual orchestration diagram — not recorded session footage`

The diagram must show `CUSTOM HARNESS` as the controlling system. It must never show `Luna → Sol → Harness`.

## Format and media rules

- Vertical 9:16, 1080 × 1920, 30 fps.
- Target duration: approximately 4–5 minutes, driven by measured narration duration rather than fixed scene durations.
- Continuous narration with 100–250 ms phrase/section joins and no silent section breaks.
- Generate approximately 17 connected Pocket TTS clips, each containing one to three connected sentences. Keep related joke lines in the same clip.
- Application evidence is live video recording only in the final composition. Existing screenshots/stills remain audit evidence but are not used as the primary application proof shots.
- Keep the real mobile recording centered, fully sharp, opacity 1, without a filter, backdrop filter, covering gradient, translucent overlay, or blur transition.
- Use the authentic 1080px-wide Android recordings in `promotions/recordings/raw/`; timecode only positive, readable states so no negative amount appears in the final edit.
- Supporting copy appears only in compact bottom glass labels or technical evidence cards. Do not use a permanent left-text/right-phone layout.
- Do not place a full-screen glass layer above the phone. Glass treatments may belong to bottom labels, technical evidence cards, or an edge rail outside the phone bounds.
- Use short eased crossfades/edge glows between evidence states. No multi-second fades, title-card pauses, slideshow chapter breaks, or empty waiting frames.
- Final narration ends with `Aabhar.` and the video ends within one second after it.

## Narrative architecture

The video is one uninterrupted argument. Each section alternates a claim, authentic evidence, and the engineering interpretation of that evidence.

1. **The result, immediately.** Open with a fast live-recording montage: app launch/onboarding, positive dashboard, income form, Go source, real test output, and mobile navigation. State the two-hour and approximate-$20 claims as creator-reported claims, not as fabricated receipts.
2. **This is real software.** Use live onboarding and remembered-device footage, then show the real frontend API client and Go authentication/session implementation. The label is `NOT A MOCKUP`.
3. **Live proof.** Use live recordings of the actual `d4rkninja` flow: create the account/workspace, complete consent, use the remembered-device path, add `Primary Cash`, record positive `Paycheck` income, and return to the persisted positive dashboard state. Do not show negative expense rows.
4. **Built through vibe coding.** Show real repository structure, actual Go and React files, and captured command output. The app stays present as evidence, but the narration is about execution speed and AI-assisted construction.
5. **Why knowledge still matters.** Show real auth/session code, request validation, workspace permission checks, atomic Mongo transaction/repository code, and matching frontend request contracts. Pair each excerpt with the live state it protects.
6. **Real testing, not page opening.** Show captured Go, web, and Android test output plus live validation/error states. Include valid input, missing/invalid input, duplicate/idempotent behavior, unauthorized access handling, empty/error responses, responsive behavior, persistence after refresh, and connected-module updates only where real evidence exists.
7. **Animated, not generic.** Use live navigation recording and real web motion source files to show that the system has deliberate transitions, cards, dialogs, loading/empty states, and feedback. The phone footage remains sharp and centered.
8. **The harness.** Switch briefly to the labeled conceptual orchestration diagram. This is the only reconstructed visual and must state that it is not recorded session footage.
9. **Luna and Sol.** Continue the same labeled diagram to explain Luna's primary implementation/fix role and Sol's planning, difficult-decision, and review role. Do not invent dialogue or imply Luna worked without guidance.
10. **The cost.** Show `APPROXIMATE AI-RELATED COST / $20` beside an authentic evidence montage: Go backend, web frontend, Android experience, animations, connected workflows, and test output. Do not show a fabricated invoice or usage dashboard.
11. **Reusable leverage.** Show the real project tree (`api/`, `web/`, `applications/android/`, `promotions/`) and real harness-side artifacts. Discuss hosted builders fairly; do not invent competitor pricing or capabilities.
12. **The actual point.** Return to live app recordings, source evidence, tests, and a short labeled diagram recap. State that vibe coding is powerful but not mindless coding, and that engineering knowledge converts generated output into reliable software.
13. **Open-source teaser and hiring.** End on the strongest live positive application sequence, then show `BUILT IN APPROXIMATELY TWO HOURS`, `APPROXIMATE COST: $20`, `POWERED BY A CUSTOM HARNESS`, `OPEN SOURCE — SOON`, and `WANT TO HIRE THIS NINJA?`. Finish the narration with `Aabhar.` and a clean positive live frame.

## Evidence sources

The first implementation pass will build a claim-to-evidence manifest. Initial sources are:

- API overview and route/security contracts: `api/README.md`.
- Auth and session implementation: `api/internal/service/auth.go`, `api/internal/handler/auth.go`.
- API routing and middleware: `api/internal/router/`, `api/internal/handler/`.
- Data model and financial behavior: `api/internal/model/`, `api/internal/repository/`, `api/internal/service/`.
- Index and query safety: `api/internal/db/indexes.go` and its tests.
- Frontend API contract: `web/src/lib/api-client.ts` and `web/src/lib/api-client.test.ts`.
- Workspace and persistence flow: `web/src/app/app-context.tsx` and related tests.
- Real transaction/account UI: `web/src/pages/finance/`, `web/src/components/quick-add-sheet.tsx`, and related tests.
- Real motion source: `web/src/components/motion/` and navigation components.
- Android QA and release evidence: `applications/android/evidence/qa-run-20260802-release-pass1/`, `applications/android/evidence/qa-run-20260802-release-pass2/`, and `promotions/recordings/raw/`.
- Positive, privacy-safe product flow notes: `promotions/documentation/features.md`.

The final evidence manifest will record, for every technical statement, the exact source file, command output, recording, or emulator capture used in the frame. If a requested proof cannot be captured authentically, the narration will be narrowed or the visual will be omitted.

## Remotion structure

- Keep `promotions/src/Root.tsx` as the 1080 × 1920 / 30 fps entry point.
- Replace the product-centered scene collection in `promotions/src/scenes/LedgerlyLaunch.tsx` with the 13-section engineering-showcase timeline.
- Keep timing in a generated audio manifest. Scene starts, visual evidence clips, and final tail all derive from measured audio durations and frame counts.
- Extend `promotions/src/components/MotionPrimitives.tsx` with focused primitives for live phone footage, code/source evidence, captured command output, labeled conceptual workflow diagrams, compact glass labels, and safe scene transitions.
- Use `OffthreadVideo` for every application recording. Use `Img` only for logos, source cards, or audit assets—not as a substitute for final app footage.
- Keep one theme object in `promotions/src/theme.ts`; no inline colors or linear easing.
- Preserve the five-layer scene discipline while ensuring grade/grain/vignette do not cover or alter the sharp foreground phone recording.

## Audio and timing

The new narration is written in approximately 17 connected chunks covering all 13 sections. Every placeholder in the supplied brief is replaced with verified Ledgerly terminology before Pocket TTS generation. Each clip is measured, trimmed at its edges, and joined with a short crossfade. The generated manifest is the single timing authority; no fixed-duration scene array remains.

The visual edit may cross a section boundary while the previous sentence is finishing. Phone footage is selected by measured timecodes, and technical evidence cards enter on eased, clamped frame ranges. No scene may end with a silent hold or introduce a multi-second pause.

## Verification and acceptance

Before completion:

1. Run the invariant test to reject placeholders, stale product-ad copy, fake orchestration ordering, screenshot-only app scenes, foreground blur/filter/opacity, and negative-value copy.
2. Run Go tests in `api/`, web tests/typecheck/lint in `web/`, and Android script tests in `applications/android/`.
3. Execute the requested Android release build command with the supplied `VITE_API_BASE_URL`, install the APK, and repeat the selected emulator workflows twice using UI-tree-derived coordinates and logcat/crash checks.
4. Generate a 30–45 second sample first and inspect its extracted frames, including a live phone recording and a technical evidence card.
5. Render the complete H.264 master at CRF 16–18 with AAC 48 kHz, 1080 × 1920, 30 fps, yuv420p, and BT.709 metadata.
6. Extract frames at the hook, every evidence transition, all model/harness diagram states, the cost reveal, and the final `Aabhar.` tail. Inspect every extracted frame for text overflow, stale placeholders, false terminal/source claims, negative values, phone blur, double-phone ghosts, jitter, or empty gaps.
7. Decode the entire final video and audio independently, run silence detection, verify duration against the audio manifest, and verify that the final frame lands within one second after `Aabhar.`.
8. Watch the complete rendered video from beginning to end once at full speed and once at a reduced preview speed for motion/jitter review.

The final handoff includes the master video, sample, evidence manifest, verification report, extracted proof frames/contact sheet, and Android APK/evidence paths.
