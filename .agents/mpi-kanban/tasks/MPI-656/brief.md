# MPI-656 Brief

**BLOCKED on MPI-655.** ~~MPI-654~~ shipped 2026-08-29 as `03b78041`. Both were
pre-existing install-state bugs that this feature converts from rare manual
accidents into routine one-click Settings actions.

### What MPI-654 changed, and why it helps this card

MPI-654's repro disproved its own brief. The stated case (weight in the default
root while a custom root is set) does **not** diverge — both readers already
fall back. The real divergence was the opposite: `resolveComfyPath` searched the
**whole custom root by basename** while `_localModelsCheck` searched the dep's
**bucket**, so a same-named weight in another bucket read installed to the
installer and not-installed to the library. It also aimed the uninstall delete
loop at unrelated user files.

The fix removed the duplicated resolution ladder: `_localModelsCheck` now
delegates to `resolveComfyPath`, and that search is bucket-scoped (the first
segment of `filename` IS the ComfyUI folder key). The `_findFile` twin is gone.

**Consequence for this card: there is now ONE resolver to make plural, not two
drifting copies.** The section below is written against the old two-copy world —
re-read `routes/shared.js` before planning. Evidence:
`tests/dep-path-agreement.test.cjs` asserts both readers agree AND are right
across 5 dep locations, and is proven to fail without the fix. Keep it passing.

**Status: direction agreed, not designed.** Maturity `blocked`, not `planned`.

## The ask

Model weights are large and users have three to six drives. A drive fills, they
add another path purely for more install capacity.

- Install a model. Main path has no room → the model installs **whole** to
  another root.
- Uninstall → removed from **every** root.
- Remove a path in Settings → the models that lived there read Not Installed and
  need reinstalling (or the path re-added).

Not a read-only annex, not a test surface. An **overflow pool**.

## Supersedes the earlier handoff

`~/.claude/plans/right-now-we-allow-radiant-rabin.md` recorded "downloads land in
the main path only — per-dep overflow was offered and declined; out of scope",
and framed three candidates (C1 read-only + refuse-uninstall, C2 per-root
managed/read-only checkbox, C3 virtual aggregate). **All three answer the wrong
question and are dropped.**

The reconciliation: *per-dep* overflow was declined. This is **per-model**
overflow — a different, simpler shape. Every "established fact" section of that
handoff is still accurate and worth reading; only the candidates are dead.

## Shape agreed

**N managed peer roots.** No read-only mode, no per-root checkbox. Every root
answers both evidence and deletion, so the load-bearing invariant ("a root must
answer BOTH or NEITHER") holds by construction rather than by discipline.

Overflow granularity is **per model**: a model that does not fit goes whole to a
root that does. Shared deps are the exception and are accepted as such — model Y
installing to `E:` finds an existing VAE on `D:` and does not re-download it. So
a model's exclusive weights have one home, its shared ones live wherever they
first landed. Consequence Fabio accepted (option A over self-contained roots):
**removing a root can affect models that were never installed to it.** The UI
must show, per model, which roots hold its weights, and root removal must warn
which models it affects.

## Why this is less dangerous than it feels

**The GC decision layer does not move.**

`_localSharedDepsMap` takes exactly one kind of input: booleans. `localModelsCheck`
hands it `{ id, installed: true|false }` per dep — there is not one path in the
function. With N peer roots, "installed" means "present in any managed root",
which stays the honest answer because peers are peers. Unchanged.
`_orphanedDepIds` is pure over `DEPS` × `protectedMap`. Unchanged.

Every historical incident lived in that layer:

| Incident | Layer |
|---|---|
| MPI-258 B1 — 19 GB undeletable | decision (mutual protection) |
| MPI-310 — 5.24 GB destroyed | decision (circular gate) |
| MPI-314 / 462 — 34 GB stranded | decision (no collector) |

What goes plural is the **execution** layer: find the copy, delete every copy,
which root owns this path, which root gets the write. That layer has no disaster
history, and its failure mode is a leak, never a deletion — a deleter that
cannot resolve a root skips.

## Call sites that go plural

- `_isInsidePath` ([routes/downloadManager.js:538](routes/downloadManager.js:538)) —
  three sites ([:301](routes/downloadManager.js:301),
  [:3037](routes/downloadManager.js:3037), [:3057](routes/downloadManager.js:3057)).
  Lexical `path.relative`, no `realpath`.
- `cleanEmptyDirs(path, stopAt)` — `stopAt` must be the **owning** root
  ([:311](routes/downloadManager.js:311), [:3083](routes/downloadManager.js:3083)).
- `_freeDiskBytes(targetDir)` at the disk gate
  ([:1682](routes/downloadManager.js:1682)).
- `resolveComfyPath` ([routes/shared.js:461](routes/shared.js:461)) — split
  "find existing" from "pick write target" (see MPI-654).
- `_localModelsCheck` ([routes/comfy.js:829](routes/comfy.js:829)).
- `buildExtraModelPathsYaml` ([routes/yamlHelper.js:36](routes/yamlHelper.js:36)) —
  already emits N blocks via a parameterised `_buildBlock`; ~6 lines.

Proposed containment: one module, `modelRoots.js`, exporting `getRoots`,
`findExisting`, `findAllCopies`, `pickWriteRoot`, `ownerRoot`. Every call site
becomes a one-liner against it, and the invariant becomes a property of ONE file
— `ownerRoot` and `findExisting` iterating the same list — testable as a pure
function with a fake root list, no app required. Today the invariant is an
emergent property of five scattered sites, so this is a net **reduction** in the
surface.

Suggested staging: make everything plural with exactly **one** root in the list
first. Behaviour identical, all tests pass, prove the refactor is a no-op. Only
then allow N.

## Hazards to design against

- **Free space does not sum.** `_freeDiskBytes` is `fs.statfs(dir)`. Two roots on
  the same drive report the same free bytes — a naive sum double-counts and the
  gate passes an install that cannot fit. Dedupe by **volume**, not by root.
- **Remove-a-path strands the bytes.** Dropping a root leaves its contents
  unreachable by sweep and uninstall alike — the MPI-314/462 leak class recreated
  by a UI button. Needs a confirm on removal: delete these, or keep them?
  (Open question: Fabio's stated model is "leave them, re-add the path and they
  come back". Not yet settled.)
- **Offline drive is indistinguishable from deleted.** Unplugged external/network
  root → models flip to Not Installed; a reinstall duplicates onto another root.
  Safe (the sweep only deletes what `pathExists`), wasteful, recoverable.
- **Nested roots.** Reject on add any root that is a prefix of, or prefixed by,
  an existing root — otherwise `ownerRoot` is ambiguous and `cleanEmptyDirs` can
  climb out of the child into the parent.
- **First `base_path:` wins.** `getCustomRoot`
  ([routes/shared.js:538](routes/shared.js:538)) regexes the FIRST `base_path:`
  in the whole YAML. Any new block must come after `comfyui:` or it silently
  becomes "the models path", aiming installs *and* the deleter at the wrong
  folder.
- **Never widen `findFileRecursive` basename matching to extra roots** — it would
  adopt a same-named different quant. Exact relative path only.

## Carried forward from the earlier handoff

- `routes/remotePodState.js` `_resolveLocalModelPath()`
  ([:79](routes/remotePodState.js:79)) needs the extra roots appended, or an
  extra-root LoRA works locally and fails only on a Pod. One line, on no delete
  path.
- **No hash verification on adoption.** A pre-existing file is trusted on
  filename — same as hand-dropping a weight into `G:\CubricModels` today. Not
  new, just more likely.
- Extra roots do not become `import-model` drop targets.
- Junctions (`mklink /J`, no admin, passes the lexical fence, zero GC code) would
  give "`diffusion_models/` lives on D:" for free — but dep filenames are flat
  `<bucket>/<name>`, so a junction can only move a whole bucket, never overflow
  per model. Recorded and not recommended.

## Docs to update whichever design wins

[docs/models-path.md](docs/models-path.md) (the contract),
`.claude/rules/comfy_engine.md` §5 (the "only loras and upscale_models" line),
`.claude/rules/downloads.md` (uninstall briefing, line 16),
`tests/extra-model-folders.test.cjs`.

Regression tests that must keep passing: `tests/plugin-dep-gc.test.cjs`,
`tests/shared-dep-uninstall-direction.test.cjs`.

## Open questions — ALL RESOLVED (2026-08-29). Planned: see `plan.md`.

1. ~~MPI-654 and MPI-655 shipped.~~ Both shipped (`03b78041`, `cf28a816`).
   MPI-655 is `validating` pending Fabio's look at its footer surface.
2. ~~Root removal: leave the files, or offer to delete them?~~ **Do not delete by
   default, and ask** — an `MpiCheckbox` unchecked by default inside the removal
   confirm. See `plan.md` § Phase 4, including why the removed uninstall
   "keep files" checkbox is NOT a precedent against this.
3. ~~Write-target policy?~~ **Main root first, then the first extra root with
   room.** Not most-free: that would push models onto a big slow drive while the
   fast one still had space.

One architecture decision was added during planning and is not in the design
above: **`model_roots.json` becomes the source of truth and the YAML a derived
artifact**, so `getCustomRoot()` stops regexing `base_path:`. See `plan.md`
§ Current State.
