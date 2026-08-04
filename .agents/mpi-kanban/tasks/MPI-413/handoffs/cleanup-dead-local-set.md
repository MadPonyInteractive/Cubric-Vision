# MPI-413 — delete the dead local set (cleanup note, 2026-08-04)

The Pod half of MPI-413 has SHIPPED to dev and is live-verified, which is what this
cleanup was waiting on. Everything below is now unreachable code. This is the last
implementation item on the card; `promote` + the stable `POD_IMAGE_VERSION` bump are
NOT part of it (they belong to the release).

## Why it is safe — verified 2026-08-04, do not re-derive

All **7** deps that carry `requirementsDrop` / `pipPins` / `installRequirementsCommand`
are `installRequirements: true`:

| dep | pins | drop | cmd |
|---|---|---|---|
| ComfyUI-LTXVideo | 1 | — | — |
| ComfyUI-Impact-Pack | 6 | yes | — |
| comfyui-kjnodes | 5 | — | — |
| ComfyUI-Frame-Interpolation | 4 | — | yes |
| ComfyUI-Impact-Subpack | 5 | — | — |
| RES4LYF | 2 | — | — |
| comfyui_controlnet_aux | 6 | yes | yes |

`installRequirements: true` ⇒ **baked into the Pod image, never volume-installed** ⇒ the
`remoteModels.js` passthrough can never fire, under **any** wrapper version. So this does
NOT need to be coupled to the release, and it does not regress a released user.

Locally the per-node step is already gone — `downloadManager.js` installs
`dev_configs/python_deps.txt` once via `_ensureCuratedPythonDeps()` and skips every
node's `requirements.txt`.

## Targets (line numbers as of commit `958fe9da`, re-grep before editing)

1. `routes/downloadManager.js:471` — `requirementsDrop: dep.requirementsDrop || null,`
   in `_createDepJob`.
2. `routes/downloadManager.js:3108` — `function _filterRequirements(...)`.
3. `routes/downloadManager.js:3133` — its `_filterRequirements` export.
4. `routes/downloadManager.js:2454` — the comment block explaining what the per-node
   step *used to be*. **Keep the first sentence** ("No per-node requirements step here
   any more — MPI-413…"); it explains why the loop is absent. Delete only the bullets
   describing fields that no longer exist.
5. `js/data/modelConstants/nodesDeps.js:88` and `:291` — the two `requirementsDrop`
   entries (sam2 drop; `{ darwin: ['onnxruntime-gpu'] }`).
6. `tests/requirements-filter.test.cjs` — delete the whole file. It tests
   `_filterRequirements` plus asserts `_createDepJob` still carries `requirementsDrop`,
   so it fails by design once (1) and (2) go.
7. `routes/remoteModels.js:412` and `:417` — the `install_command` / `pip_pins`
   passthrough (`body.install_command = …`, `body.pip_pins = …`).

## Do NOT delete

- `installRequirements` itself — still load-bearing, it decides Pod BAKE vs VOLUME.
- `dev_configs/python_deps.in` / `.txt` / `scripts/compile-node-deps.mjs`.
- `tests/curated-python-deps.test.cjs` — guards the torch-stack and single-opencv
  invariants; unrelated to the files above.
- The `getPinnedNodeCommit` / `body.commit` line in `remoteModels.js` (MPI-222 drift
  detection) — it sits right beside the passthrough and is still live.

## Doc that goes stale the moment you delete (7)

`docs/runpod-remote-engine.md` § 6, the "Python deps = ONE curated set" bullet, says:

> `install_command` / `pip_pins` are still SENT by `remoteModels.js` (a released app
> must keep working) and are accepted-and-ignored by the wrapper

That sentence becomes false. Rewrite it to say they are gone from the app and why it
was safe (the table above), in the same edit.

## Verify

- `node --test "tests/*.test.cjs"` — green. Baseline before this cleanup was **392/0**
  (which INCLUDES `requirements-filter.test.cjs`, so expect the count to drop by its
  test count, not to stay at 392).
- `npx eslint routes/ js/data/modelConstants/nodesDeps.js` — 0 errors, no new warnings.
- `grep -rn "requirementsDrop\|_filterRequirements\|pip_pins\|install_command" routes/ js/ tests/`
  returns nothing but comments you deliberately kept.
- Nothing to re-test on a Pod: this removes app-side code that provably never executed.
