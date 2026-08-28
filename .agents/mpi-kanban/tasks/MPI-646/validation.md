# MPI-646 — validation

Commit `bd2883fe` (pushed to master).

## PRE-CHECK (the gate the card set: any surviving pip run of a pack's requirements ⇒ reject)

Ran before any edit. Nothing survives on any path:

| Path | Evidence |
|---|---|
| Local install | `routes/downloadManager.js` — only read of the family is `dep.installRequirements === true` at :3032, in the **uninstall GC** (keep a pip-install node). No `runCustomCommand`; :40 records the step's removal at MPI-413. |
| Local engine deps | `ensureCuratedPythonDeps()` installs `dev_configs/python_deps.txt` in one `--no-deps` pass at `/comfy/start`. |
| Remote route | `routes/remoteModels.js:438` — "MPI-413: no `install_command` / `pip_pins` passthrough". |
| Pod wrapper | `mpi-ci/cubric-vision-pod/wrapper/wrapper.py:2498` accepts+IGNORES; `README.md:155` "The wrapper runs no pip at all." |
| Pod bake | `Dockerfile:214` — the clone loop filters on `e.get('installRequirements')`, the boolean, and never reads the command. Deps come from `python_deps.txt` with `--no-deps` (:238-260); the MPI-413 comment at :260 says the curated set "also retires the per-pack `installRequirementsCommand`". |

So the field was declared data with no consumer anywhere. Gate passed → proceed.

## Second gate: does deleting the command strand Frame-Interpolation's requirements file?

No. `python install.py` was what NAMED `requirements-no-cupy.txt`, but the drift checker
names it independently — `scripts/compile-node-deps.mjs:88`, the `REQUIREMENTS_FILE` map.
After the delete:

```
node scripts/compile-node-deps.mjs --check
  ComfyUI-Frame-Interpolation (requirements-no-cupy.txt): 9 declared
  ...
OK — every declared node requirement is covered by python_deps.in.
```

## What changed

| File | Change |
|---|---|
| `js/data/modelConstants/nodesDeps.js` | Field deleted from both entries — `ComfyUI-Frame-Interpolation` (`python install.py`) and `comfyui_controlnet_aux` (the non-upgrade pip line). Both comment blocks rewritten: the MPI-387 F3 cupy-wheel/exit-code story and the `--upgrade` override rationale described a path that cannot run, so they are now one short history note each. Net −60/+? on that file's comments. |
| `dev_configs/node_lock.json` | **Third site the card had not spotted** — the lock carried `"installRequirementsCommand": "python install.py"` on the same node. Deleted. Nothing reads it: the Dockerfile's loop reads only the boolean. |
| `tests/controlnet-aux-torch-guard.test.cjs` | Points 1-3 deleted (command exists / no `--upgrade` / starts with bare `python` / installs `-r requirements.txt`). Points 5-6 kept and renumbered 1-2 — the baked-vs-code-only split is live and decides Pod image contents. Header rewritten: the `--upgrade` hazard is stated as history, and the file now records that BOTH repairs (`pipPins` MPI-630, this one) were dead data kept alive by their own assertions. The MPI-630 point-4 placeholder folded into that header. |
| `tests/curated-python-deps.test.cjs` | Existing negative guard's message was stale ("the field itself stays — remoteModels.js still sends it to the Pod wrapper" — untrue since MPI-413); corrected. Added a second negative guard: the field must not come back as DATA in `nodesDeps.js`. |
| `docs/download-manager.md` | The "survives as data in `nodesDeps.js`" line replaced — both pip fields are now gone, with the `node_lock.json` site and the `REQUIREMENTS_FILE` fact recorded. Also dropped a reference to the field from the curated-set section. |
| `docs/playbooks/add-model/02-dependencies-r2.md` | The "do not add per-node pip pins" note said the command "survives as data on two entries"; now says the field no longer exists anywhere. |

## The new guard is negative-controlled both ways

`/^\s*installRequirementsCommand:/m` — anchored deliberately, because both entries still
NAME the field in prose while explaining the deletion. An unanchored regex fails on the
comments (it did, on the first run):

```
field line   -> true  (want true)
comment only -> false (want false)
```

## Tests

```
node scripts/compile-node-deps.mjs --check   OK, 9 declared for FI, all covered
npm test                                     773 pass / 0 fail
```

## Left alone, on purpose

`mpi-ci/cubric-vision-pod/node_lock.json` still carries the field. It is a **build-context
copy**, not hand-maintained there — `/build-pod-image` copies it from `dev_configs/`. It is
already stale by two whole nodes (`ComfyUI_Fill-ChatterBox`, `ComfyUI-MelodramaBox` are
missing), so syncing one line would hide the real drift rather than fix it. The next Pod
image build overwrites it, and the Dockerfile ignores the field regardless.
