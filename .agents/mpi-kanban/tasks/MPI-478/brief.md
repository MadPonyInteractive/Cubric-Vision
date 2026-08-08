# MPI-478 — the local engine still passes `--lowvram`; the Pod dropped it on measurement

Opened 2026-08-08 off a user report that H3 felt far slower in the app than on his
bench, with the GPU never filling (11.5 / 16 GB dedicated, 23.7 GB shared).

**The speed hypothesis this card opened with is DEAD.** `--lowvram` is inert on the
engine we ship. What survives is a real but low-drama engine half-wire, below.

## Why the flag cannot be the cause — checked in the shipped source, not a doc

Local engine: **ComfyUI 0.30.0, torch 2.13.0+cu130, comfy_aimdo 0.4.11.** aimdo's gate
is torch >= 2.8, so dynamic VRAM is ON. Under aimdo, upstream's own docstring for the
flag is *"Doesn't do anything if dynamic vram is enabled"*.

Verified against `engine/.../ComfyUI/comfy/model_management.py` rather than taken on
trust. Every `vram_state` branch in the file:

| line | test | LOW_VRAM vs NORMAL_VRAM |
|---|---|---|
| 983 | `LOW_VRAM` **or** `NORMAL_VRAM` | **same branch, same `lowvram_model_memory` budget** |
| 895 | `!= HIGH_VRAM` | same |
| 1069 | `== HIGH_VRAM` | same |
| 1080 | `HIGH_VRAM or SHARED` | same |
| 1083 | `NO_VRAM` | same |
| 1184 | `(HIGH, NORMAL)` **or `aimdo_enabled`** | same — aimdo is on |

**Not one branch distinguishes LOW_VRAM from NORMAL_VRAM.** Running the engine without
the flag executes identical code.

### MEASURED 2026-08-08 — the source read was right

The user ran it anyway, which was the correct call: a source read is an argument, a run is
evidence. Same prompt, same inputs, 1152x640 / 3 s / `match`, `NORMAL_VRAM` confirmed in
the boot log:

| run | vram state | wall clock |
|---|---|---|
| `ref2v_ms_008` | LOW_VRAM | 7m 12s |
| `ref2v_ms_004` | LOW_VRAM | 7m 23s |
| `ref2v_ms_003` | LOW_VRAM | 7m 22s |
| **`ref2v_ms_010`** | **NORMAL_VRAM** | **7m 05s** |

7 seconds against a baseline that already spreads 11 s across three runs of itself. **The
flag does nothing.** Question closed on evidence, not on reading. `routes/comfy.js` was
patched for the test and reverted (`git checkout --`), tree clean.

Residency during the flagless run: dedicated started at 14.0 GB and settled to 13.7 —
i.e. the same 10-14 GB band it occupied WITH the flag. Nothing about the split changed.

The 11.5/16-with-23.7-shared split is aimdo's JIT fault-in working as designed, not the
flag. `docs/models/h3/performance.md` measured the **bench** at 12.9/16 with ~24 GB
shared and RAM at 95 %, so both installs do the same thing. The app-vs-bench gap is
settings, and the app's own log spans 6.4 → 143 s/it in one evening on one engine.

## The research already existed — `docs/builder/` had all of this

Found only after the user said so. `docs/builder/02-image-and-rebuild.md` § "`--normalvram`
removed in v0.26 + torch 2.8" states the NO-OP outright and instructs: **"Pass NO vram
flag; let aimdo manage."** `cubric-vision-pod/start.sh` (~L140-166) carries the full
reasoning and the Pod already complies — `VRAM_MODE="${CUBRIC_VRAM_MODE:-}"`, empty by
default.

**Read `docs/builder/` before opening any engine-flag card.** This one was opened without
it.

## What actually survives: local is the last twin still passing it

| twin | flag |
|---|---|
| Pod (`start.sh`) | **none** — dropped deliberately, MPI-146/156 |
| Local (`routes/comfy.js`) | **`--lowvram`**, every NVIDIA GPU, since `a7a371a5` "init commit", 2026-03-31 |

`git log -S'--lowvram' -- routes/comfy.js` returns that one commit. It predates LTX, H3
and every shipped model, so no measurement produced it. MPI-144 then propagated it to the
Pod *"to MATCH the local engine"* — copying an unexamined default outward — and MPI-146/156
later removed it there on measurement without the local side following. Textbook half-wire.

**Today it costs nothing.** It matters only if a future engine ships torch < 2.8 or aimdo
gates off, at which point the flag silently reactivates and the failure is MPI-156's:
legacy ModelPatcher, ~6-minute cold loads on every model switch. Also worth knowing:
`--lowvram` is not universally inert — `start.sh` L159 names **"MPI-146's 5090 `--lowvram`
OOM"**.

### It is NOT a blind one-line deletion

`model_management.py` L122 sets `lowvram_available = False` on DirectML, and L549-551
**re-enable it** when `args.lowvram` is passed. So on a DirectML (AMD/Intel) install the
flag is load-bearing, not inert. Any change has to keep the non-aimdo paths intact —
condition on the vendor/torch, or gate on `aimdo_enabled`, and verify on a non-NVIDIA box
before it ships.

## Corrections this card owes, both from the user

- **We DID ship GGUF, and it OOM'd — repeatedly.** An earlier draft said "we have never
  shipped a GGUF" off `grep -ci gguf dependencies.js` returning 0. That grep describes
  **today's dep set, not the history**, and the user's recall is the correct one. MPI-168
  shipped a **Q8_0 GGUF** LTX transformer on the Pod specifically to get LTX HIGH resident
  in VRAM; MPI-185 is the resulting OOM — a raw `torch` allocation inside
  `ComfyUI-GGUF/dequant.py:62` (`int16 -> int32 -> float32` upcast), **outside aimdo's
  fence**, which is why `--vram-headroom=1` was tried against it and **DISPROVEN live** on
  a 24 GB 4090. MPI-190 reverted the Pod to bf16, *"kills the MPI-185 dequant OOM"*. The
  zero in `dependencies.js` is the *outcome* of that decision. Do not re-derive GGUF as a
  fix.
- **Offload is proven, with or without the flag.** `start.sh` L155-160: dropping aimdo via
  `--disable-dynamic-vram` on a 4090 made ComfyUI load LTX's full 3-stage set resident,
  streamed ~57 GB into a ~57 GB-RAM Pod and **container-OOM-killed** it mid-gen. aimdo's
  fault-in is load-bearing, not overhead.

## What is still unanswered

Why the app run felt slower than the bench, with the flag ruled out. Remaining differences
worth holding weights and settings constant against: engine version (bench 0.30.2 vs app
0.30.0), and system RAM pressure (60.5 / 63.8 GB, 95 %, during the report —
`footprint.js` says a 16 GB card needs ~40 GB of RAM for H3's 53 GB).

The levers the research names, none of them a vram-mode flag: `--reserve-vram` for a
big-model VAE-decode OOM, `--fast-disk`, and **model FORMAT (fp8 native), which
`start.sh` calls the real lever** — it loads faster *with* aimdo on. `--highvram` is
48 GB+ only and a gamble even there (aimdo's VBAR releases pages in HIGH_VRAM;
`pod-perf-investigation.md` L96).

It may also simply be that H3 is not a 16 GB-card model in practice. That is a product
statement, not a bug.

## A better suspect, found 2026-08-08: H3 never declares its references to the memory estimator

The user asked whether the references loaded into the node are what ComfyUI uses to size
the offload. They are — that is precisely the design — and **H3 opts out of it**.

The chain, read from the shipped engine:

1. `comfy/sampler_helpers.py:165 estimate_memory()` walks every conditioning and asks the
   model `extra_conds_shapes(**cond)` for its shapes.
2. `comfy/model_base.py:404 memory_required()` sums those shapes **alongside** the noise
   shape, but only for keys listed in `self.memory_usage_factor_conds`.
3. `comfy/model_management.py:987` turns the result into the weight budget:
   `lowvram_model_memory = free_mem - minimum_memory_required`.

So conditioning genuinely drives the VRAM/RAM split. But `BaseModel` defaults are
`memory_usage_factor_conds = ()` and `extra_conds_shapes() -> {}`, and:

| model | declares cond shapes for the budget? |
|---|---|
| Flux2 (`model_base.py:973`) | yes — `("ref_latents",)` |
| Qwen (`1489`, `1543`) | yes — `("ref_latents",)` |
| Wan family (`1813`, `1881`, `1925`) | yes — `("reference_latent", "pose_latents", …)` |
| **`class MiniMaxH3` (`2067`)** | **no — zero declarations in the whole class body** |

MiniMaxH3 overrides `extra_conds` (it reads `minimax_refs` and `minimax_keyframes` and
builds `cond_video_latents` / `cond_audio_latents`), so the references reach the model
perfectly well. It simply never tells the *estimator* they exist.

**Therefore H3's `memory_required` is computed from the output latent shape alone.** A
2048px character sheet plus a reference video contribute exactly zero to the budget.

### What that would explain — INFERENCE, not measured

ComfyUI sizes the resident weight set as if there were no references, keeps more weights
resident than it should, and then the reference activations arrive unbudgeted. The result
is pressure, aimdo faulting weights back out mid-run, and a wall clock far worse than the
VRAM reading suggests. It fits every symptom on this box: dedicated parked at 10-14 GB, a
`max` run costing 1.7x while the VRAM number barely moves (churn, not residency), and the
`--lowvram` flag being irrelevant because it was never the thing sizing this.

**Flagged as inference deliberately.** The declaration gap is fact, read from source; the
causal link to the slowdown is not measured. Do not repeat it as established.

### The lever it points at

`--reserve-vram <GB>` — hand back manually the headroom the model failed to declare. This
is already the documented knob for exactly this shape of problem: `cubric-vision-pod/start.sh`
says *"If a big-model VAE-decode OOM appears under aimdo (known LTX edge), add
`--reserve-vram <GB>` here."* Far more promising than any vram-mode flag, and testable in
one run.

The real fix is upstream: give `MiniMaxH3` a `memory_usage_factor_conds` naming its
reference keys plus an `extra_conds_shapes` override, the way Flux2/Qwen/Wan already do.
That is a ComfyUI PR, not something MpiNodes can patch — it is a core model class.
