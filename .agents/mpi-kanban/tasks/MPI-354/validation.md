# MPI-354 — Klein 4B in-app validation

Capture sheet for the verification runs. Two numbers are BLOCKED on these runs and
cannot be derived from the JSON: the progress-bar counts and the real VRAM.

## 0. Engine prerequisite — RESOLVED 2026-07-28

The first restart after the junction fix **crashed ComfyUI at boot**:

```
RuntimeError: Added route will never be executed, method POST is already registered
```

Root cause: the previous session parked the stale managed pack as
`custom_nodes/ComfyUI-MpiNodes.stale-aaa1d2d9`. ComfyUI skips a `custom_nodes` entry
**only when its name ends in `.disabled`** (`nodes.py` ~2348) — any other suffix still
loads. So the stale copy AND the junction both imported `routes.py`, each registering
`POST /mpi/reload-extra-paths`, and aiohttp refuses the duplicate → hard boot failure.

Fixed by renaming to `ComfyUI-MpiNodes.stale-aaa1d2d9.disabled`. **Never park a custom
node under any other suffix.** Engine now boots clean; `MpiStyleSelector`,
`MpiStyleLoras` and `MpiTextContains` are all present in the full `/object_info`, and
`klein_t2i.json` resolves with 0 unknown class types.

## 1. Progress stages — capture PER OP, not per file

**Read this before counting.** `stagesFor()` in `js/data/progressStages.js` keys on the
WORKFLOW FILENAME (`PROGRESS_STAGES['krea2_t2i.json']`), with a mode of
`single` / `preview` / `stage2`. Klein runs **all seven ops from `klein_t2i.json`**, and
their bar counts genuinely differ — so one key cannot hold seven answers. The table
cannot express Klein as it stands.

So capture the count **per op**, and the schema gets a per-op key afterwards
(`'klein_t2i.json:detail'`, or a fourth argument to `stagesFor`). Until then Klein has
no entry at all: the counter still ticks, it just shows "2" rather than "2/3" —
degraded, never wrong.

Counting method (from progressStages.js): run the op, watch the ComfyUI terminal, count
how many times a tqdm bar **restarts at 0**, INCLUDING the `0/1` model-load bar.

| op | `Input_wf_type` | bars | notes |
|---|---|---|---|
| t2i (enhancer OFF) | 1 | | 4 steps expected |
| t2i (enhancer ON) | 1 | | the enhancer adds its own bar — that is why it is a separate row |
| i2i | 2 | | |
| depth (poseReference) | 3 | | preprocessor may add a bar |
| edit (kleinEdit) | 4 | | try 1, 2 and 3 reference images |
| remove (inpaint) | 5 | | TWO baked stages (removal + detail) → expect ≥2 |
| detail | 6 | | 2 steps expected |
| upscale | 7 | | UltimateSDUpscale — tiles are counted at RUNTIME, so what matters here is the **post-tile** bar count (`postTileBarsFor`). MPI-350: routes/comfy.js forwards RAW tqdm, so T tiles emit **T+1** `comfy:tile-progress` events. |

## 2. VRAM — decides the tier badge

`sizeTier: 'low'` is currently a GUESS from the 4.07 GB int8 file size. The only
measured figure (~13 GB) was taken on the **bf16** weight, and that is the number that
threatened 8 GB cards.

Capture **peak** VRAM (not steady-state) on the heaviest op — most likely upscale or a
3-reference edit. If peak exceeds ~11 GB the badge should move off `low`.

## 3. Things worth eyeballing while you are in there

- **Styles reach every op** — the picker should now appear on **detail** and **upscale**
  as well as t2i/i2i/depth/edit/inpaint. It must NOT appear on Krea2's detail/upscale
  (guarded by a test, but worth one look).
- **No tier radio** anywhere on Klein, and **no negative-prompt toggle** (cfg 1.0).
- **Edit shows three image slots**; slots 2 and 3 optional, a 1-image edit still runs.
- **Enhancer** on/off actually changes the prompt of record (the `Output_prompt`
  readback), and does not crash the Qwen3-4B encoder.
- **Op selection is right.** The one-master-template failure mode is silent: a wrong
  `Input_wf_type` returns a plausible image from the WRONG op rather than an error. So
  for each op, confirm the output is the kind of thing that op should produce.

## 4. Known gap found during wiring — NOT yet implemented

`docs/models/klein/removal.md` requires that the remove op **HIDE** the prompt field
("paint then Remove, one click"), not merely ignore it. It does not: the `inpaint` op
sets `promptRequired: false`, but that field has **no consumer anywhere in the UI** —
it is metadata only, so the prompt box still renders its text area.

Removal works regardless (an empty prompt erases, which is the documented behaviour), so
this is a UX gap rather than a functional one. Fixing it means real work in
`MpiPromptBox`, which currently also carries another session's uncommitted changes — so
it was deliberately left alone rather than deepening that entanglement.

## Status

Wiring complete and verified statically: 48/48 non-pre-existing tests pass, release
health check clean, dep-vs-graph reconcile closed both directions, all new guards
negative-control proven. NOT committed — the change spans `commandRegistry.js` and
`MpiPromptBox.js`, which hold other sessions' uncommitted work.
