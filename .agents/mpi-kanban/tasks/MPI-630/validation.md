# MPI-630 Validation

## The premise, checked FIRST (the card's own gate)

The card said: close as **rejected** if any pip install of a pack's `requirements.txt`
survives somewhere the Pod Dockerfile comment does not describe. It does not. Three
independent reads, all agreeing:

| path | evidence |
|---|---|
| Local engine | `routes/downloadManager.js` — "No per-node requirements step here any more — MPI-413. The engine installs ONE curated set (`ensureCuratedPythonDeps`)". No code reads `pipPins`; `_createDepJob` never carried the field. |
| Remote route | `routes/remoteModels.js:438` — "MPI-413: no `install_command` / `pip_pins` passthrough". |
| Pod wrapper | `mpi-ci/cubric-vision-pod/wrapper/wrapper.py:2498` — `install_command` / `pip_pins` in the body are "accepted and IGNORED"; `README.md:155` — "The wrapper runs no pip at all." |
| Pod image | `cubric-vision-pod/Dockerfile:242` — the clone block installs nothing with pip; `COPY python_deps.txt` + one `--no-deps` pass is the whole dependency story. |
| Pod boot | `start.sh` — the volume-node `requirements.txt` loop is short-circuited whenever `/opt/python_deps.txt` exists (every curated image), and it never scanned baked nodes at all. |

So every `pipPins` array corrected a pip run that happens nowhere. Proceeded.

## What shipped

- `js/data/modelConstants/nodesDeps.js` — `pipPins` removed from all 8 entries that had
  it (LTXVideo, Impact-Pack, kjnodes, Frame-Interpolation, Impact-Subpack, RES4LYF,
  controlnet_aux, Fill-ChatterBox, MelodramaBox). The comments each pin justified were
  kept as knowledge and re-pointed at `dev_configs/python_deps.in`, which is where those
  versions actually live now — the LTXVideo `kornia==0.8.2` / `pad` trap especially.
- `tests/node-drift.test.cjs` — the MPI-222 `installRequirements:true ⇒ non-empty pipPins`
  invariant and its cross-node pin-conflict sibling are deleted, with a comment saying why
  so nobody reinstates them. Shared-package agreement is structural now: `python_deps.in`
  is ONE set, so a package cannot have two versions.
- `tests/controlnet-aux-torch-guard.test.cjs` — assertions 4 and 5 (the only `pipPins`
  ones) dropped, remaining checks renumbered. The `installRequirementsCommand` half of
  that guard is untouched.
- `routes/downloadManager.js` — the stale "`pipPins` below stays the corrective path"
  comment, which pointed at code MPI-413 had already deleted.
- `docs/download-manager.md`, `docs/playbooks/add-model/02-dependencies-r2.md` — the
  playbook was telling every future model author that pins are "remote-only, keep them
  accurate", which was already false before this card.

## Verification

| check | result |
|---|---|
| `node scripts/compile-node-deps.mjs --check` | **exit 0** — "every declared node requirement is covered by python_deps.in", across all 10 packs with a requirements file |
| `node --test tests/node-drift.test.cjs` | 24/24 pass |
| `node tests/controlnet-aux-torch-guard.test.cjs` | all assertions passed |
| `node --test tests/curated-python-deps.test.cjs` | 1/1 pass |
| `npm test` (full suite) | **773 pass, 0 fail**, exit 0 |

Every version the deleted pins carried was checked present in `python_deps.in` by hand
before deleting them: kornia 0.8.2, numpy 2.5.1, scipy 1.18.0, scikit-image 0.26.0,
matplotlib 3.11.0, pillow 12.3.0, color-matcher 0.6.0, mss 10.2.0, ultralytics 8.4.78,
dill 0.4.1, einops 0.8.2, `transformers[timm]` 5.13.0, safetensors, diffusers, and the
single deliberate opencv build (`opencv-contrib-python-headless==5.0.0.93`).

## Left open

`.claude/rules/comfy_engine.md:34` already calls `pipPins` dead data, but its closing
clause — "They survive only as fields in `nodesDeps.js`, pinned by
`tests/node-drift.test.cjs`" — is now stale. Rule files are not edited without explicit
permission (CLAUDE.md § 5), so it is flagged, not changed.

No release-note entry: nothing user-visible changed. No engine or Pod rebuild is implied
— the data was inert on both.
