# MPI-127 — LTX-2.3 app integration

> Spawned from MPI-4 (LTX-2.3 model integration). MPI-4 was the **authoring + research**
> phase (Builder/ComfyUI); this card is the **Cubric Vision app integration** phase.
> Multi-session. Goes through brainstorm / large-plan before implementation.
>
> **Source of truth for behavior:** `docs/builder/research/audio-input.md` (the ✅✅ block).
> **Ship workflow (tested, saved):** `D:/WORK/workflows/App/LTX_i2v_t2v_template.json`
> (mirror: `G:/ComfyUi/ComfyUI/user/default/workflows/LTX_i2v_t2v_template.json`).

---

## Status going in

LTX-2.3 has **zero app-side presence**: no model entry, no deps manifest, no `comfy_workflows/LTX*` files, no `generate_ltx.py` handler, no operations, no UI. The ComfyUI workflow is fully authored + live-tested + saved. Everything below the "What's done" line is NOT YET in the app.

### What's done (MPI-4, do not redo)
- Workflow authored + tuned + saved (157 nodes, counters synced 311/492, test nodes bypassed). One workflow drives **i2v / t2v / first-last-frame** via `Input_Mode (1=i2v 2=t2v 3=FL)` int (#182).
- Voice-ID solved via `LTXVReferenceAudio` (not `LTXVSetAudioRefTokens`). Tuning locked.
- **Re-host BLOCKER CLEARED** — all 4 third-party files mirrored to HF `Mad-Pony-Interactive/cubric-studio` (see Deps below).

---

## LOCKED audio behavior (from live testing 2026-06-24) — the product contract

The full audio matrix, all confirmed live. These drive the UI + baked workflow values.

| Mode | Mechanism | Behavior | Ambient? |
|---|---|---|---|
| **t2v** (no input audio) | model generates soundscape from prompt `[SOUNDS]` | full soundscape incl. ambient. Onset is **seed-variable** (sometimes from start, sometimes mid-clip). | ✅ YES |
| **Reference** (voice-ID) | `LTXVReferenceAudio` + `talk3_ID_Lora` (talkvid-3k) | reference voice IDENTITY drives output. Words follow `[SPEECH]`. | ❌ NO (ref audio fills its span; clip-time BEYOND the audio = model free-generates — gave a walk-away + random music tail) |
| **Original** (direct input audio) | input audio latent passthrough | input audio returned ~clean + drives video motion/lipsync. | ❌ NO |

### The knobs — all BAKED, minimal user surface
- **`Audio_Influence` (#201) = 0.9, BAKED, NO UI SLIDER.** Marked for DEPRECATION (nodes #201 `Audio_Influence` + #202 `Invert Influence` stay in workflow, red-flagged, baked 0.9 — kept in case a future workflow uses the slider). 0.9 landed empirically: 1.0 froze i2v motion, 0.5/0.7 under-synced. `[[feedback-live-workflow-small-tweaks]]`
- **`identity_guidance_scale` = 1.5, BAKED.** 1.0 lost identity; 3 (official) too hot/distorts. 1.5 = the sweet spot.
- **Transition LoRA (`ltx2.3-transition`, #191) = ON whenever audio is involved.** ⚠️ **KEY FINDING:** Transition LoRA is the i2v **motion/lipsync ENABLER**, not just a morph primitive. With it OFF, i2v audio gens FROZE (no mouth motion) regardless of influence value. ON = natural motion + lipsync, both Reference and Original paths. **This corrects/extends memory `[[project-transition-lora-short-morph]]`** (which called it morph-only). Decision: Transition LoRA ON for every audio gen (t2v too — simpler, doesn't hurt t2v ambient). So it's a **mandatory baked dep that travels with all audio ops.**
- **NO SEED UI** — random seed every gen, never exposed. `[[feedback-no-seed-ui]]`. (Node titled `Seed` #100 present → disables cache-dedupe, which is correct: every gen is new.)
- **Stage-2 sigmas = 0.65,0.45,0.25,0.0** (the "knee"). Stage-2 `LTXVReferenceAudio` REMOVED (sigma was the cure).

### Known characteristics / caveats (product notes, not bugs)
- **Lipsync quality is content-dependent:** realistic chars = flawless; 3D-style = good; **2D cartoon = poor** (model confused by flat style).
- **Multi-speaker = a lottery** on Reference (mute / one-identity-bleed / attribution-drift) — route multi-character to Original. Single-voice = better odds, still not one-shot reliable. Whole capability is seed-variable.
- **Same first+last frame (FL mode) → "wave" distortion at the clip tail.** Survives every mitigation tried (seeds, Transition on/off, audio on/off, stage-2, tiled decoder #122 bypassed). Attributed to identical FF/LF anchors. Avoid identical first+last frame; plain i2v doesn't show it. (Tiled decoder #122 left bypassed — didn't fix it.)
- **Clip length should ≈ audio length.** Clip time past the input audio = model invents content (the walk-away + meme music tail). Doc already notes "audio ≥ video length"; seen live.
- **`[SPEECH]` matching the reference audio too closely → pass-through freeze** (model copies input verbatim, no motion). Diverge the text from the reference for live generation.
- **Stage-1 reruns mid-session** seen from ComfyUI's buggy undo (subgraph-convert→undo). Plus MpiClearVram + RAM eviction `[[project-mpiclearvram-forces-rerun]]`. Frontend quirk, not wiring.

---

## App integration scope (decompose in brainstorm/plan)

1. **`generate_ltx.py` handler** + `("LTX23_", "ltx")` in `comfy_workflows/scripts/workflow_generation/registry.py`. Produce `LTX23_i2v.json`+`_stage2` and `LTX23_t2v.json`+`_stage2` (multi-stage `_ms`, Finish-only, `allowsBranchingContinue=false`, no per-stage LoRA variance). Title-keyed: workflow already has `Stage1_Bypass` (#70) + `Input_Is_Continue` (#71) — reuse the WAN bypass-one-sampler shape if it fits, else encode LTX's own splice. Verify against a hand-authored stage-2 (the WAN proof method). See workflow_generation/README.md.
   - **Open Q:** the workflow is ONE file driving i2v/t2v/FL via `Input_Mode` int. App convention is per-op files (`LTX23_i2v`, `LTX23_t2v`). Decide: does the handler fan-out one source into per-mode files (stamping `Input_Mode`), or does the app inject `Input_Mode` and ship one file per stage? FL-mode (3) handling TBD (wave caveat).
2. **LTX model entry + deps manifest** (`js/data/modelConstants/`). Deps:
   - Base: `LTX23_video_vae_bf16`, `LTX23_audio_vae_bf16`, `ltx-2.3_text_projection_bf16`, `ltx-2.3-22b-distilled-1.1_transformer_only_bf16` (official Lightricks — confirm/host per dep-rehost rule).
   - **RE-HOSTED third-party (use these HF urls):**
     - gemma CLIP → `https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/re-host/gemma-3-12b-it-heretic-fp8-comfy.safetensors`
     - ID-LoRA talkvid-3k → `.../re-host/loras/ltx-2.3-id-lora-talkvid-3k.safetensors`
     - transition → `.../re-host/loras/ltx2.3-transition.safetensors`
     - Soft_Enhance → `.../re-host/loras/LTX2.3_Soft_Enhance.safetensors`
   - Baked LoRAs in the workflow: `LTX2.3_Soft_Enhance` (#236), `ltx2.3-transition` (#191, mandatory-on for audio), `talk3_ID_Lora` (#277, talkvid-3k @1.0). 6 user slots `Input_Lora_1..6`.
   - Compute SHA256 for each (use `mpic-compute-dep-hashes`). `[[project-dep-rehost-rule]]`
3. **Operations** in `js/data/commandRegistry.js` — register LTX ops (i2v/t2v, multi-stage). `Duration`/`Motion_Intensity`/etc. injection per the standard map.
4. **AUDIO MODE UI** in `MpiPromptBox` — a **Reference | Original radio, ENABLED ONLY when audio present**, driving the two gates: `Input_Use_Reference_Audio` (#296 MpiIfElse → goal-1) + `Input_Use_Input_Audio` (#203 → goal-2). One mode live per gen. `Input_Use_Transition` (#192) forced ON when audio present. NO influence slider, NO seed UI. (Brief MpiPromptBox rules: read `.claude/rules/components.md` + component-* maps.)
5. **Tier-2 capture-title app fix** — `commandExecutor.js` (~line 903) hardcodes preview-only capture to literal `"preview"` / final to `"output"`/`"output_video"`. LTX is tier-2: capture nodes are `Output_Preview` (#72) + `Output_Video` (#186). The filter must accept `output_preview`. Doc already updated (`.claude/rules/comfy_injection.md` title map). Without this, LTX preview-only runs report "no output returned".

## Injection-point titles (already in the workflow, tier-2)
`Input_Positive`/`Input_Negative`, `Input_Width`/`Input_Height`, `Input_Duration`, `Input_Seed`, `Input_Start_Frame`/`Input_End_Frame`, `Input_Audio_File`, `Input_Mode`, `Input_Lora_1..6`, gates `Input_Use_Reference_Audio`/`Input_Use_Input_Audio`/`Input_Use_Transition`/`Input_Use_Audio`, `Input_Preview_Only`, `Input_Is_Continue`. Outputs: `Output_Video`, `Output_Preview`. Baked (no `Input_` prefix, not injected): `Audio_Influence` (deprecated), `talk3_ID_Lora`, Soft/Transition LoRAs.

## Deferred (separate cards, NOT this one)
lipdub v2v (LTX_lipdub_v2v_template.json, LoadVideoUpload-split bug) · lipsync-v2v-2 · video extend · MPI-126 (Wan stage-2 sigma drift, same fix) · modality_scale for audio↔video sync.
