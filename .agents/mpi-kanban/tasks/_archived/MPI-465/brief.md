# MPI-465 - LTX is dead on the current engine

## How it surfaced

The user reported their **bench** LTX graph failing while they were adding last-frame-only
support: `Stage1_Bypass failed` (node 70 `LTXVNormalizingSampler`),
`AttributeError: 'ModelPatcherDynamic' object has no attribute 'to'`.

It reads as their own edit. **It is not.** The failing call is in KJNodes, and the link that
triggers it has been in the shipped graphs since 2026-07-22.

## Root cause — a ComfyUI change three days after the graphs were authored

`LTX2SamplingPreviewOverride` (KJNodes) takes an **optional** `latent_upscale_model` input
for higher-resolution previews. When connected, its `OuterSampleCallbackWrapper.__call__`
runs, at the start of every sample:

```python
self.latent_upscale_model.to(device)      # nodes/ltxv_nodes.py:899
```

ComfyUI commit **`f8a3fd9d` (2026-07-25) — "upscalers: convert latent_upsampler model to
DynamicVram"** changed `LatentUpscaleModelLoader` to return a patcher instead of a bare
`nn.Module`:

```python
model_patcher = comfy.model_patcher.CoreModelPatcher(model, ...)
model.load_state_dict(sd, assign=model_patcher.is_dynamic())
model = model_patcher
return io.NodeOutput(model)
```

`main.py:278` swaps `CoreModelPatcher → ModelPatcherDynamic` when `comfy_aimdo` is present
(it is, in the engine). **Neither class defines `.to`** — proven against the engine's own
python, not inferred:

```
ModelPatcher.to        : False
ModelPatcherDynamic.to : False
```

So the wrapper raises before a single sampling step. `MpiSaveVideo` never runs.

## Blast radius — the whole LTX fleet, in the product

**All 12 shipped LTX graphs** wire `latent_upscale_model: ["125",0]` into `#366`:
`ltx_{t2v,i2v}` × `{base,_fp8,_mxfp8}` × `{stage1,_stage2}`. No other model family uses this
node, so H3 and WAN are unaffected.

The app's engine is **ComfyUI 0.30.0, which already contains `f8a3fd9d`** (verified by reading
`engine/ComfyUI_windows_portable/ComfyUI/comfy_extras/nodes_hunyuan.py` directly — the version
number is not the discriminator, the file is), with **KJNodes 1.4.7** lacking the fix.

### It SHIPPED. Corrected 2026-08-07 — the first write of this brief blamed the wrong bump.

This was originally recorded as "a product regression introduced by the H3 engine bump
(0.29.2 → 0.30.0), not yet noticed because nobody has run LTX since". **Both halves were
wrong.** The user pushed back that LTX only broke when ComfyUI was bumped — correct, but an
EARLIER bump than the one blamed. Checked at the release tags rather than by topology:

| tag | tagged | `model = model_patcher` in the loader |
|---|---|---|
| `v0.28.0` | 2026-07-15 | **absent** — clean |
| `v0.29.0` | 2026-07-28 | **present** — the break lands here |
| `v0.29.2` | 2026-07-31 | present |
| `v0.30.0` | 2026-08-02 | present |

Our engine pin went `v0.28.0 → v0.29.2` on **2026-07-31** (`e2c2b4d6`). **That** is when LTX
died, not at the H3 0.30.0 bump six days later.

And it is not internal-only. Both published releases carry the broken pair:

| release | published | ComfyUI core | KJNodes |
|---|---|---|---|
| `v1.3.0` | 2026-08-01 | `v0.29.2` | `7f43f2c` |
| `v1.3.1` | 2026-08-02 | `v0.29.2` | `7f43f2c` |

**So every user on 1.3.0 or 1.3.1 — the current public release — has had a completely dead LTX
since 2026-08-01.** That makes this a shipped user-facing regression and a hotfix candidate,
not just an unreleased-changelog line. The user's own bench only surfaced it because they went
back to LTX for the last-frame work.

## Fix

kijai fixed it upstream in **`827fe6e` (2026-07-28)**, message "Update ltxv_nodes.py" — a
`_unwrap_upscale_model()` helper that unwraps the patcher before `.to()`. Nothing in the commit
message says so, which is why a message search finds nothing; the code search does.

Pin bumped in `dev_configs/node_lock.json`: **`7f43f2c` → `35e5956`** (upstream head).
38 commits, **no `requirements.txt` change**, and neither `ImageResizeKJv2` (used by every
model) nor `LTX2SamplingPreviewOverride` was renamed or removed. Head also adds
`nodes/minimax_nodes.py` and MiniMaxH3 sage-attention patches, which are H3-relevant.

**Existing engines self-heal.** `checkUniversalWorkflowDepsStatus` (`routes/shared.js`) compares
the installed `.mpi_node_commit` marker against the pin; a mismatch is DRIFT, and boot-repair
pre-wipes the folder and reinstalls at the pinned commit (MPI-222). The engine's marker
currently reads the old sha, so the next boot repairs it.

## Proven live

The exact failing prompt was pulled from the bench's `/history` (134-node API graph), the bench
KJNodes checked out at `35e5956`, ComfyUI on 8188 restarted, and the same prompt re-queued
against a WS listener. **The whole graph completed in 124 s** — through node 70, the upsampler
and both save nodes. Before the bump the same graph raised at node 70.

## Still open

- **Not proven through the APP.** Bench ≠ app engine: same node code, different ComfyUI build
  (0.30.2 vs 0.30.0) and a different install path. Needs one LTX generation in Vision.
- **The Pod image bakes nodes from this same lock** (`routes/remotePodLifecycle.js`), so the
  remote engine is still on the old KJNodes until that image is rebuilt. Remote LTX stays broken
  until then.
- **`node_lock.json` also pins ComfyUI core** (`comfyui.core.tag = v0.30.0`). A parallel session
  is bumping that to 0.30.2 — same file, so that edit must rebase onto this one rather than
  overwrite it. Note the core bump does NOT fix this bug and does not re-break it: `f8a3fd9d` is
  in both 0.30.0 and 0.30.2, and the fix is entirely on the KJNodes side.
