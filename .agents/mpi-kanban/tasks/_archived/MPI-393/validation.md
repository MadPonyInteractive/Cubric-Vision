# MPI-393 Validation

Found live 2026-07-29 during the MPI-385 sweep connect, fixed the same session.

## The chain (all three hops are code, not inference)

1. `routes/remoteModels.js:313` — drift is **dep-level**: one `custom_nodes` folder whose
   `.mpi_node_commit` disagrees with `node_lock`. The heal for that is a re-clone, KB-scale.
2. `js/data/modelRegistry.js:193` (old) — `if (depResult.drifted) drifted.push(model.id)`.
   The dep identity was **discarded**; only the owning model id survived.
3. `js/shell.js:1412` (old) — the heal re-expanded that model id into
   `resolveFullUniverse(model)`: every weight the model has.

The volume pre-check dedupes what is already there, which is why the comment claimed this
was near-free — **true for a fully-installed model, false for a partial one**, where the
"heal" downloads every missing weight. Serial, silent, no prompt, nothing in `app.log`.

## What it did live

A recreated Pod (`pod not found` → fresh, image `v0.17.0-dev-cu130`) reads most volume nodes
as stale at once, so many models drifted together:

- volume **133.5GB → 140.6GB of 150GB** in about a minute
- unrequested `installed` toasts: SDXL Realistic, LTX 2.3, Qwen
- **MODELS climbed 0/18 → 4/18** — the heal *completing* partial installs is the smoking gun
- `[WARN] [download] remote install blocked — volume full: need 6.5 GB, have 2.3 GB free`
- the chain took back any space the user freed, so models could not be uninstalled

Note LTX in that list: MPI-385's own brief says **"LTX is needed by NOTHING on this sweep —
do not download it."** The heal downloaded it anyway.

## The fix

Dep-level all the way through. `_driftedNodeDeps = [{ modelId, depIds }]` replaces
`_driftedModelIds`; `getDriftedNodeDeps()` is new, `getDriftedModelIds()` stays as a derived
one-liner for the `models:checked` payload. `_healRemoteNodeDrift` installs `depIds` only,
and logs each re-clone.

Blast radius checked before editing: `getDriftedModelIds` had **exactly one** consumer (the
heal), and the `driftedModelIds` field on `models:checked` has **none** — so the surface
could go dep-level without touching any other consumer.

Drifted deps still carry `drifted: true` → `forceReinstall` → wrapper `force: true`, so the
MPI-222 `already_installed` short-circuit stays fixed. That flag chain is untouched and its
existing tests still pass.

## Proven

- `node --test tests/*.test.cjs` → **286/286, 0 failures** (282 baseline + 4 new).
- `npx eslint js/shell.js js/data/modelRegistry.js` → clean.
- **Negative control:** the old model-level + full-universe selection queues
  `sdxl-realistic-ckpt` and `sdxl-refiner-ckpt` for a single drifted node, so
  `heal: a drifted node on a PARTIAL model installs the node only` fails on pre-fix logic.
- New tests live in `tests/node-drift.test.cjs` beside the existing drift mirrors: partial
  model, no-drift no-op, two nodes on one model, and the multi-model case that reproduces the
  live blow-up shape.

## LIVE-PROVEN — 2026-07-30, MPI-385 sweep, Pod qrpnumt8p1rm31 (L4, EU-RO-1)

The natural connects that day had **no drift** (the 07-29 connect had already consumed it),
so the heal was silent twice — correct, but only negative evidence. The positive leg was
then **manufactured deliberately**: real drift was seeded by installing `comfyui-krea2edit`
onto the volume at its OLD v1.1 commit (`17af8833`) via a temp route that POSTed
`/wrapper/models/install` directly with `commit` overridden — the normal
`remoteInstallDep` path deliberately stamps `getPinnedNodeCommit()` (the CURRENT pin),
which would have defeated the seed. Seed verified before the run: `POST /comfy/models/check`
returned `drifted: true` for the dep. Temp route reverted after use.

Fresh app session (restart — the heal is latched per session), auto-connect, and the heal
fired on the connect edge. All three live acceptance points:

1. **Log lines present** (old code was silent):
   `remote drift heal: re-cloning 1 node(s) for krea2 — comfyui-krea2edit` (14:56:54Z)
   `remote drift heal: re-cloning 1 node(s) for krea2-nsfw — comfyui-krea2edit` (14:57:01Z)
   — both owning models processed serially, the node id named on each.
2. **Node-only re-clone.** `/comfy/downloads/status` held jobs `krea2` and `krea2-nsfw`,
   each with EXACTLY ONE dep — `comfyui-krea2edit`, **46,080 bytes**. Both models are
   PARTIALLY installed on the volume, which is precisely the shape the old code exploded on
   (it would have queued both models' full multi-GB universes right there).
3. **Volume flat.** 139,360,243,342 → 139,360,272,626 bytes = **+29KB** across the heal.
   No unrequested install toast, no weight job.

Post-heal `POST /comfy/models/check`: `installed: true`, no `drifted` flag — the volume
node is back at the pinned `223a9383` (v1.2.2). The seed→heal round-trip also re-proves the
MPI-346 drift ladder end-to-end on a live Pod.
