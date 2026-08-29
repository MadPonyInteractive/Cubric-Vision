# MPI-655 Validation

## The brief's trace HELD — reproduced before any code was touched

Unlike its sibling MPI-654, every step of the code trace reproduced exactly as written.
`tests/partial-install-strands-weights.test.cjs` drives the REAL functions against a
throwaway `CUBRIC_ENGINE_ROOT` / `CUBRIC_MODELS_ROOT` tree (the MPI-654 harness pattern),
with `boogu-edit-high` as model Y — exclusive transformer `boogu-edit-transformer-high`
(19.17 GB), shared encoder `boogu-qwen3vl-8b-clip` (9.86 GB) that `boogu-edit-balanced`
also declares. Every dep placed on disk except the encoder:

1. `localModelsCheck` → transformer `true`, encoder `false`, model `installed: false`. ✔
2. `deriveInstalledOps` → `installedOps: []`, `fullyInstalled: false` — Boogu has no arch
   axis, so this is the only live term in `anyInstalled`, and the card shows Install. ✔
3. `_localSharedDepsMap(null)` → the transformer IS protected. ✔
4. `_orphanedDepIds(protectedMap)` → the transformer is NOT an orphan; the sweep skips it. ✔

**Negative control** (same file, step 0): on an EMPTY tree the same two calls say the
transformer is undefended and IS an orphan. So the protection in step 3 is earned by the
exclusive weight being present — it is not some flow/plugin/universal set defending the id
unconditionally, which would have made step 3 pass for the wrong reason.

## The fix, and why it is not in the decision layer

`js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js` only — the detail
footer's `else` branch renders a secondary **Remove files** beside Install when
`st.partial.hasPartialProgress`, routed to the existing `_confirmWholeUninstall`. No new
derivation: `_computePartial` already means "≥1 GB of this model's OWN deps on disk, not
all of them", with shared deps an installed sibling owns excluded. Zero lines in
`routes/downloadManager.js` — the MPI-310 exclusive-evidence rule is untouched, which is
the trap the brief named.

## Proven in the running app

`npm run app:isolated` against a fully-stubbed sandbox engine + models root (fake
`.mpi_engine_version` + python bin so the install gate is skipped; every universal-workflow
dep stubbed and every node folder given its pinned `.mpi_node_commit`, so the boot repair
downloaded nothing). Boogu Image Edit seeded minus the encoder:

- tile chip: `66% on disk` — the partial state, as expected;
- detail footer: **INSTALL** and **REMOVE FILES** (screenshot taken);
- clicked Remove files → the ordinary Uninstall confirm → server log:
  `uninstall boogu-edit-high: removed 2, kept 4 universal, 0 shared, 1 model files, swept 0 orphaned`;
- on disk: `models/diffusion_models/` and `models/vae/` gone, empty dirs cleaned. The
  19.17 GB weight is reclaimable.

The user's real engine and `G:\CubricModels` were never touched — a first attempt that
faked only the engine stamp armed the universal-workflow repair and pulled 1.5 GB into the
sandbox before it was killed; the seed now stubs that whole set, which is why the second
run downloaded nothing.

## Regression surface

`npm test` — 776/776 pass, including the two the brief named
(`tests/plugin-dep-gc.test.cjs`, `tests/shared-dep-uninstall-direction.test.cjs`) and
`tests/dep-path-agreement.test.cjs` from MPI-654. `npx eslint` clean on both changed files.

## Left for Fabio

The confirm dialog still reads "Uninstall Boogu Image Edit?" when the model was never
usable. It is literally accurate (the click runs the uninstall route) and the body sentence
about shared files is the part that matters, so the heading was left alone rather than
given a second variant.
