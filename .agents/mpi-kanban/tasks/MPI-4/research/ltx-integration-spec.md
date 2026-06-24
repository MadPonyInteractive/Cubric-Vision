# LTX-2.3 Integration Spec — LIVING DOC

> **Purpose:** accumulate everything the live ComfyUI authoring sessions teach us,
> so app integration later is mechanical. Node inventory, prompt-box controls,
> operations, and the why behind each. **This is provisional and TESTING-DRIVEN** —
> entries marked `TBD` / `(testing)` are not yet decided. Update as we test; do not
> treat TBD rows as locked.

Live template (source of truth, authoring artifact):
`G:\ComfyUi\ComfyUI\user\default\workflows\LTX_i2v_t2v_template.json`
Backups beside it: `.bak`, `.bak2`, `.no_audio_latent`, `.pre_lora`.

---

## 0. RELEASE CONSTRAINT + SCOPE (2026-06-21)
- **Next Cubric Vision release to Patreon Pro: ~25th June 2026** (user unsure 24 vs 25;
  confirm). LTX-2.3 work targets this release.
- **SCOPE CALL (provisional):** given heavy testing still ongoing, this release likely
  ships ONLY what's already in the template (i2v/t2v/FL + input-audio + the LoRA stack we
  validate). **DEFER to NEXT release:** video extend, head-swap (BFS), ControlNet, guide-video.
- Decision re-evaluated tomorrow: if good progress, MAY add extend/etc; if not, ship the
  refined base. Bias = ship a solid, well-tested base over a broad-but-shaky one.

> **CONCLUDED FINDINGS GRADUATED → Builder playbook.** The durable conclusions
> below (LTX tiers, distilled-LoRA strength law, prompt contract, model set,
> strategy) now live at `docs/builder/research/` (Cubric-Vision) so they survive
> this card. This spec stays the LIVE TASK LOG (test queue, template node inventory
> §1, held reminders, in-flight state). When a finding here concludes, graduate it
> there and leave a pointer.

## 0b. TEST QUEUE — resume here tomorrow (2026-06-22)
All 4 CivitAI LoRAs downloaded + moved to `C:/AI/loras/` (ComfyUI reads here via
extra_model_paths `comfyui_external`). Files:
- `LTX2.3_reasoning_Sulphur-2_I2V_V4.safetensors` (VBVR I2V, 0.5-1.0)
- `LTX2.3_Reasoning_V1.safetensors` (VBVR T2V, 0.7-1.0)
- `Singularity-LTX-2.3_OmniCine_V1.safetensors` (anatomy/motion, 0.8-1.0)
- `LTX2.3_Soft_Enhance.safetensors` (visual polish)

**Tests, in priority order:**
1. **VBVR mode-coverage (DECIDES merge architecture):** T2V mode, same prompt+seed:
   (A) VBVR-V1 vs (B) VBVR-I2V-V4 vs (C) none. If V4 works on T2V >= V1 -> use V4 for
   BOTH modes, drop V1, ONE LoRA, clean merge. If V4 broken on T2V -> mode-specific,
   keep both, auto-switch by Input_Mode. Use LITERAL step-by-step prompts (VBVR follows
   literally). This is THE decider for whether VBVR can be merged as one always-on LoRA.
2. **VBVR motion/adherence win:** does VBVR fix the floaty-motion + "won't do the prompt
   action" problem we measured all day? Test the old failing repros (remove-shades, etc).
   High strength 1.5-2.0 = more adherence but t2v gets 16fps-choppy. image_strength 0.85
   = more motion.
3. **Stack Singularity 0.8-1.0** on top -> 3-finger/anatomy fix during motion + lip-sync.
   Singularity has STRICT prompt template (Cinematic Timeline Structure) -> test with it.
4. **Stack Soft Enhance** -> realistic/desaturated polish. Watch TOTAL stacked strength
   (transition + VBVR + Singularity + Soft) < ~1.5-ish or quality degrades.
5. **Input-audio slider decision** (still open from prior handoff): does strength 1.0 work
   on every image? If yes -> drop slider, auto-enable at 1.0 on file present.
6. **STG node:** delete from template (decided REJECTED, just kept wired-but-out). Cleanup.

**After tests -> decide:** which LoRAs to keep (merge vs switch per §"LoRA DELIVERY
ARCHITECTURE"), then either polish-and-ship for the 25th, or add extend/headswap if time.

### SESSION PROGRESS (2026-06-23) — in-flight, NOT yet concluded
- **Live template re-scanned, matches decisions.** STG nodes (226/229) ALREADY DELETED by
  user (cleanup item #6 DONE). Two plain CFGGuider (32 stage-1 / 33 stage-2). Heretic-fp8
  encoder live in DualCLIPLoader(3). Abliterated LoraLoader(5) bypassed (mode 4). The 4 new
  LoRAs are on disk but NOT wired into the template yet.
- **LoRA TENSOR-HEADER FACTS (verified, not agent-guessed):** all 4 capability LoRAs are
  **MODEL-ONLY** (100% `diffusion_model.*` keys, ZERO clip/te). => load via `MpiLoraModel`
  (model-only), **strength_MODEL is the only live knob, strength_CLIP is inert.** Matches
  user's WAN experience. The abliterated-heretic LoRA = opposite: 100% `text_encoders.*`
  (CLIP-only, strength_MODEL inert) — confirms the ~50x-dilution / superseded-by-encoder call.
- **LoRA folder reorg:** ALL LTX LoRAs moved from `C:/AI/loras/` ROOT into `C:/AI/loras/LTX2.3/`
  (rgthree "Auto Nest Subdirectories in Menus" gives folder submenus; root files don't nest).
  Moved: the 4 new (Reasoning_V1, reasoning_Sulphur-2_I2V_V4, Soft_Enhance,
  Singularity-OmniCine_V1) + abliterated-heretic-rank64 + head_swap_v3 (rank_64 +
  rank_adaptive_fro_098) + ic-lora-union-control-ref0.5. **NEW LoRA-name strings carry the
  `LTX2.3\` prefix** (e.g. `LTX2.3\LTX2.3_Reasoning_V1.safetensors`) — use prefixed names when
  wiring template / dep manifest. ⚠️ **NerdyRodent MONOLITH still points at the old ROOT paths
  — repath it before reusing it** (heretic-abliterated node 5 in the live template also points
  at root now via `LTX2.3\` — harmless while bypassed, repath if un-bypassed).
- **VBVR test (Run A, local, CONFOUNDED):** seed 46, 704×1280, 3s, I2V, V4@0.7 vs none.
  Both bad (horror hands, missing fingers) — but seed 46 is a BAD seed, so this measures
  seed-noise not LoRA. Repro image = the back-to-camera squat pose (the known motion-dead /
  spatially-ambiguous one): "hand on buttock" ≈ "hand on hip" from behind = near-zero visual
  signal to disambiguate. CORRECT next method (user's plan): lock a GOOD base seed FIRST,
  THEN A/B LoRA on/off same seed. Don't trust single confounded runs.

### ⭐ VBVR/Singularity = PROMPT-CONTRACT LoRAs (durable finding -> Cubric-Prompt recipe)
> HOLD as a note until we lock WHICH LoRA ships; then write the Cubric-Prompt LTX recipe.
- No trigger word, no template baked in the files (V1 meta = `LTX2.3_reasoning_big`, ai-toolkit;
  V4 = zero metadata). The **sequence STRUCTURE is the trigger.**
- **Contract:** brief scene anchor FRONT-LOADED, then DISCRETE ORDERED literal motion steps,
  named body parts, no run-on action piles. i2v = MINIMAL scene anchor (start frame already
  carries description; over-describing fights the pixels) + steps. t2v = FULL scene description
  (no frame to lean on) + steps. Matches Singularity's Cinematic Timeline ([Scene&Style] first,
  then [Action Timeline 0-Xs]). This is the LTX prompt shape **Cubric-Prompt must generate**
  (recipe home: `Cubric-Prompt/src/main/recipes/{model-id}.recipe.ts` + research under
  `dev-docs/recipe-research/`).

### RUNPOD AUTHORING PLAN (speed — local ~100s/gen too slow for seed-hunt; 5090 ~15-20s)
- Moving tests to a Pod for FASTER iteration (NOT for VRAM — local 16GB is fine for current
  tests). Trigger to actually spin: after gym (don't burn Pod idle).
- **Target GPU = RTX 5090** (~32GB VRAM, Blackwell). Bonus: 32GB FITS full-bf16 gemma (24.4GB)
  alongside the transformer — the "won't fit 16GB" wall lifts there, so a full-bf16-vs-heretic-fp8
  encoder A/B becomes possible on a 5090 Pod. ⚠️ Blackwell needs cu128+ ComfyUI build (older
  cu124/cu126 may lack Blackwell kernels — if first gen throws a CUDA-arch error, that's why).
- **Agent file access on Pod = SSH/SCP** (NOT the app's HTTP channel). Past RunPod *product*
  work was HTTP-only (correct for the shipping app — can't assume SSH keys on a user Pod);
  authoring is a different layer where the operator hands the agent SSH. Loop becomes identical
  to local: user drives ComfyUI GUI in browser (proxy :8188); agent over SSH reads/edits the
  template JSON (after user SAVE+CLOSE — stale-disk rule unchanged), scp's LoRAs up / outputs
  down, tails logs, runs python. Needs: key-based auth (no interactive password), connect
  string from RunPod console, `-o StrictHostKeyChecking=accept-new` on first connect. Agent
  still CANNOT watch video — visual verdict stays the user, SSH only handles plumbing.

### VBVR live-test findings (2026-06-23, local i2v) — STRENGTH NORM CONCLUDED
- **⭐ VBVR i2v STRENGTH NORM = 0.5 (max ~0.7). DO NOT go high.** Concluded across 4 tests,
  3 images, 2 resolutions (stage-1 352×640 AND 544×960). Higher strength costs, with NO motion
  payoff to justify it:
  - **Identity DRIFT / face squash** scales with strength (confirmed 2 separate images — face
    widens/jaw distorts at 1.0). Partly compounded by low stage-1 res + far-from-camera face,
    but persists at higher res too => it's the LoRA, not just resolution.
  - **Speech/lip-sync naturalness DEGRADES** at high strength (same audio in, mouth-shapes read
    less natural — face geometry distortion breaks lip-sync).
  - **Fine-detail erosion** at high strength (necklace etc.).
  - At 0.5: best overall (face, detail, coherence). 0.5–0.7 = the usable band; above = net-negative.
- **Implication for merge plan:** can't bake a face-distorting LoRA in always-on at high strength.
  If VBVR ships, it ships at LOW strength (~0.5), OR t2v-only (no input identity to protect).
- **FL start/end frame = user's identity-lock escape hatch** (pins both ends, drift can't run away).
- **✅ DECIDER CLOSED 2026-06-23 (Pod, full fair test): DROP VBVR FOR i2v.** Tested the long
  multi-part hypothesis to exhaustion on a Builder Pod (RTX PRO 4500, bf16 distilled):
  - **Clean single-subject image + ordered `then/while/as` prompt + good seed → BASE (VBVR 0.0)
    already follows the whole sequence.** Base does the steps unaided. VBVR has no gap to fill.
  - **Tested the creator's OWN recommended envelope** (CivArchive card: strength 1.0-2.0 for
    adherence, 10-12 steps, ordered-literal prompt — we matched the prompt shape exactly):
    - 0.5 / 0.7 @ 8 steps = ~nothing (one extra camera-look vs base).
    - 0.7 @ **12 steps** = slightly better head-tilt + slightly better eyes, **BUT jacket morph
      got WORSE** (shoulder visible through jacket), and **+25s/gen.** The eye gain is moot —
      stage-2 detail pass handles eyes anyway.
    - 1.0+ = face morph (prior finding, holds).
  - **Net:** best-case effect = a marginally better tilt, bought with a worse garment morph,
    a permanent +25s step tax, AND a shipped dependency (download/mirror/merge). Not worth it.
  - **The base IS the i2v product:** good image + the prompt-contract (front-loaded anchor +
    ordered literal `then/while/as` steps + named body parts) delivers the sequence clean,
    fast, dependency-free. **VBVR-V4 (i2v) = DROPPED.**
  - **Context that explains the flat response:** Kijai's "distilled LoRA" is a SPEED/step-count
    compression LoRA (dev→8-step CFG1), NOT reasoning — nobody baked sequencing in; the base
    distilled model is just already good at ordered prompts. VBVR (3rd-party LiconStudio/Civitai
    port of a Wan2.2 reasoning LoRA) tries to improve what the base already does → redundant.
- **✅ t2v V1 DROPPED TOO 2026-06-23 (Pod). VBVR FULLY DROPPED (both modes).** Tested V1 (the
  t2v reasoning LoRA, the one WITH proper ai-toolkit metadata) base-vs-0.7 across two t2v scenes,
  same seed each:
  - **Scene 1 (studio):** V1 looked BETTER — fixed jacket drape, and removed a literal studio-light
    PROP the base built from "soft directional light" (lighting-as-condition not object). Promising.
  - **Scene 2 (neon street):** V1 = TIE-to-WORSE. Same motion sequence as base; V1 added nonsense
    coat buttons, was LESS charming, and SUPPRESSED the (weakly-rendered) rain entirely. The
    scene-1 light-prop "win" did NOT replicate.
  - **Verdict: inconsistent across scenes at the same strength = a coin-flip, not a feature.** For
    an always-on shipped LoRA that's a DROP. **VBVR V1 (t2v) + V4 (i2v) both DROPPED.** Base + the
    prompt-contract is the product for both modes.
- **VERSION/BASE-MISMATCH FINDING (explains V4's i2v flatness):** VBVR has many versions —
  v1.0=T2V, v2/v3/v4=I2V. **v4 (what we tested for i2v) was trained/demoed on the "Sulphur-2"
  UNCENSORED base, not the standard Lightricks distilled base we run** (creator: "generated using
  Sulphur 2… I highly recommend LTX 2.3 Sulphur 2 base"). LoRA-tuned-for-base-X-on-base-Y often
  goes flat → may explain V4's weak i2v showing. **v3 is the "better motion, smaller, attention-only"
  i2v variant we NEVER tested.** → ONE cheap i2v A/B left worth doing: download **v3**, judge MOTION
  (not prompt-following) base-vs-0.7 on the clean image. If v3 fixes floaty motion where v4 didn't →
  reconsider i2v. If v3==base → i2v drop stays locked. (Don't chase the Sulphur-2 base itself — that's
  an uncensored full checkpoint, separate NSFW shipping decision, out of 25th scope.)
- **AUDIO — "no music" PROSE DOESN'T WORK (confirmed live):** no NAG/negative field; inline "no music"
  ignored, clip still had music. Only prose lever = dense dominant ambient that crowds music out.
  Reliable music-off needs a WORKFLOW/MODEL-level control → open item. Also: rain renders only as
  ground-impact drops (no visible falling rain); reasoning LoRAs suppress weakly-supported elements.
  Both graduated to Cubric-Prompt MPI-11.
- **✅ SINGULARITY OmniCine DROPPED 2026-06-23 (Pod, tested in NATIVE timeline syntax).** Tested
  properly in its `[Scene&Style]`/`[Action Timeline] 0-Xs`/`[Camera Timeline]`/`[Environment]` format,
  i2v, strengths 0.8/0.5/0.3, simple AND dense (5-segment/10s) prompts, stage-1 + stage-2, portrait + landscape:
  - **Real but marginal WIN:** at 0.3 on a DENSE 5-segment timeline it paced actions across more of
    the clip than base (base CRAMMED segments 1-3 into the first ~3s then paused; 0.3 spread them).
    Timeline-choreography-at-scale is its one genuine capability base lacks. Base honors ~2 segments
    fine but rushes 5.
  - **Killers:** (1) **degrades AUDIO at every strength** — gated/distorted fabric foley, no ambient
    bed, robotic voice at 0.8; (2) **ethnicity bias** — drags faces Asian unprompted (full at 0.8,
    partial 0.5, clean only at 0.3); (3) +2.5GB dependency; (4) ~17% slower (87→102s @0.8; 105+195s @0.3);
    (5) identity instability at higher strength.
  - **DECISION RULE (user): search for documented audio/sigma settings → none exist → DROP.** HF/Civitai
    cards have ZERO audio settings (no audio_normalization_factors, no sigmas, no fix). Blind tuning of
    the stage-1 sampler `audio_normalization_factors` (all 1.0) is an unbounded time sink — not for the ship.
    Also recommends an **fp8** transformer base; we run **bf16** (another base mismatch, like VBVR-v4/Sulphur).
  - **Verdict: DROP.** Marginal pacing win < degraded audio (no documented fix) + ethnicity bias + 2.5GB + time.
- **⭐ AUDIO/MUSIC CONTROL — clarified live (multiple findings):**
  - "no music" prose = IGNORED (no NAG/negative field).
  - **"cinematic" / "fashion editorial" style words PULL IN scored music** (theory, strongly indicated).
  - **Listing CONCRETE diegetic foley** (`footsteps, fabric movement`) in an `[Audio]` line → model voices
    THAT and DROPS music (base 0.0 with a concrete foley list = no music). Abstract ambient ("room tone")
    does NOT render; concrete sounds do. This is the most reliable in-prose music lever found.
  - Un-cinematic style ("documentary/candid/homemade") = untested counter-lever theory (kills music?).
  - **The workflow stage-1 sampler HAS `audio_normalization_factors` (all =1.0) + audio sigmas** = a
    real workflow-level audio-control surface IF in-prose levers prove insufficient. Open item.
  - Rain renders only as ground-impact drops (no falling rain). All graduated to Cubric-Prompt MPI-11.
- **STILL OPEN (NOT 25th-critical):** v3 i2v MOTION test (download v3 — "better motion, attention-only",
  the variant we never tested; judge MOTION not prompt-following); VBVR/transition on **FL** (transition's
  home, untested, likely highest-value); landscape behavior (one A/B done, more if needed).
- **✅ SOFT_ENHANCE — KEEP (the session's one clean LoRA win) 2026-06-23.** Detail/autofocus/DoF
  + "removes crispness for a more realistic/softer result" enhancer. The ONLY LoRA that reliably IMPROVES
  output (softer/more natural skin + face, better face lighting, color, realism) — opposite of VBVR/Singularity.
  Earned signal all session (cig/detail got WORSE without it); confirmed across i2v + t2v, multiple strengths.
  - **🎯 VISIBILITY RULE:** Soft's effect is a FACE/DETAIL polish → only clearly visible when the FACE IS
    LARGE in frame (close-up / medium / a push-in). On wide/full-body shots the face is too small to read
    the difference. Test it (and it shines) on close shots, not wides. This is a USAGE rule, not a flaw.
  - It does NOT suppress motion — apparent "fewer actions/steps" base-vs-Soft was t2v free-choreography
    variance (no start-frame anchor), not Soft killing motion.
  - **Strength:** 0.7 = best face detail; 0.5 = perfect-in-between (slightly less face improvement, lower
    over-effect risk); law says 0.5 (1.0 hallucinates — invented a necklace earlier). Ship strength TBD (0.5-0.7).
  - **Placement:** currently BOTH stages. It's a DETAIL LoRA → strongest on STAGE-2 (the detail stage, user
    confirms bigger impact there). Per the stage-1=motion/stage-2=detail rule, ship placement is likely
    stage-2-weighted. Still confirming stage-1 effect on opening composition (see pose-pin test below).
  - **✅ DECISION: SCHEDULED TO BE MERGED INTO THE MODEL.** Tiny (344MB), no prompt change, no toggle,
    always-on quality gain → bake into shipped diffusion weights. No extra dep, no mirror-risk, no runtime
    stacking. The opposite of the dropped capability LoRAs. (Final ship strength 0.5-0.7 + per-stage weight
    to lock when the merge is built.)
  - **⚠️ TIMING NOTE (no conclusion):** observed 0.0=124s / 0.5=113s / 0.7=107s on this Pod — i.e. "more LoRA
    = faster", which is IMPOSSIBLE for a real compute cost. So this is **VRAM-staging variance on this GPU
    (32GB, 40GB model → dynamic load lottery), NOT the LoRA.** A LoRA adds compute, never subtracts; Soft's
    true cost is negligible (344MB) → treat as TIME-NEUTRAL. Do NOT record "Soft is faster". Retest on a
    clean/resident-VRAM card later to confirm the staging-variance read.
  - **Open:** does an explicit START-POSE in the prompt override the i2v start-frame's pose? (base vs Soft
    each guessed a different opening orientation when pose was unspecified — pinning "near side-profile,
    facing left" tests if prompt can redirect the opening + removes that A/B confound.)
- **TRANSITION LoRA — recap (user, 2026-06-23):** tested earlier; matches the corrected stage rule —
  creator proposed STAGE-2-only → NO effect; only worked when added to STAGE-1 (swap/cross with stage-2).
  Confirms stage-1=motion. **Use case is NARROW:** only good for **First/Last-frame (FL)** where the
  ENVIRONMENT and/or CHARACTER changes SUBSTANTIALLY between start and end frame. Not a general enhancer.
  **Delivery UNDECIDED:** on/off switch, its own OPERATION, or an "EFFECT" — Cubric Vision has **NO effect
  system yet**. Many style/effect LoRAs exist → an effects system is its own BRAINSTORM (not 25th scope).
  Transition is deferred until that's decided; stays a separate switchable dep, never merged.

- **⭐⭐ SHIP CONFIG LOCKED (i2v + t2v, ~25th release):** **BASE distilled LTX-2.3 + prompt-contract +
  Soft_Enhance (MERGED, 0.5-0.7 detail/realism polish). NO reasoning/anatomy LoRAs.** VBVR (V1+V4) dropped,
  Singularity dropped, transition deferred (FL-only, needs effect-system decision). Base + good prompt +
  merged Soft polish IS the product — clean, fast, dependency-free. Strong, defensible release.

### ⚠️ WORKFLOW NOT SAVED — RE-CREATE THIS LoRA STATE NEXT SESSION (2026-06-23)
The live ComfyUI workflow was NOT saved before the Pod was deleted (only settings changed; all are
recorded here). The persistent 75GB volume survives but the in-ComfyUI graph edits do not. On the next
Pod, reload the template and SET THE LoRA CHAIN TO:
- **Soft_Enhance → 0.7** (KEEP/merge candidate; the only active LoRA)
- **VBVR-V4 (i2v reasoning) → 0.0**
- **VBVR-V1 (t2v reasoning) → 0.0**
- **Singularity OmniCine → 0.0**
- **Transition → 0.0** (until FL/effect work)
That's the end-state: every dropped LoRA at 0, Soft at 0.7. (Backslash-vs-forwardslash path note still
applies — the 3 may show "missing" on Linux reload, re-select from dropdown; then SAVE the workflow this
time so it doesn't have to be re-created again.)

### NEXT SESSION PLAN (2026-06-24, new Pod off the persistent 75GB volume)
1. **Audio-drop GATE (not a slider).** Test if the input-audio influence needs a STRENGTH SLIDER or just a
   binary "did the user drop audio / not" gate (auto-enable at a fixed strength on file-present). Open
   question: does a fixed strength (e.g. 1.0) work on EVERY image, or do some need a lower value (→ keep
   slider)? If fixed works everywhere → drop the slider, ship the gate. NOT an on/off button — a
   user-dropped-audio-or-not gate.
2. **Soft_Enhance MERGE** — schedule/execute the bake-into-weights (or confirm the merge recipe + final
   strength/per-stage weight).
3. **IF time — VIDEO EXTEND (optional operation).** Lengthy; likely needs its own Pod. Key unknowns:
   - Can extend be a SEPARATE workflow → an OPTIONAL operation (not baked into the main template)?
   - LTX extend pulls from **stage-1 latent** — but can ALSO pull from an **already-made/final video**.
     **Must test the difference: extend-from-stage-1-latent vs extend-from-final-video** (quality, seams,
     practicality). This decides the extend architecture. Half-wired already (IfElse 51/56 feed the
     save-gate, NOT the sampler — sampler-side continue feed unverified).
4. Loose ends (only if fast): v3 i2v MOTION test; music style-word test ("cinematic" vs "documentary");
   transition/FL once an effect-system path is chosen.

### ⭐⭐ DISTILLED-LoRA STRENGTH LAW (general rule — confirmed on LTX, 2026-06-23)
> **Distilled LTX models want LoRAs at LOW strength: band 0.3–0.7, sweet spot ~0.5.**
- Matches the user's WAN experience EXACTLY (distilled WAN: LoRAs prefer 0.3–0.7, 0.5 sweet spot).
- Now confirmed on LTX across TWO independent LoRAs converging on the same curve:
  - VBVR: best @0.5, degrades >0.7 (identity/lip-sync/detail).
  - Soft Enhance: clean @0.5, HALLUCINATES detail @1.0 (invented a necklace).
- This is a DISTILLED-MODEL PROPERTY (few denoise steps → no error-averaging → a LoRA's nudge
  commits hard; cfg=1 → no CFG headroom to dilute), NOT a per-LoRA quirk.
- **DEFAULT any LTX LoRA to 0.5, sweep 0.3–0.7.** Skips a blind strength hunt per LoRA. Feeds
  template defaults + model-config + Cubric-Prompt recipe.
- Over-strength tell on enhancer LoRAs = HALLUCINATED detail (jewelry, accessories not in source).
- Note: higher stage-1 res (544×960 vs 352×640) preserves identity MUCH better (freckles
  consistent across the strength sweep) — so earlier "identity drift" was PARTLY low-res+far-face,
  not pure LoRA. Drift is resolution-mitigable, which de-risks the merge plan.

### ⭐ STRATEGIC CONFIDENCE MARKER: LTX stage-1 quality > WAN (live-observed 2026-06-23)
- At stage-1 ONLY (352×640, pre-upscale), output quality is already impressive — "Wan cannot do
  this." Confirms the core thesis: LTX-2.3 quality >> WAN. This is the moat behind the
  high-quality-open-video-model strategy (and the future NSFW-motion-LoRA play). Strength-independent
  observation — bankable.
- **VBVR does NOT add NSFW/genitalia capability** (tested, confirmed). It's reasoning/motion,
  not content/anatomy (dev's own words: "NOT a motion LoRA, stacks with motion LoRAs"). The
  Civit NSFW examples were either already-visible-in-frame-1 content (i2v animating what's
  there) or made on the Sulphur-2 full UNCENSORED CHECKPOINT, not this LoRA on the official base.
- **Confirms the 2-layer censorship model (layer 2 = capability gap):** model can ANIMATE what's
  visible in frame 1, CANNOT SYNTHESIZE anatomy it never trained on. No LoRA/abliteration fixes
  layer 2. i2v makes it worse (i2v = "animate this frame", so off-frame synthesis is uphill).
- **AUDIO prompt rule (durable -> Cubric-Prompt recipe):** if ambient/diegetic sound is NOT
  described, the model defaults to placing MUSIC over the clip. Always specify ambient sound
  ("room tone, footsteps, breathing, no music") OR add `music, soundtrack, score` to negative.

### 🎯 STRATEGIC: own NSFW MOTION LoRA — market gap (FUTURE, post-first-LTX-release, UNDER CONSIDERATION)
> Not a 25th-June item. Logged as a differentiator candidate, NOT a current test task.
- **Market gap:** proprietary models (Sora/Veo/Kling/Runway) hard-block NSFW. NSFW creators'
  only real open option today = WAN (functional, lower quality). LTX-2.3 = higher quality but
  no NSFW capability + NO community LoRA fills it (confirmed this session). => "high-quality open
  video model that does NSFW" is an UNOCCUPIED category. Cubric Vision could be the only one.
- **Scope (user has trained many image LoRAs, this is his read):** teach generalized **MOTION
  only, NOT anatomy.** WAN precedent: 5-10 short (~3s) clips were enough to teach a motion.
  Don't build a massive LoRA — a few basic generalized NSFW motions. RTX 6000 (~not expensive),
  ~2-3 days based on WAN. LTX ≠ WAN so trial-and-error first run is longer, later runs fast.
  Existing successful WAN NSFW LoRAs often SHIP their datasets => half the work (port/adapt to LTX).
- **Why viable now (corrects earlier "expensive/data-heavy" caution):** that caution was for
  teach-anatomy-from-scratch. Motion-only on already-visible content = a much smaller, bounded
  R&D project. The difficulty (and the fact the community hasn't done it for 2.3) IS the moat.
- **Decision: ship refined base on the 25th regardless; this is its own epic, later.**

### HELD REMINDERS (surface at the right moment)
1. 🔊 UNMUTE the 2× SaveLatent nodes (`ltx_video_latent`, `ltx_audio_latent`) before the final
   logged workflow — muted now to avoid polluted test outputs.
2. 🗂️ Repath NerdyRodent monolith LoRAs root -> `LTX2.3\` (see folder-reorg note above).
3. 📝 Write the Cubric-Prompt LTX recipe from the prompt-contract finding ONCE the ship LoRA
   is locked.

---

## 1. Template node inventory (as of 2026-06-21)

### Input_* nodes (app-READ)
| Title | Node type | id | Meaning / app control |
|---|---|---|---|
| Input_Mode (1=i2v 2=t2v 3=FL) | MpiInt | 182 | mode selector → 2× MpiAnySwitch (S1 180 / S2 181). 1=i2v, 2=t2v, 3=first/last |
| Input_Positive | MpiText | 9 | positive prompt |
| Input_Negative | MpiText | 8 | negative prompt |
| Input_Width | MpiInt | 88 | width (must obey LTX /64 rule, x0.5 at stage-1) |
| Input_Height | MpiInt | 89 | height (same /64 rule) |
| Input_Duration | MpiInt | 75 | duration (frames/seconds — drives Duration MpiWanSeconds 76) |
| Input_Seed | MpiInt | 77 | seed |
| Input_Start_Frame | LoadImage | 90 | i2v / FL start image |
| Input_End_Frame | LoadImage | 91 | FL end image |
| Input_Preview_Only | MpiBoolean | 73 | stage-1-only preview gate (skips stage-2) |
| Input_Is_Continue | MpiBoolean | 71 | extend/continue toggle: load prior latent vs fresh |
| Input_Video_Latent | LoadLatent | 67 | prior VIDEO latent for continue |
| Input_Use_Audio | MpiSimpleBoolean | 190 | output audio on/off (CreateVideo with/without audio) |
| Input_Use_Transition | MpiBoolean | 192 | transition-LoRA on/off (float→strength self-bypass). **NORMAL MpiBoolean (float out), NOT SimpleBoolean** |

> NOTE: there was an `Input_Audio_Latent` LoadLatent (id 69) for continue audio —
> reinstated 2026-06-21 in the audio-subgraph restore. Confirm its title prefix is
> `Input_` (currently `Inpput_Audio_Latent` — TYPO in node title, fix to `Input_Audio_Latent`).

### Output_* nodes (app-WRITE)
| Title | Node type | id | Meaning |
|---|---|---|---|
| Output_Preview | SaveVideo | 72 | stage-1 preview video (audio-less per current decision — see §4) |
| Output_Video | SaveVideo | 186 | final stage-2 video |

> Tier-1 reserved bare titles present: `Duration` (MpiWanSeconds 76), `Seed` (MpiReroute 100).
> SaveLatent / LoadLatent stay bare per the naming law.

---

## 2. Prompt-box controls (PLANNED — provisional)

These map app UI controls → template Input_* nodes. **Cross-operation controls** apply
regardless of operation; **op-specific** only show for certain ops.

| Control | Type | Scope | Maps to | Status |
|---|---|---|---|---|
| Prompt (positive) | text | all | Input_Positive | locked |
| Negative | text | all | Input_Negative | locked |
| Width / Height (or Ratio) | int / ratio | all | Input_Width/Height | locked (LTX_RATIOS /64) |
| Duration | int | all | Input_Duration | locked |
| Seed | int | all | Input_Seed | locked |
| **Transition LoRA** | bool | **cross-op** | Input_Use_Transition | **decided 2026-06-21: cross-op prompt-box toggle, NOT its own operation** |
| Use Audio (output) | bool | all (video) | Input_Use_Audio | provisional |
| Start frame | image | i2v, FL, extend? | Input_Start_Frame | provisional |
| End frame | image | FL | Input_End_Frame | provisional |
| Continue / Extend | bool + latent | extend op | Input_Is_Continue + Input_Video_Latent | provisional (see §3) |
| **Input audio (voice)** | audio file + bool (+ maybe slider) | all (video) | Input_Audio_File + Input_Use_Input_Audio (+ Input_Audio_Influence) | **WORKING 2026-06-21 — see §3d. Slider may be droppable: strength 1.0 worked on multiple images. NEEDS more img/prompt testing to confirm "just turn on at 1.0 when audio present".** |

---

## 3. Operations (PLANNED — provisional, NOT finalized)

User's train of thought (2026-06-21), to be confirmed by testing:

- **image-to-video** — start frame (+ end frame? + audio input? + guide video?)
- **text-to-video** — prompt only (+ audio input? + guide video?)
- **first/last (transition)** — start + end frame (transition LoRA most effective here)
- **video extend** — prompt-box OPERATION (not separate workflow). Own-output extend =
  latent path (Input_Video_Latent, already half-wired via IfElse 51/56). External video
  extend = decode/encode the input into the same template. Needs stage-1 output → can't
  be standalone.
- **ControlNet** — DEFERRED (separate op, IC-LoRA union). Monolith has it (untested).
- **head-swap** — DEFERRED (separate op, BFS LoRAs). Monolith has it (untested).
- **guide-video** — UNEXPLORED. Monolith has a guide-video section neither of us has examined.
- **input audio / voice-to-character** — **BUILT + WORKING in template (2026-06-21).** See §3d.
  Cross-op (any video op can take input audio). Model auto-picks which character lip-syncs.

> Multi-stage: LTX is `_ms` → each op exports stage-1 + derived stage-2 file via the
> workflow-generation orchestrator (add `generate_ltx.py`). `allowsBranchingContinue=false`
> → Finish-only preview cards.

---

## 3b. Model DEPENDENCIES (implementable deps for this model)

> **DECISION 2026-06-21:** the extra LoRA in this workflow are NOT added to the user
> LoRA dropdown. They ship as **model dependencies** (auto-downloaded with the model),
> like the base weights. We already know the exact set — it's whatever the live template
> loads. Source of truth = the loader-node widget values below.

Extracted live from `LTX_i2v_t2v_template.json` (matches the user's Load-node screenshots):

| Role | File | ComfyUI folder | Precision | Source (TBD = confirm URL) |
|---|---|---|---|---|
| Diffusion (UNET) | `ltx-2.3-22b-distilled-1.1_transformer_only_bf16.safetensors` | `models/unet` (or checkpoints) | bf16 distilled | Kijai/LTX2.3_comfy (HF) — TBD exact |
| Text encoder 1 | `gemma_3_12B_it_fp8_scaled.safetensors` | `models/clip` (text_encoders) | fp8_scaled | Lightricks/LTX-2.3 collection — TBD |
| Text encoder 2 | `ltx-2.3_text_projection_bf16.safetensors` | `models/clip` | bf16 | Lightricks/LTX-2.3 — TBD |
| Video VAE | `LTX23_video_vae_bf16.safetensors` | `models/vae` | bf16 | Kijai/LTX2.3_comfy — TBD |
| Audio VAE | `LTX23_audio_vae_bf16.safetensors` | `models/vae` | bf16 | Kijai/LTX2.3_comfy — TBD |
| LoRA: gemma abliterated | `gemma-3-12b-it-abliterated_heretic_lora_rank64_bf16.safetensors` | `models/loras` | bf16 | (heretic abliterated variant) — TBD |
| LoRA: transition | `ltx2.3-transition.safetensors` (subfolder `LTX2.3\`) | `models/loras/LTX2.3` | — | **valiantcat/LTX-2.3-Transition-LORA (HF) — VERIFIED, 372MB, model-only** |

> URL/SHA resolution is a follow-up (see `mpic-compute-dep-hashes` skill + the
> `dependencies.js` integrity pattern in memory `project_dep_url_filename_integrity` —
> cross-check url/sha vs filename, crossed weights broke WAN i2v before).
> These plug into `js/data/modelConstants/dependencie...` as the model's dep manifest.
> The 2 LoRA are deps, NOT user-dropdown entries.

## 3d. Input audio (voice lip-sync) — AS-BUILT + WORKING (2026-06-21)

**STATUS: WORKING.** Generated character lip-syncs to a user-supplied audio clip.

### As-built node chain (template node IDs)
```
Input_Audio_File(197 LoadAudio) -> Audio Encode(198 LTXVAudioVAEEncode) <- Audio VAE(129 reroute<-2 VAELoaderKJ)
  -> Audio Noise Mask(200 SetLatentNoiseMask) <- Audio Mask(199 SolidMask)
       199.value <- Invert Influence(202 MpiNormalizeValue, mode INVERSE) <- Input_Audio_Influence(201 MpiFloat)
       199.width/height <- 155/156 floor(a/2)  [user wired real latent dims, NOT 512]
  -> Audio In Select(204 MpiIfElse): Input_Use_Input_Audio(203 MpiSimpleBoolean) ? user_audio : empty(144)
  -> 145 LTXVConcatAVLatent.audio_latent (stage-1)
```
Stage-2 inherits audio automatically (its audio latent derives from stage-1 output).

### THE FIX that made it work: LTXVConditioning fps embedding
- Template had NO LTXVConditioning → conditioning lacked fps metadata → audio timing never mapped.
- Added node **212 `LTX Conditioning (fps)`** between conditioning reroutes 84->86, frame_rate
  wired to live FPS (98 FPS reroute <- 76 Duration.fps). Feeds BOTH stages.
- This was THE missing piece. Before it: mouth never tracked input audio at any strength.

### Influence semantics (INVERTED slider, confirmed)
- `Input_Audio_Influence` slider 0..1 -> MpiNormalizeValue mode=inverse -> SolidMask value.
- Slider **1.0** = mask **0.0** = FULL audio conditioning (= monolith's "mask strength 0").
- Creator's video used mask 0.7 = our slider **0.3**.
- **Image-dependent:** image A worked at slider 0.3 AND 1.0; image B needed slider **1.0**
  (0.3/0.27 = no movement on B). => **1.0 is the safe default** (worked on every image tested).

### OPEN DESIGN QUESTION (test after lunch 2026-06-21)
- If strength 1.0 works on EVERY image/prompt -> **drop the slider entirely.** No button even:
  **auto-enable input audio at strength 1.0 whenever the user drops an audio file.**
- Needs more testing across images + prompts to confirm 1.0-always before removing the slider.
- If some images need <1.0 -> keep the slider as a tuning knob.

### Other confirmed facts
- Audio/video LENGTH: user ran 8s audio + 4s video; audio captured at END of clip, still worked.
  Length-match (trim) NOT confirmed as required — worked mismatched. Revisit if artifacts.
- Monolith reference: its saved state had custom-audio BYPASSED; user toggled ON -> WORKS.
  So a working reference exists. audio_normalization_factors = all 1s in BOTH (the `0.33` a
  prior sub-agent reported was a FABRICATION — widget fallback, never the wired value).
- Stage-1 CFG = 1 in BOTH (distilled). The `CFG=4` a prior sub-agent reported was also wrong
  for our path. DO NOT trust sub-agent claims without live-JSON verification (lesson repeated).

## 3e. Motion + prompt-adherence tuning — TEST SESSION (2026-06-21 evening)

> Full research + sources: [[motion-adherence-tuning]]. This = live-test findings.

### THE BIG FINDING: image/pose dominates motion, NOT resolution or settings
- Original "drop 2K/4K for low motion" decision = CONFOUNDED. Re-test at 2K showed
  GOOD motion (lady got up from sitting and walked away at 2K portrait).
- The real motion killer = **hard-to-animate START POSE**, not pixel count. Repro: a
  woman leaning on a wall, back to camera, looking over shoulder = motion-dead at any
  res (ambiguous pose, no natural motion affordance; model spends budget resolving
  "what is this body doing" before it can animate).
- Implication for app/UX: **"low motion" can be the INPUT'S fault, not a setting.**
  Some start frames won't move regardless of knobs. This is an expectation/UX thing.

### Resolution: 2K moved BETTER than expected (hypothesis broken)
- 2K portrait = good motion (knights brawled, lady moved). Original low-motion-at-high-res
  belief came from confounded tests (bad pose + high res blamed on res alone).
- 2K/4K tiers were NOT saved in LTX_RATIOS (js/utils/ratios.js line ~86, dropped w/ TODO).
  Computed for testing (NOT added to file — tier reshuffle pending): 2K ~1472/2560,
  4K ~2176/3840, /64-snapped (true 16:9 1440/2160 aren't /64; off by one grid step).

### Orientation may be a motion axis (WAN precedent)
- User's WAN experience: landscape often failed motion, portrait worked better (finetune
  orientation skew — training set leans portrait/9:16). Distilled LTX may carry similar.
- Testing portrait vs landscape, same prompt/seed. If it holds, orientation = quality
  axis, not just framing → per-orientation tuning may be needed, not just per-tier.

### Length: 3s gave good motion; under-shooting can suppress, over can degrade
- User found 3s gives GOOD motion (short clip = the action arc completes fast enough).
- Too-short can starve a slow-developing action; too-long drifts/loops + bigger latent.
- Some instructions need more time than others (action-dependent). 3s = fine test default.

### STG — ❌ REJECTED (2026-06-21). Use plain CFGGuider (cfg=1).
- **DECISION: drop the STG guider.** A/B test (same seed, STGGuider vs CFGGuider): plain
  CFGGuider gave tongue-out + hand-on-hip + NO color degradation. STG (any scale 1-2)
  consistently DESTROYED color/contrast and added no motion. Net-negative. Matches
  Lightricks shipping distilled at stg_scale=0. Stage-1 uses plain CFGGuider, cfg=1.
- Wiring kept in template for now but STGGuider is OUT of the gen path. Can delete later.
- (historical) STG was wired correctly; it just doesn't help this distilled model.

### STG (Spatio-Temporal Guidance) — WIRED + WORKING, but WEAK motion lever on distilled
- As-built: LTXVApplySTG(226, block_indices "14, 19") -> patched model -> STGGuider(229,
  cfg=1 / stg=1.5 / rescale=0.7) -> stage-1 sampler LTXVNormalizingSampler(70). Real
  pos + neg conditioning (84 reroute splits correctly: pos->212.positive, neg->212.negative).
- STG DOES something (visible change at stg=2) but leans toward COLOR/CONTRAST shift more
  than motion. Matches research: STG on distilled = EXPERIMENTAL, Lightricks defaults
  distilled to stg_scale=0. Not a reliable motion rescue for a motion-dead pose.
- stg is the `stg` widget, NOT cfg. cfg MUST stay 1 on distilled (cfg=2 = contrast blowout,
  user confirmed the color blowing out — known distilled failure).
- Sweep range: stg 0.5-2.0 (per Note node in graph). rescale 0.7.

### max_shift — cheap per-res lever (testing)
- Lower max_shift (2.05 -> 1.8) de-compresses sigma schedule at high res (more latent
  tokens auto-raise shift -> front-loads to structure, starves motion). Stage-1 only.

### ⭐ Heretic gemma (full abliterated encoder) — ADOPTED as default (2026-06-21)
- **A/B CONFIRMED (same seed held constant):** original `gemma_3_12B_it_fp8_scaled` ->
  hand on HIP (+ 3 fingers); `gemma-3-12b-it-heretic-fp8-comfy` -> hand ON BUTTOCK.
  Encoder is doing real work, seed controlled. Heretic earns its place.
- **DECISION: use heretic-fp8 as the gemma encoder. LoRA (abliterated rank64) BYPASSED.**
  The full abliterated encoder beats the LoRA (no ~50x layer dilution — abliteration baked
  into all layers). Keep original `gemma_3_12B_it_fp8_scaled` for further A/B testing.
- "On but not grabbing" = encoder passes the concept; diffusion still renders MILD version.
  Stronger intensity = diffusion-side NSFW LoRA (CivitAI, WAN-style), not the encoder. Park
  that unless on-buttock isn't enough.
- ❌ fp4 heretic DELETED (kept fp8 only). bf16 (24.4GB) never downloaded (won't fit 16GB VRAM).
- Files in `G:/ComfyUi/ComfyUI/models/text_encoders/`: heretic-fp8 (13.5GB, DEFAULT) +
  gemma_3_12B_it_fp8_scaled (12.3GB, baseline for testing).

### Censorship characterization — TWO LAYERS (2026-06-21 conclusion)
- **Layer 1 (encoder REFUSAL):** heretic gemma fixes. Suggestive A/B CONCLUSIVE (same seed,
  hand hip->buttock). KEEP heretic. Violence A/B INCONCLUSIVE (gore is seed-noisy +
  composition shifts; original gemma even gave more blood on one run). Decision rests on
  the clean suggestive test, not the noisy violence one.
- **Layer 2 (training CAPABILITY gap):** abliteration can't fix. Model never learned:
  bullet exit-wound physics, real fluid dynamics. Blood renders but as CGI-fake liquid,
  not realistic spray/squirt. = CivitAI diffusion-LoRA territory (teaches missing visual
  vocab), NOT an encoder fix. WAN users solve NSFW/gore this way (diffusion-side LoRA).
- **NEXT (user, on VPN — CivitAI blocked in UK):** hunt LTX-2.3 diffusion LoRAs for
  gore/realism/NSFW. Must be MODEL-side (diffusion), not text-encoder. Stacks on MODEL path
  alongside transition LoRA, strength ~0.6-1.0. User returning with findings.

### LoRA DELIVERY ARCHITECTURE — merge vs switch (DECISION 2026-06-21)
- **Always-on quality LoRAs (VBVR / Singularity / Enhancers-Soft) → MERGE INTO MODEL.**
  If we keep them, bake into the diffusion weights we ship. No extra download dependency,
  no runtime strength-stacking. This KILLS the mirror-risk for merge-ables (weights ship
  with our model; anongecko-style repo-deletion irrelevant once merged).
- **Toggleable LoRAs (transition = on/off switch) → STAY SEPARATE.** Can't merge — need
  runtime on/off control. Mirror these (they ship as switchable deps).
- **Heretic gemma → stays separate** (text encoder, different merge target than diffusion
  LoRAs). Still mirror it.
- **OPEN: style/effect LoRAs.** User has seen good style/effect-specific LTX LoRAs. Two
  paths under consideration: (a) add as separate switchable LoRAs (like transition) =
  per-style on/off, possibly as OPERATIONS; (b) a new styles/effects system for video+image
  models. UNDECIDED — design later.

### CivitAI capability LoRA hunt — RESULTS (2026-06-21)
> NOTE: CivitAI split NSFW to civitai.red (separate account + gating). NSFW LoRA search
> on main site now sparse. Sulphur 2 = uncensored full LTX-2.3 checkpoint family (not LoRA)
> for hardcore NSFW; companion rank-768 LoRA at huggingface.co/SulphurAI/Sulphur-2-base.

**TO DOWNLOAD + TEST (model-side, distilled-compatible, stack on MODEL path):**
| LoRA | What | URL (direct CDN) | Size | Strength |
|---|---|---|---|---|
| VBVR **I2V** (V4 Sulphur) | reasoning/motion/adherence for i2v | LTX2.3_reasoning_Sulphur-2_I2V_V4 | 786MB | 0.5-1.0 |
| VBVR **T2V** (V1) | reasoning/motion/adherence for t2v | LTX2.3_Reasoning_V1 | 658MB | 0.7-1.0 |
| Singularity OmniCine V1 | finger/toe anatomy + fast-motion + lip-sync + kills subtitles | civitai.com/api/download/models/3001143 | 2.5GB | 0.8-1.0 |
| Enhancers **Soft** | realistic/desaturated visual polish (Soft only, skip Crisp) | civitai.com/api/download/models/2849706 | 344MB | combine |

- ⚠️ **VBVR is MODE-DEPENDENT, not version-A/B.** Dev ships a different build per gen mode:
  I2V = V4 (Sulphur-trained), T2V latest = V1. Load the one matching the op. (FL = test
  which; likely the I2V/frame-conditioned build.) Both are NSFW LoRAs (explicit examples).
- **Merge implication:** VBVR isn't uniformly always-on — it's always-on-but-mode-specific.
  Merging means PER-MODE merged models, OR keep VBVR as a LoRA auto-SWITCHED by Input_Mode
  (not user-toggled like transition). Revisit the merge plan with this in mind.
- **VBVR is NOT a motion LoRA per dev — "stacks with motion LoRAs."** So VBVR + Singularity
  = complementary, stack both. Dev desc matches OUR findings: "reduces floaty/drifty motion,
  things move with purpose, follows prompts literally." High strength (1.5-2.0) = more
  adherence but t2v goes 16fps-choppy. Lower image_strength to 0.85 for more motion.
- **Singularity has STRICT prompt template** (Cinematic Timeline Structure: [Scene&Style]
  [Action Timeline 0-Xs][Camera Timeline][Environment][Dialogue][Audio]). Relevant to
  app prompt-builder later. Recommends our exact base (distilled-1.1 fp8_scaled).
- ❌ **Fight LoRA SKIPPED** (civitai 2489766) — user reviewed examples, fighting still bad.
  Recorded for possible later retest, NOT downloaded. This model is bad at fight scenes,
  period — don't build fight ops on it.
- **GORE/blood/wound LoRA: NONE EXIST for 2.3** (confirmed gap). Fluid-physics LoRA only
  for LTX-2.0 (rejected, doesn't map to 2.3). Gore = train-your-own or prompt-via-heretic.
- Bonus: OmniNFT RL LoRA (Kijai mirror) fixes audio-video desync/lip-sync/impact timing —
  relevant to input-audio work. huggingface.co/Kijai/LTX2.3_comfy loras/LTX-2.3-OmniNFT-RL-Lora_bf16.

### ⚠️ MODEL-MIRRORING TODO (supply-chain risk)
- `anongecko/gemma-3-12b-it-heretic-ltx` is a SMALL/low-following HF repo. Risk: author
  deletes it -> our default encoder vanishes. **MIRROR IT to our own repo to guarantee
  availability** before shipping it as a model dependency. Same principle for any low-trust
  community weight we depend on. (User policy: grab + self-host critical community models.)
- When LTX deps are finalized (spec §3b), heretic-fp8 ships as a model DEPENDENCY pointing
  at OUR mirror, not anongecko's repo. Resolve url/SHA against the mirror.

### Abliterated heretic LoRA — CLIP-ONLY, architecturally diluted ~50x (SUPERSEDED by heretic encoder)
- `gemma-3-12b-it-abliterated_heretic_lora_rank64_bf16` = TEXT-ENCODER ONLY (Comfy-Org/ltx-2,
  Kijai, 628MB). strength_MODEL is INERT (no diffusion keys); only strength_CLIP matters.
  Keep LoraLoader (model+CLIP), do NOT switch to model-only (would no-op it).
- "Not much effect" is ARCHITECTURAL: abliteration edits Gemma's final layer (48), but
  LTX averages embeddings across all 49 layers ~equally -> abliterated layer = ~2% of
  conditioning -> effect diluted ~50x. (Nathan Sapwell analysis.) fp8 base is a red
  herring, not the cause. Cannot affect motion (text-encoder LoRA).
- Stronger uncensor = replace WHOLE gemma encoder w/ fully-abliterated build, not a LoRA.
  Downloaded for testing (2026-06-21): anongecko/gemma-3-12b-it-heretic-ltx fp8 (14.5GB)
  + fp4 (9.75GB) -> G:/ComfyUi/ComfyUI/models/text_encoders/. fp8 = drop-in for current
  gemma_3_12B_it_fp8_scaled. NOTE: full bf16 (24.4GB) won't fit 16GB VRAM + transformer.
- Earlier precision finding ([[project_ltx23_model_precision_choice]]): full gemma
  "over-influences" -> dropped on purpose. fp8 abliterated may sidestep that while adding
  abliteration. Test fp8 vs fp4 vs current.

### Tiled VAE decode — DISCONNECTED, plain VAEDecode in use
- See [[tiled-vae-decode]]. Node kept but disconnected; plain VAEDecode for output (8s OK
  on 16GB). Revisit if last-frame artifacts or long-video OOM (then cap length + use extend).

### NAG (Normalized Attention Guidance) — re-arms negative at CFG=1 (not yet wired)
- Monolith has a NAG workflow (currently OFF). NAG = NEGATIVE-prompt mechanism only;
  does NOT touch positive. At cfg=1 normal negatives die ((cfg-1) term = 0); NAG restores
  them via attention-space normalization. The ONE way to make `static/motionless` negative
  actually suppress on a distilled model. Params: nag_scale ~5 (main knob), nag_tau 1.5,
  nag_alpha 0.5, nag_sigma_end ~4. Stacks with STG (STG=positive push, NAG=negative bite).
- Back-pocket lever for motion: `static, motionless, still` in negative WITH NAG active.

## 3c. Input-audio + BFS (head-swap) — see separate research docs
- Input audio (voice-to-character): [[monolith-input-audio]] — investigated 2026-06-21.
  SolidMask = global audio-strength scalar (0=full, 1=min), no per-character node.
- BFS head-swap: [[monolith-bfs-headswap]] — DEFERRED. BFS = Best Face Swap LoRA
  (Alissonerdx) + ComfyUI-BFSNodes; BFS_AUDIO = voice from the face-swap source video.

## 4. Decisions log (with WHY)

- **2026-06-21 — Audio subgraph reinstated.** Prior session removed the whole stage-1
  audio continue+save subgraph (9 nodes), breaking multi-stage audio (CreateVideo 66
  had unlinked audio; stage-2 "Stage 1 Audio Latent" 124 read raw fresh, not continue-aware).
  Restored from `.bak2`. Audio latent saved because it influences final result.
- **2026-06-21 — Preview audio decode removed (user, post-restore).** User removed the
  LTXVAudioVAEDecode preview-audio path again (no audio in stage-1 preview is fine), but
  KEPT the audio-latent SaveLatent (it affects stage-2 output). Re-scan before next JSON edit.
- **2026-06-21 — Transition LoRA = cross-op toggle.** `valiantcat/LTX-2.3-Transition-LORA`
  (file `LTX2.3\ltx2.3-transition.safetensors`, 372MB, verified model-only: 1152 tensors all
  `diffusion_model.*`, ZERO CLIP). Loaded via **MpiLoraModel** (model-only), switched by
  **Input_Use_Transition** (normal MpiBoolean float out 0.0/1.0 → strength_model
  self-bypass). NOT promoted to its own operation — applies across i2v/t2v/FL.
  - ⚠️ **STAGE PLACEMENT CORRECTED 2026-06-23 (live test).** This entry originally said
    "stage-2 only (matches official valiantcat workflow)" — **WRONG.** Live A/B: transition
    on **stage-2 only = ZERO effect**; moved to **stage-1 = the effect appeared.** So
    transition must run on **STAGE-1** (or both). This establishes the general rule below.
  - ⭐ **GENERAL RULE (2026-06-23): STAGE-1 = MOTION, STAGE-2 = FINE DETAIL.** Stage-1 is the
    motion-deciding stage (latent's temporal structure is born here); a motion/sequencing
    LoRA on stage-2 alone does nothing. Stage-2 re-denoises for spatial detail only. So:
    motion-class LoRAs (transition, VBVR, Singularity) → STAGE-1; detail-class LoRAs
    (Soft_Enhance — cig/fine detail degraded with it OFF on stage-2) → STAGE-2. Confirmed by
    the transition stage-2→stage-1 flip AND by the stage-2-only garment-morph (pants) being a
    detail-stage re-interpretation, not a motion change.
  - WHY cross-op: README confirms it works for t2v AND i2v, not FL-only ("strong
    generalization in: First-to-last frame · Text-to-video · Image-to-video"; "open-ended
    prompt-driven generation"). Strongest on FL (different scene/clothes/identity), lighter
    but real on t2v transformation prompts.
  - Settings: strength 1.0, trigger `zhuanchang` (near prompt end). CFG: distilled model
    → embedded guidance 1.0 (README also lists classic CFG 4.0 — A/B if transition weak).
- **Earlier (locked):** model precision — diffusion full bf16, gemma fp8_scaled. Min spec
  16GB VRAM + 32GB RAM. See memory `project_ltx23_model_precision_choice`.

---

## 5. Open testing questions

- [ ] Transition LoRA: A/B on/off across ALL modes (i2v/t2v/FL), not just FL.
- [ ] Transition CFG: 1 (distilled) vs README's 4 — does transition strengthen at 4?
- [ ] Video extend: confirm latent-continue feeds the sampler (currently the IfElse 51/56
      only feed the save-gate, NOT the sampler — sampler-side continue feed unverified).
- [ ] Stage-2 continue re-inject: does loaded latent need re-inject like i2v stage-2? (re-scan)
- [ ] Guide-video section in monolith — explore.
- [ ] Input audio / voice-to-character section in monolith — explore.
- [ ] Fix node-title typo `Inpput_Audio_Latent` → `Input_Audio_Latent`.
