# MPI-710 — the top-level `update-manifest.json` reads stale on a real install

Spun out of MPI-709 (2026-09-08), which found it while proving the 1.5.0 delta bug.
**Not blocking the 1.5.0 re-cut.**

## Symptom

`resources/cubric/update-manifest.json` on a real install read **1.3.0** while the
install was actually running **1.5.0** — stale by two whole updates.

## Why it matters, and why it is not a P0

MPI-709's root-cause fix deliberately reads the installed version from the app's own
`package.json`, **not** from this manifest, precisely because the manifest was measured
stale. So the delta guard is not exposed to it. What is unknown is who else reads it,
and whether any of them are load-bearing.

## The trap for whoever picks this up

MPI-523's unit test for this manifest **passes**. The staleness is therefore not a
logic bug the test can see — it is something about how the manifest is written or
staged during a real in-place update that the test does not model. Start by asking why
a green test and a stale file can coexist; do not start by editing the test.

## First steps

- `grep` every reader of `update-manifest.json` and classify each as load-bearing or not.
- Reproduce on a real installed portable (not `npm start`) across an in-place update.
- Compare what `build-portable.mjs` stages into the bundle against what `apply-update.cjs`
  leaves on disk afterwards.
