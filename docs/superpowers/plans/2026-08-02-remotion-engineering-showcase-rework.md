# Remotion Engineering Showcase Video Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the product-promo composition with a 4–5 minute evidence-first engineering showcase whose application proof uses authentic live recordings and whose Luna/Sol section is an explicitly labeled conceptual workflow visualization.

**Architecture:** A generated evidence manifest will bind every technical card to real source files, real command output, or real API/emulator captures. A new 17-clip narration manifest will drive 13 visual sections, so visual section starts and the final tail are derived from measured audio. Remotion will use centered `OffthreadVideo` clips for all application proof and separate source/command/API cards for technical proof; no final application claim will use a screenshot still.

**Tech Stack:** Remotion 4, React 18, TypeScript, Pocket TTS (`uvx pocket-tts`), FFmpeg/ffprobe, Go tests, Vitest web tests, Android Gradle/Capacitor release build, adb, and the existing Ledgerly API/web/Android workspace.

## Global Constraints

- The video is vertical 9:16 at exactly 1080 × 1920 and 30 fps.
- Target duration is approximately 4–5 minutes and is determined by measured narration, not fixed scene durations.
- Application proof in the final composition uses live MP4 recordings only; screenshots/stills are audit assets, not application proof shots.
- Technical claims use only authentic Go source, web source, real tests/output, real API requests/responses, real terminal commands, real application workflows, real validation/error states, and real project files.
- No fabricated terminal sessions, source code, test results, API responses, or AI conversations.
- The Luna/Sol workflow is shown only as an animated diagram labeled `Workflow visualization — reconstructed from the actual development process` or `Conceptual orchestration diagram — not recorded session footage`.
- The diagram order is `CUSTOM HARNESS` → `Context + skills + task planning` → `GPT-LUNA` → `SOL` → `Tests + verification` → `Working application`.
- Foreground phone footage has opacity 1, no filter, no backdrop filter, no covering gradient, no translucent overlay, and no blur transition.
- No final application frame may show a negative amount or a minus-value artifact.
- Narration is approximately 17 connected Pocket TTS clips with no long pauses; the final video ends within one second after `Aabhar.`.
- Use clamped easing for every interpolation, `spring()` or themed easing for entrances, staggered motion, faster exits, and no CSS animation.
- Use the installed official `remotion-dev/skills` package under `.agents/skills`; apply its best-practices, markup, interactivity, multimedia, captions, render, and documentation guidance where relevant, while preserving the existing project instead of scaffolding a new one.
- The final master is H.264 CRF 16–18, yuv420p, BT.709, AAC 48 kHz, and fast-start compatible.

---

### Task 1: Add failing authenticity and composition invariants

**Files:**
- Create: `promotions/scripts/assert-engineering-showcase-invariants.mjs`
- Modify: `promotions/package.json`
- Test: `promotions/scripts/assert-engineering-showcase-invariants.mjs`

**Interfaces:**
- Consumes: current source text, audio script files, generated evidence manifest, and `LedgerlyLaunch.tsx`.
- Produces: a deterministic `npm run test:engineering-invariants` gate that fails before the rework and passes only when the final composition obeys the approved authenticity boundary.

- [ ] **Step 1: Write the failing invariant script**

  Assert the following concrete conditions:

  ```js
  const scene = read('src/scenes/LedgerlyLaunch.tsx');
  const primitives = read('src/components/MotionPrimitives.tsx');
  const scripts = glob('audio/scripts/*.txt').map(read);

  assert(scene.includes('LivePhoneFootage'));
  assert(!scene.includes('StillPhone'));
  assert(scene.includes('CUSTOM HARNESS'));
  assert(scene.includes('Workflow visualization'));
  assert(scene.includes('GPT-LUNA'));
  assert(scene.includes('SOL'));
  assert(!scene.includes('Luna → Sol → Harness'));
  assert(!scripts.some((text) => /\[[A-Z0-9_ ]+\]/.test(text)));
  assert(!scene.includes('Ledgerly / money clarity'));
  assert(!primitives.includes('backdropFilter: "blur'));
  assert(!primitives.includes('filter: "blur'));
  ```

  Also require the evidence manifest to contain `source`, `command`, `api`, and `recording` entries, and reject any visible copy containing `TODO`, `TBD`, `ACTUAL ENTITY`, `fake terminal`, or `test passed` when it is not sourced from captured output.

- [ ] **Step 2: Run the test to verify it fails**

  Run: `npm.cmd run test:engineering-invariants`

  Expected: FAIL because the current composition uses the old nine-scene product story, `StillPhone`, and the old product-centered labels.

- [ ] **Step 3: Add the package script**

  Add this script without changing the existing render scripts:

  ```json
  "test:engineering-invariants": "node scripts/assert-engineering-showcase-invariants.mjs"
  ```

- [ ] **Step 4: Re-run after the composition tasks**

  The gate must pass only after Tasks 2–6 have replaced the old scene and evidence model. Keep the check in the final verification sweep.

---

### Task 2: Capture and freeze authentic evidence

**Files:**
- Create: `promotions/scripts/capture-authentic-evidence.mjs`
- Create: `promotions/scripts/capture-live-api-evidence.mjs`
- Create: `promotions/public/evidence/manifest.json`
- Create: `promotions/public/evidence/source/`
- Create: `promotions/public/evidence/commands/`
- Create: `promotions/public/evidence/api/`
- Modify: `promotions/package.json`

**Interfaces:**
- Consumes: `api/`, `web/`, `applications/android/`, the running API endpoint, and the installed Android emulator.
- Produces: immutable-looking evidence records with `id`, `kind`, `source`, `command`, `cwd`, `capturedAt`, `status`, and `text`/`json` fields. Remotion cards consume only this manifest.

- [ ] **Step 1: Write the capture script before changing the video**

  `capture-authentic-evidence.mjs` must read actual files and run actual commands; it must never synthesize a success line. Capture these source excerpts:

  ```text
  api/README.md
  api/internal/service/auth.go
  api/internal/handler/auth.go
  api/internal/router/router.go
  api/internal/router/middleware.go
  api/internal/repository/store.go
  api/internal/db/indexes.go
  api/internal/handler/frontend_contract_test.go
  web/src/lib/api-client.ts
  web/src/app/app-context.tsx
  web/src/pages/finance/data.ts
  web/src/pages/finance/home-transactions.tsx
  web/src/components/quick-add-sheet.tsx
  ```

  Store exact source lines with the relative path and line range. Redact only tokens, passwords, email addresses, IP credentials, and request bodies that contain secrets; label a redaction as `[redacted]` rather than inventing a replacement.

- [ ] **Step 2: Capture real command output**

  Run and store stdout/stderr and the exit code for:

  ```text
  go test ./...                         (cwd: api)
  npm.cmd run test:run                  (cwd: web)
  npm.cmd run typecheck                 (cwd: web)
  npm.cmd run lint                      (cwd: web)
  npm.cmd run test:scripts              (cwd: web)
  ```

  Store each command exactly as executed with its cwd. A failed command is stored as failed evidence and is not shown as a passing result.

- [ ] **Step 3: Capture real API requests and responses**

  `capture-live-api-evidence.mjs` must perform safe, non-mutating or intentionally invalid requests against the reachable endpoint and store the actual status, headers safe for display, and body:

  ```text
  GET  http://80.225.194.189:3001/health
  GET  http://80.225.194.189:3001/api/v1/workspaces
  POST http://80.225.194.189:3001/api/v1/auth/register
       {"name":"x","email":"not-an-email","password":"short","preferredCurrency":"INR","termsAccepted":false}
  ```

  Use `--fail-with-body`-equivalent behavior so validation/401 responses are retained rather than treated as fabricated failures. Do not include credentials or tokens. If the endpoint is unavailable, show the authentic source/test evidence instead and record the unavailable endpoint in the verification report.

- [ ] **Step 4: Add the evidence package scripts**

  Add:

  ```json
  "evidence:capture": "node scripts/capture-authentic-evidence.mjs",
  "evidence:api": "node scripts/capture-live-api-evidence.mjs"
  ```

  Run both scripts and fail if the manifest contains a claim without a source path or capture command.

---

### Task 3: Record the live Android application proof pass

**Files:**
- Create: `promotions/recordings/raw/ledgerly-engineering-showcase-pass.mp4`
- Create: `promotions/recordings/raw/ledgerly-engineering-validation-pass.mp4`
- Create: `promotions/documentation/live-recording-manifest.md`
- Modify: `promotions/documentation/features.md`

**Interfaces:**
- Consumes: the release APK built with the requested API URL, `emulator-5554`, adb, UI-tree bounds, and the verified `d4rkninja` flow.
- Produces: authentic live MP4 recordings with timecoded onboarding, dashboard, account, income, navigation, persistence, and validation/error states. The new composition uses these MP4s through `OffthreadVideo`.

- [ ] **Step 1: Build the requested release APK before capture**

  From `web/`, run exactly:

  ```powershell
  $env:VITE_API_BASE_URL='https://80.225.194.189:3001/api/v1'; npm.cmd run android:build:release
  ```

  Record the real build output and APK path in the evidence manifest. Do not echo or embed credentials.

- [ ] **Step 2: Start a real screen recording and drive only UI-tree-derived taps**

  Use the Android QA skill workflow: resolve the package/activity, dump the UI tree before every interaction, derive bounds with `ui_pick.py`, then tap. Record these authentic states:

  ```text
  account name d4rkninja and consent completion
  remembered-device PIN gate after relaunch
  workspace home with a positive balance
  More → Accounts with Primary Cash
  Quick add → Income with Paycheck and a positive amount
  saved positive dashboard state after refresh/relaunch
  navigation through Home, Entries, Budgets, and More
  one real validation/error state with no secret or negative-value frame
  ```

  Save the full recordings by pulling the emulator MP4, not by reconstructing frames from screenshots. Record the exact timecodes for stable readable sections.

- [ ] **Step 3: Verify the recordings**

  Use ffprobe to confirm video stream, duration, dimensions, and constant frame rate. Extract contact sheets from both recordings. Reject any segment with minus values, emulator overlays, unreadable UI, duplicated phone content, or encoder corruption.

- [ ] **Step 4: Document the recording manifest**

  Write a table mapping each timecode to the claim it proves, for example `positive-dashboard → persisted positive balance`, `income-form → validation and connected write`, and `more-navigation → animated navigation and privacy controls`. Include the fact that screenshots are not used in the final composition.

---

### Task 4: Replace the nine product-ad narration clips with 17 engineering-showcase clips

**Files:**
- Delete: `promotions/audio/scripts/01-hook.txt` through `promotions/audio/scripts/09-close.txt`
- Create: `promotions/audio/scripts/01-result.txt` through `promotions/audio/scripts/17-close.txt`
- Modify: `promotions/scripts/make-voiceover.mjs`
- Modify: `promotions/scripts/tighten-voiceover.mjs`
- Modify: `promotions/scripts/build-audio-manifest.mjs`
- Modify: `promotions/scripts/verify-audio-silence.mjs`
- Modify: `promotions/package.json`

**Interfaces:**
- Consumes: the approved 13-section narrative and verified Ledgerly terminology.
- Produces: 17 measured WAV clips, a generated `promotions/public/audio/audio-manifest.json`, and `promotions/src/audioManifest.ts` with `fromInFrames`, `durationInFrames`, and the final tail.

- [ ] **Step 1: Write the failing audio/content assertions**

  Extend the invariant script to require these exact terms in the joined narration source:

  ```text
  approximately two hours
  approximately $20
  Golang backend
  GPT-Luna
  Sol
  custom harness
  authentication
  workspace
  Primary Cash
  Paycheck
  end-to-end testing
  Aabhar.
  ```

  Also reject product-ad-only copy such as `a calmer way to stay close to your money` when it appears without an engineering claim.

- [ ] **Step 2: Write the 17 connected narration files with no placeholders**

  Use this content direction, with each file containing one to three connected sentences and no standalone joke clip:

  ```text
  01-result:
  I built this entire working application suite in approximately two hours. A real Golang backend, a real web frontend, a mobile application experience, authentication, database operations, forms, validation, animated interfaces, connected workflows, error handling, and end-to-end testing.

  02-result-proof:
  Fully functional and prepared for production use. And yes, I said approximately two hours. But wait, wait, wait. Before someone calls this another vibe-coded demo, let me show you what was actually built.

  03-real-software:
  This is not Figma, a collection of attractive screens connected by hope, or a landing page with six animations and no backend. The frontend talks to an actual Golang API, and the data is validated, stored, retrieved, updated, and displayed through real workflows.

  04-live-proof:
  I start with a real d4rkninja account, complete the required consent step, and let the application create the private workspace. No hidden record waiting for the camera. The first screen is a real request, a real response, and a real session.

  05-live-proof-detail:
  Then I add the real Primary Cash savings account and create a positive Paycheck income record. The form validates the fields, the backend writes the record, the dashboard reads the new state, and the same workspace is still there after a relaunch. That is a workflow, not a screenshot.

  06-vibe-coding:
  This entire system was created through vibe coding. Not by manually writing every function line by line, and not by spending three weeks moving buttons by four pixels. AI handled a major portion of the implementation. That sounds simple. It is simple. Simple. Simple. Simple. Cute, right? Not too cute.

  07-knowledge:
  Because generating code is only the beginning. AI can write Golang, create React components, connect APIs, build forms, create database queries, and generate tests. But how do you know the architecture is correct? How do you know authentication is secure and one user cannot see another user's data?

  08-knowledge-detail:
  How do you know invalid input is rejected, a database mutation is safe, the frontend request matches the backend contract, or a fix in one module did not quietly break another? AI generates code. Someone still needs to authenticate the result—not user authentication, engineering authentication.

  09-testing:
  That is why I did not test this by opening each page, looking at it for two seconds, and saying, “Looks production-ready to me.” The actual workflows were tested: valid input, missing fields, invalid values, duplicate behavior, unauthorized requests, incorrect identifiers, empty responses, and real API errors.

  10-testing-detail:
  Records were created, edited, searched, refreshed, and verified across connected modules. The Go suite, the web suite, and the Android checks all leave evidence. Does that mean the application can never contain a bug? No. I am confident, not spiritually delusional. It means the production-ready claim has evidence behind it.

  11-motion:
  The interface is animated too. Navigation, cards, dialogs, forms, loading states, empty states, charts, and feedback use deliberate motion. The animation supports the interaction instead of delaying it, because building quickly does not mean the result has to look unfinished.

  12-harness:
  Now let us discuss the most misunderstood part of vibe coding. Everyone asks which model is best. The model matters, but the harness around the model is equally important. It controls the context, the skills, the plan, the implementation loop, the tests, the review, and the final verification.

  13-models:
  Most of the implementation was handled by GPT-Luna, the primary construction and fixing model in this workflow. Sol handled planning, difficult decisions, and review. Sol stood there with a clipboard and occasionally said, “Perhaps do not destroy authentication.” This is a workflow visualization, not a recorded model session.

  14-cost:
  Now for the cost. The approximate AI-related cost was around twenty dollars. Not twenty dollars for a login page. Around twenty dollars for the backend, frontend, mobile experience, animations, connected functionality, and testing you are watching.

  15-leverage:
  With a personal harness, I control the model, the context, the skills, the architecture, the source tree, and the verification loop. Hosted builders can be useful for a fast start, but the harness is reusable leverage. The application is one result. The system that builds the next one is the multiplier.

  16-point:
  So the point is not that AI magically replaces knowledge. It is the opposite. Knowledge lets one person direct far more execution than before. Vibe coding is not pressing Enter and trusting destiny. It is knowing what to ask for, what to test, when the model is wrong, and when the output is ready for production.

  17-close:
  I improve this harness every day. Every failure becomes another rule, every repeated task becomes another skill, and every application makes the next build faster and more reliable. I plan to open-source the harness soon. If a company wants to hire this ninja for Golang systems, backend architecture, AI workflows, or complete product engineering, yes, you can do that. Enjoy. Aabhar.
  ```

- [ ] **Step 3: Generate, trim, and manifest the audio**

  Run the existing Pocket TTS pipeline once per connected file, trim phrase edges with FFmpeg, join adjacent clips with a 20 ms crossfade, and tighten internal pauses over 350 ms. Use measured ffprobe durations to compute starts with 3–6 frames between clips and a 15-frame final tail. Do not hand-edit scene duration constants.

- [ ] **Step 4: Verify audio before composition work**

  Run: `npm.cmd run audio:verify`

  Expected: all 17 stems pass, no internal silence longer than 450 ms, and total narration duration lands in the 4–5 minute target after composition tail.

---

### Task 5: Add authentic technical-evidence and live-recording primitives

**Files:**
- Create: `promotions/src/evidenceManifest.ts`
- Create: `promotions/src/components/EvidencePrimitives.tsx`
- Modify: `promotions/src/components/MotionPrimitives.tsx`
- Modify: `promotions/src/theme.ts`
- Test: `promotions/scripts/assert-engineering-showcase-invariants.mjs`

**Interfaces:**
- Consumes: generated evidence manifest, the theme, Remotion frame/fps APIs, and live MP4 recording paths.
- Produces: `LivePhoneFootage`, `SourceEvidenceCard`, `CommandEvidenceCard`, `ApiEvidenceCard`, `HarnessWorkflowDiagram`, `BottomEvidenceLabel`, and a scene stack that keeps phone video sharp.

- [ ] **Step 1: Add failing primitive invariants**

  Require the live phone primitive to use `OffthreadVideo` and reject `Img`/`StillPhone` for application proof. Require technical cards to display source/command metadata and require the workflow diagram label to be present in the same render branch as the diagram.

- [ ] **Step 2: Implement `LivePhoneFootage`**

  Use the following contract:

  ```ts
  type LivePhoneFootageProps = {
    src: string;
    startSec: number;
    endSec: number;
    style?: CSSProperties;
    objectPosition?: string;
  };
  ```

  Render `OffthreadVideo` with `startFrom`/`endAt`, `muted`, `objectFit: "fill"`, opacity exactly 1, and no filter/backdrop filter/covering child. Hide the phone only while an intentional scene boundary is being crossed; never show a duplicate phone behind it.

- [ ] **Step 3: Implement evidence cards from the manifest**

  `SourceEvidenceCard` shows actual source path, line range, and code text from the manifest. `CommandEvidenceCard` shows the exact command, cwd, exit code, and captured output. `ApiEvidenceCard` shows method/path/status/body with sensitive values redacted and labeled. None of these components may display a green “PASS” unless the captured exit/status data says so.

- [ ] **Step 4: Implement the labeled workflow diagram**

  Animate the exact six nodes in order with staggered spring entrances and short clamped connectors. Keep this copy visible at the bottom:

  ```text
  Conceptual orchestration diagram — not recorded session footage
  ```

  Use `CUSTOM HARNESS` as the visually dominant node. Do not render a chat bubble, fake terminal, fake code, or fake model transcript.

- [ ] **Step 5: Keep the scene stack safe**

  Retain the background mesh, technical graphics, grade, grain, and vignette discipline, but scope any grade/grain/vignette behind or outside the phone bounds. Keep compact glass labels below the phone or in the safe lower zone. Use themed colors and easing only.

---

### Task 6: Rewrite the complete 13-section composition around live footage and evidence

**Files:**
- Modify: `promotions/src/scenes/LedgerlyLaunch.tsx`
- Modify: `promotions/src/Root.tsx`
- Modify: `promotions/src/components/MotionPrimitives.tsx`
- Modify: `promotions/src/components/EvidencePrimitives.tsx`
- Test: `promotions/scripts/assert-engineering-showcase-invariants.mjs`

**Interfaces:**
- Consumes: 17-segment `audioManifest`, evidence manifest, recording manifest, and the primitives from Task 5.
- Produces: the `LedgerlyFieldGuide` composition with 13 audio-derived visual sections and no screenshot-only application scenes.

- [ ] **Step 1: Replace fixed scene timing with grouped audio timing**

  Define a typed section map:

  ```ts
  type SectionDefinition = {
    id: string;
    segmentIds: string[];
    render: (props: SectionProps) => ReactNode;
  };
  ```

  Compute each section’s start from the first referenced segment and its end from the next section’s first segment, adding only the approved final tail to the last section. The composition duration must equal the generated audio manifest duration plus the final tail.

- [ ] **Step 2: Implement Sections 1–3 with live recordings**

  Use `LivePhoneFootage` clips for launch/onboarding, remembered-device, dashboard, account creation, positive income form, and persisted positive dashboard. Use the exact timecodes from `live-recording-manifest.md`; do not use the existing PNGs as substitutions. Overlay only the short labels `TWO HOURS`, `APPROXIMATE AI-RELATED COST: $20`, `NOT A MOCKUP`, and the real feature labels.

- [ ] **Step 3: Implement Sections 4–7 with authentic technical cards and live application evidence**

  Show real Go/React source excerpts and captured command output in Sections 4–6. Use `ApiEvidenceCard` for the real health/unauthorized/validation responses. Return to live Android/web recording immediately after each technical card. Use live navigation recording plus real web motion source excerpts for Section 7.

- [ ] **Step 4: Implement Sections 8–9 with the conceptual diagram only**

  Render the exact six-node workflow and the explicit reconstruction label. Explain Luna as primary implementation/fixes and Sol as planning/difficult decisions/review. Do not show a fabricated terminal or pretend the diagram is a recording.

- [ ] **Step 5: Implement Sections 10–13 with evidence-backed cost, leverage, conclusion, and close**

  Use real project-tree/source evidence for the harness argument, a creator-reported cost label without a fabricated receipt, live application footage for the close, and `Aabhar.` as the last narration phrase. Keep the final positive live dashboard frame on screen only for the short tail.

- [ ] **Step 6: Run the composition typecheck and invariant gate**

  Run from `promotions/`:

  ```powershell
  npm.cmd run typecheck
  npm.cmd run test:engineering-invariants
  ```

  Expected: both pass, with no `StillPhone` usage in the final scene composition and no stale product-ad scene text.

---

### Task 7: Update render, sample, verification, and evidence documentation

**Files:**
- Create: `promotions/scripts/verify-engineering-showcase.mjs`
- Modify: `promotions/scripts/render-master.mjs`
- Modify: `promotions/scripts/verify-video.mjs`
- Modify: `promotions/scripts/verify-sample.mjs`
- Modify: `promotions/scripts/compare-raw-rendered.mjs`
- Modify: `promotions/package.json`
- Create: `promotions/documentation/evidence-map.md`
- Create: `promotions/documentation/verification-engineering-showcase.md`

**Interfaces:**
- Consumes: final MP4, audio manifest, evidence manifest, recording manifest, and extracted frames.
- Produces: sample/master verification JSON, claim-to-evidence documentation, and explicit checks for authentic source labels, live phone footage, no negative values, continuous audio, and final-tail timing.

- [ ] **Step 1: Add sample checks**

  Require the sample to be 30–45 seconds, 1080 × 1920, 30 fps, H.264/AAC, and to contain at least one live-recording frame and one source/command evidence frame. Reject a sample whose application proof is only an image asset.

- [ ] **Step 2: Add full verification checks**

  Verify dimensions/fps/codec/profile/pixel format/BT.709/AAC 48 kHz, duration against `audioManifest`, mixed-video silence, final tail after `Aabhar.`, and no visible negative/placeholder/fake-session copy in generated evidence text.

- [ ] **Step 3: Make raw-vs-rendered comparison video-aware**

  Compare cropped frames from the new live MP4 timecodes against the rendered phone windows. Do not compare a final phone frame against a PNG. Write `comparison.json` with source path, source timecode, rendered timestamp, and dimensions.

- [ ] **Step 4: Write the evidence map and verification report**

  For every major narration claim, record the exact source file, command output, API response, live recording/timecode, or labeled conceptual diagram. Include known limitations, such as the fact that no Luna/Sol session recording exists.

---

### Task 8: Render, inspect, run all tests, and repeat verification

**Files:**
- Create: `promotions/checks/engineering-sample/`
- Create: `promotions/checks/engineering-master/`
- Modify: `promotions/documentation/verification-engineering-showcase.md`

**Interfaces:**
- Consumes: complete composition, authentic evidence captures, and the Android QA target.
- Produces: verified sample/master deliverables and the final handoff paths.

- [ ] **Step 1: Render the sample first**

  Run:

  ```powershell
  npm.cmd run render:sample
  npm.cmd run verify:sample
  ```

  Extract frames at the hook, first phone transition, first Go/source card, first command output, and first labeled workflow transition. View the contact sheet and individual transition frames. Fix text overflow, phone blur, double-phone ghosts, stale copy, or timing errors before the master render.

- [ ] **Step 2: Run the complete code/test sweep**

  Run:

  ```powershell
  # api/
  go test ./...

  # web/
  npm.cmd run test:run
  npm.cmd run typecheck
  npm.cmd run lint
  npm.cmd run test:scripts

  # promotions/
  npm.cmd run typecheck
  npm.cmd run test:engineering-invariants
  npm.cmd run audio:verify
  ```

  Store fresh outputs in the evidence manifest; do not reuse stale “passed” text.

- [ ] **Step 3: Render the H.264 master**

  Run: `npm.cmd run render`

  Confirm the wrapper invokes Remotion with overwrite and encodes the final master as H.264 CRF 16–18, yuv420p, BT.709, AAC 48 kHz, and faststart.

- [ ] **Step 4: Extract and inspect the entire narrative**

  Extract a contact sheet plus individual frames at every section boundary, every live-phone start/end, every technical-card transition, every diagram node state, the cost reveal, and the final `Aabhar.` tail. Visually inspect all frames with `view_image`. Use a reduced-speed review render to inspect easing, jitter, and motion continuity.

- [ ] **Step 5: Run independent media verification**

  Run the full verification script, independent FFmpeg video/audio decodes, silence detection, raw-vs-rendered live-frame comparison, and a negative-value/placeholder scan. The master fails if any technical panel is unlabeled, any phone proof is a still, any recording is blurred/dimmed, any audio gap is unexplained, or the final tail exceeds one second.

- [ ] **Step 6: Repeat Android QA twice after the final build**

  Install the exact release APK on `emulator-5554`, resolve/launch `io.github.d4rkninja.ledgerly/.MainActivity`, repeat the selected flow twice with UI-tree-derived taps, capture screenshots/UI trees/logcat/crash buffers, and verify no negative-value or runtime-crash state is used by the final video.

- [ ] **Step 7: Complete the handoff**

  Record final master/sample/APK paths, exact build command, test counts, recording timecodes, evidence manifest path, verification JSON, contact sheet, and known limitations in `verification-engineering-showcase.md`.

---

## Self-review checklist

- Every supplied brief section maps to Sections 1–13.
- Every technical claim maps to a real source/output/API/recording entry.
- The only reconstructed visual is the explicitly labeled Luna/Sol workflow diagram.
- The app is always shown as live MP4 footage, never as a screenshot substitute.
- The plan contains no unfilled feature placeholders.
- The section timing interfaces use the same `segmentIds` and generated manifest names throughout.
- The acceptance checks cover authenticity, negative values, audio continuity, sharpness, jitter, and final-tail timing.
