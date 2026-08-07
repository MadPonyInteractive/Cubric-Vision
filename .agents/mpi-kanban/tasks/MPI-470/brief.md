# MPI-470 - Deprecate Wan 2.2 text-to-video

Requested by the user 2026-08-07. Scope agreed BEFORE any edit — the three forks below
were the user's call, not defaults.

## Why

`wan-22` (Wan 2.2 Smooth 14B) carried two ops with **separate** weights:

| op | weights | provenance |
|---|---|---|
| `t2v_ms` | `wan-22-t2v-high` + `wan-22-t2v-low`, 13.55GB each | DigitalPastel/Smooth Mix Wan 2.2 14B (CivitAI 1995784), `allowNoCredit: false`, no badge |
| `i2v_ms` | `wan-22-i2v-high` + `wan-22-i2v-low`, 13.32GB each | **our own merge** (Mad Pony Interactive) |

LTX 2.3 owns text-to-video now (and H3 and the 5B card both still offer it), so the t2v
pair earns neither its 27.1GB nor its third-party-licence exposure. The i2v merge is ours
and has no substitute — it stays.

## The three decisions

1. **`wan-22` `t2v_ms` only.** `wan22-5b` is untouched: its `t2v`/`i2v` share ONE
   combined transformer, so dropping its t2v would save zero disk and be pure UI loss.
   `wan-22` `i2v_ms` survives.
2. **`wan-22-t2v-high/low` STAY in `modelDeps.js`.** `_orphanedDepIds` in
   `routes/downloadManager.js` iterates `DEPS` and trashes anything no model's dep list
   protects. Keeping the entries is what lets the uninstall sweep reclaim the 27.1GB
   **already on existing users' disks**. Deleting them would blind the sweep and strand
   those two files forever, untracked, with nothing in the app able to remove them.
3. **R2 + the HF mirror keep serving the files.** No live destructive op this session.
   Released builds that still list the dep keep installing rather than 404ing.

## What changes

- `js/data/modelConstants/models.js` — `wan-22`: `supportedOps`, `workflows`,
  `operations` lose `t2v_ms`; description stops advertising text-to-video.
- `js/data/modelConstants/modelDeps.js` — the two t2v deps get a DEPRECATED note saying
  why they are still here (decision 2). Nothing removed.
- `js/data/progressStages.js` — the `wan22_t2v.json` row goes with the graph.
- Graphs deleted: `comfy_workflows/wan22_t2v.json`, `comfy_workflows/raw/
  wan22_t2v_template.json`, `comfy_workflows/scripts/workflow_generation/
  wan22_t2v_template.json`. `generate_wan.py` is template-driven (one output per
  template), so removing the template removes the output — no generator branch to cut.
- `tests/desktop/model-ops-resolver.spec.js` — asserted `selectable ==
  ['i2v_ms','t2v_ms']` and that a t2v-only resolve excludes the i2v node pack. Both
  retargeted.
- MPI-453's comments in `js/data/modelRegistry.js` and `MpiGalleryBlock.js` used "Wan 2.2
  opens on `t2v_ms` with only the i2v weights on disk" as their worked example. The code
  is unchanged and still correct; the example is now impossible, so the comments say so.

## Deliberately NOT done

- **Not flattened to `dependencies`.** With one op left, `wan-22` keeps its
  `commonDeps` + `operations{}` shape, so it stays the app's only live exemplar of the
  op-keyed resolver (op drafts, per-op install toggles, `requiresOps` cascade,
  `deriveInstalledOps`). Flattening would leave that whole subsystem with no shipped
  model exercising it. Cost of keeping it: the Model Library renders a lone
  "Image to Video" toggle. Unticking it and installing immediately would fetch
  `commonDeps` only (~6.5GB, useless) — `_draftFor` refuses to honour an empty *saved*
  draft, so it cannot persist.
- **`release-baselines/*.json` untouched** — they are the PREVIOUS release's manifests,
  regenerated at release time. The deleted graph correctly shows up as a removal in the
  next delta bundle.
- **`releaseNotes.js` untouched** — keyed to `APP_VERSION`; `mpi-version-bump` writes the
  user-facing line at the next bump. Worth one there: an op disappears from a card users
  already own.

## Downstream

MPI-467's smoke-run budget recomputes from the registry, so it needs nothing from here —
its 312.2GB drops to 285.1GB once this lands.
