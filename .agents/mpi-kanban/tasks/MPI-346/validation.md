# MPI-346 — validation

## Status: PARTIAL — app-level verification still pending

## Verified

**Node pin.** `dev_configs/node_lock.json` -> `223a9383`. Archive resolves and downloads
(46,276 bytes), `pyproject.toml` reports `version = "1.2.2"`. Both ComfyUI installs on this
machine confirmed on v1.2.2:
- `G:\ComfyUi\ComfyUI\custom_nodes\comfyui-krea2edit` — installed this session (was v1.1,
  a 10,277-byte `__init__.py`; now 23,320 bytes). Old file backed up to the session scratchpad.
- `engine\ComfyUI_windows_portable\ComfyUI\custom_nodes\comfyui-krea2edit` — already v1.2.2
  since 2026-07-20.

**Live schema gate.** `/object_info/Krea2EditModelPatch` on the restarted bench (PID 40140,
started 07:55:55) exposes all seven new optional inputs: `fit_mode`, `ref_boost`,
`ref_boost_a`, `ref_boost_mask`, `source_image`, `source_image_b`, `vae`. The sync was run
only after this returned green — converting against the stale v1.1 schema would have
silently mis-mapped the new widget values. See [[tool_comfy_schema_gate_before_workflow_sync]].

**Conversion + bake.** `sync-raw-workflows.mjs` -> `validate-injection-rules.mjs` passed both
files; `orchestrate.py` rebuilt both Krea2 cards at 104 nodes with 10 style LoRAs. Baked
runtime asserted directly:

| check | sfw | nsfw |
|---|---|---|
| dangling links | 0 | 0 |
| `UNETLoader` | `krea2_raw_int8_convrot` | `lustify-v10-krea-raw-int8_convrot` |
| `299`/`300` `grounding_px` | 1024 | 1024 |
| `306` (two-ref) | `ref_boost` 1, `ref_boost_a` 1, `fit` | same |
| `408` (one-ref) | `ref_boost` 4, `ref_boost_a` 1, `fit` | same |
| `vae` + `source_image` | wired on both patch nodes | same |

Variant substitution, tier scrub (2 -> 1), prompt scrub and seed scrub all fired as expected.

**Injection contract unchanged.** `Input_`/`Output_` title sets diffed old vs new runtime:
krea2 34 -> 34, describer 2 -> 2, nothing added or removed. No `commandRegistry` /
`operationRegistry` drift, so no version-registry work is implied.

**Describer scaffold.** Survived the round-trip intact — opens `<|im_start|>system`, closes
`<|im_start|>assistant\n`, exactly one `<|image_pad|>` inside the user turn, three turns
total. Bypassed bench nodes (45/46/47) dropped by the converter as designed.

**User bench testing.** Every Krea2 operation exercised in the ComfyUI node graph. Text-to-image
was initially BLOCKED — `Input_Image` (`MpiLoadImageFromPath`) had `block_if_empty: True`, so a
t2i run, which supplies no image, could never execute past that node. Turned off in the same
pass (`96980f88`); t2i then confirmed working in the browser, and image edit confirmed working.

> Trade-off accepted with that flag: an empty path now yields a blank image instead of halting,
> so a genuinely missing image on an EDIT run degrades to a black reference rather than
> erroring. The graph's `Input_Is_i2i` / `Input_Is_Edit` gates decide whether the branch runs
> at all, so this is contained.

**Export hazard hit twice, both caught before baking.** Two consecutive exports of this
template were serialized against the STALE v1.1 node schema and silently dropped the new
widget values — first run lost `ref_boost`, `ref_boost_a`, `fit_mode` and `system_prompt`
outright; second run restored the widgets but at DEFAULTS, so `408`'s `ref_boost` came back
as 1 instead of 4. Cause both times was the ComfyUI browser tab restoring its own cached copy
of the graph rather than the file on disk — not a stale install (both ComfyUI installs were
confirmed on v1.2.2). Caught by diffing `raw/` against HEAD BEFORE running the sync. Standing
lesson: diff the raw source, do not trust a green schema gate alone — the gate proves the
SERVER is current, not that the exporting TAB was.
See [[tool_comfy_schema_gate_before_workflow_sync]].

## RESOLVED — the `ref_boost` open issue (2026-07-25, second session)

The earlier bake of `ref_boost: 4` on node `408` was wrong and is now **2.0**. Resolved by an
extended live sweep on the bench rather than by picking one of the three options previously
written here. Full durable write-up: **`docs/models/krea2/editing.md`** (new).

### What the sweep measured

Single reference, turbo (`cfg 1`), padded framing, same seed and prompt throughout:

| `ref_boost` | identity | cost |
|---|---|---|
| 1.0 | none | — |
| 1.5 | thin | expression nearly holds |
| 2.0 | good | expression lost, pose softens |
| 4.0 | best | expression + pose lost, **reference background bled in** (the source photo's mirror frame appeared in a forest scene) |

Monotone trade with no crossover. Expression edits are the worst case, because expression lives
on the face and the face is exactly what boost preserves.

### Why no value could have been right

Three findings, each traced to the v1.2.2 source:

1. **`ref_boost` is global.** `_ref_attn_bias` applies its `log(b)` bias on `rows0:` — every
   target token — so it boosts the whole reference against the whole instruction. No spatial or
   semantic gating exists.
2. **Reference framing is a second global dial on the same axis.** `pad` shrinks the subject and
   inserts dead margin (weak reference, good scene adherence); `crop` fills the grid with the
   subject *and its background* (strong identity, background bleeds). Tested both — crop brought
   the source bedroom back into forest scenes. Pad fraction and `ref_boost` are one knob turned
   twice.
3. **Boost is diluted at `cfg > 1`.** The patch applies identically to the cond and uncond
   passes, so it largely survives the CFG difference at weight ~1 while the text is amplified by
   `cfg`. Confirmed: boost 4 at cfg 2.5 bought no identity and added saturation.

⇒ Identity and direction cannot both be had on a general graph. That is now a measured
conclusion, not a tuning gap. **Identity-lock moves to MPI-348**, where a user-placed face box
serves as both the crop anchor and the `ref_boost_mask` — the only spatially selective lever in
the node set. Interim product answer is tutorial guidance: crop the reference so the character
fills the frame.

## Shipped in the same pass (all baked + asserted, sync commit `c7d0d8c1` + staged runtime)

- **`ref_boost` `408` = 2.0**; `306` (two-ref) stays 1.0 — the bias hits the last ref while
  biasing every target token, so it drags character A toward reference B.
- **Both edit references now padded to the output frame.** `ImageResizeKJv2` `457` + `471`
  (`keep_proportion: pad`, `divisible_by: 16`) replace the old scale+crop chains
  (`454`/`455`, `406`/`451`). Image 2 was previously on the old chain, so the two references
  had asymmetric geometry.
- **Tier 1 retuned outright — `311` cfg `3.5 -> 2.0`, `436` refiner `3 / 0.19 -> 2 / 0.30`**,
  both flat literals, no gate. This started as an edit-only fix (`MpiMath 466`,
  `2.5 if a else 3.5`, gated on `Get_is_edit`) and the gate was removed once t2i measured better
  at the same values on BOTH weights. Tier 2 (`72` / `162`) untouched — already `cfg 1`.
- **`denoise` gate rebuilt** as `MpiMath` `468` (`b if a else 1.0`), replacing `230`/`231`.
  This is the **i2i** denoise gate and is unrelated to the refiner; it stays.
- **`bongmath: true`** on node `311` (was `false` — the only sampler with it off). User-measured
  as equal pixel quality and slightly faster. Note it is a **baked literal**, not gated, so it
  applies to every tier-1 op including t2i.

### Bake assertions (both cards, run after the FINAL sync `9371f3ec`)

| check | result |
|---|---|
| injection-rule validator | passed |
| nodes / dangling links | 100 / **0** |
| `311` base | `cfg 2`, 25 steps, `beta`, `bongmath true` |
| `436` refiner | `2 steps @ denoise 0.3`, `cfg 1` |
| `72` / `162` (tier 2) | `8 @ cfg 1` / `3 @ 0.19` — untouched |
| `408` / `306` | `[2, 1, fit]` / `[1, 1, fit]` |
| `457` / `471` / `257` | `pad` / `pad` / `crop` (i2i) |
| `grounding_px` `299`+`300` | 1024 |
| `Input_Tier` | 1 — baked by `generate_krea2.py` as a safe default regardless of the template |
| UNET | SFW `krea2_raw_int8_convrot` · NSFW `lustify-v10-krea-raw-int8_convrot` |
| injection surface | 34 -> 34, nothing added or removed |

> `generate_krea2.py` bakes the weight, `Input_Tier` and the bypass-LoRA strength
> **unconditionally per variant** — a template saved with the SFW weight or `Input_Tier 2` is
> harmless. Those three are exactly "what a hand-export cannot be trusted to carry".

The unchanged injection surface means **no `operationRegistry` / `commandRegistry` drift**, so
no version-registry work follows.

### Other findings recorded in `docs/models/krea2/editing.md`

- **A negative prompt cannot remove anything that is in the reference image.** Tested with
  `"holding a phone"` — no effect. The reference arrives as source tokens present identically in
  both CFG branches, so it cancels out of `cond - uncond`. Removals must be stated positively.
- **Prompt form matters and was measured.** A descriptive `"Create a photo of this woman
  wearing… running scared…"` failed where a decomposed imperative `"Change her clothes… and
  change her expression… and place her in…"` worked, on the same reference and seed.
- **`samplers.md` does not cover the edit path** — it was measured 2026-07-09/10 on distilled
  turbo at cfg 1 with no edit LoRA. Its step-count optima are distillation-bound. `simple` vs
  `beta` was re-tested here at cfg 3.5 with no meaningful gain, so `beta` stands.
- The node pack's own `README.md` + `CHANGELOG.md` are a real usage guide and had never been
  mined; the Raw-cfg3-for-removals recipe comes from there.
- **High cfg is mode-seeking, and that injects unrequested content.** On the SFW weight with
  `"two women in a pirate ship. One woman has pirate clothes, The other woman is naked"`, cfg 3.5
  supplied young attractive subjects and put period costume on the woman the prompt never
  described; 2.0 returned ordinary adults and a modern woman — the literal prompt. Same knob as
  the plastic rendering.
- **Lustify masks cfg findings.** All early tuning ran on the NSFW finetune, which is already
  biased toward idealised subjects, so lowering cfg there only improved lighting. The base SFW
  weight exposed the demographic shift. Re-check every cfg finding on the SFW card.
- **The refiner does two independent jobs** — texture, and plausibility repair (a reference denim
  patch bleeding into trousers vanished at `0.30`, present at `0.19`). Lowering base cfg did not
  move the refiner's optimum down, proving it was never merely compensating.
- **Comparing across cfg needs seed replication; comparing refiner settings does not.** A
  2.0/2.1/2.2 sweep produced non-monotonic identity purely from trajectory divergence — a fixed
  seed fixes only the initial noise. Refiner arms share an identical base latent, so one seed is
  sufficient there.

## NOT verified

- **App-level generation on any operation.** Nothing has been run through Cubric Vision itself.
  The injection surface is provably unchanged (34 -> 34), which is why the user judged the risk
  low, but "unchanged contract" is not the same as "ran green in the app".
- **The describer's first-word behaviour end-to-end** — the entire point of the new recipe is
  that it no longer opens with "The image shows"; confirm on a real describe run.
- **Remote (RunPod) engine.** The `.mpi_node_commit` drift ladder should reinstall the node at
  the new commit on connect. Untested this session.
- **Two-reference edits under the new symmetric framing.** Image 2 only started being padded in
  this pass. The "two-ref inverts" finding was measured on the old asymmetric geometry — the
  `rows0:` argument for why it is structural stands on its own, but the measured severity may
  have had a geometry component. Re-run before designing the App around it.

## Next action

Run one Krea2 edit and one describe through the app. If both land, this card can close.

> **The remote (RunPod) leg is queued on [MPI-385](../MPI-385/brief.md)** — the RunPod
> verification umbrella: the `.mpi_node_commit` drift ladder, plus the one edit and one
> describe through the app that close this card.
