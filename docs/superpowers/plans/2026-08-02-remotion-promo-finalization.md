# Remotion Promo Finalization and Visual Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finalize the existing Ledgerly Remotion promo with a fresh, genuinely decodable master, safe public evidence, corrected captions, and a restrained spacing refinement that keeps the approved visual language.

**Architecture:** Keep the current scene structure, theme, phone footage, evidence components, and motion primitives. Centralize spacing and safe-area constants, replace sensitive/production-only overlays at the evidence boundary, and make the render script promote a temporary file only after complete decode, stream-duration, final-frame, and tail checks pass.

**Tech Stack:** Remotion 4, React/TypeScript, `OffthreadVideo`, FFmpeg/FFprobe, H.264 High, AAC 48 kHz, Pocket TTS `javert` voice for the one corrected cost sentence.

## Global Constraints

- Preserve the dark cinematic background, violet/cyan accents, glass cards, typography, chapter structure, phone framing, code panels, harness-diagram style, and application UI.
- Treat the second brief as the authority for spacing refinement; refine rather than replace the visual identity.
- Use only authentic source, terminal, API, test, and live Android evidence; redact sensitive values without inventing evidence.
- Do not expose IP addresses, hostnames, ports, tokens, API keys, environment values, credentials, database URLs, private paths, or internal production notes in the public video.
- Keep the Luna/Sol workflow visibly labelled as reconstructed and keep CUSTOM HARNESS as the controlling system.
- Keep the positive live app states and exclude the negative-balance source range.
- Render to `out/ledgerly-field-guide-master.rendering.mp4`; decode and inspect it before renaming to `out/ledgerly-field-guide-master-final.mp4`.
- Preserve 1080x1920, 30 fps, H.264 High, `yuv420p`, approximately 10-16 Mbps video, AAC 192-256 kbps, 48 kHz, and `+faststart`.
- Produce and review a 30-45 second sample before the complete render.

---

### Task 1: Establish failing finalization and privacy invariants

**Files:**
- Create: `promotions/scripts/assert-finalization-invariants.mjs`
- Modify: `promotions/package.json`
- Test: `promotions/scripts/assert-finalization-invariants.mjs`

**Interfaces:**
- Consumes the Remotion scene, evidence primitives, theme, and render script as text.
- Produces a nonzero exit code when public-video privacy, disclosure, spacing-token, or safe-render requirements are absent.

- [ ] **Step 1: Write the failing invariant checks**

  Assert that the scene no longer renders `Label chapter` production footers, that the scene does not use `api-client-errors` as a visible source card, that the evidence layer contains a host-redaction helper and `api.example.com`, that the harness diagram contains the reconstructed disclosure and required workflow labels, that `theme.spacing` exists, and that the render script uses `master.rendering.mp4`, `master-final.mp4`, and a verification command before promotion.

- [ ] **Step 2: Run the invariant script and confirm it fails for the current source**

  Run `node scripts/assert-finalization-invariants.mjs` from `promotions/` and record the expected missing-requirement failures before production edits.

- [ ] **Step 3: Add the package script**

  Add `test:finalization-invariants` pointing to the new script so the regression gate is repeatable.

### Task 2: Harden temporary rendering and decode verification

**Files:**
- Modify: `promotions/scripts/render-master.mjs`
- Modify: `promotions/scripts/verify-video.mjs`
- Modify: `promotions/scripts/verify-live-video-sync.mjs`
- Modify: `promotions/package.json`

**Interfaces:**
- `render-master.mjs` renders Remotion output to a run-local intermediate, encodes to `ledgerly-field-guide-master.rendering.mp4`, invokes verification, then renames the verified file to `ledgerly-field-guide-master-final.mp4` without touching the legacy master during rendering.
- `verify-video.mjs` accepts an explicit path, performs the required complete audio/video decode, checks stream durations and frame counts, extracts the final frame and required tail timestamps, and writes a report.
- `verify-live-video-sync.mjs` prefers `master-final.mp4` and falls back to the legacy master only when the new final does not exist.

- [ ] **Step 1: Add a failing decode-gate regression assertion**

  Extend `assert-finalization-invariants.mjs` to require the exact FFmpeg mapping `0:v:0`, `0:a:0`, `-f null -`, stream-duration comparison, final-frame extraction, and tail timestamps `215`, `220`, `225`, `240`, `255`, and `270` seconds.

- [ ] **Step 2: Run the new gate and confirm the current render script fails the new contract**

  Run `npm.cmd run test:finalization-invariants`; it must fail because the current script promotes through a different temporary name without calling the complete decode verifier before copying.

- [ ] **Step 3: Implement the smallest render promotion change**

  Keep the current Remotion command and high-quality FFmpeg settings, but write the validated master encode to `out/ledgerly-field-guide-master.rendering.mp4`, invoke `node scripts/verify-video.mjs <rendering-file> <checks-dir>`, and only then call `fs.renameSync()` to `out/ledgerly-field-guide-master-final.mp4`. Generate the compressed copy from the verified final file.

- [ ] **Step 4: Implement the decode and tail checks**

  Run FFmpeg with `-v error -i <file> -map 0:v:0 -map 0:a:0 -f null -` and fail on any stderr/exit error. Probe stream durations, frame counts, and codec metadata; extract `3:35`, `3:40`, `3:45`, `4:00`, `4:15`, `4:30`, `duration-0.5`, and the final frame. Keep the existing loudness, bitrate, dimensions, and silence checks.

- [ ] **Step 5: Run the gate against the existing clean legacy master**

  Run `node scripts/verify-video.mjs out/ledgerly-field-guide-master.mp4 checks/legacy-master` to prove the new verifier can decode a complete file before a fresh render.

### Task 3: Redact public evidence and remove production footers

**Files:**
- Modify: `promotions/src/components/EvidencePrimitives.tsx`
- Modify: `promotions/src/scenes/LedgerlyLaunch.tsx`
- Modify: `promotions/src/theme.ts`

**Interfaces:**
- Evidence cards continue to display authentic records, but all displayed URLs and known infrastructure paths are visually redacted to safe placeholders.
- The public scene contains no internal `BottomEvidenceLabel` footer; the only production disclosure retained is the reconstructed harness/model diagram disclosure.

- [ ] **Step 1: Add failing privacy/copy checks to the invariant script**

  Assert that no rendered evidence meta path contains the deployed IP literal, no `Label chapter` calls remain, and the cost scene body does not contain both `approximately` and `about`.

- [ ] **Step 2: Replace the visible unsafe source selection**

  Use existing authentic Go records `auth-handler`, `router-middleware`, and `auth-register` for authentication/contract scenes instead of `api-client-errors`. Do not alter the underlying Go excerpts.

- [ ] **Step 3: Add display-only redaction**

  Replace known deployed URL literals in displayed excerpts and API-card metadata with `https://api.example.com/v1`, and replace captured local workspace prefixes with `[workspace]`. Keep the raw evidence records unchanged for auditability.

- [ ] **Step 4: Remove internal bottom labels**

  Remove the `Label` wrapper and its scene calls. Keep captions and the required diagram disclosure; do not alter the approved chapter headers.

- [ ] **Step 5: Run typecheck and invariant checks**

  Run `npm.cmd run typecheck`, `npm.cmd run test:invariants`, `npm.cmd run test:engineering-invariants`, and `npm.cmd run test:finalization-invariants`.

### Task 4: Refine spacing, captions, diagram hierarchy, and cost presentation

**Files:**
- Modify: `promotions/src/theme.ts`
- Modify: `promotions/src/components/MotionPrimitives.tsx`
- Modify: `promotions/src/components/EvidencePrimitives.tsx`
- Modify: `promotions/src/scenes/LedgerlyLaunch.tsx`
- Modify: `promotions/scripts/build-caption-manifest.mjs`
- Regenerate: `promotions/public/captions/caption-manifest.json`, `promotions/src/captionManifest.ts`
- Modify: `promotions/audio/scripts/14-cost.txt`
- Regenerate: `promotions/audio/generated/segment-14-cost.wav`, `promotions/public/audio/generated/segment-14-cost.wav`, `promotions/public/audio/audio-manifest.json`, `promotions/src/audioManifest.ts`

**Interfaces:**
- `theme.spacing` supplies 8/12/16/24/32/40/48/64/80/96 pixel tokens.
- Existing components consume spacing tokens while preserving their current colors, fonts, border treatment, and motion language.
- Caption text remains JSON-backed `Caption` data and stays synchronized to the narration timeline.

- [ ] **Step 1: Add failing spacing/caption checks**

  Require `theme.spacing`, the safe-area constants, the exact cost wording `The approximate AI-related cost for this build was around twenty dollars.`, and corrected caption phrases without trailing commas or awkward lowercase `Paycheck`.

- [ ] **Step 2: Add centralized spacing and safe-area tokens**

  Define the requested scale and use it for scene margins, card padding, caption padding, phone placement, code panels, and diagram gaps. Keep the phone centered and keep captions at least 150 px from the bottom edge.

- [ ] **Step 3: Refine component geometry without changing the visual identity**

  Normalize scene header spacing, technical card padding and height, caption width/padding, phone frame position, metric-card gaps, and workflow-node/arrow spacing. Keep all existing animation primitives and glass treatment.

- [ ] **Step 4: Update the harness diagram order and disclosure**

  Keep the current style but show CUSTOM HARNESS → Context, skills, and project rules → Task planning → GPT-LUNA — primary implementation → Tests and verification → SOL — planning, difficult reasoning, and review → Corrections → Working application. Preserve the explicit reconstructed-session disclosure and show the loop as a subtle secondary row.

- [ ] **Step 5: Correct only the cost narration and captions**

  Change `14-cost.txt` to the exact sentence above, regenerate only that Pocket TTS stem with voice `javert` using the existing trimming parameters, rebuild the audio manifest and caption manifest, and use `APPROXIMATE AI COST FOR THIS BUILD` with `≈ $20` plus five compact included-item pills in the scene.

- [ ] **Step 6: Run the focused checks**

  Run `npm.cmd run typecheck`, the three invariant scripts, and `npm.cmd run audio:verify` before rendering.

### Task 5: Render and review the redesigned sample

**Files:**
- Modify: `promotions/package.json`
- Create/overwrite: `promotions/out/ledgerly-field-guide-sample.mp4`
- Create/overwrite: `promotions/checks/sample-proof/`

- [ ] **Step 1: Render a 30-45 second sample**

  Render frames `0-1199` (40 seconds) with the existing 50% review path and run `npm.cmd run verify:sample`.

- [ ] **Step 2: Extract and inspect sample frames**

  Inspect the centered phone, heading/phone, code-panel, caption, and harness-diagram beats at full resolution and 50% size. Confirm no IP, no internal footer, no caption/phone collision, and no negative balance.

- [ ] **Step 3: Fix only sample-proven spacing defects**

  If a sampled frame violates the token/safe-area contract, adjust the shared token or component once, rerun the focused checks, and rerender the sample before proceeding.

### Task 6: Fresh full render, complete decode, tail review, and delivery

**Files:**
- Create: `promotions/out/ledgerly-field-guide-master-final.mp4`
- Create: `promotions/out/ledgerly-field-guide-compressed.mp4`
- Update: `promotions/documentation/verification.md`
- Update: `promotions/documentation/live-recording-manifest.md`
- Update: `promotions/checks/master-final/`

- [ ] **Step 1: Render the complete composition to the required temporary filename**

  Run `npm.cmd run render` after confirming no stale render process is active. The script must leave the legacy master untouched until verification succeeds.

- [ ] **Step 2: Run the complete decode and metadata checks**

  Run `npm.cmd run verify`, `npm.cmd run verify:live-sync`, and `npm.cmd run audio:verify`, each with fresh output. Confirm no FFmpeg decoder stderr, actual stream durations within tolerance, full frame count, final frame extraction, high-quality metadata, and zero long internal narration silence.

- [ ] **Step 3: Inspect the required late-video frames**

  Inspect frames at 3:35, 3:40, 3:45, 4:00, 4:15, 4:30, the final spoken-word region, and the final frame. Confirm motion, narration captions, phone/evidence continuity, close scene, and normal ending.

- [ ] **Step 4: Generate and inspect a complete contact sheet**

  Extract one representative frame per major scene at full and 50% scale. Check shared margins, heading rhythm, caption position, card padding, phone alignment, diagram spacing, and safe areas across the whole video.

- [ ] **Step 5: Update verification documentation with measured evidence**

  Record the final filename, actual decodable duration, frame count, bitrate, loudness, true peak, tail checks, source ranges, redaction policy, and Android evidence without claiming any unrun test.

- [ ] **Step 6: Run the final verification checklist**

  Run `npm.cmd run typecheck`, all invariant scripts, `npm.cmd run verify`, `npm.cmd run verify:live-sync`, `npm.cmd run audio:verify`, and `npm.cmd run verify:sample`. Review the full contact sheet and final-frame images before delivery.
