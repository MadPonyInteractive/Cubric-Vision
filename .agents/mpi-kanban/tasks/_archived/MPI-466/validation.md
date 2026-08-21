# MPI-466 — validation

Code is written, tested and committed (`92420fad`, `5ab43e4e`). **Nothing has run
through the app**, which is why this card is `in-progress` and not `validating`.

## Proved — 2026-08-07

| Claim | How |
|---|---|
| The graph converts and is injection-clean | `workflow-to-api.mjs` against the bench on 8188: 215 LiteGraph → **123 API nodes** (the 18 muted/bypassed pruned exactly as the ComfyUI frontend does). `validate-injection-rules.mjs` passes on **both** output files |
| The generator is title-keyed and refuses a stale export | `generate_ltx.py` hard-fails if `Input_Is_Continue`, `Input_Preview_Only` or `Input_Text_to_video` reappear, and if the `MpiStageLatents` / `UNETLoader` titles are missing or duplicated |
| Both tiers resolve | `ltx-23` → 12 deps, `ltx_i2v_t2v.json`, transformer bf16. `ltx-23-balanced` → 12 deps, `ltx_i2v_t2v_int8.json`, transformer int8. **0 unknown dep ids**, `archVariantOptions` empty on both |
| Stage 2 resolves in-file | `resolveWorkflowFile(..., { stage2: true })` returns the SAME filename on both cards — `singleFileStages` is doing its job |
| The int8 bytes are the bytes | sha256 `30fe2173fdb18881eb2482ece17ca044bedb8f28a38550ea7230da796fb8b614` computed over the local 21,505,993,424 B file and pinned in the dep |
| The /64 ratio law survives the re-export | Re-checked in the NEW graph rather than assumed: nodes **155/156** still `floor(a/2)` from `Input_Width`/`Input_Height` into `EmptyLTXVLatentVideo` **143**; resizes still `divisible_by: 32`. `LTX_RATIOS` unchanged |
| No graph carries a `LoadLatent` | Grep across every runtime workflow — which is what makes the staging deletion safe |
| Suite | `npm test` — **478/478**, lint clean |

## Proved through the APP — 2026-08-07, 04:23

**LTX 2.3 Balanced (int8) t2v generates end-to-end through the app.** Engine `/history`
`43716088-1eb9-47f6-ace0-33a76b86a29e`: `status: success`, node **457 `Output_Video` →
`MpiVideo_00001.mp4`**, node **568 `MpiStageLatents` → `latents/mpi_stage1.latent`**.
89.96s at 768x448 / 2s. This also closes MPI-465's last open item.

| Claim | How |
|---|---|
| KJNodes is repaired | `.mpi_node_commit` = `35e5956`, `_unwrap_upscale_model` present in `nodes/ltxv_nodes.py`. **Both stamped 02:50:44 — an EARLIER boot had already done it**, so the handoff's "the app has never booted since" premise was stale. The drift check was a no-op this boot |
| Every `Input_*` landed | Read off the DISPATCHED graph, not off the run finishing. 22/22 titles present with the app's values; prompt, 768x448, 2s, seed all correct; `Input_Start_Frame`/`Input_End_Frame` both `""` = the t2v route; `Input_Video_Latent` `is_continue:false, is_preview:false` |
| Dispatched == shipped | 126 nodes both sides. No `LoadLatent`. `unet_name` = the int8 file |
| `PROGRESS_STAGES` `single: 3` is CORRECT | Counted live on the new graph: **three** distinct bars — `1/1` (sigmas `[1.0000, 0.9937]`), `7/7` (`[0.9937 … 0.0000]`), `3/3`. The file's value was inherited and flagged unverified; it survives re-measurement unchanged. NOTE: the run that FAILED showed only 2 bars because it died before the third — a truncated count reads exactly like a real measurement |

### THREE bugs had to be fixed before any of that passed

None were in the LTX re-wire itself; all three were latent defects the re-wire was the
first thing to expose.

1. **MUTED nodes in the export.** `127`/`128` (`Stage 2 Video/Audio Latent` reroutes) and
   `258` (`Model` reroute) were muted, so `VAEDecode 215.samples`,
   `LTXVAudioVAEDecode 117.samples` and both `CFGGuider.model` arrived unlinked and EVERY
   output node was ignored — "completed but no output returned" in 0.07s. **Mute severs a
   link; bypass passes it through by type.** They are not interchangeable, and advice to
   prefer mute over bypass is wrong. Fixed by re-export.

2. **`workflow-to-api.mjs` did not recognise union widget types.** ComfyUI's V3 schema
   emits a union as ONE comma-joined string — `LTXVEmptyLatentAudio.frame_rate` and
   `LTX2SamplingPreviewOverride.preview_rate` are both `"FLOAT,INT"`. `isWidgetType`
   tested `Array.isArray(type) || PRIMITIVE.has(type)`, so a union matched neither and was
   treated as a SOCKET: emitted nothing **and consumed no positional value**, shifting
   every later widget on the node by one. `144` shipped `batch_size: 24` — 24 is the frame
   rate. **ComfyUI rejects a MISSING required input but silently accepts a SHIFTED one**,
   so this is precisely the plausible-wrong-output failure this card was written to hunt.
   Fixed: a union is a widget only when EVERY member is primitive (`IMAGE,MASK` stays a
   socket). Swept: 34 union inputs engine-wide, 3 all-primitive, and only LTX ships a node
   using them — no other workflow was silently wrong.

3. **Injection clobbered a wired link.** `_inject` (`comfyController.js`) sprays a scalar
   into every recognised key on a title-matched node; `latent` is on that list.
   `MpiStageLatents` is the first shipped node carrying BOTH a `latent` link and injectable
   widgets under one title, so `params['Input_Video_Latent'] = <filename>` replaced the
   wire to node `569` with a string and the node died on `TypeError: string indices must be
   integers, not 'str'` — **after four minutes of sampling, on the last node**. The comment
   at `commandExecutor.js:676` had assumed the plain title "finds no recognised target" on
   a migrated graph; it finds `latent`. Fixed structurally: a wired input is never
   overwritten by a scalar, on both the spray path and the `Title.widget` path.
   **FLEET-WIDE, not LTX-only** — `minimax_h3_fl2va.json#320` and `wan22_i2v.json#881`
   carry the identical node with the identical wire, which may well be what MPI-452's
   step 6 was dying on. Pinned by `tests/inject-never-clobbers-link.test.cjs`.

A gate was added to `workflow-to-api.mjs` so bug 2's whole class is loud: every converted
node is checked against the same `/object_info` it converted with, and a missing required
input aborts the conversion. It caught two PRE-EXISTING holes on its first run (see
"Noticed" below).

## NOT proved — the remaining scope

### 2. i2v / first-frame / last-frame routing — **PROVED 2026-08-07**

All three remaining routes ran through the app and were read off the engine's dispatched
graph, not off the run completing. The branch nodes report the routing themselves:

| run | `Input_Start_Frame` | `Input_End_Frame` | `#509 start` | `#514 end` | `Output_Video` |
|---|---|---|---|---|---|
| `8721f851` | **EMPTY** | t2i_029.png | 0 images | 1 image | MpiVideo_00005.mp4 |
| `5fabe2cd` | t2i_029.png | **EMPTY** | 1 image | 0 images | MpiVideo_00006.mp4 |
| `0ab03b36` | t2i_028.png | t2i_027.png | 1 image | 1 image | MpiVideo_00007.mp4 |

All `success`, 126 nodes each, 22/22 `Input_`/`Output_` titles landed. The branch outputs
invert cleanly with the inputs across all three, so presence-routing is real and not a
coincidence of one run. **End-only — the route that had never executed once — works.**

`Input_Use_Transition` is `false` on all three, which is CORRECT rather than a finding:
it is gated on audio presence (`PromptBoxControls.js` `audioMode.getInjectionParams`),
no audio was staged, so no injection happened and the baked default stood.

**A renderer bug had to be fixed first.** The frame-role pill rendered but clicking it did
nothing: `_renderStrip`'s reorder fast path keys on the item SET, and toggling start/end
changes no id, so the repaint was skipped and the pill never moved. The click handler was
firing correctly the whole time. Fixed by stamping `chip.dataset.roleKey` and comparing it
in the `sameSet` test — the drag-reorder fast path is untouched, since the key is identical
during a reorder. The pill also lost its floating tooltip (nothing else in the app has one)
and gained a `swap` icon, which is what now signals it is a button.

### 3. Preview → Continue — PASSES, with one accepted deviation
Proved live. Preview `3871ae93` set `is_preview: true` and wrote node **470
`Output_Preview`** (not `457`), so the `MpiStageLatents` preview gate works — which also
retires the `Preview_Only` question below. Continue `d3f52077` dispatched
`is_continue: true` with `load_path` = the staged per-preview UUID latent
(`c801904d-….latent`), NOT the `ComfyUI_00001_.latent` default, and produced
`457:videos` with **no `568:latents`** — the lazy SAVE gate fires exactly as H3's does.
The whole two-stage handshake therefore works in ONE file with no `_stage2` twin and no
`LoadLatent`, which was this card's core architectural bet.

**Accepted deviation:** a Continue still RUNS the stage-1 sampler — node 70
`LTXVNormalizingSampler`, titled "Stage1_Bypass", is absent from `execution_cached`, and
both sigma chunks execute. Only the save is gated, so the preview's work is redone
(45s vs a 90s cold run). **The user accepted this rather than re-authoring the graph**
(2026-08-07), so `PROGRESS_STAGES.stage2` was corrected to match reality instead. Do not
"fix" this as a bug without asking — the count now encodes the accepted behaviour.

### 4. The bf16 High tier is untestable locally
The 41GB weight is not on this machine and there is no room for it. Both tiers now share
one generated graph and differ only in the baked `unet_name`, so verifying balanced
verifies the graph; only the weight itself is unexercised.

### 5. R2 upload
In flight at the session boundary — **28% of 20.03 GiB**, capped at 3 MB/s per the R2
capability rule, ETA ~1h20m. `rclone copy` is idempotent, so re-running the same command
resumes rather than restarting. **Then `HEAD` the public URL and confirm `content-length`
matches 21,505,993,424.** Until that lands, a fresh install of the balanced tier would
404 — local testing is unaffected because the weight is already on `G:/CubricModels`.

## Noticed, NOT actioned — pre-existing, other cards

Surfaced by the new conversion gate and the injection sweep. None are MPI-466's doing and
none were touched.

- **`flow_sdxl_4k.json` nodes `1603`/`1615` reject on this engine** — `MpiScaledDimensions`
  gained a required `upscale_method` and the shipped export predates it. Needs a re-export.
- **`resize.json` / `resize_video.json`: `Input_Flip_Image` / `Input_Rotate_Image` have
  their `image` input WIRED**, and `image` is a spray target — so those controls were
  writing the control value into the image link. The MPI-466 link guard turns that from a
  corruption into a no-op, which means the flip/rotate controls likely never worked at all.
- **The LTX clip-mode preview buffer revokes a blob the `<img>` may still be showing** —
  `MpiGalleryGrid.js:444` (`_stopPreviewPlayback` revokes every frame) and `:466` (the
  rolling buffer evicts+revokes the oldest at `PREVIEW_CLIP_MAX`), neither checking the
  play head. Console shows `ERR_FILE_NOT_FOUND` on a dead `blob:` URL. `activeGenerations.js`
  already solved this class once (MPI-211) by deferring the revoke past the task; that
  lesson never reached this buffer. Cosmetic — the card renders fine. NOTE it may only be
  firing now because clip mode is gated on the KJNodes `VHS_latentpreview` event from node
  `366`, whose `preview_rate` was MISSING until this session's converter fix.

## RESOLVED — the `Preview_Only` warning is dead noise for LTX

`comfyController.js:1225` warns and strips when neither `Preview_Only` nor
`Input_Preview_Only` has a node. LTX retired both titles, so it fires on EVERY LTX
generation. It is now proven harmless: `is_preview` reaches the graph through
`Video_Latent.is_preview` and demonstrably drives the preview. Left in place deliberately —
narrowing the guard is a fleet-wide change to a defensive check that still protects every
other model, and it is not worth doing inside this card.

## A changelog entry is DRAFTED AND HELD — write it when section 1 passes

`docs/releases/UNRELEASED.md` already carries MPI-465's fix line (LTX was dead in
1.3.0/1.3.1). **This card's own entry was deliberately NOT written**, because announcing a
model change that has never generated in the app is the exact stale-note failure the
release check exists to catch. Add it to `## importantChanges` once an LTX run passes:

> **LTX's Balanced tier moved to a better, smaller model file.** The two GPU-specific
> options (RTX 50 Series / RTX 40 & Older) are gone — one file now runs on every card, at
> 20 GB instead of 24–25 GB, with better detail and sound and a little more speed. If you
> already have LTX Balanced installed, the new file downloads once and the old one is
> cleaned up.

Check the wording against what the run actually shows before shipping it.

## Deliberately NOT done

**The `variants` axis is now dead code and was left in place.** LTX was its last consumer,
so `variantAxisTokens` / `archVariantOptions` / `detectOtherArchInstall` / `variantDepsOf`,
the `workflowSuffix` branch in `resolveWorkflowFile`, and the model-manager's arch toggle
row have no caller. Removing it touches ~8 files including UI and `footprint.js`, and
starting a wide removal at the end of a long session is how a half-wire ships. It is the
first item in the handoff.

## A trap this card walked into — do not repeat it

Deleting `ltx23-transformer-fp8` / `-mxfp8` from `modelDeps.js` looked like correct
cleanup and was a **bug**: `_orphanedDepIds` (`routes/downloadManager.js`) iterates the
DEPS map to decide what to trash, so a dep removed from the map can never be swept and its
24–25GB file strands on every existing user's disk, untracked. Both entries are restored as
deprecated-but-present. Caught only because MPI-470 had just written the same reasoning
into the WAN t2v deps — worth knowing before retiring any weight.

## CLOSED 2026-08-08 — the three i2v routes passed, on the user's own runs

The one outstanding item was proving start-only, end-only and start+end by their OUTPUT,
which needed a human looking at the video. Asked during the smoke-run session and answered
directly:

> "LTX Image to Video: all operations have been tested and passed. Same thing for WAN, at
> least locally. Same thing for H3, the two new models from H3."

That is the judgement this card was parked on, and it covers the end-only route that was
unreachable until the slot gate and the last-frame role pill landed. LOCAL engine only —
stated as such by the user.

The REMOTE half is not claimed here and is not this card's to claim: it is proven by the
MPI-467 smoke matrix, which has not run yet. MPI-465 still carries that.
