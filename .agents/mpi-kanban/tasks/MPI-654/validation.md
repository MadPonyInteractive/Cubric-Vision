# MPI-654 Validation

## The repro came first — and the brief's direction was wrong

Sandboxed harness (`CUBRIC_ENGINE_ROOT` + `CUBRIC_MODELS_ROOT` at a temp tree, a
fake `extra_model_paths.yaml` with a custom `base_path`), calling the REAL
`localModelsCheck` (`routes/comfy.js`) and the REAL `resolveComfyPath`
(`routes/shared.js`) for the same dep. The user's engine was never touched.

Six scenarios, before any edit:

| scenario | library | installer |
|---|---|---|
| weight in its own bucket under the custom root | true | true |
| **weight in the DEFAULT root, custom root set — the brief's case** | **true** | **true** |
| **same-named weight in another bucket under the custom root** | **false** | **true** ← the only divergence |
| weight nested inside the right bucket | true | true |
| nothing on disk | false | false |
| partial (download marker present) | false | false |

**The brief's scenario does not reproduce.** Both readers already fell back to
the default root — the fallback the brief says the installer lacks is at
`routes/shared.js:487`, and the harness shows it firing. The brief was a code
trace, and it read the wrong line.

The real divergence runs the OTHER way, and it was in the brief's own list of
traps: `resolveComfyPath` searched the **whole custom root by basename**, while
the library searched the dep's **bucket**. So a same-named file in another bucket
(a different quant, or anything the user already had there) read *installed* to
the installer and *not-installed* to the library. User-visible: the badge never
flips, and clicking Install downloads nothing because every dep already looks
complete.

Two more consequences of the wide search, neither of them noticed before:

- The weight the installer adopts is in a bucket ComfyUI's folder-type mapping
  never points the consuming node at — so the generation fails to find the model
  even though the installer said it was there.
- The **uninstall delete loop** (`routes/downloadManager.js:3009`) resolves the
  path to `fs.remove`. The wide basename search aimed it at a user's unrelated
  same-named file in another bucket.

## The fix — one ladder, bucket-scoped

Root cause is the duplication itself: two copies of the same
targetPath → custom_nodes → custom-root → default-root ladder, drifting
independently. MPI-607 was the first drift (missing `targetPath` branch); this is
the second.

- `routes/shared.js` — `resolveComfyPath` searches the dep's own bucket
  (`path.dirname(filename)`'s first segment), recursive inside it.
- `routes/comfy.js` — `_localModelsCheck` deletes its copy and delegates to
  `resolveComfyPath`. `_findFile` (a byte-for-byte twin of `findFileRecursive`)
  and two now-dead locals went with it: **−45 lines**.
- `docs/download-manager.md` — records that one resolver owns the question, and
  why the search must stay bucket-scoped.

## Evidence

- `tests/dep-path-agreement.test.cjs` (new): the two readers must agree, and
  agree on the right answer, across five dep locations. **Verified it fails
  without the fix** — reverting the bucket scope in `shared.js` and re-running
  gives `both readers agree about a same-named weight in the WRONG bucket and
  both are WRONG — expected false`. Restored, it passes.
- Harness re-run after the fix, extended with `custom_nodes` (installed, and the
  weight-only-shell case) and a `targetPath` weight to prove the delegation did
  not regress MPI-387 F1 or MPI-607: **9/9 agree, 0 failures**.
- `npm test`: **774 pass, 0 fail** (16.8s).

## Not done here

Additive `loras`/`upscale_models` folders (`extra_model_folders.json`) are
searched by ComfyUI but by neither reader. Same seam, different question —
that belongs to MPI-656.
