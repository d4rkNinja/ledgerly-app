# Remotion Promotional Video Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the existing Ledgerly Remotion promo so native mobile footage stays sharp and the narration/visual timeline has no unexplained multi-second gaps.

**Architecture:** Keep the existing nine-scene composition and verified positive product footage, but replace fixed scene-second timing with a generated trimmed-audio manifest. Sequence narration back-to-back with a three-frame handoff gap, begin visual scenes twelve frames before the next narration, and keep the phone as an unfiltered, fully opaque foreground layer. Restrict glass treatment to labels/caption areas outside the phone.

**Tech Stack:** Remotion 4, React/TypeScript, `@remotion/media`, Pocket TTS WAV files, FFmpeg/FFprobe, native Android screen recordings, H.264 CRF 16.

## Global Constraints

- Preserve the existing Remotion project and verified product claims; do not recreate the promo or make unrelated design changes.
- Use native recordings at 1080x2424 or higher in Remotion; reject the 720x1616 derivative for the final phone layer.
- Foreground phone must use `filter: none`, `backdrop-filter: none`, `opacity: 1`, and no translucent full-screen overlay.
- Keep transitions 8–15 frames and use non-blurring visual accents outside the phone.
- Derive narration and scene timing from trimmed audio durations, with 3 audio-gap frames between connected clips and a 12-frame visual overlap.
- Final master must be 1080x1920, 30 fps, H.264 CRF 16–18, YUV 4:2:0-compatible, with AAC audio and no silent ending beyond 0.3–0.7s after “Aabhar.”
- Validate a 30–45s sample before the complete render.

---

### Task 1: Freeze the root-cause evidence

**Files:**
- Create: `promotions/documentation/root-cause.md`
- Inspect: `promotions/src/components/MotionPrimitives.tsx`
- Inspect: `promotions/src/scenes/LedgerlyLaunch.tsx`
- Inspect: `promotions/recordings/raw/*.mp4`
- Inspect: `promotions/audio/generated/segment-*.wav`

- [ ] Record the current findings: native footage is sharp; `SceneLayers`/`GlassCut` place `backdrop-filter` and dark overlays above the phone; final source uses the 720x1616 processed derivative; fixed 30–36s scenes leave audio-tail gaps.
- [ ] Include the exact native/processed/rendered comparison paths and metadata, plus the measured WAV durations and silence intervals.
- [ ] Do not edit composition code until this record exists.

### Task 2: Build the narration manifest and trimmed audio

**Files:**
- Create: `promotions/scripts/build-audio-manifest.mjs`
- Create: `promotions/src/audioManifest.ts`
- Create: `promotions/public/audio/narration/segment-*.wav`
- Modify: `promotions/audio/scripts/09-close.txt`
- Modify: `promotions/package.json`

- [ ] Generate connected Pocket TTS narration, ending the final clip with the requested word `Aabhar.`.
- [ ] Use FFmpeg silence trimming only at clip boundaries, preserving natural word endings and breaths.
- [ ] Measure original/trimmed duration, leading/trailing trim, and internal silences with FFprobe/`silencedetect`.
- [ ] Emit a typed manifest containing each file, trimmed duration, frame count, audio start frame, and inter-clip gap.
- [ ] Add scripts for manifest generation and `silence:check`; fail the check on unexplained internal silence over 0.45s.

### Task 3: Replace fixed scene timing with audio-derived timing

**Files:**
- Modify: `promotions/src/scenes/LedgerlyLaunch.tsx`
- Modify: `promotions/src/Root.tsx`

- [ ] Replace `sceneSeconds`, `starts`, and fixed 30/36-second `Sequence` durations with manifest-derived frames.
- [ ] Start each next narration after the prior trimmed clip plus three frames; start its visual scene twelve frames earlier.
- [ ] Calculate the composition duration from the final audio end plus a 0.3–0.7s tail.
- [ ] Replace internal 14/15/16/30/36-second visual slots with fractions of the passed scene duration.
- [ ] Keep visual transitions short and overlapping without overlapping spoken narration.

### Task 4: Keep the foreground application sharp

**Files:**
- Modify: `promotions/src/components/MotionPrimitives.tsx`
- Modify: `promotions/src/scenes/LedgerlyLaunch.tsx`
- Create/prepare: `promotions/public/footage/ledgerly-native-*.mp4`

- [ ] Copy/use native 1080x2424 captures directly; do not use the 720x1616 processed copies in the final composition.
- [ ] Remove `filter`, `backdropFilter`, opacity fades, inset dark gradients, and full-screen blur from the phone layer and its parents.
- [ ] Move glass treatment to bottom labels/caption cards outside the phone bounds.
- [ ] Keep the phone centered with integer dimensions and only restrained motion-matched scale/translation.
- [ ] Replace the current full-screen `GlassCut`/`GlassTransition` behavior with an 8–15 frame non-blurring edge/accent transition.

### Task 5: Render and verify the required sample

**Files:**
- Create: `promotions/scripts/render-sample.mjs`
- Create: `promotions/out/ledgerly-field-guide-sample.mp4`
- Create: `promotions/checks/sample/`

- [ ] Render a 30–45s sample spanning one formerly blurred transition and one formerly long section handoff.
- [ ] Probe dimensions, fps, codec, bitrate, and audio duration.
- [ ] Run narration-only and sample-video silence detection.
- [ ] Extract frames before, during, and after both transitions and compare them to the native source at 100%.
- [ ] Decode the sample with and without audio and visually inspect every extracted frame before proceeding.

### Task 6: Render the repaired master and derivatives

**Files:**
- Modify: `promotions/scripts/verify-video.mjs`
- Create: `promotions/out/ledgerly-field-guide-master.mp4`
- Create: `promotions/out/ledgerly-field-guide-compressed.mp4`
- Create: `promotions/out/ledgerly-field-guide-silent.mp4`

- [ ] Render the full composition with H.264 CRF 16–18 and native footage.
- [ ] Run FFprobe, silence detection, full decode, and bitrate checks.
- [ ] Extract start/middle/end frames for every scene and every transition; inspect at full resolution.
- [ ] Review the complete master at normal speed with audio and without audio, then regenerate derivatives only from the verified master.

### Task 7: Document acceptance evidence

**Files:**
- Create or modify: `promotions/documentation/verification.md`
- Modify: `promotions/PLAN.md`

- [ ] Record the confirmed root cause, sample result, full-master metadata, bitrate, silence output, source comparison, and all output paths.
- [ ] Explicitly document any intentional pause shorter than 0.45s and confirm the final frame follows “Aabhar.” by less than one second.

