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

## If it wins, the fix is not a deletion

`--lowvram` was added on measurement, not by default. `routes/remotePodLifecycle.js`
records it (MPI-142/143/144): without it the Pod ran default `normalvram`, tried to
keep the 42 GB LTX transformer resident, and **OOM-killed** a 5 s 704x1280 i2v on a
24 GB 4090. Removing it globally trades this slowdown for a crash on the models that
needed it.

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
