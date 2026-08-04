# MPI-413 Plan — Phase 2: one curated pip file

Phase 1 (constrain every node pip) is **deferred by the user's call 2026-08-04** — Phase 2
runs first. Phase 1's first half already shipped: `--upgrade` is gone from both
`runPipCommand` call sites (commit `1b884a59`). Its second half — a `PIP_CONSTRAINT` file
for the local engine, mirroring the Pod's `ENV PIP_CONSTRAINT=/opt/constraints.txt` — is
still open and stays on this card.

## Open questions — settled 2026-08-04 from the files on disk

**Q1 — the `install.py` nodes.** `brief.md` claims ComfyUI-Frame-Interpolation's deps
"live only inside `install.py`'s logic, so no scanner can see them". That is **wrong**.
FI ships `requirements-no-cupy.txt` (`torch numpy einops opencv-contrib-python kornia
scipy Pillow torchvision tqdm`); `install.py` loops it one `os.system` pip per line —
which is where a chunk of the 13-invocation waste comes from — then calls
`install_cupy()`. Fully scannable.

Also only **1 of 7** `installRequirements` nodes runs a genuinely custom command.
`comfyui_controlnet_aux`'s `installRequirementsCommand` is
`python -m pip install -r requirements.txt --no-warn-script-location`, already equivalent
to the default path (its own comment at `nodesDeps.js:258` says so). The other five are
plain `requirements.txt`.

**cupy — DROP. Zero behaviour change.** Measured in the live engine 2026-08-04:
`cupy ABSENT, taichi ABSENT`, torch `2.13.0+cu130`, and FI loads. `cupy` is reachable only
through `vfi_models/ops`, which is imported by gmfss_fortuna / m2m / sepconv / stmfnet /
momo — and none of their `__init__.py` files import the arch at load time. We ship exactly
one FI node, `RIFE VFI` (`comfy_workflows/video_interpolate.json`, the only VFI
`class_type` in the repo), and RIFE never touches `ops`. Dropping cupy removes a build
that fails on every platform on every install (Evidence C) and changes nothing else.
Never carry `cupy-wheel`: it is a 2.9 kB source shim whose only job is the runtime CUDA
detection the curated file replaces.

**Q2 — platform variance.** Two real cases only. `onnxruntime-gpu` has never published a
macOS wheel → `; platform_system != "Darwin"`. `git+https://github.com/facebookresearch/sam2`
is already dropped on all three platforms (`nodesDeps.js:88` — needs `git`, which no
portable engine ships, and it is unused) → omit entirely. PEP 508 markers in the one file,
not per-platform files.

**Q3 — strictly additive.** Compile constrained by ComfyUI core's *frozen* set, then
subtract it. Core's own `requirements.txt` is itself unpinned (`torch`, `numpy>=1.25.0`,
`einops`, …), so "constrain against core" means "freeze what core actually installed".
`torch` / `torchvision` / `torchaudio` / `triton` / `nvidia-*` never enter the file —
engine provisioning owns them (`routes/engine.js` step 2b, the Windows portable archive,
comfy-cli's vendor branch).

**Q4 — `repair-deps` and the hard-fail fallback.** `repair-deps` becomes "reinstall the
aggregate": one marker, one pass, no per-node notion. A merged resolve that hard-fails
where sequential silently succeeded by last-writer-wins is a real conflict surfacing — it
fails the install rather than shipping a soft-broken engine, and the Pod image build's
`IMPORT FAILED` grep (MPI-341) catches an under-specified set in CI before a user sees it.

**Conflict the aggregate resolves (found while answering Q3).** Three opencv variants
install into the same `cv2` namespace today: `opencv-python` (controlnet_aux, RES4LYF),
`opencv-python-headless` (impact-pack, impact-subpack, kjnodes), `opencv-contrib-python`
(frame-interpolation). Current `pipPins` force **two of them simultaneously**, so which
`cv2` an engine ends up with is last-writer-wins. One resolve →
`opencv-contrib-python-headless` (superset, headless) satisfies all three.

## Phases

### Phase 2a: curated input + generated lock

`dev_configs/python_deps.in` — the curated INPUT. Union of the seven
`installRequirements` nodes' declared requirements with our decisions applied: cupy and
sam2 dropped, `onnxruntime-gpu` marked, opencv unified, existing `pipPins` folded in as
real pins. Hand-reviewed; this is the file a node bump edits.

`dev_configs/python_deps.txt` — the GENERATED lock. `uv pip compile --universal` over
`.in`, constrained by core's frozen set, with the torch family and everything core already
provides subtracted. Committed.

### Phase 2b: generator + drift check

`scripts/compile-node-deps.mjs` does both jobs, deliberately in one command so the
anti-drift gate and the generator can never diverge:

- `--check`: scan every `installRequirements` node's declared requirements and report
  anything not covered by `.in`.
- default: regenerate `.txt`.

### Phase 2c: consumer

`routes/downloadManager.js` installs `python_deps.txt` once behind a hash marker (same
shape as the existing `writeNodeCommitMarker`), then skips per-node `requirements.txt`,
`installRequirementsCommand` and `pipPins`. The marker makes it self-heal on engines
already on disk, which never re-run provisioning.

### Phase 2d: anti-drift docs

A mandatory step in `docs/playbooks/add-model/` (a new node with requirements → run the
script, review the diff, commit) plus a line in `.claude/rules/comfy_engine.md`, both
pointing at the one script. This is the user's explicit ask: the pass must exist so the
file cannot drift when nodes are added.

## Deliberately not in this phase

- **No CI compile job.** The script plus the playbook step is the gate; the Pod build's
  `IMPORT FAILED` grep already fails a bad set in CI. Add a job if the step is ever
  actually skipped.
- **Pod Dockerfile consuming the same file.** `mpi-ci/cubric-vision-pod` bakes deps at
  image-build time and installs volume nodes on connect via
  `wrapper.py _install_node_requirements`. Converging it onto `python_deps.txt` needs a
  user-authorized image build, so the remote twin stays on its current path until then.
  Flagged, not silently skipped.
- **Phase 1's constraint file.** Still open, still on this card.

## Verification

**Verify mode:** auto

- `scripts/compile-node-deps.mjs --check` reports 0 uncovered packages.
- `uv pip compile --universal` resolves clean.
- The generated `.txt` contains no `torch` / `torchvision` / `torchaudio` / `triton` /
  `nvidia-` entry.
- A throwaway `uv venv` installs the whole file in one pass with 0 conflicts.

Real-engine install verification (`grep -icE "downloading (triton|nvidia)"` = 0, a `+cpu`
torch tag, "Requirement already satisfied" count far below 400, zero `IMPORT FAILED`)
needs the Linux/CPU box and is NOT claimed by this phase.
