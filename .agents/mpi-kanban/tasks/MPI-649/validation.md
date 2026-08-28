# MPI-649 — validation

**Scope was re-cut by Fabio on pickup (2026-08-28).** The card asked for a bump *and* a
smoke test. The smoke matrix rents a RunPod GPU, so it was moved as a block onto **MPI-595**
(2.0 release readiness) rather than paid for twice: "if we're gonna do them, might as well do
them when needed, not right away." This card therefore owns **gates 0–5 of
`docs/playbooks/bump-engine/README.md` — the free, local half — and nothing else.**

Everything below is measured. Nothing here is read off release notes.

---

## Gate 0 — breaking surfaces, `v0.31.0…v0.34.0`

97 commits, 182 files. The one that mattered came back **clean**.

**`comfy/ops.py` moved 261 lines** — commit "Make a context manager for cast_bias_weight and
use it" (#14750). That is the exact MPI-465 failure shape: a core API that pinned custom
nodes call, changing under them. Diffed the file at both tags:

- `cast_bias_weight(s, input=None, dtype=None, device=None, bias_dtype=None, offloadable=False, compute_dtype=None, want_requant=False)` — **signature unchanged**.
- `uncast_bias_weight` — still present.
- The new `CastBiasWeightContext` is **purely additive**; core's own `forward_comfy_cast_weights`
  moved onto it, callers outside core did not have to.
- `cast_modules_with_vbar` / `resolve_cast_module_with_vbar` gained *optional* keyword args
  (`return_faulted`, `return_weights`) with backward-compatible defaults.

So there is **no changed core API under our pinned nodes** in this range.

**"Minimum officially supported pytorch is now 2.7" (#15413) is a README edit only** — no
runtime gate, no version check. Same commit adds a new line worth knowing: cu130+ pytorch is
now stated as *required* on NVIDIA 20-series and above. The live engine reports
`2.13.0+cu130`, so it is above both floors.

**No engine-owned requirement line moves.** `torch`/`torchvision`/`torchaudio` are bare (no
version) in `requirements.txt` at both tags, and no `triton`/`nvidia-*`/`cuda-*` line appears.
Per `_fullReinstallReason()` that is what keeps the upgrade off the wipe path — **users do not
pay an ~11 GB reinstall for this bump**, which is what the release-notes bullet says.

**The card's risk 2 (workflow-templates is a meta-package) does not bite an online install.**
`comfyui-workflow-templates==0.11.48`'s seven subpackage pins are unconditional
`requires_dist`, not extras — a normal pip pulls all seven. Confirmed by execution below. It
remains a real risk for an *offline or baked* install, which is Pod territory (MPI-595).

## Gate 1 — target reachable

`v0.34.0`, published 2026-08-26, is the newest **published Release** and carries all four
portable assets (`ComfyUI_windows_portable_nvidia.7z` + amd/intel/cu126). Tag commit
`12d5279438bfefc058a269eae805ceab6047777f`. The card's read that `v0.34.1`/`v0.34.2` are tags
with no Release object was re-checked at pickup and still holds.

## Gate 2 — n/a

No suspected break to date against `node_lock.json` history.

## Gate 3 — the pins

Four values moved, and they were grepped afterwards and agree:

| file | field | was | now |
|---|---|---|---|
| `node_lock.json` | `comfyui.core.tag` | `v0.31.0` | `v0.34.0` |
| `node_lock.json` | `comfyui.core.commit` | `43cb4fff…` | `12d52794…` |
| `node_lock.json` | `comfyui.frontend.comfyui-frontend-package` | `1.48.7` | `1.49.6` |
| `node_lock.json` | `comfyui.frontend.comfyui-workflow-templates` | `0.11.34` | `0.11.48` |
| `system_dependencies.json` | `engine.version` | `0.31.0` | `0.34.0` |

Both frontend values were read from **v0.34.0's own `requirements.txt`**, never a changelog.

`python_deps.txt` regenerated with `node scripts/compile-node-deps.mjs` against the new core:
**zero package versions moved.** The only diff is the provenance comment
(`cubric-core-constraints-v0.31.0.txt` → `…v0.34.0.txt`). `--check` first printed
`ComfyUI core v0.34.0`, which is the free confirmation the pin propagated. It still has to
**travel to `mpi-ci` with the lock** — see MPI-595.

## Gate 4 — every pinned node, at its pinned commit

The card listed six packs as unproven (MpiNodes was ahead on the bench; five others were
installed there without `.git`, so their bench-clean import was evidence about *some* version,
not the pinned one). That gap is now closed on the real engine, not the bench:

**17 of 17 custom-node folders carry a `.mpi_node_commit` marker matching `node_lock.json`
exactly** — including all five no-`.git` packs (`comfyui_controlnet_aux`, `comfyui-krea2edit`,
`comfyui-inpaint-cropandstitch`, `LanPaint`, `ComfyUI-MelodramaBox`) and `ComfyUI-MpiNodes` at
`38b3a27a`, not the bench's `3e455e88`.

> Folder names do **not** match lock keys character-for-character —
> `ComfyUI-UltimateSDUpscale` is on disk as `comfyui_ultimatesdupscale`, hyphens as
> underscores. My first sweep matched names case-insensitively and reported it MISSING;
> reading `.mpi_node_commit` gave 17/17. **The hand-rolled sweep was the mistake** —
> `nodesDeps.js` declares `filename` beside `id`, and
> `checkUniversalWorkflowDepsStatus()` (`routes/shared.js`) already walks every universal
> dep and diffs the marker against the pin. Written up in
> `docs/playbooks/bump-engine/02-local-upgrade.md` § Traps.

## Gate 5 — the LOCAL floor check ✅

Run against the app engine on `48188` (the one users get), driven from an isolated instance on
`53312`. Fabio closed his own app first, so nothing was taken from him.

**The app performed the upgrade itself at boot** — it detected the pin mismatch and took the
in-place path with no `POST /engine/upgrade` needed. Measured, start to stamp: **25 seconds.**

```
git checkout --force 12d5279438bfefc058a269eae805ceab6047777f
  Previous HEAD position was 43cb4fff ComfyUI v0.31.0
  HEAD is now at 12d52794 ComfyUI v0.34.0
In-place upgrade pip set: comfyui-frontend-package==1.49.6 comfyui-workflow-templates==0.11.48
  comfyui-embedded-docs==0.5.10 av>=17.0.0 comfy-kitchen==0.2.31 comfy-aimdo==0.4.15
In-place upgrade landed 0.34.0; version stamp written
```

Exactly the six moved requirement lines, no torch, **no wipe** — as gate 0 predicted.

**Four independent reads agree the tree actually moved** (the MPI-419 self-concealing-restamp
trap): `git rev-parse HEAD` = `12d52794`, `git describe --tags` = `v0.34.0`,
`comfyui_version.py` `__version__ = "0.34.0"`, `engine/.mpi_engine_version` = `0.34.0`, and the
live `/system_stats` = `0.34.0`. The stamp is written only after the code re-reads
`comfyui_version.py`, so it could not have stamped a version the tree did not reach.

```
node scripts/engine-floor-check.mjs
engine http://127.0.0.1:48188 · 1988 class_types registered
workflows 50 · class_types used 211 · missing 0
✓ every class_type used by a shipped workflow registers on this engine.
```

Baseline on the same engine at 0.31.0, taken before the bump: **1919** registered, same 50
workflows / 211 used / **0 missing**. So the bump *added* 69 class_types and removed none we
use.

**Boot log has no new import failure.** The only two `ImportError`s are
`PatchTritonVAE requires triton` (a KJNodes node; the Windows portable ships no triton) and
comfy_kitchen reporting its triton backend unavailable. Both are **pre-existing** — they appear
in the default-profile `app.log` at 16:56 and 17:08 today, hours before this bump, at 0.31.0.
No workflow uses `PatchTritonVAE`.

`npm test` — **773/773 pass**, 0 fail.

## What this does NOT prove

- **Registering is not running.** MPI-465 threw *after* the loaders ran, with every
  `class_type` registered. This gate earns the right to smoke; it does not replace it.
- **Windows-only, and one machine.** Nothing here says anything about the Linux/macOS
  comfy-cli engine or the Pod's baked image.
- **`av >= 17` was never actually exercised by this run.** pip answered
  `Requirement already satisfied: av>=17.0.0 … (18.0.0)` — this machine's engine was *already*
  on av 18 under the old `av>=16` floor. So the PyAV major bump cost nothing here and, more to
  the point, **was not tested here.** It is still the single riskiest line in the whole
  requirements diff for a *fresh* install or a rebuilt Pod image. **The smoke matrix must
  include a video op** — that is why MPI-595's block says so in those words.

## Handed to MPI-595 (all of it costs money)

Gates 6–9, written into that card's Gate B as one block: sync **both** `node_lock.json` and
`python_deps.txt` into `c:\AI\Mpi\mpi-ci\cubric-vision-pod\`, re-run `--plan` immediately
before the smoke, rebuild the **DEV** Pod image and restart the default-profile app, assert the
Pod reports `0.34.0`, run the matrix **with a video op**, then the mandatory stable-image
rebuild at release.

`npm run release:check` already refuses, by name, which is the correct resting state:

```
- Engine pin moved 0.31.0 -> 0.34.0 since v1.4.2. smoke-evidence.json was produced against
  ComfyUI 0.31.0, not the pinned 0.34.0 — that run validated a different engine.
- Engine pin moved 0.31.0 -> 0.34.0 since v1.4.2. smoke-evidence.json is STALE — recorded
  2026-08-22T22:58:19.413Z, but node_lock.json last changed 2026-08-28T19:56:26+01:00.
```

## State left on the machine

Fabio's engine is now on **0.34.0** — reopening his app will not re-upgrade, the pin matches.
The isolated instance (`53312`) and the ComfyUI it started on `48188` are shut down.
