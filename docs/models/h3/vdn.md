# VDN-H3 — hybrid attention on H3 (MPI-702, evaluated 2026-09-06)

Video Delta Net for MiniMax H3: a **runtime attention patch plus a branch/adapter stage**,
not a new transformer. Node `Saganaki22/ComfyUI-VDN-H3` (Apache-2.0), weights
`OpenVDN/vdn-minimax-h3` (5.46 GB), installed on the bench at `C:/AI/vdn`.

**NOTHING HERE SHIPS YET.** This file records what the node *does*, measured on the bench,
so it is not re-derived. The ship/no-ship verdict is still open — see § Verdict.

## Licence — it is NOT Apache-2.0, whatever the node README says

The **node** is Apache-2.0. The **weights** are not. The HF card is `license: other` and
the LICENSE blob is byte-identical to the 17.6 kB MiniMax H3 Community Licence we already
bundle. So VDN weights are territory-gated exactly like every other H3 weight
(§ Licence in [README.md](README.md)) and **must never go on R2**. Publisher-hosted only,
like three of the four existing H3 deps — no new delivery machinery needed.

## What a pruned base does to it — the part that costs the most time to rediscover

Every transformer this repo ships is **pruned** (`minimax_h3_fl2va_pruned_int8_convrot`,
`minimax_h3_ref2va_pruned_int8_convrot`). Pruned — the node calls them "curve" bases — does
**not** mean layers were removed. It means `adaln_proj.linear` is collapsed to a tiny
t-feature input (the `[96768, 8]` weights) where the trained VDN deltas expect the full
`silu(t_emb)` width. `_is_pruned_base()` (`vdn_h3/apply.py`) detects it by weight shape,
because the model flag alone missed some checkpoints.

51 adaln deltas therefore have nowhere to go. What happens next depends on `lora_mode`
**and on whether the Turbo node is installed**, which is the fact that gets lost:

| `lora_mode` | `ComfyUI-MiniMax-H3-Turbo` present? | adaln deltas |
|---|---|---|
| `merge` | irrelevant | **dropped (51)** |
| `bypass` | **no** | **dropped (51)** — same as merge |
| `bypass` | **yes** | **re-injected** via `_inject_adaln_egrid`, using `h3_silu_temb_grid.safetensors` |

So `merge` and grid-less `bypass` are equivalent for adaln. The only config that behaves
differently is bypass **with** the grid present — and the bench has that grid installed at
`custom_nodes/ComfyUI-MiniMax-H3-Turbo/h3_silu_temb_grid.safetensors`, which is why bypass
ever looked different here.

### Two corrections to the record

**1. "Bypass costs lip-sync and audio quality" is too broad.** The damage came from the
e-grid adaln re-injection, which only runs on a pruned base with the Turbo grid present.
Plain bypass does not do it. The conclusion (don't use bypass) is unchanged; the reason
matters if it ever comes up again.

**2. "Merge on a pruned base gives crushed darks" did not survive measurement.** That
diagnosis was formed while the bench was on the *unpruned* base. The log dates the switch
exactly — the adapter report counts the deltas for you:

| run | `turbo` weights merged | base |
|---|---|---|
| 13:58 | **255** | unpruned |
| 14:26 onward | **204** + `pruned base: 51 adaln deltas … skipping them` | **pruned** |

255 − 204 = 51. Every quality judgement Fabio made from 14:26 on — the tie with turbo at a
1920×1088 deliverable, the win below it — was measured on **pruned + merge with the deltas
already dropped**, and was judged good. The node's own comment ("near-visual-neutral per
community testing") holds on this bench.

**Consequence: VDN needs no unpruned base.** The +13 GB download and the reopening of
"PRUNED is final" ([README.md](README.md) § What ships) are both off the table.

## S is the stage being sampled, not the output canvas

`[vdn] layout: … S=N` counts spatial tokens of **the pass currently running**, so one
deliverable produces several different S values. `S = (W/32) · (H/32)` of that stage:

| S | stage | output deliverable |
|---|---|---|
| 252 | base | 1344×768 |
| 510 | base | 1920×1088 |
| 1008 | windowed refine | 1344×768 |
| 2040 | windowed refine | 1920×1088 |

**Name runs by their deliverable, not their base pass.** A "1K run" whose base samples at
960×544 and then goes through `MinimaxH3-3D` (`Latent 60x34 → 120x68 | Pixels 1920x1088`)
and a 2-window refine is a **1920×1088** job, and timing it against a single-stage
1344×768 job is comparing two different pipelines. Timings recorded under the base-pass
name are not comparable to each other and should be relabelled before use.

## The ceiling is an OOM, not a taste judgement

VDN dies on the windowed refine at 1920×1088 (S=2040) on a 16 GB card:

```
File "vdn_h3/branch.py", line 147, in frame_statistics
  vb = (vf * beta.unsqueeze(-1).to(vf.dtype)).contiguous()
torch.OutOfMemoryError: Allocation on device 0 would exceed allowed memory.
Currently allocated : 12.94 GiB
Requested           : 557.81 MiB
Device limit        : 16.00 GiB
```

`frame_statistics` allocates against S per frame, so the ceiling sits between **S=1008 and
S=2040** — i.e. between a 1344×768 and a 1920×1088 deliverable, on 16 GB. Above it there
is no quality question to answer, because there is no output. Any "use VDN below X" rule
should be derived from available VRAM at dispatch, **never** from a baked-in resolution
constant: these are 16 GB numbers, not properties of VDN.

## VDN is not step-pinned; turbo is — judge them at different step counts

The turbo LoRA is a **DMD distill built for 6–8 steps**. Above that it overcooks: the step
budget is the product. VDN is an **attention patch** with no such pin, and on the bench
(2026-09-06) VDN at **25 steps / `res_multistep` / `simple`** beat both turbo-at-8 and
VDN-at-8, with no overcooking, at 350 s against ~150–250 s.

**So every 8-step VDN-vs-turbo comparison measured VDN in turbo's regime**, where it has
nothing to gain. If VDN has a place, it is not as a turbo substitute at 8 steps — it is at
high step counts turbo structurally cannot reach. Judge it there.

Note `apply_turbo_adapter` (default **True**, `turbo_strength` 1.0) stacks the DMD adapter
on top of VDN — that is why VDN-at-8 is even coherent, and it is probably dead weight at 25
steps. `apply_turbo_adapter=False` is the untested pure-VDN high-step config.

**The control that decides it: non-turbo at the same step count.** Non-turbo already wins
quality at 8 steps. If it also wins at 25, the steps earned the quality, not VDN.

## TRAP: `ApplyVDNH3Advanced` applies its OWN turbo adapter — so turbo lands twice

`apply_turbo_adapter` defaults to **True** with `turbo_strength` 1.0, and the node merges
the turbo adapter itself (`{'default': '100 weights merged', 'turbo': '204 weights
merged'}` in the log). **Every H3 graph in this repo already has an `MpiLoraModel` node
carrying the turbo LoRA at `strength_model: 1`** (e.g. `minimax_h3_r2va.json:537`). Drop
the VDN node into one of those and turbo is applied **twice** on the same model, while the
turbo-only arm you are comparing against has it once.

On the bench, 2026-09-06, this invalidated a day of VDN-vs-turbo comparisons. The symptoms
all read as VDN quirks and none of them were:

| symptom | actually |
|---|---|
| VDN@10 looks like turbo@8 | turbo is driving; it is on twice |
| VDN "acts like a different seed" | over-applied distill perturbs the trajectory |
| morphing teeth, straw/glass confusion | semantic and anatomical smear from over-applied DMD |
| VDN ≈ non-turbo at 25 steps | at high steps the distill matters less, so the arms converge |

**For a clean VDN-vs-turbo test:** `apply_turbo_adapter = False`, keep the graph's existing
turbo LoRA. Both arms then carry exactly one turbo and the VDN branch is the only variable.
**For a high-step tier test:** no turbo on either side — pure VDN against plain.

Verify per stage rather than trusting the canvas: walk each sampler's `guider`/`model`
input back and check whether a VDN node *and* an `MpiLoraModel` with a non-`None`
`lora_name` are both upstream of the same stage. These graphs have several sampling stages
and dead branches, so "it is in the graph" says nothing about which stage it reached.

## Diagnosis trap: a cached VDN node logs nothing

`[vdn]` lines appear when `ApplyVDNH3Advanced` **applies** the patch. ComfyUI caches that
node whenever its subtree is unchanged, so a run that reuses an already-patched model emits
**no `[vdn]` output at all** while still sampling through VDN. Log silence means "not
re-applied", never "not applied" — this cost a wrong call on 2026-09-06.

To tell for real, ask the history for the execution record rather than reading the log:
`GET /history?max_items=1`, then check `status.messages` → `execution_cached` for the node
id, and walk the `guider`/`model` inputs of each sampler back to see whether the VDN node
is upstream of that particular stage. Reachability from a `SaveVideo` is not enough — these
graphs carry several sampling stages and dead branches.

## VDN holds VRAM on purpose — that is not a leak

After a finished run the bench showed ~2.7 GB live in torch with ComfyUI idle. It is
VDN's own caching policy, and it is logged:

```
[vdn] branch_weights=auto: model.safetensors, cache_gpu (14.3 GiB VRAM free, stage 0.00 GiB)
[vdn] retain_buffers=auto: retained (14.3 GiB VRAM free; stage 2.15 GiB + 10 GiB headroom)
```

`auto` sees headroom and keeps the branch weights on the GPU plus 2.15 GB of retained
buffers. Both are node widgets (`vdn_h3/nodes.py`):

- `branch_weights`: `auto` | `stream` | `cache_gpu`
- `retain_buffers`: `auto` | `on` | `off`

**Untested lever worth a run (MPI-702):** the OOM above missed by **557 MiB** while VDN was
holding 2.15 GB of retained buffers plus branch weights on the same card. Forcing
`branch_weights=stream` + `retain_buffers=off` may put 1920×1088 inside VDN's range and
move the ceiling, rather than merely confirming it.

Diagnosing "held" VRAM on Windows: `nvidia-smi` reports per-process memory as `N/A` under
WDDM, and Task Manager's figure is whole-desktop. Ask the engine instead —
`GET /system_stats` returns `torch_vram_total` (allocator reserved) and `torch_vram_free`
(free within that reserve); live bytes are the difference.

## The balanced tier CANNOT show VDN — the refine erases it

Before reading the verdict, understand why most of the evaluation could not have worked.
Per-stage trace of the bench graph, 2026-09-06:

```
[565] base      VDN YES   turbo YES   25 steps  res_multistep
[712] refine    VDN NO    turbo YES    3 steps  euler, sigmas 0.9035 -> 0
```

**VDN touches only the base stage.** The balanced tier then upscales and runs a
turbo-only refine that VDN never sees, restarting at sigma 0.9035 — a substantial rewrite,
not a polish. Whatever VDN did to the base is re-sampled away by a pass it is not part of.

That is why `turbo@8`, `VDN@10`, clean `VDN@25` and `non-turbo@25` all converged. Those
runs were not measuring their base configs; they were measuring the shared refine. **No
amount of testing on the balanced tier could ever have answered the VDN question.**

Two consequences worth keeping even though VDN was rejected:

- **The OOM ceiling only binds when VDN is wired into the refine.** The S=2040 failure came
  from such a graph. Base-stage VDN runs at S=252–510, nowhere near it.
- **The upscale+refine pays for itself — tested, 2026-09-06.** Single-stage sampling
  directly at the multi-stage output resolution gives a very similar result and takes
  **longer**. So base-at-low-res plus 3D upscale plus a short refine is the *cheaper* route
  to that canvas, not overhead: a brief refine over an upscaled latent costs less than
  paying full resolution on every step. The two-stage pipeline is justified on speed at its
  own quality.

## Verdict — REJECTED (2026-09-06)

**VDN-H3 was evaluated and declined.** Same output quality as the turbo LoRA, slower, and
more VRAM. Nothing about it is broken — it simply does not buy anything this app needs.

What was settled along the way, and would still hold if it were revisited: VDN runs on the
shipped pruned base with `merge`, needs no new transformer, and needs no unpruned download.

What could never be settled from the balanced tier is above. The observations below are
kept because the *behaviour* they describe is real, but they were gathered under the
double-turbo trap and the refine confound, so **none of them is evidence about VDN**.
Re-derive rather than cite them if VDN-H3 v2 ever makes this worth reopening.

Against the turbo LoRA, at near-identical wall clock, two seeds split — seed 1 to turbo (VDN varied object placement more
and morphed the subject's teeth), seed 2 to VDN, **both by a small margin**. Opposite
winners at small margins is the signature of an **effect size below seed variance**: the
seed is deciding, not the model. More seeds of the same test buy nothing; the test needs
more discriminating power instead. Non-turbo still wins quality over both, at a large time
cost.

**VDN does not preserve the seed's scene, so no VDN comparison is paired.** Turbo vs
non-turbo on one seed gives the same scene with a quality delta — a paired test, where the
difference is readable off a single pair. VDN on that same seed produces a *different
scene* (different props, different staging), as if a different seed had been supplied. So
every VDN-vs-turbo comparison is two independent draws, and the noise floor is not quality
variance but full scene-to-scene variance. That is why seeds 1 and 2 split. **A small
quality difference between VDN and turbo cannot be resolved by single-run A/Bs at all** —
it would take many runs per arm, which is why the cost side of the decision carries more
weight than the quality side here.

**Judge it on a domain that exposes the axis VDN acts on.** VDN is an attention patch, so
temporal coherence is what it should move. Flat-shaded, hard-lined content (anime) makes
pixel distortion and line instability legible in a way a realistic scene does not. Note
that a realistic run must stay in the mix if the teeth/face artefact is to be re-tested at
all — simplified faces will not reproduce it.

**If a high-power test also comes out a wash, that is the answer.** A quality difference
that cannot be seen does not justify 5.46 GB, a publisher-hosted territory-gated dep, and a
hard ceiling below 1920×1088 — against a turbo LoRA that already ships, costs nothing
extra, and has no ceiling.

MPI-702 closed as `rejected` on the above. This file stays as the record of why, and of the
two traps (double turbo, the erasing refine) that any future evaluation of a base-stage
model patch on this app will hit again.

## Sources

- <https://huggingface.co/OpenVDN/vdn-minimax-h3> — weights (`license: other`, MiniMax CLA)
- <https://github.com/Saganaki22/ComfyUI-VDN-H3> — the node (Apache-2.0)
