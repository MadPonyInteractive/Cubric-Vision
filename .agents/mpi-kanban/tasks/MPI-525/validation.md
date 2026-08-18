# MPI-525 — validation

## Unit / route

1. `node tests/curated-deps-pending.test.cjs` — `curatedDepsPending()` agrees with the
   install branches in all three states (no marker / matching hash / stale hash).
   **Result: 3/3 OK.**
2. `routes/comfy.js` on a spare port → `GET /comfy/deps-pending` answers
   `HTTP 200 {"pending":false}` (marker matches the shipped lock — correct).
   **Result: pass.**
3. `npm test` — 629/629. `npx eslint` on every touched file — clean.

## Live install run (2026-08-18)

Own isolated instance (`npm run app:isolated`, own profile + port), engine down, nothing
on 48188, no other app running. The real curated pass was forced by staling the marker
(`deadbeefdeadbeef`) in `engine/ComfyUI_windows_portable/python_embeded/.cubric_python_deps`,
then calling the production path `ComfyUIController.ensureServerRunning({})` from the
renderer and sampling the modal every 100 ms.

**Run 1 (label only) — found a second defect.** Modal read "Installing Python packages…"
for the FULL 46.8 s, but the log shows pip ran `08:02:24.4 → 08:02:26.9` (2.5 s). The
remaining ~44 s was ComfyUI booting under an install label — the same class of mislabel
the card exists to fix. Fixed: the controller re-emits a plain `comfy:starting` once
`/comfy/start` answers, and `MpiStartingComfy.show()` now assigns the copy BEFORE its
idempotent guard so a second call relabels a modal that is already up.

**Run 2 (after the fix) — correct.** Sampled transitions:

| t (ms) | title |
|---|---|
| +0.1 s  | Installing Python packages… / First engine start only — this can take several minutes. |
| +1.6 s  | Starting ComfyUI Engine… / This may take a few moments… |
| +24.8 s | (modal gone — `ready: true`) |

Matches the log exactly: `installing curated python deps` 08:04:47.6 → `marker stamped`
08:04:49.1. Marker restamped to the real hash `48d7ca7ee6226c88`; `/comfy/deps-pending`
flipped to `{"pending":false}`; `ensureServerRunning` resolved `{ ready: true }`.

Cleanup: engine stopped, instance killed, marker left at the correct hash, backup removed.

**Not covered:** a true from-scratch engine install where pip downloads rather than finds
everything satisfied. The pass ran for real here, just fast (2.5 s) — the label logic is
identical and both phases were observed live.

**Note:** a concurrent session (MPI-548) shares the repo's `playwright-cli` browser; its
`goto` swapped the page and wiped the globals of a third, negative-control run. That run
was discarded, not counted. Runs 1–2 were on this session's own instance (port 58394).

## TRUE wipe-and-reinstall run (2026-08-18, 10:40–10:48Z)

The run the card was held open for: the label seen over a from-scratch pip pass that
**actually downloaded**, not an already-satisfied one.

**Wipe.** Not a hand `rm -rf` — the product's own path, `POST /engine/upgrade
{"mode":"full"}` → `_fullEngineReinstall()` (`routes/engine.js`). It stops ComfyUI first
(the MPI-457 EBUSY half-delete lesson), removes `engine/ComfyUI_windows_portable`
recursively — which takes `python_embeded/Lib/site-packages` **and** the curated marker
that lives beside the interpreter — and preserves the models root. Pre-flight: the whole
`engine/` tree was scanned for reparse points (`Get-ChildItem -Attributes ReparsePoint`)
and has **none**, so no delete could reach `G:\CubricModels`; `.engine-config.json` pins
`ENGINE_ROOT` to `C:\AI\Mpi\Cubric-Vision\engine`.

Reinstall: 10:40:08.3 → 10:44:12.9 = **4 m 04.6 s** (archive download 47 s, extract ~2 min,
14 custom nodes, version stamp 0.31.0, `extra_model_paths.yaml` rewritten with the
preserved root `G:\CubricModels`).

**The pass was genuinely pending, not forced.** Marker file absent; `/comfy/deps-pending`
→ `{"pending":true}`. The fresh portable ships numpy/scipy/transformers but **not**
mediapipe, ultralytics, onnxruntime-gpu, polars, scikit-image or trimesh — all six were
absent before the pass and present after it, so pip really downloaded (~140 of the ~150
pinned entries).

**Trigger.** Own isolated instance (`npm run app:isolated`, own profile, port 50855),
engine down. Production path from the renderer: `ComfyUIController.ensureServerRunning({})`
— a NON-background start, the only one that shows the blocking modal. Modal title+text
sampled every 100 ms, recording only changes.

| wall clock | t | modal |
|---|---|---|
| 10:45:24.367Z | +0.05 s | **Installing Python packages... / First engine start only — this can take several minutes.** |
| 10:48:11.951Z | +167.6 s | **Starting ComfyUI Engine... / This may take a few moments...** |
| 10:48:32.160Z | +187.8 s | (modal gone — `ensureServerRunning` resolved `{ready:true}` at 10:48:32.139) |

- Install label held **167.6 s (2 m 47.6 s)** — the multi-minute wait the card was filed for.
- Engine label held **20.2 s**. The install label covered **89.2 %** of the blocking wait.
- Log cross-check: `installing curated python deps (48d7ca7ee6226c88) in one pass`
  10:45:24.335 → `curated python deps installed, marker stamped` 10:48:11.929. The label
  went up **32 ms after** pip started and came down **22 ms after** pip ended. The phase
  boundaries are exact, not approximate.

This closes the "Not covered" gap left by the forced run above: that pass was real but
2.5 s; this one downloaded for 2 m 48 s and the label tracked it precisely.

**Engine handed back healthy.** 1885 `class_types` registered, **0 IMPORT FAILED**, Impact
Subpack resolving `G:\CubricModels`, marker restamped to `48d7ca7ee6226c88`,
`.mpi_engine_version` 0.31.0, `engine/mpi_models` (2.54 GB) untouched. The only node
missing is KJNodes' `PatchTritonVAE` — `triton` is deliberately excluded from
`python_deps.txt` (engine-owned torch stack), so that is by design and pre-existing, not a
regression from the wipe.

Cleanup: engine stopped, browser closed, instance killed by process TREE (`taskkill /T /F`
on the launcher cmd), no listener left on 50855/48188. The user's standalone bench
(`G:\ComfyUi` on 8188, PID 9908) was verified untouched before and after.
