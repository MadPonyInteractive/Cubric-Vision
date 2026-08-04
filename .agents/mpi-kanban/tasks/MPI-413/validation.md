# MPI-413 Validation — the stated root cause is DISPROVEN

Investigated 2026-07-31 on the Linux box. **This card's diagnosis was wrong.** It
is kept as the record of why, because the wrong version was persuasive.

## What the card claimed

That `pip install -r <node reqs> --upgrade` re-resolved an **already-correct**
`torch 2.13.0+cpu` into the CUDA build, dragging in ~14 `nvidia-*` wheels.

## Why that cannot be what happened

Measured directly, with a correct `torch 2.13.0+cpu` in the venv and the real
`ComfyUI-LTXVideo/requirements.txt`:

```
A) pip install --dry-run -r requirements.txt --upgrade
B) pip install --dry-run -r requirements.txt
→ byte-identical output. NEITHER installs torch, torchvision, or any nvidia-*.
```

`diffusers` / `transformers[timm]` / `kornia` are satisfied by the torch already
present, so nothing re-resolves it.

Two further facts close it off:

- **PEP 440 makes it impossible.** PyPI's torch is the bare `2.13.0`; a version
  carrying a local segment (`2.13.0+cpu`) **outranks** the same version without
  one. `--upgrade` could never have replaced `+cpu` with PyPI's build.
- **There is no CUDA index in play.** No `pip.conf`, no `PIP_*` env, no
  `--index-url`/`--extra-index-url` directive in any node's `requirements.txt`.

## What actually happened

The CUDA stack was installed because **torch was absent**, not because a good one
was replaced:

1. `comfy install` failed with `exit 1` — **MPI-411**, the existing-clone bug.
2. So the `[comfy-install]` stage never installed torch at all.
3. Retry then routed to deps-only (**MPI-414**), which ran the node requirements.
4. `diffusers`/`transformers[timm]` pull bare `torch`, which resolved from PyPI —
   and PyPI's linux torch **is** the CUDA build, declaring the `nvidia-*` wheels.

The stage tags that made this look like an independent bug were real — the CUDA
install genuinely happened at `[system] [pip]` — but only because the
`[comfy-install]` stage before it had died.

**So MPI-413 is a downstream symptom of MPI-411, which is now fixed and
live-verified.** Confirmed the same night: with `--restore` working, `comfy install`
laid down `torch-2.13.0+cpu / torchvision-0.28.0+cpu / torchaudio-2.11.0+cpu` off
the PyTorch CPU index, and the node stage then has nothing left to resolve.

## The code change made under this card — kept, re-attributed

`--upgrade` was removed from `routes/downloadManager.js:2181` and the comment at
`:2033` (which asserted `--upgrade` was the idempotent one — exactly backwards)
corrected. **This does not fix the CUDA problem**, because that was never the cause.

It is kept on its own merits, which are real and **not** CPU-specific:

```
einops pinned to 0.8.0, then the same real requirements file:
  with --upgrade → would install einops-0.8.2      (drift)
  without        → "already satisfied (0.8.0)"     (no drift)
```

That is the **MPI-217** class — the mechanism that once took `opencv 4.13 → 5.0`
major and bumped numpy on an ordinary install. The repo had already hand-patched
this hazard twice per-node (`pipPins`, and `comfyui_controlnet_aux`'s
`installRequirementsCommand`, whose comment carried the same empirical dry-run
proof). Removing the flag fixes the class instead of the instances.

Consumer sweep: `runPipCommand` has exactly **two** callers, both in
`downloadManager.js`; the other (`pipPins`, `:2198`) already omitted `--upgrade`.
The **remote twin** (`cubric-vision-pod/wrapper/wrapper.py`
`_install_node_requirements`) has always omitted it and has run that way in
production, so this **converges** the engines rather than splitting them.

Self-heal is preserved: `pip install -r` still installs *missing* packages.
`--upgrade` only ever added the drift.

## Residual risk — NOT closed by this change (raised by the user 2026-07-31)

Removing `--upgrade` kills **gratuitous** drift: installing plugin B no longer moves
a shared library that plugin A already depends on and is working against. Two
narrower cases survive, named here so nobody reads this as airtight.

**1. Fresh installs still resolve "newest at the time."** A node listing an
unconstrained `kornia` gets whatever is newest on install day, so two users
installing a month apart can end up with different shared libraries. This is live,
not theoretical — tonight's dry-run showed a fresh install resolving
`kornia-0.8.3`, the exact version documented at `nodesDeps.js` as removing `pad`
and breaking ComfyUI-LTXVideo's import.

Already defended by `pipPins`, which forces known-good versions AFTER requirements
run. **The gap is that `pipPins` is a per-node, hand-maintained allowlist** — a
shared package nobody thought to pin can still land at an untested version, and it
surfaces only when something breaks.

**2. A node that explicitly constrains a shared library** (`numpy>=X`) still gets
the upgrade even without `--upgrade`, and can still break a sibling node. Rarer,
and arguably correct — it is a stated requirement rather than drift.

### Why this is not urgent

- The **remote twin has never had `--upgrade`** and has run that way in production
  across the whole MPI-385 Pod sweep without drift problems. This change makes the
  local engine match a configuration already proven at scale.
- Custom nodes are **pinned to specific commits** (`writeNodeCommitMarker` /
  node_lock), so their requirements files do not shift between releases.

### The proper fix, when someone picks it up

A single **constraints file** covering the shared set (torch family, numpy, opencv,
kornia) applied to *every* node requirements install, so pip is structurally unable
to move them regardless of what any node asks. That closes case 1 at the class
level instead of per-node whack-a-mole, and would let `pipPins` shrink to genuine
per-node needs. Contained work, but it needs testing against all 15 universal nodes
on a real install — deliberately NOT started the night before a release.

## Disposition

Root cause disproven → the CUDA-on-CPU symptom is owned by MPI-411 (fixed). The
surviving code change belongs to the MPI-217 drift class. CPU-specific concerns
dropped per the user's 2026-07-31 call that CPU inference is a fallback nobody uses.

---

# Phase 2 validation — the curated pip file (2026-08-04)

Phase 2 shipped ahead of Phase 1 at the user's call. **Local engine only** — the Pod twin
is unchanged and still owns `install_command` / `pip_pins`.

## What shipped

| file | what |
|---|---|
| `dev_configs/python_deps.in` | hand-curated input — the union of 7 nodes' requirements with our decisions (drops, pins, markers), each with its reason |
| `dev_configs/python_deps.txt` | generated lock — 124 packages, `uv pip compile --universal` |
| `scripts/compile-node-deps.mjs` | generator AND drift check in one command |
| `routes/downloadManager.js` | installs the lock once behind a hash marker; per-node requirements/command/pipPins step DELETED from the local path |
| `tests/curated-python-deps.test.cjs` | guards the two invariants + that the deleted step stays deleted |
| `docs/playbooks/add-model/02-dependencies-r2.md`, `.claude/rules/comfy_engine.md`, `docs/download-manager.md` | the mandatory pass, so the file cannot drift when a node is added |

## Verified

- `compile-node-deps.mjs --check` → **0 uncovered** across 65 declared requirements in 7
  nodes; `sam2` correctly reported as a deliberate drop.
- `uv pip compile --universal` resolves clean.
- Throwaway venvs on **both** interpreters the engine ships (uv venv 3.12, Windows
  portable 3.13): `Resolved 124 packages`, **124/124 would install**, no errors, no
  warnings, no source builds. Real one-pass install on 3.13 → exit 0.
- Post-install in that venv: `cv2 5.0.0` with contrib present (`ximgproc` → True) and
  **exactly one** opencv dist-info on disk; `numpy 2.5.1`, `scipy 1.18.0`, `PIL 12.3.0`,
  `transformers 5.13.0` — every curated pin landed exactly. The only `nvidia*` entry is
  `nvidia_ml_py` (the deliberate keep; pure-Python NVML, no CUDA runtime).
- `node --test "tests/*.test.cjs"` → **343 pass, 0 fail**. ESLint clean.
- Negative control on the new guard: removing `--no-deps` from the installer makes it fail
  with `the curated install MUST use --no-deps`. Restored and re-verified.

## The bug the guard caught during the build

The first compile emitted pinned `triton`, 16 `nvidia-*` wheels and — on Linux —
`cuda-toolkit`, `cuda-bindings`, `cuda-pathfinder`, all `# via torch`. `--no-emit-package
torch` drops torch itself but **not its transitive closure**, and torch is legitimately in
that closure via diffusers/ultralytics/kornia/albumentations/mediapipe. That is this card's
Evidence A stack reproduced by our own generator. Fixed by filtering the whole engine-owned
family post-compile and re-checking; `nvidia-ml-py` is exempted deliberately.

Same pass exposed a second one: three transitive opencv variants (mediapipe →
`opencv-contrib-python`, ultralytics → `opencv-python`, albumentations →
`opencv-python-headless`) defeated the unification, and `pipPins` was forcing **two of
them at once** — so `import cv2` was last-writer-wins on every engine today. Unified to
`opencv-contrib-python-headless`, which is why `--no-deps` is load-bearing rather than an
optimisation: with deps, pip re-derives all three.

## NOT verified — deliberately not claimed

- **No real-engine install.** The card's own verify (`grep -icE "downloading
  (triton|nvidia)"` = 0, a `+cpu` torch tag, "Requirement already satisfied" far below
  400, zero `IMPORT FAILED`) needs the Linux/CPU box. Nothing here proves it.
- **ComfyUI has not booted against the curated set.** The venv proves the packages
  install and import; it does not prove all 15 universal nodes import inside ComfyUI. The
  Pod build's `IMPORT FAILED` grep (MPI-341) is that gate, and the Pod has not converged.

## Still open on this card

1. **Phase 1's `PIP_CONSTRAINT` file** for the local engine. Note that `--no-deps` makes
   it unnecessary for *this* install — the file cannot move torch because torch is not in
   it — so Phase 1's remaining value is narrower than when it was written.
2. **Pod convergence.** `mpi-ci/cubric-vision-pod` still bakes per-node deps and the
   wrapper still installs volume-node requirements. Needs a user-authorized image build.
   `requirementsDrop` + `_filterRequirements` are dead on the local path now and should be
   removed together with that step, not before.

*(Both resolved below on 2026-08-04.)*

---

# Phase 2 real-engine verification — DONE (2026-08-04, Linux box)

The verification the card had never had. Run on the Ubuntu test laptop against a REAL
engine (`~/Downloads/CubricVision-linux-x64-v1.3.0/engine`, uv-provisioned Python 3.12.13,
`torch 2.13.0+cpu`), driving the app's **own exported entry point** —
`startUniversalWorkflowInstall(<14 custom_nodes ids>, false, false)` under
`ELECTRON_RUN_AS_NODE=1` with the real `CUBRIC_*` env. No fabricated job, no hand-typed pip,
no port 3000. Only node ids were passed, so nothing downloaded and the sole remaining work
was the curated pass itself.

**Deployed to the box:** master's `routes/downloadManager.js` + `dev_configs/python_deps.txt`
(md5-matched both ends). The single-file swap was proven safe first — master's file requires a
strict SUBSET of the box's `shared.js` exports (it drops `runCustomCommand`, adds nothing).
Original saved at `app/routes/downloadManager.js.pre413`.

**Starting state (the honest baseline):** the engine was left half-provisioned by the
2026-07-31 MPI-411 session — 60 packages, ComfyUI core itself unable to boot
(`ModuleNotFoundError: No module named 'sqlalchemy'`). Core's `requirements.txt` was
installed first to repair that; it is the *precondition*, not the code under test. Notably it
resolved `kornia 0.8.3` and `transformers 5.14.1` — the exact drifted versions the curated
set exists to correct.

## The card's four metrics

| metric | target | measured |
|---|---|---|
| `grep -icE "downloading (triton\|nvidia)"` | 0 | **0** |
| torch carries a `+cpu` tag after | yes | **`2.13.0+cpu` / `0.28.0+cpu` / `2.11.0+cpu`** — byte-identical to before |
| "Requirement already satisfied" lines | far below 400 | **47** |
| zero `IMPORT FAILED` | 0 | **NOT OBTAINABLE ON THIS HARDWARE — see below** |

Plus, from the same run:

- **1 pip invocation**, not 13. Exact command logged:
  `python -m pip install -r <app>/dev_configs/python_deps.txt --no-deps --no-warn-script-location`
- The only `nvidia*` artefact anywhere in the log is `nvidia_ml_py-13.610.43` — the
  deliberate keep (pure-Python NVML, no CUDA runtime).
- Every curated pin landed: `kornia 0.8.3 → 0.8.2` (uninstall + install logged),
  `transformers 5.14.1 → 5.13.0`, `ultralytics 8.4.78`, `matplotlib 3.11.0`.
- **Exactly one opencv on disk** — `opencv_contrib_python_headless-5.0.0.93.dist-info`,
  `cv2.__version__ == 5.0.0`, `hasattr(cv2, 'ximgproc') == True`. Before the pass there was
  none; the three-variant race cannot occur.
- Marker stamped `a76364ad228dd931`. **Idempotence proven by a second run**: `curated python
  deps already installed (a76364ad228dd931)`, **0** pip invocations, returned in **0.6s**.
- 60 → 110 (core) → **183** packages.

## Why `IMPORT FAILED` could not be measured here — and it is NOT our bug

The box is an **Intel Core i3-2367M (Sandy Bridge, 2011) with no AVX2**. `import kornia_rs`
dies with `Illegal instruction (core dumped)`, so ComfyUI cannot finish booting on this
machine at all. Established as pre-existing and unrelated:

- The **BEFORE** run crashed identically, at `kornia/__init__.py:28`, on kornia **0.8.3**,
  before any curated package was installed.
- Isolated per-module check after the curated install: `kornia_rs` is the **only** failure.
  `torch`, `numpy`, `cv2`, `transformers`, `mediapipe`, `onnxruntime`, `ultralytics`,
  `albumentations`, `diffusers` all import clean.
- `kornia_rs` is pulled by **ComfyUI core's own** `kornia` requirement — it is in core's
  freeze, not an MPI-413 choice.

So the fourth metric stays with the gate the plan always named for it: the **Pod image
build's `IMPORT FAILED` grep** (MPI-341), which boots ComfyUI and imports every baked node on
a modern CI runner. That gate now covers the curated set directly, because the Pod installs
the same file.

## A real gap this run exposed (self-heal is narrower than claimed)

`_ensureCuratedPythonDeps` self-heals only when `_runCustomNodeInstall` runs, and
`POST /engine/repair-deps` **returns early** when `missingDeps + driftedDeps` is empty
(`routes/engine.js`) — before `startUniversalWorkflowInstall` is ever called. So on an engine
where every node folder is already present and un-drifted, repair-deps is a no-op and the
curated set never lands. That is exactly the box's state, and it is why the probe had to call
`startUniversalWorkflowInstall` directly.

Impact is bounded, not broken: a full engine install DOES run the curated pass (`engine.js`
→ `finishCustomNodeInstall`), and an engine provisioned by a pre-Phase-2 app already has the
old per-node deps, so nothing fails — it simply never converges onto the curated set. Worth a
follow-up; deliberately not fixed here (it is a `repair-deps` gating question, not a Phase 2
regression).

---

# Pod convergence — code DONE, ship pending (2026-08-04)

Both engines now install the same file. Written and self-verified; **not yet shipped** —
publishing the wrapper and building the image are user-authorized live ops.

## What the investigation changed vs the handoff's assumption

The handoff expected a wrapper rewrite. Measured instead:

- `install_command` / `pip_pins` are set **only** on `installRequirements: true` deps, and
  those are BAKED (`remoteModels._isImageResident`) and never volume-installed. Both branches
  of `_install_node_requirements` were **already unreachable** on the remote path.
- Of the 7 code-only volume nodes, fetched at their pinned commits, **exactly one ships a
  `requirements.txt`**: VideoHelperSuite → `opencv-python`, `imageio-ffmpeg`. So the live Pod
  was installing a SECOND cv2 build at connect — the precise last-writer-wins bug Phase 2
  removed locally.
- Dropping it is safe: VHS wraps the `imageio_ffmpeg` import in `try/except` and falls back to
  `shutil.which("ffmpeg")` (`videohelpersuite/utils.py:64-92`), and the image apt-installs
  ffmpeg. The local engine has never installed VHS's requirements either.

## The changes

| file | change |
|---|---|
| `mpi-ci/.../wrapper/wrapper.py` | `_install_node_requirements` DELETED; `_run_node_install` runs no pip; `_run_node_requirements_only` settles the job (nothing left to heal) and keeps the same complete SSE; `install_command`/`pip_pins` accepted-and-ignored so a released app keeps working. Version → `0.2.41`. |
| `mpi-ci/.../Dockerfile` | per-pack requirements loop REPLACED by `COPY python_deps.txt` + `pip install --no-cache-dir --no-deps -r /opt/python_deps.txt`; standalone MPI-131 kornia pin deleted (now a curated pin) with its `pad` assert kept and a `cv2`/`ximgproc` assert added. `PIP_CONSTRAINT`, `PIP_EXTRA_INDEX_URL`, the MPI-244 `+cu130` re-assert and the `IMPORT FAILED` grep all KEPT. |
| `mpi-ci/.../python_deps.txt` | new — the curated file in the build context, md5-identical to `dev_configs/python_deps.txt` |
| `.claude/commands/build-pod-image.md` | step 3a now copies BOTH generated files, with why they must move together |
| `mpi-ci/.../README.md`, `docs/runpod-remote-engine.md` § 6 | the Pod half documented |

Self-verified: `wrapper.py` parses (`ast.parse`), no dangling `_install_node_requirements` /
`install_command` / `pip_pins` references remain outside comments.

**SHIP ORDER IS LOAD-BEARING — wrapper first.** A new curated image running the OLD stable
wrapper would re-add `opencv-python` at connect and partially undo the unification. The
reverse is safe: the new wrapper on the current image finds opencv already baked, and ffmpeg
on PATH. So: `publish-runtime.sh dev` → restart Pod → test → `promote`, and only then build
the image.

Also spotted, not actioned: `Dockerfile:89` still defaults `COMFYUI_REF=v0.19.3` while the
lock says `v0.29.2` (harmless — CI passes the arg), and `remotePodLifecycle.js` pins
`WRAPPER_VERSION = '0.2.36'` while the wrapper file now self-reports `0.2.41`; that app-side
const gets synced at publish time (build-pod-image step 2).

---

# Phase 1 — CLOSED AS SUPERSEDED (2026-08-04)

A `PIP_CONSTRAINT` file for the local engine is no longer worth building. `runPipCommand` has
exactly ONE call site left in the local engine, and it runs `--no-deps` against a file with no
torch in it — so it is *structurally* incapable of moving torch, which is the only thing the
constraint existed to prevent. What stays unconstrained is comfy-cli's own pip during
`comfy install`, already guarded on macOS (pinned trio + `--skip-torch-or-directml`) and moot
on Windows (prebuilt archive, no pip) — a Linux-only sliver with no observed failure. Phase
1's first half (`--upgrade` removed from both call sites, commit `1b884a59`) shipped and
stands.
