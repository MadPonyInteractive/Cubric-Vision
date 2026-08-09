# H3 — performance levers we tested

Measured answers to "can we make H3 cheaper", so nobody re-runs a 25-minute A/B to
reach the same conclusion. See also the hub's § Memory is a poor predictor here.

## The KJNodes H3 VRAM patches — REJECTED (measured 2026-08-07, MPI-475)

`comfyui-kjnodes` ships three H3-specific model patches. Two are safe and useless to
us; the third is unusable. **None are in either H3 graph, and that is deliberate.**

| Node | Verdict |
|---|---|
| `MiniMaxChunkFeedForward` | Rejected — costs time, saves VRAM we do not need |
| `MiniMaxLowVRAMAttention` | Rejected — same, and not tested alone |
| `MiniMaxH3MemoryEfficientSageAttentionPatch` | Rejected — `sageattention` is not installed, and it is approximate |

### The measurement

Both patch nodes together, on the model wire between the last LoRA and the sampler,
`chunks=2` / `seq_threshold=4096` / `head_chunks=4`. Stage 1 only, same settings both
runs, RTX 4060 Ti 16 GB, bench (0.30.2):

| | wall clock |
|---|---|
| without | **669.80 s** |
| with | **762.50 s** (+92.7 s, **+13.8 %**) |

Output quality identical, which is the expected half — see below.

### Why they cost and do not pay

They are VRAM-saving patches, and H3 on the two cards that matter is **not
VRAM-bound**:

- **16 GB (4060 Ti)**: the baseline completed without them. Dedicated sat at
  12.9/16 GB with ~24 GB in shared memory — offload-bound, with system RAM at 95 %
  the real ceiling. The patches reduce residency, which does not help when the
  manager is already spilling and the GPU is at 97 % utilisation.
- **32 GB (5090, the expected primary card)**: the encoder is unloaded before
  sampling, so ~21 GB of transformer sits inside 32 GB. Resident, no spill, nothing
  for a VRAM patch to save — cost only.

`MiniMaxChunkFeedForward` in particular buys no speed *by design*: it splits the
SwiGLU over the packed token dim, adding a Python loop per block across 52 blocks.

### They are mathematically exact — that part checked out

Worth recording, because it is the reason the outputs matched and it is what would
make them worth revisiting:

- FFN chunking partitions the packed token dim. Rows are independent and int8
  activation quant is **per-token**, so the partition is exact.
- `MiniMaxLowVRAMAttention` frees the normed block input right after the qkv GEMM
  and the fused `(S, 3*inner)` buffer before `out_proj` allocates, then optionally
  slices attention into head groups. Heads are independent, so also exact.

### When to revisit

Only if a user reports H3 **failing to run** — an OOM, not slowness — on a card
smaller than 16 GB. Then these become a rescue path, not an optimisation. The lever
is already clean: `MiniMaxChunkFeedForward.execute` returns the model untouched at
`chunks == 1`, so the node can be baked in and driven per-card by an injected value
without costing anything on a large GPU. `head_chunks == 1` likewise leaves only the
buffer freeing, which is the free half.

Placement, if it is ever wired: both take and return MODEL, so they sit between the
last LoRA (`Input_Lora_6`) and the model broadcast that feeds the scheduler and
guider. The CLIP wire bypasses them. Order between the two does not matter — they
patch different keys (`blocks[i].mlp.forward` vs `blocks[i].forward` +
`blocks[i].attn.forward`) and each clones the model first.

### The Sage node is a separate no

`MiniMaxH3MemoryEfficientSageAttentionPatch` quantizes Q/K to int8 and V to fp8 —
genuinely different arithmetic, so it is a silent quality risk on a shipped product.
Moot regardless: `sageattention` is absent from `python_embeded/Lib/site-packages/`,
so the node raises at execution. Adding it means a CUDA-pinned wheel plus Triton.

All three are `is_experimental=True`, but `dev_configs/node_lock.json` pins kjnodes to
a commit, so they cannot shift without a deliberate bump.

## Not a lever: `EmptyMiniMaxH3LatentAV`

Core's standalone empty-latent node offers nothing our graphs lack. Both
`MiniMaxH3ImageToVideo` and `MiniMaxH3ReferenceToVideo` call `_empty_av_latent`
internally and return the latent as output 1, which is what the samplers consume.

## Step distillation — the lever that WORKED (MPI-505, measured 2026-08-09)

**H3 was the only non-distilled video model we shipped**, and that single fact explains
why every acceleration technique in this doc lands on H3 and nowhere else:

| model | steps | distilled |
|---|---|---|
| H3 | 20 | no, until the turbo LoRA |
| LTX 2.3 (both tiers) | 8 (`LTXVScheduler.steps`, a literal) | yes, upstream |
| WAN 2.2 14B | 6 (`ManualSigmas` 1.0/0.93/0.85 then 0.85/.../0.0) | yes |
| WAN 5B | 4 | yes, baked distill LoRA at 0.8 |

LTX "High" vs "Balanced" is **precision** (bf16 vs int8) - all four weights are
`ltx-2.3-22b-distilled-1.1_*`. A turbo LoRA there would distil a distilled model.

`drbaph/MiniMax-H3-Turbo-Lora-ComfyUI`, variant `v4_step600_ema` (Apache-2.0, original
`larryvrh`) takes H3 to 8 steps. Measured at 864x480 (the baked default), 2s clip, warm:

| config | time |
|---|---|
| 20 steps, two-stage, no EasyCache | 204.02s |
| 20 steps, single-pass, EasyCache | 136s |
| **8 steps (turbo)** | **90-96s** (4 runs) |

Upstream settings: euler / beta / strength 1.0, sigma shift video 12 and **audio 4-6**.
The model defaults are 12 / **3.0** (`nodes_minimax_h3.py`, `ldm/minimax/model.py`), and
the audio value is the one that must move or audio distorts. Sweeping 4/5/6 changed
nothing audible - the audible fix was euler/beta - so it is baked at 5. Turbo ships
OPT-IN: quality is slightly below the 20-step path, which is the user's stated trade.

### The two-stage split costs nothing at low step counts

Turbo two-stage (91.59 / 90.07s) and turbo single-pass (91s) are indistinguishable, so
collapsing the split is only ever worth measuring at high step counts. Note the preview
decode does **not** run on a full two-stage generation - `MpiStageLatents` blocks
`denoised` unless `is_preview`, so the split's real cost is one sampler setup plus the
latent save.

## SolAttn and SageAttention — rejected as node packs (2026-08-09)

Both need Triton, and that is the end of it for the local engine: `triton` is classified
engine-owned in `scripts/compile-node-deps.mjs` (`isEngineOwned()`) and `routes/engine.js`
(`ENGINE_OWNED_PKG`), so it cannot enter the curated pip set at all, and Windows embedded
Python ships no compiler. SageAttention adds three prior rejections - MPI-50 (local),
MPI-189 (Pod build bugs), MPI-145 (`--use-sage-attention` crashes LTX-2.3 on Ada sm_89,
engine dies) - and was measured **~2x SLOWER** on Windows, where the failed Triton JIT is
pure overhead. `kijai/ComfyUI-SolAttn_triton` adds two more: it ships **no LICENSE file**,
and being CUDA-only it can never run on the macOS build. Its dispatch also branches on H3
and WAN only, with no LTX path.

Reopen SolAttn only if it gains a licence AND an LTX branch. Do not re-test SageAttention.

## EasyCache — free, already installed, non-turbo only

`comfy_extras/nodes_easycache.py` is **core ComfyUI** (node id `EasyCache`) - no pip dep,
no node pin, both engines, works on macOS. Worth **-22%** on the 20-step path, but it
needs steps to work with: at 8 steps it skips **0**, and it cost **+12%** on a cold run,
so it must never become a silent default.

Its skip pattern is structural and reproduced across seeds: **0 skips in stage 1, 4 in
stage 2.** `easycache_sample_wrapper` is an `OUTER_SAMPLE` wrapper whose `finally` calls
`reset()`, so each sampler gets a cold lifetime - stage 1 pays ~2 steps of warmup and
sits in the high-sigma region where per-step change always clears `reuse_threshold`.
Stage 2 is the low-sigma region it exists for. Two samplers cannot be given separate
cache instances, because they share one guider.
