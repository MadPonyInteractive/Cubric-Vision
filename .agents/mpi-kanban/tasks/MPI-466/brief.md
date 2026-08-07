# MPI-466 - Re-wire LTX to the new export

## The decision (user, 2026-08-07)

**Drop the distill LoRA toggle. Drop the non-distilled dev model.** Keep two tiers:

| tier | weight | was |
|---|---|---|
| **High** | `ltx-2.3-22b-distilled-1.1_transformer_only_bf16` (41GB) | unchanged |
| **Balanced** | `ltx-2.3-22b-distilled-1.1_transformer_only_int8_convrot` (21.5GB) | `_fp8_scaled` 25.2GB / `_mxfp8_block32` 24.1GB |

Everything below follows from that. The card's previous plan - one card, dev int8 + the
rank-111 distill LoRA as a `capabilities.turboToggle` - **is retired.** So is the gate that
would have decided it (*"does a bf16 rank-111 LoRA patch cleanly onto int8 weights?"*).
**Do not re-run that experiment**; nothing in the shipped design depends on the answer.

## Why int8 wins the balanced slot

Bench A/B, 2026-08-07, distilled-1.1 int8 against our shipped fp8: **better in every way -
sound, hands, eyes - and 10s faster.** Measured on a 2s clip at 320x640, so the margin is
small-clip inflated, but the direction is not in doubt. On top of that, int8 is expected to
run where mxfp8 cannot, which is what kills the arch axis (below).

## The re-export changes far more than the weight

`comfy_workflows/raw/ltx_i2v_t2v_template.json` - **215 nodes against the shipped 119**, and
re-exported once already this session to remove a stray Turbo node.

| What the export carries | Consequence for this card |
|---|---|
| t2v and i2v in **one** graph | The `ltx_t2v` / `ltx_i2v` pair collapses |
| `Input_Video_Latent` **and** `Output_Preview` together | Both stages in one file - the **six** LTX `_stage2` twins die here. Needs `capabilities.singleFileStages: true` (H3's precedent, MPI-452), or `resolveWorkflowFile` appends `_stage2` and Finish 404s |
| Routing derives from which frame slots are filled | No op booleans for t2v / start-only / end-only / start+end. Same shape H3 uses (`MpiAnyChecker` into lazy `MpiIfElse`) |
| ~18 nodes muted/bypassed | **The app prunes nothing; the ComfyUI browser does.** `generate_ltx.py` must normalize them, or a node that only ever worked because the browser dropped it surfaces in Vision first |

**Measured, not assumed** - the `Input_*` / `Output_*` title sets were diffed, shipped
(`ltx_t2v` + `ltx_i2v` union, 29 titles) against the export (22):

- **ADDED: none.** Audio input (`Input_Audio` / `Input_Use_Audio` /
  `Input_Use_Reference_Audio`) and `Input_Use_Transition` **already ship** on both LTX cards
  (`capabilities.audio: true`, reference/direct modes). They are not new work.
- **REMOVED: seven** - `Input_Text_to_video` and `Input_Use_End_Image` (the routing booleans),
  `Input_Preview_Only` and `Input_Is_Continue` (the stage flags), and the four-node latent
  cluster `Output_Video_Latent` / `Output_Audio_Latent` / `Input_Audio_Latent` / `LoadLatent`.

All seven collapse into node **568 `MpiStageLatents`** titled `Input_Video_Latent`, whose
`is_continue` / `is_preview` are WIDGETS addressed as `<title>.is_continue`.

## The app side is already done - LTX is the last model on the old shape

Do not re-solve this. WAN and H3 migrated onto `MpiStageLatents` already
(`models.js` `singleFileStages: true` on both), and the app follows:

- `commandExecutor.js:1711` - `saveLatentNodeIds` already recognises `MpiStageLatents`, the
  fix that MPI-452 6a paid for and that reappeared when H3/WAN migrated.
- `commandExecutor.js:719` - `_buildParams` already emits `Video_Latent.is_continue` and
  `Video_Latent.is_preview`; the `Input_` canonicalization pass renames them.
- `Use_End_Image` / `Text_to_video` are already derived from media presence, so with the
  nodes gone they become silently-skipped no-ops rather than work.

What remains for LTX is the generator, the deps, and `models.js`.

## The wiring path

`raw/ltx_i2v_t2v_template.json` -> `scripts/workflow-to-api.mjs` (live `/object_info`) ->
`comfy_workflows/scripts/workflow_generation/ltx_i2v_t2v_template.json` -> `generate_ltx.py`
-> `comfy_workflows/ltx_*.json`. **Never hand-edit the runtime JSON** - the generator is the
sanctioned place to normalize (H3's `generate_h3.py` is the worked example, MPI-452).

Then: `modelDeps.js` (retire fp8 + mxfp8, add int8), `models.js` (both LTX defs), the app-side
removal of whatever writes the routing booleans, and the R2 upload.

## Sequencing - this card gates MPI-465

**No LTX runs on this machine today.** The fp8/mxfp8 weights were deleted to make room, the
41GB bf16 was never on the drive, and the int8 file is present but not yet declared. So
[MPI-465](../MPI-465/task.json)'s one open item - *an LTX generation completes through the
app* - cannot be taken before this card ships. The KJNodes heal (pin `35e5956`, committed
`c077efa9`) still happens on the next app boot via the drift check; only the proof waits.

Two calls that stay live on MPI-465 regardless: the **hotfix** question (1.3.0/1.3.1 users
have had dead LTX since 2026-08-01, and a 1.3.2 restores it on the weights they already have
- whereas 1.4.0 will hand them a 21.5GB re-download), and the **Pod image rebuild** for
remote LTX.

## Open items

- **Blackwell.** int8 is proven on the user's **Ada** card, and other int8 models were run on
  Blackwell - but not `int8_convrot` specifically. Say that plainly rather than claiming
  coverage; it decides whether `variants.arch` deletes cleanly or needs a guard.
- **Sampler tune.** `LTXVScheduler` over `ManualSigmas`, the split-sigma two-stage and the
  stage-2 `0.85` fix were measured on **distilled** - which the new balanced tier still is,
  so they carry over. This item shrank to nothing when the dev model was dropped.
- **The three baked LoRAs** (merged 3.87GB, transition, talkvid) were tuned against a
  distilled base, and the base stays distilled. Re-check on int8 rather than on a new arch.
- **R2.** LTX deps serve `models.cubric.studio` with HF as `mirrorUrl`, so adoption means
  uploading the int8 file, not just re-pointing a URL. LTX's licence permits re-hosting
  (unlike H3).
- **Audio input + transition** reach the UI or get deferred *with the reason on this card*.
