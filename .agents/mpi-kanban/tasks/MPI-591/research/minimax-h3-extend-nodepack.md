# kat3ri/ComfyUI-MiniMax-H3-Extend — read 2026-08-31

Fabio brought this pack in from a Benjy video as the way to do H3 extend. It is real and it
works, but it is **not** the route this card should ship on, and the reason is the thing worth
recording. Read with `../brief.md` (the seam physics) — this file only covers the pack and what
changed since the card was written.

## Head fact: the card's BLOCKER IS GONE, and the pack is not why

`task.json` blocks this card on an engine bump: PR 15439 (`MiniMaxH3AddGuide`) and PR 15375
(per-stream H3 video/audio noise masks) were master-only against a `v0.31.0` pin.
`dev_configs/node_lock.json` now pins **core `v0.34.0`** (`12d5279`), and both are in it —
verified by reading the tagged files, not the changelog:

| check | at tag `v0.34.0` |
|---|---|
| `comfy_extras/nodes_minimax_h3.py` | `MiniMaxH3AddGuide` present (also `EmptyMiniMaxH3LatentAV`, `MiniMaxH3ImageToVideo`, `MiniMaxH3ReferenceToVideo`, `MiniMaxH3SigmaShift`) |
| `comfy/ldm/minimax/model.py` | `audio_denoise_mask` — 5 occurrences, threaded through `forward`/`_forward` alongside `denoise_mask` |
| `comfy/samplers.py` | `denoise_mask.is_nested` branch — the nested AV mask reaches the sampler |

The local bench (`G:\ComfyUi`, core **0.34.2**) has the same. **So the masked-prefix route the
brief prescribes can be built and tested today, on the engine users already run.** No bump, no
`/mpi-bump-engine`, no waiting.

Still absent at `v0.34.0`, and this is what the pack exists for: `MiniMaxH3VideoExtend` and
`MiniMaxH3EncodeAV`. Neither is in stock ComfyUI. They are **fork-only**
(`kat3ri/ComfyUI`, branch `feat/minimax-h3-video-extend`).

## What the pack actually is

| | |
|---|---|
| Repo | `github.com/kat3ri/ComfyUI-MiniMax-H3-Extend`, created 2026-08-11, head `d175f0a` (2026-08-30) |
| Registry | `api.comfy.org/nodes/minimax-h3-extend` — v**1.0.0**, published 2026-08-11, 592 downloads. **The registry copy is 19 days behind `main`**, so a `source: registry` pin would fetch a different pack than the one that was read |
| Licence | `MIT`, declared in `pyproject.toml` and in the registry metadata. **There is no `LICENSE` file in the repo** — the tree is `.gitignore`, `README.md`, `__init__.py`, `nodes.py`, `patch.py`, `pyproject.toml`, two example workflows |
| Reach | 10 stars, 4 forks |
| Nodes | `MiniMaxH3VideoExtendPatched`, `MiniMaxH3EncodeAVPatched` — plus injection of both under their un-suffixed native names into `comfy_extras.nodes_minimax_h3`, only if absent |

**It is not a node pack in the ordinary sense — it monkey-patches two core internals at import
time** (`patch.py`, applied from `__init__.py` before the nodes load):

1. `comfy.ldm.minimax.model.PackedLayout.__init__` — adds `kind="context"` / `kind="context_audio"`
   keyframes at negative RoPE-time positions, and generalises keyframe anchoring from a hardcoded
   `text_len` origin to a `target_origin` that also accounts for refs in the same call. Stock
   "hard-rejects any keyframe anchor except exactly frame 0 or frame_count-1".
2. `comfy.model_base.MiniMaxH3.extra_conds` — stock **overwrites** `cond_video_latents` from refs
   instead of appending, so a call carrying context keyframes AND ref images silently drops the
   keyframes' half.

Both patches self-skip if a native `MiniMaxH3VideoExtend` is found.

## The two example workflows — what the difference is

Both load a prior clip (`VHS_LoadVideo`), `MiniMaxH3EncodeAVPatched` it to an AV latent, and feed
that as `context_latent`. Same sampler stack (`MiniMaxH3SigmaShift 12/6`, `BasicScheduler
linear_quadratic 20 steps`, `SamplerCustomAdvanced`), same length expression
(`max(5, round(a*24)) + (5 - (max(5, round(a*24)) % 17)) % 17` — the `17k+5` grid from the brief).
The difference is one input and one weight:

| | Text-to-Video-Extend (22 nodes) | Ref-to-Video-Extend (26 nodes) |
|---|---|---|
| transformer | `minimax_h3_fl2va_int8_convrot` → our **`minimax-h3`** card | `minimax_h3_ref2va_int8_convrot` → our **`minimax-h3-ref2va`** card |
| extra inputs | none | `LoadImage` ×2 → `ImageBatchMulti` → ref images |
| prompt in the example | filled | **empty** — the references carry the subject |
| what it continues on | the prompt describes the new seconds | the references pin a subject / voice **across the seam** |

So "reference to video" is not a different kind of extend — it is the same continuation with
subject-consistency refs attached, on the other transformer. That is a genuinely useful second
thing, and it is also **a second 20.97GB download**.

Note both examples load `minimax_h3_video_vae_fp16`. We ship and bench the **int8_convrot** video
VAE (`vae-minimax-h3-video-int8`, MPI-517). Any bench run must use ours, not the author's.

## Why the pack is not the shipping route

- **It patches core, and we pin core.** `PackedLayout.__init__` and `MiniMaxH3.extra_conds` are
  internal call sites with no stability contract. Every `/mpi-bump-engine` is a chance for the
  patch to land on a changed signature — and positional-encoding math that is subtly wrong
  **raises nothing**; it renders a plausible clip that is quietly wrong. That is the exact failure
  class `brief.md` opens by warning about.
- **The author's own two files disagree about verification.** `README.md`: "Confirmed working via
  live testing (2026-08-11) across text-to-video, reference-to-video, and cast-to-video
  continuation." `patch.py` STATUS docstring: "ported from the fork's actual model code and
  reasoned through carefully … **but not yet verified against a live reference render**". Whichever
  is current, neither is our verification.
- **`brief.md` already picked the cheaper mechanism.** The pack is the **guide** route (context
  keyframes → the model regenerates the head → trim). The brief takes the **masked prefix** route:
  write the encoded tail straight into the target latent's prefix and protect it with the nested
  AV noise mask. No regenerated head, nothing to trim, and — the point — **no keyframes, therefore
  neither core patch applies to it.** Stock's keyframe-anchor rejection and its
  refs-overwrite-keyframes bug are both keyframe bugs.
- ~80 lines in `ComfyUi-MpiNodes` versus a 19th third-party pack in `node_lock.json`, from a
  one-author repo with no `LICENSE` file, that rewrites core at import time.

**The hypothesis that decides the whole card** (bench, Phase 1): masked prefix + refs needs no
patch either — refs go in through stock `MiniMaxH3ReferenceToVideo`, the context arrives as latent
data rather than as a keyframe, so `extra_conds`' overwrite never fires. If that holds, both
example workflows are reachable first-party. If it does not, the ref variant is where the pack (or
a port of just patch #2) earns a second look.

## What the pack is still worth

**An oracle.** Install it on the bench only, run its own example against ours on the same source
clip and seed, and compare seams. It is the fork's real implementation, so a masked-prefix result
that matches it is strong evidence the seam math is right — which is otherwise the hardest thing
to prove about this card. Bench-only means it never enters `node_lock.json`.

`MiniMaxH3EncodeAVPatched` is separately interesting: it is a vendored copy of a native
`MiniMaxH3EncodeAV` that stock does not register either. Encoding the prior clip to an AV latent is
needed on **every** route, ours included, so this is the one piece worth reading closely before
writing our own — it has no dependency on either patch.

## Loose end worth one issue

The repo has no `LICENSE` file. `pyproject.toml` and the registry both say MIT. If the pack is ever
pinned rather than bench-only, ask the author to commit the file — one issue, no code.
