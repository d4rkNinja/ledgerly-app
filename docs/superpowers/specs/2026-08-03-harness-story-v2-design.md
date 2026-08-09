# Harness Story V2 — Production Design

## Objective

Replace the existing long-form promotional cut with an original, dark cinematic 9:16 Remotion story about how a real Ledgerly system was built in approximately two hours for approximately $20 using engineering knowledge, reusable skills, a custom harness, GPT-Luna, and Sol. The application is evidence during one concentrated 30-second section; the harness is the subject for the rest of the film.

## Approved Narrative and Runtime

The target runtime is approximately 2:45 at 30 FPS (about 4,950 frames), never less than 2:20 or more than 3:00. Nine continuous narration thoughts, generated with Pocket TTS `javert`, drive an independent master audio timeline:

1. **Hook** — a real system in approximately two hours.
2. **Application proof** — the single 30-second live Android feature sequence.
3. **Two-hour reveal** — AI implemented much of the work; code generation is the easy part.
4. **Knowledge** — security, isolation, input validation, and regression proof require engineering judgment.
5. **Harness** — project context, skills, rules, planning, testing, review, and verification control the work.
6. **GPT-Luna and Sol** — Luna performs primary implementation; Sol handles planning, difficult decisions, and review, both inside the harness.
7. **Cost** — approximately $20 is strictly scoped to this build’s AI-related cost.
8. **Multiplier** — each build improves rules and skills, so the harness outlives one output.
9. **Close** — open-source teaser, hiring line, and `Aabhar.`

The supplied phrases remain, exactly where useful for rhythm: “Wait, wait, wait.”, “Simple, simple, simple.”, “Cute, right?”, “Not too cute.”, “Sol stood nearby with a clipboard.”, “If a company wants to hire this ninja…”, and “Aabhar.”

## Visual Language

The new composition uses a separate V2 visual system: obsidian/navy background, controlled violet and cyan signal color, warm amber only for the $20 reveal, large mobile-readable type, sharp technical rules, and continuously evolving transforms. It does not reuse the prior white-glass theme, card deck, scene layout, narration structure, or composition.

Scenes transform through a signal sweep, camera parallax, type expansion, circuit routing, and bounded blur/matte transitions. Frosted glass appears only for a transient transition layer or an evidence label; it never becomes a full-screen treatment. Each beat changes a meaningful state, crop, diagram state, or evidence source rather than merely moving static cards.

## Beat Map

| Beat | Target visual duration | Visual job |
| --- | ---: | --- |
| Hook | 9–12 s | `TWO HOURS.` expands into Golang, web, mobile, and testing while real evidence flashes for only a few frames each. |
| Live application proof | 30 s | A single connected Android journey: workspace creation, invitation/pending-or-active member state, shared access, a positive financial record, reflected dashboard state, one polished mobile animation, then one real test/API proof flash. |
| Build reveal | 14–17 s | The final Android result compresses into source, agents, skills, tests, and a 00:00 → 02:00:00 build trace. |
| Engineering knowledge | 20–23 s | Four kinetic questions resolve into short real authentication, isolation, validation, and test evidence crops. |
| Custom harness | 22–25 s | A labelled reconstructed workflow circuit: context and skills enter CUSTOM HARNESS, then implementation, test, review, fix, and verification route to the working application. |
| GPT-Luna and Sol | 18–20 s | Luna’s implementation stream and Sol’s planning/review stream rejoin inside the harness; no fabricated session footage. |
| Cost | 15–18 s | Small costs accumulate into `≈ $20`, scoped visibly to this build. |
| Multiplier | 13–16 s | One output stops while the harness continues through build, learn, skill, rule, and faster next build. |
| Closing | 13–16 s | `≈ 2 HOURS` → `≈ $20` → `CUSTOM HARNESS` → `OPEN SOURCE SOON` → hiring line → `Aabhar.` |

The precise frame boundaries come from measured Pocket TTS output, not guessed visual durations. Visual transitions begin 8–15 frames before a thought finishes, while the master audio timeline preserves every final word.

## Evidence Integrity

- All app footage is native Android screen recording. The Android device must retain native physical size and density; the previously observed 1080×1920 override on a physical 1080×2424 Pixel 9 is prohibited. Video framing happens in Remotion, never by shrinking the emulator’s display.
- The 30-second application section is the only dedicated feature showcase. No application walk-through returns after it.
- Each live app range, source crop, test output, and diagram state appears once. Positive financial values only; no visible negative/minus transaction values.
- Implementation claims use real repository files; verification claims use real test or API results captured during this rebuild.
- Model orchestration is always visibly labelled `WORKFLOW VISUALIZATION — reconstructed from the actual development process`; the Custom Harness is the controller, GPT-Luna is primary implementation, and Sol is planning/difficult review inside that workflow.
- If a genuine invitation/member capture cannot be authenticated and validated, the render is blocked rather than replaced with invented footage.

## Audio Design

Nine Pocket TTS `javert` clips live under `promotions/audio/scripts/v2/` and produce 48 kHz WAV files under `promotions/audio/generated/v2/`. The existing boundary-preserving approach is retained: roughly 80–140 ms before speech, 180–300 ms after a thought, and natural 100–400 ms inter-thought spacing. No visual sequence owns an audio clip; a generated manifest positions all audio independently with ceiling-rounded frame durations plus safety frames.

## Fresh Module Boundaries

- `src/v2/HarnessStoryV2.tsx`: composition shell, master audio timeline, and beat orchestration.
- `src/v2/beatMap.ts`: typed visual/audio contract and measured scene boundaries.
- `src/v2/V2Primitives.tsx`: dark cinematic typography, signal field, transition, evidence labels, and safe-area primitives.
- `src/v2/AppProofSequence.tsx`: the one 30-second Android evidence block.
- `src/v2/EngineeringEvidence.tsx`: concise real source/test/API proof scenes.
- `src/v2/HarnessVisuals.tsx`: disclosed harness, model-role, cost, multiplier, and close motion systems.
- `src/v2/theme.ts`: isolated dark V2 palette and motion tokens.

Existing V1/Cinematic modules remain untouched until V2 has passed its full validation gate.

## Acceptance Gate

The candidate must prove: native screen configuration is correct; all intended Android workflows are real; showcase length is about 30 seconds; overall runtime is 2:20–3:00; no repeated visual evidence; no final word clipping; no silence gaps over the allowed limit; no freeze longer than two seconds; H.264 High/BT.709/yuv420p 1080×1920 at 30 FPS; 48 kHz AAC; real code/test/API evidence only; and the final frame lands shortly after `Aabhar.`
