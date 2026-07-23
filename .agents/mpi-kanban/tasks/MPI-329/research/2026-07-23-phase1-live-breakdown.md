# MPI-329 Phase 1 — live switch-cost breakdown (2026-07-23, direct 8188)

Pod `83skaxvrf6sxjc`, image `v0.17.0-dev` (ComfyUI **0.28.0**, torch **2.12.0+cu130**,
comfy-aimdo **0.4.10**), RTX 4090 24GB, host 201GB RAM / 157GB free. Krea2 t2i (SFW),
tier 2 (turbo, 8-step). Driven DIRECT into ComfyUI 8188 (dev door, MPI-203) — no app,
no wrapper — via `scratchpad/driver.py`. Origin+browser-UA headers required (RunPod
Cloudflare proxy 1010-bans urllib UA; ComfyUI middleware 403s missing Origin).

## Measured legs (exec time = ComfyUI execution_start→execution_success)

| leg | state | graph | exec |
|---|---|---|---|
| A cold | first gen after boot | our app graph | **76.5s** |
| B warm | same model, next seed | our app graph | **7.7s** |
| C evicted | `/free` then rerun | our app graph | **80.4s** |
| D evicted | `/free` then rerun | **vanilla** 8-node graph (no LoRAs) | **60.5s** |

Warm 7.7s matches the 2026-07-21 sweep (8s). Cold/evicted ~76-80s = the "switch" cost.

## Where the ~76-80s goes (from `/internal/logs/raw`, leg C timeline)

| Δ | phase | detail |
|---|---|---|
| ~19s | text-encoder load | `Krea2TEModel_ prepared 4999MB staged` → next stage |
| ~57s | **transformer fault-in** | `Krea2 prepared 12864MB staged` → sampler can start |
| ~2s | VAE + decode | `WanVAE prepared 241MB` |

The **12.8GB transformer fault-in dominates (~57s)**. Sampling itself is the 7.7s warm
number. So it's load, not compute — confirms the switch-cost framing on a NON-LTX,
fits-in-24GB image model. Nothing here is network-volume-bound in the fault (host had
157GB free RAM; bytes served from page cache — the MPI-187/#13139 aimdo per-page
fault-handler cost, not I/O).

## TWO new findings

### 1. Our app graph is ~20s SLOWER than vanilla on the SAME evicted state (80.4 vs 60.5)
Cause is in the log: the app graph prints `Model Krea2 prepared for dynamic VRAM
loading. 12864MB Staged. 263 patches attached` **FOUR times** per gen; the vanilla
graph prints it **ONCE** (`0 patches`). The 263 patches = our LoRA/edit stack (identity
edit LoRA, filter-bypass LoRA, control LoRA, style slots). Each re-patch makes aimdo
re-prepare the 12.8GB transformer → repeated partial re-faults. **This ~20s is
app-side and rebuild-free** — a workflow/patch-order lever independent of the engine.

### 2. API / wrapper path acquitted for the SWITCH symptom too
Browser-direct-8188 exec times equal the app-measured times from the 2026-07-21 sweep
(cold ~2min class, warm ~8s). The wrapper was already acquitted for the LTX stage-gap
(★★★★★ pod-perf-investigation.md). This extends the acquittal to the model-switch
symptom: the cost is inside ComfyUI's load path, not our request path. **The user's
"something wrong with the API communication" hypothesis is tested and cleared.**

## 2.12 baseline locked for the torch A/B
Current image = torch **2.12.0+cu130** (the MPI-191 `edc09a8` experiment that FAILED its
own inter-stage test and was never reverted, despite the Dockerfile instructing revert
to 2.10). Baseline: **fault-in ~57s for a 12.8GB model.** MPI-187 measured torch
**2.10+cu130** faulting **40GB (LTX) in ~11s**. If both hold, 2.12 is a large fault-in
regression. Phase 2 = build a torch-2.10+cu130 dev image on the SAME ComfyUI 0.28 (only
torch changes) and re-run legs A/C/D. Target: 12.8GB fault-in well under 57s.

## Phase 1b — MPI-193 dedup VERIFIED, torch-minor & dup-packs both ruled out (pod noyw5u93or00v2)

Re-spun 4090, same image (v0.17.0-dev, torch 2.12.0+cu130, ComfyUI 0.28, aimdo 0.4.10).
Boot-log audit (`/internal/logs/raw`):

- **0 "Duplicate install detected"**, **0 IMPORT FAILED**, every custom-node pack imports
  exactly ONCE, no pack loaded from both `/opt` (baked) and the volume. **MPI-193 dedup
  works — dup volume node packs are ELIMINATED on the current image.** The 2026-07-05 prime
  suspect is dead, yet the fault is still ~55s → dup-packs were never the residual cause.
- `Enabled pinned memory 231803` (231GB pinned, 257GB host). The June "8MB memlock cap →
  1GB/s pinning" ceiling does NOT apply to this secure-cloud host. Model fully in pinned
  RAM, still faults ~0.34GB/s → pure aimdo per-page fault-handler cost, not I/O, not pinning.
- `Set vram state to: NORMAL_VRAM` + DynamicVRAM enabled = ComfyUI 0.28 open-bug behavior
  (#13139 "Models always unloaded when using dynamic VRAM", #14162): model unloaded after
  each prompt, re-faulted next.

### The reframe (from leg B warm log)
Same-model consecutive gens do NOT pay the fault (warm 7.7s, no 55s re-fault in the log —
model stays resident). **The 55s is paid only on a genuine cross-model SWITCH** (evict A →
fault B → switch back → re-fault A). Two ~13GB image models can't co-reside in 24GB → every
switch pays it. This is a VRAM-capacity + aimdo-unload cost, not a "bug" and not I/O.

### Torch-minor is NOT the lever (do NOT rebuild to test it)
pod-perf-investigation.md, MPI-191 (`edc09a8`, live): our image = ~86s on torch 2.12 AND
~60-93s on torch 2.10 — BOTH slow. Stock RunPod image = 11-14s at torch 2.10. So our-vs-stock
gap is NOT the torch minor; it is "OUR IMAGE BUILD or LAUNCH" (doc's own words). The 2.12
Dockerfile drift is real hygiene debt to revert, but a 2.10 rebuild is a near-certain NULL for
this symptom — dropped as a fix path. [supersedes this task's Phase 2 plan]

### The genuinely-UNRUN experiment: keep-resident flag on a model that FITS
The whole saga's "can't disable aimdo, it OOMs" is an **LTX-40GB-doesn't-fit** fact. Krea2/
Qwen/Chroma (~13GB) FIT 24GB. `--highvram` ("keep models in GPU memory, skip the unload") was
NEVER tested where the model fits (the 96GB run used aimdo DEFAULT, not highvram). Caveat
(#14475): aimdo VBAR may release pages even in HIGH_VRAM. But untested on a fitting model.
NEXT: relaunch engine with `CUBRIC_VRAM_MODE=--highvram`, re-run the switch legs on Krea2. If
the 55s fault collapses and same-model stays resident with no re-fault → rebuild-free fix for
the image-model switch (the 90% case). LTX (40GB) keeps dynamic aimdo (would OOM under highvram).
