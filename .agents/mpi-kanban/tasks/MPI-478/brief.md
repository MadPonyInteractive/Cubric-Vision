# MPI-478 — the engine forces `--lowvram` on every NVIDIA GPU

Opened 2026-08-08 off a user report: H3 generations in the app feel far slower
than the same model on his authoring bench, and the GPU never fills.

**This card is an investigation, not a fix.** The cause is NOT established.

## What is established

| | flags |
|---|---|
| App engine (`:48188`) | `main.py --listen 127.0.0.1 --port 48188 **--lowvram** --preview-method taesd --enable-cors-header …` |
| Bench (`G:\ComfyUi\run_nvidia_gpu.bat`, `:8188`) | `main.py --windows-standalone-build --preview-method taesd --output-directory …` — **no VRAM flag** |

Read off the live process command line and the bat, 2026-08-08. The app's log
confirms the consequence: `Set vram state to: LOW_VRAM`. Source is
`routes/comfy.js` — `modeArgs = ['--lowvram']` for every non-Apple, non-CPU
vendor, with no size condition on either the card or the model.

Symptom it matches: dedicated GPU memory parks at **11.5 / 16 GB** with
**23.7 GB in shared**, while the run sits at ~94 s/it. The user's words:
"like having a 10 GB card when I have 16."

## What is NOT established — read this before theorising

The app is **not** uniformly slow. Its own log for 2026-08-07 (all on `:48188`,
all with `--lowvram`) contains, in order:

```
10.2 s/it → 47.5 → 23.5 → 6.4 → 143.2 → 94.6
```

Six generations spanning **22x**, on one box with one engine. Canvas, duration,
reference count and `ref_image_size` move the cost far more than any flag could,
so a bench-vs-app wall-clock comparison across *different settings* proves
nothing. Do not compare a bench number to an app number unless every setting
matches.

Also already known and NOT the difference: H3 spills on this box either way.
`docs/models/h3/performance.md` measured the **bench** at 12.9/16 GB dedicated
with ~24 GB shared and system RAM at 95 %. Spilling is not what separates them.

## The one test that settles it

One variable, same job, same box. No code change needed — the app only talks to
`:48188`, so the engine can be started by hand:

1. Let the current generation finish. Note its exact settings and s/it.
2. Stop the engine from the app.
3. Relaunch it by hand with the **identical** command line **minus `--lowvram`**:
   `engine\ComfyUI_windows_portable\python_embeded\python.exe engine\…\ComfyUI\main.py --listen 127.0.0.1 --port 48188 --preview-method taesd --enable-cors-header --extra-model-paths-config …`
4. Re-run the SAME generation from the app. Compare s/it and the dedicated/shared split.

A second run at `--normalvram` is worth it only if step 4 wins, to tell "the flag"
from "any restart".

## The local flag was never justified by a measurement — CORRECTED 2026-08-08

An earlier draft of this brief said `--lowvram` was added on measurement, citing the
MPI-142/143/144 OOM. **That is wrong for the LOCAL engine and the correction matters
more than anything else on this card.**

`git log -S'--lowvram' -- routes/comfy.js` returns exactly one commit: **`a7a371a5`,
"init commit", 2026-03-31.** The flag has been there since day one, before LTX, before
H3, before any shipped model — so no measurement on any current model can have produced
it. It is an unexamined default, not a decision.

The OOM is the **Pod twin's** justification, not the local one, and
`routes/remotePodLifecycle.js` says so in its own words: *"MPI-144: Pod ComfyUI now
launches with --lowvram, **to MATCH the local engine**"*. The Pod copied a default
nobody had checked.

### What that OOM actually was (checked 2026-08-08, on the user's challenge)

He asked whether it was a GGUF or the 40 GB weight. Neither:

- **We have never shipped a GGUF.** `grep -ci gguf js/data/modelConstants/dependencies.js`
  → **0**. There is no GGUF weight anywhere in the dep set.
- It was the **bf16 transformer, `ltx23-transformer-bf16`, 41 GB** — 61.40 GB of weights
  resolved — which is where the comment's "42GB" comes from.
- **The 40 GB card did not exist yet.** `ltx-23-balanced` is 40.40 GB total on a 20 GB
  int8 transformer, and it was created by **MPI-200 (2026-07-05)**, *after* the OOM
  (**MPI-144, 2026-06-26**) — and created *because* the bf16 transformer never fits.
  `models.js` says it outright: the bf16 weight "is replaced by a 20GB one that FITS
  32GB — which kills the aimdo stage-2 eviction thrash MPI-197 traced".

So the OOM was real, on the fattest weight we ship, on a card that had no lighter tier
to fall back to yet. Every part of that premise except the weight itself has since moved.

### It still is not a deletion

`ltx-23` HIGH resolves to `ltx23-transformer-bf16` on **every** arch today —
`resolveDeps(..., {arch:'modern'})` and `{arch:'blackwell'}` both give 61.40 GB. (The
`fp8`/`mxfp8` entries are deliberate orphans: MPI-466 collapsed them into one int8
weight and the dep entries stay so the orphan sweep does not strand them on existing
disks.) A 24 GB card on LTX HIGH genuinely still needs offload.

So the shape of any fix is conditional — on measured VRAM, on the resolved model
footprint, or both — and per THE ROOT-CAUSE RULE it must land on **both engine
twins**: `routes/comfy.js` (local) and `routes/remotePodLifecycle.js` (Pod). A
local-only fix is a false done.

## The other ceiling, which no flag moves

System RAM read **60.5 / 63.8 GB (95 %)** during the report. H3 is 53 GB of weights;
`footprint.js` says a 16 GB card needs ~40 GB of RAM for it. That is a real ceiling on
this box and `docs/models/h3/performance.md` already names it. If the test above shows
no change, this is the next thing to look at — and it may simply be that H3 is not a
16 GB-card model in practice, which is a product statement, not a bug.
