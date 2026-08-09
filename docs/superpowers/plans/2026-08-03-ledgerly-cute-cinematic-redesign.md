# Ledgerly cute-tech cinematic redesign plan

> Status: approved implementation plan. The user's full brief and prior blanket approval establish the direction; no additional design approval is required before execution.

## Goal

Create a fresh 1080x1920, 30fps Remotion promotional video that makes Ledgerly's engineering workflow the main subject. It must use authentic Go, API, test, and newly captured Android evidence; present the harness hierarchy accurately; and use an original cute-tech, cinematic visual language inspired only by the pacing and contrast of the supplied reference.

## Constraints

- Do not reuse the reference's footage, copy, branding, interface, artwork, or claims.
- Do not recreate the existing video blindly or mutate the legacy compositions; add an isolated new composition.
- Capture fresh native Android recordings through the Android emulator QA workflow. Use no web recording or static screenshot as app proof.
- Show no negative or minus-valued financial data. If a recording has a visible error, validation defect, crash, unexpected state, or jank, discard that take and record a new one.
- Do not repeat an Android source range, code crop, terminal result, or diagram state. A shot registry will enforce distinct source ranges.
- Use real Golang source, real commands, real test output, real API requests/responses, and real app workflows only.
- The only reconstructed material is the orchestration diagram. It must visibly state that it is a conceptual workflow visualization, not recorded session footage.
- Diagram order is: Custom Harness -> context/skills/task planning -> GPT-Luna -> tests/verification; Sol supplies planning, difficult decisions, and review inside the harness. The harness is the controlling system, never an endpoint after Luna or Sol.

## Deliverables

1. `promotions/reference-analysis/` analysis documents and contact sheets documenting the supplied reference without incorporating protected content.
2. New Android captures in `promotions/recordings/cinematic-mobile/`, each with a written capture manifest and fresh source range allocation.
3. New cinematic Remotion composition and supporting data/components under `promotions/src/cinematic/` and `promotions/src/scenes/`.
4. A 45-60 second sample, a full master, contact-sheet/frame audit, and FFmpeg decode verification in `promotions/out/` and `promotions/audits/`.

## Implementation sequence

1. Inspect source, present Android state, real API health and validation behavior, and test suite. Save only sanitized evidence that can appear in the video.
2. Use ADB UI trees—not screenshot coordinates—to record fresh, native flows: authenticated entry, a positive income entry and persisted result, workspace switch, goal/account proof, and dashboard movement. Capture `gfxinfo` after each viable take and reject janky takes.
3. Create `VisualBeat` and `ShotUsage` registries. Map all narration segments to original, constantly moving visual beats. Validate no overlapping/reused Android source range.
4. Build five visual layers per scene: moving mesh/field, evidence/app asset, graphics/type, color grade, and grain/vignette. Use clamped spring/interpolation motion and brief glass refraction transitions.
5. Build the storyline: outcome; not-just-UI framing; Android proof; Go request route/validation/handler/database/response; vibe-coding and knowledge loop; tests; live application result; labelled harness reconstruction; Luna/Sol responsibilities; scoped build cost; reusable leverage; concise close.
6. Render and inspect a 45-60 second sample at mobile size. Correct readability, pacing, crops, audio joins, safe areas, and motion before full rendering.
7. Render final H.264 High / yuv420p / AAC master with CRF 16-18 and `+faststart`; perform duplicate-source, static/low-motion, safe-area, audio-boundary, and full FFmpeg decode checks. Watch the complete output before hand-off.

## Files expected to change

- `promotions/Root.tsx`: register the new isolated composition.
- `promotions/src/cinematic/*`: visual beat data, unique shot registry, primitives, and scene modules.
- `promotions/src/scenes/LedgerlyCuteEngineeringCinematic.tsx`: orchestration composition.
- `promotions/package.json`: scoped render/audit scripts if useful.
- `promotions/public/cinematic-mobile/*`: newly normalized Android footage only.
- `promotions/recordings/cinematic-mobile/*`: source takes and capture report.
- `promotions/audits/*`: render/contact-sheet/verification records.

## Verification

- `npm.cmd run typecheck` passes.
- Every evidence string is traceable to an actual local source file, command, test, API request, or recording.
- `adb shell dumpsys gfxinfo <package>` shows an acceptable jank rate for each approved fresh Android take; rejected takes are not registered for render.
- The sample and final have no frozen/repeated frames beyond intentional continuous motion, no repeated Android source range, and no negative financial values.
- `ffprobe` confirms 1080x1920 / 30fps / H.264 / yuv420p / AAC output, and FFmpeg fully decodes the final master.
