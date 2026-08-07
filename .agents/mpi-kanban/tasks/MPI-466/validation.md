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

## NOT proved — the whole remaining scope

### 1. One generation through the app
The app was closed at 03:2x specifically so its engine drift-repairs KJNodes
`7f43f2c → 35e5956` on the next boot. **Until that boot happens, LTX cannot run at all**
(MPI-465). Then:

- t2v dispatches and completes on the balanced (int8) card.
- **Read the DISPATCHED graph off `/queue`, not the fact that it finished.** Injection
  silently skips an `Input_*` title matching no node, and LTX now derives its routing from
  media presence — so a wrong-but-plausible video is the failure mode. Confirm all 22
  `Input_*`/`Output_*` titles landed.
- Progress bar: `PROGRESS_STAGES` still carries the OLD graph's 3/2/1. **Re-measure and
  correct if the bars differ** (count distinct tqdm bars; tqdm prints each finished bar
  twice).

### 2. i2v / first-frame / last-frame routing
No op boolean exists any more. `Input_Start_Frame` / `Input_End_Frame` are path strings
feeding lazy branches, so confirm each of the four routes by its OUTPUT, not by the run
completing: t2v, start-only, end-only, start+end.

### 3. Preview → Continue
The path that drives `MpiStageLatents` through the app's own staging. Stage 2 must run the
second sampler ONLY — if it re-runs stage 1 the lazy gate is not firing.

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
