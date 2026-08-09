# Harness Story V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify an original 2:20–3:00 dark cinematic Remotion video whose subject is the reusable development harness, using a single 30-second live Android proof sequence and no fabricated technical evidence.

**Architecture:** V2 is isolated from the current cinematic composition. Measured Pocket TTS audio produces the master timeline; a typed beat map drives the visuals. Dedicated V2 components own the app proof, engineering evidence, harness visualization, and final render validation.

**Tech Stack:** Remotion 4, React 18, TypeScript, Pocket TTS `javert`, ffmpeg/ffprobe, native Android `adb` capture, Go test output.

## Global Constraints

- 1080×1920, 9:16, 30 FPS, H.264 High, yuv420p, BT.709, 48 kHz AAC, faststart delivery.
- Runtime must be 2:20–3:00; target approximately 2:45.
- The app feature section is one contiguous 30-second live Android sequence; no app-tour content elsewhere.
- Android recordings use a native 1080×2424 Pixel 9 display with no `wm size` or density override; crop in Remotion only.
- Real application/video/source/test/API evidence only. The harness/model diagram is disclosed as reconstructed workflow visualization.
- Keep transaction evidence positive; never show a negative/minus financial value.
- Use Pocket TTS only: `uvx pocket-tts generate --language english --voice javert`.
- Preserve complete speech tails with ceil-rounded durations and 4–8 safety frames. Do not nest audio under visuals.
- Do not reuse V1/Cinematic narration, screen-recording range, static composition, or diagram state.

---

### Task 1: Verify native Android capture state and record the missing real workflow

**Files:**
- Create: `promotions/recordings/harness-story-v2/README.md`
- Create: `promotions/recordings/harness-story-v2/*.mp4`
- Create: `promotions/recordings/harness-story-v2/manifest.json`
- Modify: `promotions/public/mobile/harness-story-v2/` (copied validated capture assets only)

**Consumes:** Pixel 9 AVD, `io.github.d4rkninja.ledgerly`, Android QA workflow.

**Produces:** One unique, native proof inventory: workspace creation, invitation/pending-or-active member state, shared state, positive financial activity, dashboard, and one mobile interaction animation.

- [ ] **Step 1: Prove the native display configuration before capture.**

  Run:

  ```powershell
  adb -s emulator-5554 shell wm size
  adb -s emulator-5554 shell wm density
  ```

  Expected: `Physical size: 1080x2424` with no `Override size`, and physical density with no override.

- [ ] **Step 2: Inspect and authenticate the real app workflow.**

  Resolve the installed activity and use Android UI state/validated interaction to reach workspace creation, members, accounts, transactions, and dashboard. Do not substitute a demo view or a web browser view.

- [ ] **Step 3: Capture each proof state once.**

  Use `adb screenrecord` for unique ranges, stop and discard any range showing an error, keyboard obstruction, black frame, or negative value. Capture source resolution at 1080×2424; do not issue a `wm size 1080x1920` command.

- [ ] **Step 4: Write the evidence manifest.**

  Use this shape for every retained recording:

  ```json
  {
    "id": "workspace-create",
    "source": "recordings/harness-story-v2/workspace-create-take1.mp4",
    "publicPath": "mobile/harness-story-v2/workspace-create-take1.mp4",
    "realEvidence": "Creates a private workspace in the native Android application",
    "usableRangeSeconds": [0.5, 4.2],
    "playbackRate": 1.5
  }
  ```

- [ ] **Step 5: Validate capture quality.**

  Extract a contact sheet, inspect every retained range, and run `ffprobe` for 1080×2424 dimensions and readable frame rate. Reject any duplicate or broken range.

### Task 2: Create concise V2 narration and the measured master audio timeline

**Files:**
- Create: `promotions/audio/scripts/v2/01-opening-claim.txt`
- Create: `promotions/audio/scripts/v2/02-application-proof.txt`
- Create: `promotions/audio/scripts/v2/03-two-hour-build.txt`
- Create: `promotions/audio/scripts/v2/04-engineering-knowledge.txt`
- Create: `promotions/audio/scripts/v2/05-custom-harness.txt`
- Create: `promotions/audio/scripts/v2/06-luna-and-sol.txt`
- Create: `promotions/audio/scripts/v2/07-cost.txt`
- Create: `promotions/audio/scripts/v2/08-multiplier.txt`
- Create: `promotions/audio/scripts/v2/09-closing.txt`
- Create: `promotions/scripts/make-v2-voiceover.mjs`
- Create: `promotions/scripts/build-v2-audio-manifest.mjs`
- Create: `promotions/src/v2/audioManifest.ts`

**Consumes:** The accepted V2 narration, Pocket TTS `javert`, current ffmpeg boundary protection.

**Produces:** Nine real WAV thoughts and a measured independent audio manifest with a final duration in 4,200–5,400 frames.

- [ ] **Step 1: Write the failing timeline validation.**

  Create `promotions/scripts/assert-harness-story-v2-invariants.mjs` with an assertion that `V2_DURATION_IN_FRAMES / 30` is at least 140 and at most 180, there are exactly nine V2 audio clips, and the app-proof beat has 900 frames.

- [ ] **Step 2: Run the invariant before the V2 manifest exists.**

  Run:

  ```powershell
  node scripts/assert-harness-story-v2-invariants.mjs
  ```

  Expected: failure identifying the missing V2 manifest or composition export.

- [ ] **Step 3: Implement the new text and Pocket TTS generator.**

  Base `make-v2-voiceover.mjs` on the current `make-voiceover.mjs`, but read only `audio/scripts/v2`, write only `audio/generated/v2`, pass `--voice javert`, pad the lead/tail, reject missing EOS, and retain whole speech tails.

- [ ] **Step 4: Generate and measure audio.**

  Run `uvx pocket-tts generate --help` first, then `node scripts/make-v2-voiceover.mjs` and `node scripts/build-v2-audio-manifest.mjs`. Use `Math.ceil(durationSeconds * fps) + 6` as the playback duration safety floor.

- [ ] **Step 5: Verify audio.**

  Run the existing silence/boundary verifier against V2 paths (or an explicit V2 equivalent). Expected: no clipped tail, no overlap, and each natural gap no longer than 0.4 seconds.

### Task 3: Define the V2 beat contract and authentic evidence registry

**Files:**
- Create: `promotions/src/v2/beatMap.ts`
- Create: `promotions/src/v2/evidence.ts`
- Test: `promotions/scripts/assert-harness-story-v2-invariants.mjs`

**Consumes:** Measured `src/v2/audioManifest.ts` and validated Android evidence manifest.

**Produces:** `VideoBeat`, `V2_BEATS`, `APP_PROOF_DURATION_IN_FRAMES`, `V2_DURATION_IN_FRAMES`, and a unique-source registry used by every V2 scene.

- [ ] **Step 1: Expand the failing invariant.**

  Require one `VideoBeat` per narration thought, monotonic non-overlapping frame boundaries, a 900-frame app proof, exact unique Android `src` values, and explicit conceptual disclosure for harness/model beats.

- [ ] **Step 2: Run it and confirm invalid/missing values fail.**

  Run `node scripts/assert-harness-story-v2-invariants.mjs`; expected failure before `beatMap.ts` exports the contract.

- [ ] **Step 3: Implement the typed contract.**

  ```ts
  export type VideoBeat = {
    id: string;
    startFrame: number;
    endFrame: number;
    narrationText: string;
    primaryVisual: string;
    visualAction: string;
    realEvidence?: string;
    caption?: string;
  };
  ```

  Derive all frame boundaries from measured audio clip starts; do not hand-time audio to visual sequences.

- [ ] **Step 4: Run the invariant and TypeScript check.**

  Run `node scripts/assert-harness-story-v2-invariants.mjs` and `npm.cmd run typecheck`. Expected: both exit 0.

### Task 4: Build the new V2 dark cinematic primitives and app-proof sequence

**Files:**
- Create: `promotions/src/v2/theme.ts`
- Create: `promotions/src/v2/V2Primitives.tsx`
- Create: `promotions/src/v2/AppProofSequence.tsx`
- Test: `promotions/scripts/assert-harness-story-v2-invariants.mjs`

**Consumes:** V2 beat/evidence registries and 1080×2424 Android assets.

**Produces:** A 900-frame, connected, unique native app proof visual that crops source video with `objectFit: 'cover'` inside the 1080×1920 composition without changing emulator resolution.

- [ ] **Step 1: Add invariant checks for the visual language.**

  Assert the V2 theme is dark, uses violet/cyan accents, has mobile-safe typography, and does not render a permanent `GlassPanel` or a static full-phone frame through the whole proof.

- [ ] **Step 2: Implement motion primitives.**

  Export `SignalField`, `KineticWords`, `EvidenceStamp`, `MatteTransition`, and `NativeVideoCrop`. `NativeVideoCrop` accepts `{ src, trimBefore, trimAfter, playbackRate, focalY }` and uses a single unique source entry.

- [ ] **Step 3: Implement the app proof.**

  Build the 30-second sequence as one connected flow: workspace creation → member invite/state → shared workspace → positive financial record → reflected dashboard → polished mobile interaction → brief real verification flash. Use each source range exactly once and make transitions readable rather than frantic.

- [ ] **Step 4: Render and inspect the app-proof window.**

  Render frames covering the 900-frame V2 app beat at half scale, create a contact sheet, and inspect it for full native layout, no duplicate range, no keyboard, no error state, and no negative values.

### Task 5: Build engineering, harness, model, cost, multiplier, and close visuals

**Files:**
- Create: `promotions/src/v2/EngineeringEvidence.tsx`
- Create: `promotions/src/v2/HarnessVisuals.tsx`
- Modify: `promotions/src/v2/V2Primitives.tsx`
- Test: `promotions/scripts/assert-harness-story-v2-invariants.mjs`

**Consumes:** Real Go source/test/API evidence and V2 visual primitives.

**Produces:** The non-application 80% of the film, focused on engineering knowledge and the custom harness.

- [ ] **Step 1: Add evidence and disclosure assertions.**

  Assert real source/test/API labels for code/test scenes, exact Harness control hierarchy, `GPT-LUNA` primary implementation, `SOL` planning/difficult review, and visible `WORKFLOW VISUALIZATION — reconstructed from the actual development process` disclosure.

- [ ] **Step 2: Implement concise evidence scenes.**

  Show only actual source lines that support auth, isolation, bad-input rejection, and passing tests. Never fabricate terminal text, source, API response, session footage, or AI chats.

- [ ] **Step 3: Implement the progressive harness circuit.**

  Route project context, rules, skills, architecture, plan, test requirements, and failures into CUSTOM HARNESS. Animate implementation, test, review, fix, and verification as a continuously evolving circuit that ends at the working application.

- [ ] **Step 4: Implement models, cost, multiplier, and close.**

  Keep Sol and Luna inside the harness. Scope `≈ $20` to this build. Let the harness path continue beyond one output. End within a short tail after `Aabhar.`.

- [ ] **Step 5: Run invariant and type checks.**

  Run `node scripts/assert-harness-story-v2-invariants.mjs` and `npm.cmd run typecheck`. Expected: both exit 0.

### Task 6: Assemble the independent-audio composition and register it

**Files:**
- Create: `promotions/src/v2/HarnessStoryV2.tsx`
- Modify: `promotions/src/Root.tsx`
- Modify: `promotions/package.json`
- Test: `promotions/scripts/assert-harness-story-v2-invariants.mjs`

**Consumes:** All V2 components and the measured audio/beat map.

**Produces:** A new `LedgerlyHarnessStoryV2` Remotion composition at 1080×1920/30 FPS with independent audio tracks.

- [ ] **Step 1: Add a composition-registration invariant.**

  Require `LedgerlyHarnessStoryV2`, `durationInFrames={V2_DURATION_IN_FRAMES}`, `fps={30}`, `width={1080}`, and `height={1920}` in `Root.tsx`.

- [ ] **Step 2: Render audio independently.**

  For each measured clip, use `Sequence from={segment.fromInFrames}` with an audio duration of `Math.ceil(segment.durationSeconds * fps) + 6`, not the visual beat duration. Begin visual scene transitions early while prior audio finishes.

- [ ] **Step 3: Register V2 without removing V1.**

  Add the new composition and V2-specific `render:v2`/`render:v2:preview` package scripts. Do not alter the existing V1 composition registration yet.

- [ ] **Step 4: Validate compilation.**

  Run `npm.cmd run typecheck` and `node scripts/assert-harness-story-v2-invariants.mjs`. Expected: both exit 0.

### Task 7: Render V2, audit it twice, and promote only the verified final

**Files:**
- Create: `promotions/scripts/render-harness-story-v2.mjs`
- Create: `promotions/checks/harness-story-v2/` (generated audit outputs)
- Create: `promotions/out/ledgerly-harness-story-v2-final.mp4` (verified delivery)

**Consumes:** `LedgerlyHarnessStoryV2`, V2 audio, real evidence assets, ffmpeg verification.

**Produces:** One final high-quality H.264 master with two independent audit reports.

- [ ] **Step 1: Render a full V2 candidate.**

  Render `LedgerlyHarnessStoryV2` with H.264 CRF 16–18, High profile, yuv420p, BT.709, AAC 192–256 kb/s, 48 kHz, and `+faststart`.

- [ ] **Step 2: Run the first complete audit.**

  Verify dimensions, frame count, duration, codecs, loudness, peak, silence, audio/video durations, output contact sheet, full-timeline `freezedetect`, 30-second showcase boundaries, and all evidence disclosures.

- [ ] **Step 3: Fix only verified failures.**

  If a frame is blank, an app capture shows a bug, a narration tail clips, a visual repeats, or a freeze is detected, repair the responsible V2 component or asset selection and rerender. Do not mask a failed proof with a fabricated replacement.

- [ ] **Step 4: Promote and audit the canonical final a second time.**

  Promote the passing candidate to `out/ledgerly-harness-story-v2-final.mp4`, then repeat the full decode, metadata, audio, freeze, and contact-sheet audit against that exact filename.

- [ ] **Step 5: Remove only superseded V2 intermediates.**

  After canonical verification, delete the `.render`, `.base`, sample, and QA V2 videos only. Preserve raw Android recordings, manifests, checks, and the final V2 master. Do not delete unrelated working-tree files.

### Task 8: Final regression proof and handoff

**Files:**
- Modify: `promotions/scripts/assert-harness-story-v2-invariants.mjs` only if a missing acceptance requirement is discovered during audit.
- Verify: `promotions/out/ledgerly-harness-story-v2-final.mp4`

**Consumes:** Canonical V2 final and audit results.

**Produces:** Evidence-backed handoff with no false claims.

- [ ] **Step 1: Run fresh regression checks.**

  Run:

  ```powershell
  npm.cmd run typecheck
  node scripts/assert-harness-story-v2-invariants.mjs
  npm.cmd run audio:verify
  npm.cmd run audio:verify-boundaries
  $env:GOCACHE = 'D:\Codeverse\ledgerly\.gocache'; go test ./...
  ```

- [ ] **Step 2: Verify the canonical output inventory.**

  Confirm the final V2 master exists and only obsolete V2 intermediate videos were removed.

- [ ] **Step 3: Review requirement coverage.**

  Confirm every accepted requirement maps to an audited visual: 30-second real app proof, two-hour claim, engineering knowledge, Custom Harness control hierarchy, Luna/Sol roles, scoped $20 cost, multiplier, open-source teaser, hiring line, and `Aabhar.`.

- [ ] **Step 4: Commit only scoped V2 source and documentation changes.**

  Stage explicit V2 files and documentation, never broad globs in the dirty repository. Commit only after all final verification succeeds.
