# MPI-591 — Plan: Extend Video takes MiniMax H3, and the user picks which

Written 2026-08-31 after Fabio brought in `kat3ri/ComfyUI-MiniMax-H3-Extend`. Two files feed
this plan and neither should be re-searched: `brief.md` (the H3 seam physics — every rule there
fails SILENTLY) and `research/minimax-h3-extend-nodepack.md` (the pack, and what changed).

## Current State (2026-08-31, after the static arm and the Phase 2 node)

**Phase 1's static arm is RUN and it is the best result on the card — but it also turned the
"open for Fabio" question into a measured one.** The card is in `doing` / `in-progress`.

- **Arm G (static shot) matches the pack oracle exactly on the seam: 1.40x against 1.40x**
  (§ Phase 1 results, the seam table). Head preserved at PSNR 38.0 dB, scene continuous.
- **Arm E's moving-shot seam is 3.85x — measurably worse than the oracle.** The camera drift is
  real and it is a mechanism, not a budget: one frame-0 guide anchors CONTENT, not camera velocity.
- **The sparkle artifact is NOT camera-related — it reproduces on the locked-off shot.** Fabio,
  2026-08-31: he has never seen it in turbo, which points at the prefix rather than the sampler.
  **Arm I is queued to settle it** (frame-0 guide kept, `MpiH3MaskedPrefix` removed, nothing else).
- **PHASE 2 IS DONE — gate green.** `MpiH3EncodeAV` written, self-check green, both nodes verified
  REGISTERED on a live restarted bench via `/object_info`, and the pin bumped off `5e07043` to
  **`53c0198`** (archive URL checked, 200). `MpiH3EncodeAV` is **bit-identical to the pack's
  `MiniMaxH3EncodeAVPatched`** — arm J against arm G2, `PSNR y:inf`, head at the same 38.035 dB.
  The fork dependency is gone, proven equivalent rather than merely non-crashing.
  `changelog.md` + `README.md` rows added for BOTH H3 nodes — `f6d2484` had shipped without them,
  which would have made them invisible to `/comfy-release`.

**Next action, ordered by Fabio 2026-08-31: (1) DIAGNOSE THE SPARKLE, (2) then Phase 3.**
Not the other way round — Phase 3 would author a shipped graph around a node whose output is known
to be wrong. The diagnosis starts as reading, not running: the three places to look are listed at
the end of § the sparkle is `MpiH3MaskedPrefix`, in order.

Fabio has confirmed the artifact by eye (G has it, I does not) but has NOT yet given the Phase 1
seam verdict — the static-vs-moving question in § the static arm is still his to answer, and it
does not block the diagnosis.

**The app engine reinstalls MpiNodes at the new pin on its next boot** — it is a user replica with
no symlink. Restart the app before generating, or it stays at `5e07043` for that session.

**The bench is shared and it is not free.** GPU 0 was held from 11:49 by another session's MPI-664
voice bench, on the SAME ComfyUI at `:8188`. `gpu_lease.py run --` queues correctly behind it;
check `gpu_lease.py status` before assuming a slow run is your own, and check the QUEUE is empty
before restarting the bench — a restart kills whatever another session has in flight.

**A `RuntimeError: HostBuffer.read_file_slice failed` inside `SamplerCustomAdvanced` is an engine
hiccup, not a graph bug.** Seen once right after the other session's job released the GPU; the
identical graph succeeded on retry. Retry before diagnosing.

## Phase 1 results (2026-08-31) — six arms, on the bench

Source: `mpi591_src39.mp4`, 39 frames / 1.625 s / **640x352**, cut down from `MpiVideo_00056`.
Target 73 frames (39 preserved + 34 new). Seed 591000591 on every arm. Turbo settings lifted from
the SHIPPED graph, not invented: LoRA `minimax_h3_ref2v_..._4step` at **1.0**, `MiniMaxH3SigmaShift`
12/5, `BasicScheduler` **beta / 6 steps**, `KSamplerSelect` **euler**. Weights: our
`ref2va_pruned_int8_convrot` + int8 video VAE, never the author's fp16.

| arm | what | result |
|---|---|---|
| A | the pack (`MiniMaxH3VideoExtendPatched`), context as keyframes | **seam invisible** — the oracle |
| B | masked prefix ALONE | boundary EXACT, but the tail renders **an unrelated scene** |
| C | masked prefix + a 39-frame `MiniMaxH3AddGuide` | **crash** |
| D | that guide with NO mask | **same crash** — so it is the guide, not the mask |
| **E** | **masked prefix + a single frame-0 guide** | **works — continuous, first-party, stock** |
| F | stock pin-last-frame, no prefix | built, not run (E made it unnecessary) |
| **G** | **arm E on a STATIC shot** | **the best result on the card — seam matches the oracle** |
| H | no prefix, no guide (control) | clean, but a different scene: not a usable control |
| **I** | **frame-0 guide, prefix REMOVED** | **clean — so the PREFIX causes the sparkle** |

### The sparkle is `MpiH3MaskedPrefix`, and that is a real defect (2026-08-31)

Arm I is arm G with exactly one node removed. Same seed, same frame-0 guide, same source, same
canvas, same turbo settings. It anchors to the same scene and subject, and its tail is **clean**:

| arm | masked prefix | seam/tail | tail |
|---|---|---|---|
| G | **yes** | 1.39x | sparkle/streak particles from ~frame 50 |
| I | no | 1.17x | **no artifact** |

Fabio, 2026-08-31: he has never seen this artifact in turbo. So it is not the 6-step budget and it
is not the resolution — the two explanations the earlier "open for Fabio" note offered are both
dead. **`MpiH3MaskedPrefix` is putting it there.**

Not yet diagnosed, and NOT to be patched at the symptom. What is already known and constrains it:

- The preserved head is clean (PSNR 38.0 dB), so the damage is in the GENERATED region beside the
  boundary, not in the prefix itself.
- It grows with distance from the seam rather than sitting on it, which does not fit a simple
  boundary-blend error.
**Narrowed, same day, by two more arms:**

- **G2** — arm G re-run on a freshly restarted bench, after Fabio flagged `aimdo` VBAR
  `pin_count` warnings that never clear. **Bit-identical: `PSNR y:inf` against G.** So the engine
  state is not a factor, the warnings are noise, and G-vs-I was never confounded by the restart
  Fabio's MPI-664 job sat in the middle of. Worth keeping as a habit: when two arms straddle
  another session's job, re-run the earlier one before trusting the pair.
- **K** — the mask kept exactly as G has it, the context latent zeroed through core's own
  `LatentMultiply` (so shape, nesting and dtype are the real encode's, not a hand-built tensor).
  **Tail is clean.**

| arm | prefix content | mask | sparkle |
|---|---|---|---|
| G / G2 | real | yes | **yes** |
| K | zeros | yes | no |
| I | none | none | no |

**So the noise mask is exonerated and the written CONTENT is the cause.** That also kills the
first suspect: a noise-scale error would show up in the head, and the head decodes at 38.0 dB.

**Split again by arm L — it is the VIDEO half.** L keeps the video prefix and silences the audio
one with `AudioAdjustVolume` at -100 dB (silencing beats zeroing: the waveform keeps its exact
length, so the audio latent keeps its step count and the node's arithmetic is untouched).

| arm | video prefix | audio prefix | mask | sparkle |
|---|---|---|---|---|
| G / G2 | real | real | yes | **yes** |
| **L** | **real** | **silent** | yes | **yes** |
| K | zeroed | zeroed | yes | no |
| I | none | none | none | no |

Fabio confirmed the artifact by eye on G and its absence on I, 2026-08-31.

So the cause is **the written video latent**, and the audio half is exonerated. Note the tension
that makes this interesting: the same written latent decodes the head at 38.0 dB, so it is not
wrong — it is correct content that nonetheless poisons what is generated after it.

**Where to look next, in order.** All of this is reading, not running:

1. **The encoder's tail pad.** `MpiVideoSamplingPreview`'s changelog records that an H3 encode
   carries a 3-token pad after the real content, and that H3 packs 17 pixel frames per 5 latent
   tokens with each chunk's prefix trimmed. `MpiH3MaskedPrefix` takes `ctx_v[:, :, -steps:]` — the
   TAIL — which is exactly where a pad would sit. The head decoding at 38 dB argues against it, but
   this is the one place the node knowingly slices near a region the VAE treats specially.
2. **The packing phase across the boundary.** The context is encoded as a standalone 39-frame clip
   and then dropped into a 73-frame target's first steps. Both are on the grid, but the target's
   chunking is computed for 73 frames, not 39 — worth confirming the two agree token-for-token.
3. **What the model attends to.** The preserved tokens are re-noised at each sigma and never
   denoised. If the sparkle grows with distance from the seam (it does — it starts around frame 45,
   not at 39), that is attention drift, not a boundary error.

**Do NOT reach for a fix at the crash site.** There is no crash; there is correct-looking content
producing wrong output downstream, which is precisely the shape a symptom-patch would hide.

### The static arm (G), 2026-08-31 — the gate's second half

Source `MpiVideo_00001` trimmed to 39 frames at **352x608** (portrait, same pixel budget as E's
640x352). Picked by measurement, not by eye: edge-region frame-diff, brightness-normalised, isolates
CAMERA motion from subject motion — `00001` scores **0.075** against **6.2** for the street clips and
**8.9** for E's own source. It is the only locked-off clip on disk with ≥39 frames.

**The clip must be re-encoded AT the target canvas before it reaches the graph.** `VHS_LoadVideo`
does not resize, so a 704x1216 source against a 352x608 target is a hard stop — `MpiH3MaskedPrefix`
raised exactly that, which is the guard working. Phase 1's own source was already downscaled on disk.

**Seam metric** — the seam frame's luma diff over the mean diff of the SYNTHETIC side. Raw frame
diffs are not comparable across clips (real footage is smooth, a 6-step turbo tail is not), so the
ratio is the number that carries. The pack's oracle sets the bar at 1.40x:

| clip | head | seam | tail | **seam/tail** |
|---|---|---|---|---|
| A oracle (moving) | 3.66 | 11.61 | 8.29 | **1.40x** ← the bar |
| **G ours (static)** | 2.05 | 5.78 | 4.15 | **1.40x** ← matches it |
| B mask alone (moving) | 3.68 | 12.72 | 3.97 | 3.20x |
| E ours (moving) | 3.67 | 23.01 | 5.98 | **3.85x** |

So the route is clean on a locked camera and steps on a dolly-in. That is a real limit to write
down, not a turbo artefact: a single frame-0 guide gives the model the subject and the set, and
says nothing about where the camera was going.

**A metric that did NOT work, recorded so it is not tried again:** frame-38-vs-frame-72 scene drift.
It scores arm B — the known failure that renders an unrelated scene — at 29.5 against G's 25.3. A
moving subject alone produces that much, so it cannot separate the known-good from the known-bad.

**Three findings that outlive the card:**

1. **The masked prefix is mechanically correct on stock core, and that is now measured.** E's and B's
   first 39 frames come back at **PSNR ~38 dB** against the source — VAE-round-trip level, not a
   regeneration. The boundary lands exactly where the arithmetic says. The nested AV noise mask
   reaches the sampler, `scale_latent_inpaint` returns the preserved region unscaled, and
   `process_timestep` zeroes its timestep. None of that needed a patch.
2. **A clean prefix is NOT an anchor.** Arm B is the whole lesson: perfectly preserved frames 0-38,
   and then a completely different street, wardrobe and subject from frame 39. The model will
   happily leave given tokens alone and ignore them. One single-frame guide at index 0 fixes it.
3. **`brief.md`'s trap 3 is WRONG for this route and must be corrected.** It says "guides inside the
   preserved head must be dropped — a stock first-frame guide sitting in the repeated span fights
   the prefix". It does not fight it: the frame-0 guide *inside* the preserved head is precisely
   what makes the continuation cohere. Arm B (no guide) is the failure; arm E (guide) is the fix.

**Why C and D crashed, exactly** — `comfy/ldm/minimax/model.py:654`,
`all_video_rows[~img_update] = cond_video_rows`, `shape mismatch [2640, 96] -> [220, 96]`. 2640 is
the 39-frame guide's 12 latent steps x 220 rows; 220 is ONE step. Stock reserves a single latent
step for a keyframe, which is the anchoring limit the pack's `PackedLayout` patch generalises. So
the research file's read of the patch is confirmed from the failure side — and irrelevant, because
E never needs a multi-frame guide.

**Open for Fabio:** E's new tail keeps the subject, wardrobe and street, but the camera drifts from
the source's dolly-in to a pull-back, and a light streak crosses frames 50-72. 6-step turbo at 352p
is a low bar, so this may be budget rather than mechanism — re-run at 768p / non-turbo before
reading anything into it.

**Cost note:** the first attempt ran the pack's example defaults (1504x832, 124 frames, 20 steps,
`res_multistep`) and was still going at 1000 s. Fabio's correction — small source, small canvas,
single stage, turbo on — took a full arm to **40-80 s**. Do not run this bench work any other way.

## The card is UNBLOCKED — that is the headline

`task.json` still says "cannot start until `/mpi-bump-engine` lands a core that has both".
**It already did.** `node_lock.json` pins core `v0.34.0`, and `MiniMaxH3AddGuide` (PR 15439) and
the per-stream `audio_denoise_mask` (PR 15375) are both in that tag — read off the tagged files,
not the changelog. The bench (`G:\ComfyUi`, 0.34.2) has the same. Nothing here waits on anything.

## Plan Drift

- **2026-08-31 — Phase 1 and Phase 2 merged.** Phase 1 said "build the masked-prefix graph by
  hand". It could not be built: a live `/object_info` probe showed nothing in core or in MpiNodes
  composes a masked prefix (`MiniMaxH3VideoExtend` / `MiniMaxH3EncodeAV` are fork-only). So the
  Phase 2 node was written FIRST, in `h3.py`, which the bench sees through its symlink. Phase 2 is
  now commit → push → pin only. Fabio approved; that is also what moved the card to `doing`.
- **2026-08-31 — the mechanism changed, the plan's headline claim was wrong.** The plan said the
  masked prefix "uses no keyframes, so neither core patch applies". Half right: no patch is needed,
  but the masked prefix ALONE does not continue anything (arm B). The shipping route is masked
  prefix **plus a single frame-0 guide** (arm E). Still fully first-party and stock — the verdict
  on the pack does not change, only the graph does.
- **2026-08-31 — a first-party AV encode is now a Phase 2 item.** Both arms used the pack's
  `MiniMaxH3EncodeAVPatched` to turn the prior clip into an AV latent, deliberately, to keep the
  encode out of the comparison. A shipped graph cannot depend on the pack, and core exposes no
  join for the two halves (`VAEEncode` + `VAEEncodeAudio` give separate latents). Add
  `MpiH3EncodeAV` to `h3.py` — ~10 lines, mirroring core's own `_encode_ref_audio`.
- **2026-08-31 — the source clip must be trimmed to 17k+5 frames BEFORE it is encoded.** Found by
  the node's own self-check, not at run time: an off-grid clip shifts the VAE's packing phase so
  that NO tail of it lands on a legal context length (a 30-step latent can reach 4, 8, 12, 16, 17,
  21 ... frames and never 39 or 90). The node raises and says so. The graph needs a trim upstream.
- **2026-08-31 — every bench graph ends in `MpiClearVram`** (Fabio), wired as a passthrough between
  the decode chain and `SaveVideo` so it cannot be reordered off the end. Carry this into the
  Phase 3 shipped graph.
- **2026-08-31 — the seam has a NUMBER now, and it says the route has a limit.** "Judged by Fabio"
  is still the gate, but the seam/tail ratio (§ the static arm) makes the two arms comparable: ours
  ties the oracle at 1.40x on a locked camera and misses at 3.85x on a dolly-in. Do not read that as
  a turbo budget — it reproduces the plan's own § Phase 1 "open for Fabio" note as a mechanism. If a
  moving-camera extend has to be as clean as a static one, the fix is more camera information at the
  seam (a second guide near the boundary, or the pack's multi-frame anchor), and that is a decision
  for Fabio, not a silent change to the node.
- **2026-08-31 — `MpiH3EncodeAV` is written, committed and pushed (`952919f`), and the pin is
  deliberately still at `5e07043`.** Phase 2's gate reads "committed → pushed → pinned", and the
  middle step is done. The pin waits because the node has never been loaded by a running ComfyUI:
  the only bench was held by another session's job all session, and restarting it would have killed
  that job. Pinning first and verifying later is the false-done this card keeps catching.

## The decision: first-party masked prefix. The pack is a bench ORACLE, not a dependency.

| route | mechanism | verdict |
|---|---|---|
| **masked prefix** (`brief.md`) | encoded tail written into the target latent's prefix, protected by the nested AV noise mask | **ship this** |
| **the pack** | context keyframes → model regenerates the head → trim | bench-only |

The pack monkey-patches `comfy.ldm.minimax.model.PackedLayout.__init__` and
`comfy.model_base.MiniMaxH3.extra_conds` at import time. We pin core and bump it; a patched
internal that drifts does not raise, it renders a plausible clip that is quietly wrong. Both
patches fix **keyframe** bugs, and the masked-prefix route uses no keyframes — so neither applies
to it. ~80 lines in `ComfyUi-MpiNodes` against a 19th third-party pack that rewrites core.

The pack still earns its keep on the bench: it is the fork's real implementation, so running its
example against ours on the same clip and seed is the only cheap way to check a seam that
otherwise cannot be proven wrong by looking at it.

## Scope: v1 is prompt-only. Refs are a follow-up card.

The pack ships two example workflows and the difference is one input and one weight:

- **Text-to-Video-Extend** → `fl2va` transformer → our **`minimax-h3`** card. Prompt describes the
  new seconds. This is the LTX extend the flow already does, on the other model.
- **Ref-to-Video-Extend** → `ref2va` transformer → our **`minimax-h3-ref2va`** card, plus ref
  images that pin a subject/voice **across the seam**. A second **20.97GB** download, a second
  graph, and its own UI (image slots that only exist for one candidate).

v1 = `minimax-h3` only, so the slot reads `['ltx-23-balanced', 'minimax-h3']` and the flow's input
surface does not change at all. Ref-extend is a real feature and it gets its own card — it is
squarely the LoRA-free character-consistency bet (consistent character, no training),
which is exactly why it should not be smuggled in as a checkbox on this one.

## The one new thing: a Flow whose picked model selects a different WORKFLOW FILE

This is the part that outlives the card, and it is the same finding `task.json` already made.
`modelParams` swaps params inside ONE graph; LTX extend and H3 extend share no nodes.

Today (`js/services/commandExecutor.js:1457`):

```js
const universal = getUniversalWorkflow(payload.operation);   // op → one filename
```

and `getUniversalWorkflow` (`js/data/modelRegistry.js:405`) is `UNIVERSAL_WORKFLOWS[key]?.workflow`.

**Proposed contract — keep resolution where it already lives:**

```js
// universal_workflows.js
flowLtxExtend: {
    workflow: 'flow_ltx_extend.json',            // the recommended candidate, models[0]
    byModel: { 'minimax-h3': 'flow_h3_extend.json' },
},
```

```js
// modelRegistry.js
export function getUniversalWorkflow(key, modelIds = []) {
    const def = UNIVERSAL_WORKFLOWS[key];
    if (!def) return null;
    for (const id of modelIds) if (def.byModel?.[id]) return def.byModel[id];
    return def.workflow ?? null;
}
```

The executor passes `payload.generationSettings?.flowModelIds`, which flow payloads have carried
since MPI-620 (`flowService.js:122`) — so nothing new has to be threaded through, and every
existing caller keeps working on the one-argument form.

Rejected: putting a resolved `workflowFile` straight on the payload from `flowService`. It is
fewer lines and it opens a second route into workflow resolution that bypasses the registry — the
next flow with a two-graph slot would not know which one to copy.

`filePrefix` stays `flowExtendVideo` and the op stays `flowLtxExtend`. **Do not rename the op** —
`operationRegistry.js` + `commandRegistry.js` + the sidecars of every clip already extended read
that key, and MPI-533 (tombstone ledger) is still a `todo`.

## Phases

Each phase has one gate. Do not start the next until its gate is green.

### 1 — Bench: prove the seam (no app, no repo edits, **NO DOWNLOAD**)

On `G:\ComfyUi` (0.34.2), with **our** weights: `minimax_h3_video_vae_int8_convrot` (2.95GB),
`minimax_h3_audio_vae_fp32` (0.56GB), the H3 Qwen3-VL encoder (24.55GB) — all already on disk.

**Run this phase on `ref2va` (19.53GB, already there), NOT `fl2va`.** See § Disk: `fl2va` does not
fit and buys nothing here. The seam is a **latent-layout** property — the `17k+5` grid, the VAE's
temporal packing, the nested AV mask — and both DiTs share the VAEs, the encoder and the layout.
A seam proven on one is proven on the other. The pack's own two examples differ only in the
`UNETLoader` widget, so the oracle run swaps to `ref2va` the same way.

1. Install the pack into the bench `custom_nodes/` **only**, run its Ref-to-Video-Extend example
   (it already loads `ref2va`) on a known clip. That is the oracle take.
2. Build the masked-prefix graph by hand: `MpiH3Length` for the `17k+5` grid, encode the whole
   context run in ONE VAE call, snap the context DOWN onto the grid before slicing the tail
   (trap 1), use a context length divisible by 3 so both clocks line up — **39 / 90 / 141**
   (trap 2), take the audio prefix from the sampled latent not a re-encode, drop guides inside the
   preserved head (trap 3).
3. Same source clip, same seed, both routes. Compare the seam.

> **Gate:** a masked-prefix extend whose seam is at least as clean as the pack's, judged by Fabio.
> A seam that only *looks* fine on one clip is not a pass — run a static shot and a moving one.

Running on `ref2va` also settles, in the same session and for free, the thing the follow-up ref
card needs: does masked prefix + stock `MiniMaxH3ReferenceToVideo` work with no patch? The context
arrives as latent data rather than as a keyframe, so `extra_conds`' overwrite should never fire.
Record the answer either way.

### 2 — The node in `ComfyUi-MpiNodes`

`/mpi-nodes-sync` owns this — the sibling repo's procedures do not load in a Vision session, read
them and follow inline. ~80 lines beside the existing `MpiH3Length` / `MpiH3References` in `h3.py`:
encode tail, snap to grid, write the prefix, build the two-stream mask, drop conflicting guides.
Written from `brief.md`'s rules, **not ported** — `ethanfel/ComfyUI-MiniMaxH3-Contex-Loop` is
GPL-3.0 and MpiNodes has no `LICENSE` file (`brief.md` says so, and it still has none).

Read `MiniMaxH3EncodeAVPatched` first: encoding the prior clip to an AV latent is needed on every
route including ours, and it is the one piece of the pack with no dependency on either patch.

> **Gate:** committed → pushed → `node_lock.json` `ComfyUI-MpiNodes.commit` bumped off
> `5e07043`. A node that is not pinned did not ship.

### 3 — The workflow file

Bench graph → `comfy_workflows/raw/flow_h3_extend.json` → API export → `flow_h3_extend.json`.
`Input_*` / `Output_*` titles per `docs/workflow-authoring/`; agents never hand-edit the JSON —
this is a bench re-export. Titles must at minimum cover `Input_Video`, `Input_Positive`,
`Input_Seed`, `Input_Duration`, `Output_Video`, so the existing collected fields land unchanged.

**H3 has no negative input** (`models.js` `minimax-h3`: `negativePrompt: false` — the conditioning
comes out of a single Qwen3-VL encode). **Fabio, 2026-08-31: the negative box HIDES on the H3
arm.** So the H3 graph carries no `Input_Negative` node and the field goes behind `hiddenWhen`.
Keeping it visible would have re-created MPI-475 exactly — a stop the user typed that never
reached the model, with nothing saying so.

> **DEPENDS ON MPI-664**, which is adding `hiddenWhen` as portable frame work. Do not author a
> second one here. If Phase 4 lands first, the field stays visible with a one-line comment naming
> this dependency, and the hide is a one-line follow-up — never a bespoke twin.

> **Gate:** `tests/inject-params-titles.test.cjs` extended to pin the new file's titles, green.

### 4 — Wire the pick

Four edits, all small:

| file | edit |
|---|---|
| `js/data/modelConstants/universal_workflows.js` | `byModel` on `flowLtxExtend` |
| `js/data/modelRegistry.js` | `getUniversalWorkflow(key, modelIds)` |
| `js/services/commandExecutor.js` | pass `payload.generationSettings?.flowModelIds` |
| `js/data/flowsRegistry.js` | `requiredModels: [{ label: 'Model', models: ['ltx-23-balanced', 'minimax-h3'] }]` |

`models[0]` is the recommended candidate and the picker stars it — LTX stays first, because it is
what every existing extend ran on. No `modelParams` arm is needed: the two candidates differ by
graph, not by a loader widget inside one graph. Check `tests/flow-model-choice.test.cjs` tolerates
a slot with no `modelParams` — if it does not, that is a test change, not a `modelParams` stub.

H3's licence consent gate (MPI-451, keyed by licence id in `licences.js`) already covers this: an
H3-only user who accepted during an fl2va install gets no second dialog.

> **Gate:** `tests/flow-model-choice.test.cjs` + the inject test green, `node --check` clean.

### 5 — Verify (`docs/playbooks/add-flow/05-verify.md`)

Isolated app on its OWN port and profile (`npm run app:isolated`) — never `:3000`. Pick LTX, run:
unchanged. Pick H3, run: a real clip. Reopen the flow: the pick is session-only by design
(`setFlowModel`), so it does **not** restore — confirm that reads as intended and not as a bug.
Reuse Prompt on an H3 extend must come back on H3 (`flowModelIds` on the sidecar, MPI-620).

> **Gate:** Fabio watches one H3 extend end to end. The live-run gate is his, always.

### 6 — Docs

`docs/playbooks/add-flow/existing-flows/ltx-extend.md` gains the second candidate and the
`byModel` contract; `any-of-models.md` gains "a slot may pick a different GRAPH, not just
different params" — that is the portable half and it belongs there, not on the flow's own page.
Ask before editing `.claude/rules/`.

## Not in v1

- **Ref-to-video extend** — its own card, see § Scope.
- **`minimax-h3-ref2va` as a third candidate** — same thing.
- **The pack in `node_lock.json`** — bench-only. If Phase 1 fails and the pack becomes the route,
  pin `source: git-commit` at `d175f0a`, **not** `registry` (the registry copy is v1.0.0 from
  2026-08-11, 19 days behind `main`), and open an issue asking for a `LICENSE` file.
- **Width/height on the flow** — still MPI-520's open half, still deferred, unchanged by this card.

## Disk — the real constraint, and why Phase 1 costs nothing

Measured 2026-08-31: **`G:` is 98% full, 5.1GB free of 239GB.** `fl2va` is ~19.53GB, so it does
not fit at all — this is not a preference to weigh, it is arithmetic.

`G:\CubricModels` is **the app's shared model store**, not a bench scratch dir — the bench's
`extra_model_paths.yaml` says so in its own comment ("same models the app pulls from"). So
**deleting a weight there uninstalls it from Fabio's app.** Relevant weights:

| weight | size | status |
|---|---|---|
| `qwen3vl_32b_h3_*` encoder | 24.55GB | shared by both H3 DiTs — never a candidate |
| `minimax_h3_ref2va_pruned_int8_convrot` | 19.53GB | **present — Phase 1 runs on this** |
| `ltx-2.3-22b-distilled-1.1_transformer_only_int8_convrot` | 20.03GB | the flow's shipped path AND its A/B baseline |
| `minimax_h3_fl2va_pruned_int8_convrot` | ~19.53GB | absent |

**Do not uninstall LTX.** It is `models[0]`, it is what every existing extend ran on, it is the
control in Phase 1's comparison, and removing it costs a 20GB re-download to get back to today.

Fabio raised uninstalling LTX to make room. It is not needed: **nothing before Phase 3 wants
`fl2va`.** Prove the seam on `ref2va`, and only then spend space on a route that is known to work
rather than on spec. When `fl2va` is finally needed, the two surfaces want different things and
only one of them is tight:

- **Bench (Phase 3, authoring the graph)** — no `G:` space needed at all. The bench's
  `extra_model_paths.yaml` already maps a SECOND store, `comfyui_external` →
  `C:/AI/diffusion_models/` (101GB free on `C:`). Drop `fl2va` there; ComfyUI scans both roots and
  the node dropdown does not care which one served the file.
- **App (Phase 5, the live run)** — this one is tight. The app has ONE models root
  (`CUBRIC_MODELS_ROOT`, preserved across engine reinstalls via `getCustomRoot()`,
  `routes/engine.js:1009`), so the weight has to live under it. Either free ~15GB of unrelated
  weights on `G:`, or move the whole store — it is one path, not a per-model choice. Decide then,
  with the route already proven.

## Open — needs Fabio

Nothing. Both questions answered 2026-08-31: the negative hides on the H3 arm (§ Phase 3), and the
disk question dissolves because Phase 1 needs no download (§ Disk).
