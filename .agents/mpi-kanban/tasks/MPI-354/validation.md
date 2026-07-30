# MPI-354 — Klein 4B in-app validation

Capture sheet for the verification runs. Two numbers are BLOCKED on these runs and
cannot be derived from the JSON: the progress-bar counts and the real VRAM.

## 0. Engine prerequisite — RESOLVED 2026-07-28

The first restart after the junction fix **crashed ComfyUI at boot**:

```
RuntimeError: Added route will never be executed, method POST is already registered
```

Root cause: the previous session parked the stale managed pack as
`custom_nodes/ComfyUI-MpiNodes.stale-aaa1d2d9`. ComfyUI skips a `custom_nodes` entry
**only when its name ends in `.disabled`** (`nodes.py` ~2348) — any other suffix still
loads. So the stale copy AND the junction both imported `routes.py`, each registering
`POST /mpi/reload-extra-paths`, and aiohttp refuses the duplicate → hard boot failure.

Fixed by renaming to `ComfyUI-MpiNodes.stale-aaa1d2d9.disabled`. **Never park a custom
node under any other suffix.** Engine now boots clean; `MpiStyleSelector`,
`MpiStyleLoras` and `MpiTextContains` are all present in the full `/object_info`, and
`klein_t2i.json` resolves with 0 unknown class types.

## 1. Progress stages — capture PER OP, not per file

**Read this before counting.** `stagesFor()` in `js/data/progressStages.js` keys on the
WORKFLOW FILENAME (`PROGRESS_STAGES['krea2_t2i.json']`), with a mode of
`single` / `preview` / `stage2`. Klein runs **all seven ops from `klein_t2i.json`**, and
their bar counts genuinely differ — so one key cannot hold seven answers. The table
cannot express Klein as it stands.

So capture the count **per op**, and the schema gets a per-op key afterwards
(`'klein_t2i.json:detail'`, or a fourth argument to `stagesFor`). Until then Klein has
no entry at all: the counter still ticks, it just shows "2" rather than "2/3" —
degraded, never wrong.

Counting method (from progressStages.js): run the op, watch the ComfyUI terminal, count
how many times a tqdm bar **restarts at 0**, INCLUDING the `0/1` model-load bar.

| op | `Input_wf_type` | bars | notes |
|---|---|---|---|
| t2i (enhancer OFF) | 1 | 1 sampling stage | 4 steps |
| t2i (enhancer ON) | 1 | 1 sampling stage | the enhancer does NOT add a bar — it runs inside the same stage |
| i2i | 2 | 1 sampling stage | |
| depth (poseReference) | 3 | 1 sampling stage | |
| edit (kleinEdit) | 4 | 1 sampling stage | 1, 2 and 3 refs all run |
| remove (inpaint) | 5 | 2 sampling stages | matches the prediction — removal + detail are both baked |
| detail | 6 | 2 sampling stages | |
| upscale | 7 | (tiles at runtime) | UltimateSDUpscale — tiles are counted at RUNTIME, so what matters here is the **post-tile** bar count (`postTileBarsFor`). MPI-350: routes/comfy.js forwards RAW tqdm, so T tiles emit **T+1** `comfy:tile-progress` events. |

Counts above are the user's live report, expressed as **sampling stages beyond the
initial model-load bar** — add 1 for the `0/1` load bar to get the `stagesFor` total.
Every op is a single stage except remove and detail, which are two. Nothing consumes
these yet: `PROGRESS_STAGES` still cannot key per-op, so Klein has no entry either way.

**A passive WS listener cannot capture this.** ComfyUI addresses `execution_start` /
`progress` to the ORIGINATING client id, so a second socket that merely connects to
`:8188/ws` receives nothing while the app generates. Counting must come from the app's
own progress stream, the ComfyUI console, or the user.

## 2. VRAM — ROUGH READINGS, 2026-07-28 (RTX 4060 Ti, 16 GB, `--lowvram`)

**These are eyeballed estimates from the status bar, not instrumented measurements.**
Treat them as orders of magnitude and nothing finer; do not quote a decimal anywhere.
They were also taken with only ~6 GB of the card actually free — see below, it matters
more than the numbers do.

- **Most ops sit around 5 GB** — t2i, i2i, depth, 1-reference edit, remove, detail, upscale.
- **Multi-reference edit is the outlier, in the low teens.** References are the whole cost
  curve: the second one roughly triples the peak and the third adds little on top.
- ~1 GB of every reading is app + desktop baseline.

`sizeTier` stays `'low'` — a display facet only (the Size filter and the picker's meta
word), and Klein has no `modelFamily` so it shows no tier letter. The weights are
genuinely small (4.07 GB transformer), which is what the badge is really describing.

### The low-VRAM question is ANSWERED — accidentally, and better than a test would have

**Every run in this capture pass had only ~6 GB of VRAM actually free.** A Cubric Prompt
LLM agent was holding ~10 GB of the 16 GB card throughout. Generations climbed to ~15.3 GB
by offloading into system RAM and **completed** — slower, but correct output on every op,
including multi-reference edit.

That is a stronger result than the `--reserve-vram 8` test that was planned, and it
settles the tier: Klein runs **below** the 8 GB the Model Library quotes as its minimum,
provided system RAM is there to absorb the spill. It also confirms the reading of the
earlier numbers — the "14 GB" peak was staging filling free VRAM, never a floor.

The app already frames this correctly on its own terms and needs no change: the Model
Library detail panel renders `tradeTable()` (`footprint.js`) from the model's weights,
showing Klein at **min 8 GB VRAM + ~8 GB system RAM** (or 16 GB VRAM alone) under the
label *"Estimated model need; excludes OS usage"*. Derived, caveated, and now corroborated
by a run that beat it. Nothing else should restate a card size.

### VRAM no longer piles up between runs — FIXED IN THE GRAPH

Peak roughly doubled when one op followed another without a release, because
nothing freed the previous run's residents. The user added **`MpiClearVram` (node 570)**
to the master template and re-exported; it is baked into `klein_t2i.json`, wired
`MpiAnySwitch10 318 → MpiClearVram 570 → Output_Image 111`, i.e. on every branch's way
out. Runtime is now 185 nodes.

## 3. Things worth eyeballing while you are in there

- **Edit shows three image slots** — CONFIRMED working at 1, 2 and 3 references.
- **Op selection is right** — CONFIRMED. Every op run returned the kind of image that op
  should produce, which is the check that matters: the one-master-template failure mode
  is silent (a wrong `Input_wf_type` returns a plausible image from the WRONG op).
- **Quality**: best edit model shipped so far, per the user. Residual failure mode is
  ordinary generative error — occasional hallucinated or missing limbs — not a wiring
  defect. Raises the question of whether the 9B is worth evaluating (see MPI-323).
- **Enhancer works** — CONFIRMED. On/off is visible in the output at a glance across four
  t2i runs, the Qwen3-4B encoder does not crash, it adds no extra progress bar (it runs
  inside the single sampling stage), and it costs little time. **Reuse restores the
  ENHANCED prompt**, not the original the user typed — worth deciding whether that is the
  wanted behaviour, since re-running a reused card with the enhancer still ON feeds an
  already-enhanced prompt back through the enhancer.
- **Styles working**, **no negative-prompt toggle**, **no tier radio** — all CONFIRMED.
- **Depth preprocessor is now `depth_anything_v2_vits.pth`** (the user swapped it from
  vitl and the change is already baked — the vitl node was pruned as not upstream of an
  output). Not an issue: `comfyui_controlnet_aux` auto-fetches it into
  `ckpts/depth-anything/Depth-Anything-V2-Small/`, verified present on both the engine
  and the G:\ bench. It is not a file dep of ours and needs no registry entry.

## 3b. Depth takes TWO images on Klein — IMPLEMENTED, USER-VERIFIED 2026-07-28

Klein's depth branch shares the edit branch's `ReferenceLatent` chain (verified in the
baked graph: the `any_3` output path traces back through `VAEDecode 117`, which is
downstream of `Input_Image_2`). So depth accepts a second image, and the second image
changes what the op MEANS: **image 1 supplies the depth, image 2 supplies the subject
posed into it.** With one image the subject comes from the prompt; with two it comes
from the picture. The app was gating depth to a single image and losing this entirely.

Implemented WITHOUT touching Krea2/SDXL depth, which have no such input and share the
one `poseReference` op def:

- `poseReference.mediaInputs` gains an optional `inputImage2` slot carrying
  `requiresCapability: 'depthSubject'`.
- `filterMediaInputsForModel()` grew a general form of the gate it already applied to
  LTX's audio slot: a slot naming a capability is dropped for any model that does not
  declare it. Klein declares `capabilities.depthSubject: true`; nothing else does.
- `_maxMediaSlots()` now filters by model before counting. Without this the op-fit rule
  (MPI-337, "max media = declared slots") would have let **Krea2** depth light up on two
  staged chips and then inject an image its graph never reads.
- The info panel copy is per-model via the `help.byModel` mechanism `getOpHelp` already
  had, keyed on `type: 'klein'` so no other model's depth guide changes.

Pinned by three tests in `tests/op-strip-availability.test.cjs`, each with its negative
control (Krea2 must NOT see the slot, must NOT become available at 2 chips, must keep
the one-image guide).

Klein's depth ALSO reaches the 3rd reference chain in the graph, but only two slots are
exposed — two is what the op means, and an unused third slot would just invite confusion.

## 3c. Depth and edit do not take a ratio — and the card was cut to the wrong shape

Found by generating Klein depth from a PORTRAIT input with LANDSCAPE selected. Two
separate defects, one visible symptom.

**The ratio picker should not be there.** Klein's depth and edit branches scale the input
image to a megapixel target and inherit its shape; `Input_Width`/`Input_Height` are never
read. Offering the picker is worse than useless — it tells the user they chose an output
shape they will not get. Now gated by `modelShowsRatio(model, operation)` against a new
`ModelDef.imageSizedOps`, which Klein sets to `['poseReference', 'kleinEdit']`. Same shape
as `modelShowsStyleRack` and for the same reason: whether an op sizes itself is a property
of the MODEL's graph, not the op — Krea2/SDXL depth DOES generate at our dimensions and
shares the identical `poseReference` def. Default is an empty list, so no other model
changes. Two tests, including the Krea2 negative control.

**The gallery card was shaped by the REQUEST, not the result** — and this one was never
Klein-specific. `generationService` built each gallery group with the requested
`injectionParams.Width/Height`, so any graph that sizes its own output got a card cut to
a shape the image does not have: the justified layout reserved a landscape cell for a
portrait picture and padded the difference. The ITEM was always correct — the server
probes the real file with `sharp` and `resolvedDims` picks that up — which is exactly why
opening the card showed the right size while the grid did not. The group now takes
`it.pixelDimensions` and falls back to the requested size only when the probe returned 0.

**USER-VERIFIED 2026-07-28: no more crop on edit or depth.** And it fixed more than Klein
— the user had previously noticed small padding on generations from OTHER models and put
it down to noise. Same cause: any run whose output dimensions diverge from the requested
ones (a graph rounding to a multiple, snapping to a supported bucket, or sizing from an
input) built a card cut to the request. That class of defect is now closed everywhere,
which is the argument for having fixed the group rather than special-casing Klein.

No unit test: the change is a fallback expression on a service with no seam, and the
repo's convention for this file is a mirrored re-implementation, which would only pin a
copy of the logic. The live check above is the verification.

## 4. Known gap found during wiring — NOT yet implemented

`docs/models/klein/removal.md` requires that the remove op **HIDE** the prompt field
("paint then Remove, one click"), not merely ignore it. It does not: the `inpaint` op
sets `promptRequired: false`, but that field has **no consumer anywhere in the UI** —
it is metadata only, so the prompt box still renders its text area.

Removal works regardless (an empty prompt erases, which is the documented behaviour), so
this is a UX gap rather than a functional one. Fixing it means real work in
`MpiPromptBox`, which currently also carries another session's uncommitted changes — so
it was deliberately left alone rather than deepening that entanglement.

## Status — 2026-07-28

**All seven ops ran in the app and produced the right kind of output**, with bar counts
captured for each and the enhancer confirmed on both settings. VRAM sized roughly, the
inter-run pile-up fixed in the graph, depth ungated to two images. Remaining open items
are small and none blocks the model: the live re-check of the gallery card shape (§ 3c),
the enhanced-prompt-on-Reuse question (§ 3), and the prompt-field gap (§ 4).

Test suite: 214 pass / 9 fail, and all 9 failures live in the
same 4 pre-existing files the previous session identified by stashing
(`optional-media-placeholder` — a `WORKFLOW_INPUT_DEFAULTS` drift, `permodel-key-allowlist`,
`resolve-model-deps`, `runpod-remote-hardening`). None is attributable to this work.

---

Wiring complete and verified statically: 48/48 non-pre-existing tests pass, release
health check clean, dep-vs-graph reconcile closed both directions, all new guards
negative-control proven. NOT committed — the change spans `commandRegistry.js` and
`MpiPromptBox.js`, which hold other sessions' uncommitted work.

---

## REMOTE (POD) LEG — PASSED 2026-07-30 (found as a coverage hole, Pod qrpnumt8p1rm31, L4 EU-RO-1)

This card closed on local evidence WITHOUT adding its Pod line to the MPI-385 sweep brief —
the standing rule got skipped exactly once, and the user caught it live after that sweep had
already closed. Recorded here so the hole is visible.

**All Klein operations tested and passed on the Pod by the user** (t2i, i2i, depth, edit
multi-ref, inpaint/removal, upscale/detail as exercised). Hard evidence off the Pod's
`/history`: **11 Klein prompts, all `success`** — universal graph with the
`comfyui-inpaint-cropandstitch` branch, 4 image inputs and 9 LoRA loader slots per prompt
(`flux-2-klein-4b-int8-convrot` + e.g. NSFW style + refcontrol-depth + outpaint LoRAs all
resolving off the volume). Exec 4-8s per gen on the L4.

**Hot-store:** Klein staged to the Pod's fast disk at gen preflight exactly as designed
(`hot-store: 5/5 file(s) on Pod disk`; Krea2 `16/16` in the same session) — the model-keyed
path works; the engineAsset gap it does NOT cover is carded as MPI-403.

Krea2 rode along: depth-control + identity-edit LoRA gens both green (~21-25s exec).
