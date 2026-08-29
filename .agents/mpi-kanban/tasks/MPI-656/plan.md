# MPI-656 Plan — Multiple model roots: install overflow across drives

## Current State

**Project mode:** `scalable-foundation`. Full guardrails, no prototype shortcuts,
decisions front-loaded rather than deferred into implementation.

**Goal.** Users have 3–6 drives. A drive fills; they add another path purely for
install capacity. A model that does not fit the main root installs **whole** to
another root. Uninstall removes it from **every** root. Removing a path in
Settings makes the models that lived there read Not Installed.

**Design agreed in brainstorm** (full reasoning in `brief.md` — read it first):
N **managed peer** roots. No read-only mode, no per-root checkbox. Every root
answers both evidence and deletion, so the invariant *"a root must answer BOTH
or NEITHER"* holds by construction. Overflow granularity is **per model**.
Write-target policy is settled: **main root first, then the first extra root
with room** — not most-free, which would push models onto a big slow drive while
the fast one still had space.

**Blockers cleared.** MPI-654 (`03b78041`) unified the two drifting resolution
ladders into one bucket-scoped `resolveComfyPath`. MPI-655 (`cf28a816`) split
`anyInstalled`'s two jobs so a half-installed model can hand its bytes back.
MPI-655 is `validating` — its UI surface wants Fabio's eyes before it closes.
Both shipped with regression tests that must keep passing:
`tests/dep-path-agreement.test.cjs`, `tests/partial-install-strands-weights.test.cjs`.

### The constraint that shapes every phase

**The GC decision layer does not move.** `_localSharedDepsMap`
([routes/downloadManager.js:155](routes/downloadManager.js:155)) takes only
booleans — there is not one path in it. `_orphanedDepIds` is pure over
`DEPS` × `protectedMap`. All four historical incidents lived in that layer:
MPI-258 B1 (19GB undeletable), MPI-310 (5.24GB **destroyed**), MPI-314/462
(34GB stranded). What goes plural is the **execution** layer only. Its failure
mode is a leak, never a deletion — a deleter that cannot resolve a root skips.

**A diff touching `_localSharedDepsMap` or `_orphanedDepIds` is a failed
implementation, not a bonus.**

### Architecture decision front-loaded (scalable-foundation)

**Invert the source of truth for the roots list.** Today `getCustomRoot()`
([routes/shared.js:538](routes/shared.js:538)) regexes the **first** `base_path:`
in `extra_model_paths.yaml`. `buildExtraModelPathsYaml` already emits two blocks
(`comfyui` + `comfyui_default`) and the regex happens to hit the right one only
because of emit ordering. With N root blocks that ordering becomes load-bearing
and invisible — the brief lists it as a hazard, but the real fix is to stop
parsing the YAML at all.

Make **`model_roots.json` the source of truth** (ordered list, main first) and
the YAML a **derived artifact** regenerated from it. `extra_model_folders.json`
already works exactly this way, so this is the existing pattern, not a new one.
This deletes a hazard class rather than guarding it.

### Investigation

No read-only investigation sub-agents were spawned. The investigation for this
card was already performed in the brainstorm session that produced `brief.md`
(every call site read and line-referenced against source), and Fabio drives
agent dispatch himself in this project. Re-deriving it cold would cost context
and add nothing. If implementation reveals a gap, record it under `Plan Drift`.

## Completed

- [ ] Nothing yet.

## Remaining Work

## Phase 1: One resolver owns the root list — still exactly ONE root

Foundation. Behaviour must be **identical** at the end of this phase; the whole
point is proving the refactor is a no-op before any second root exists.

- [ ] Create `routes/modelRoots.js` exporting `getRoots()` (ordered, main first),
      `findExisting(relPath)`, `findAllCopies(relPath)`, `pickWriteRoot(relPath, bytes)`,
      `ownerRoot(absPath)`. `ownerRoot` and `findExisting` MUST iterate the same
      list — that shared iteration IS the both-or-neither invariant, and is the
      reason this lives in one file instead of five call sites.
      **Verify:** new `tests/model-roots.test.cjs` drives all five exports against
      a fake root list with no filesystem and no app: every path `findExisting`
      returns is a path `ownerRoot` claims, and vice versa, including the
      negative cases (path outside every root → `ownerRoot` null → `findExisting`
      never returned it).
- [ ] Add `model_roots.json` beside `extra_model_folders.json`, with a migration
      that seeds it from the existing YAML `base_path` on first read. Repoint
      `getCustomRoot()` to read JSON, never the regex.
      **Verify:** with a pre-existing yaml-only install, first call produces a
      `model_roots.json` whose single entry equals what the old regex returned;
      assert against a temp tree, engine untouched.
- [ ] Regenerate the YAML from `model_roots.json` in `buildExtraModelPathsYaml`
      ([routes/yamlHelper.js:36](routes/yamlHelper.js:36)) — `_buildBlock` is
      already parameterised over the block key.
      **Verify:** `npm test` green including `tests/extra-model-folders.test.cjs`;
      byte-compare generated YAML before/after the refactor for a single-root
      install — it must be **identical**.

## Phase 2: Route every call site through the module — still ONE root

- [ ] Replace the five execution-layer sites with `modelRoots.js` calls:
      `_isInsidePath` → `ownerRoot` ([:301](routes/downloadManager.js:301),
      [:3037](routes/downloadManager.js:3037), [:3057](routes/downloadManager.js:3057));
      `cleanEmptyDirs` `stopAt` → the **owning** root
      ([:311](routes/downloadManager.js:311), [:3083](routes/downloadManager.js:3083));
      `_freeDiskBytes` target ([:1682](routes/downloadManager.js:1682));
      `resolveComfyPath` ([routes/shared.js:461](routes/shared.js:461));
      `_localModelsCheck` ([routes/comfy.js:829](routes/comfy.js:829)).
      **Verify:** `npm test` fully green (776+/776+), `npm run lint` clean, and
      `git diff` shows **zero** changes inside `_localSharedDepsMap` and
      `_orphanedDepIds`.
- [ ] Prove the no-op in the running app: install a small model, uninstall it,
      confirm bytes land and are reclaimed exactly as before. Own instance via
      `npm run app:isolated` — never `:3000`, never `G:\CubricModels`.
      **Verify:** install → files on disk under the single root; uninstall →
      `removed` non-empty, empty dirs cleaned, no shared dep taken.

## Phase 3: Allow N roots

- [ ] `pickWriteRoot`: main root first, then the first extra with room.
      **Verify:** unit test — main with room → main; main full → first extra with
      room; every root full → null (caller raises the existing disk-full gate).
- [ ] Disk gate: measure per root and **dedupe by volume**, not by root — two
      roots on one drive report the same `fs.statfs` free bytes and a naive sum
      double-counts, passing an install that cannot fit.
      **Verify:** unit test with two roots on one fake volume asserts the summed
      capacity counts that volume once.
- [ ] Uninstall deletes **every** copy in **every** root (`findAllCopies`).
      Leaving one behind means it is still evidence, so the model still reads
      installed and the uninstall did not work.
      **Verify:** temp-tree test — same dep seeded in two roots, uninstall, both
      gone; `tests/shared-dep-uninstall-direction.test.cjs` and
      `tests/plugin-dep-gc.test.cjs` still pass.
- [ ] Reject nested roots on add (a root that is a prefix of, or prefixed by, an
      existing root) — otherwise `ownerRoot` is ambiguous and `cleanEmptyDirs`
      can climb out of the child into the parent.
      **Verify:** unit test rejects both nesting directions and the identical-path
      case.

## Parallel Batch: Surfaces (run only after Phase 3 lands)

Disjoint ownership, batch-safe verification, no forward dependencies — each task
consumes `modelRoots.js` and touches nothing the others touch. Dispatch with
`mpi-execute-parallel`. Every worker needs the Critical Rules Snapshot plus the
"decision layer does not move" constraint pasted into its prompt.

- [ ] Settings: roots list UI — add / remove / reorder, showing free space per
      root. `_renderExtraFolderBucket`
      ([MpiSettings.js:763](js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js:763))
      is already generic and is the pattern to follow, not to copy wholesale —
      roots are not buckets. Ownership: `js/components/Compounds/LandingPages/MpiSettings/`.
      Briefings: `components`, `dos_and_donts`. **Verify:** add a second root in
      the running isolated app, confirm it round-trips to `model_roots.json` and
      regenerates the YAML; nested and duplicate paths refused with a visible reason.
- [ ] Model Library: "where do this model's weights live" per-model display —
      the surface Fabio asked for, and the thing that makes a smeared model
      legible. Ownership: `js/components/Compounds/LandingPages/MpiModelManager/`.
      Briefings: `components`, `dos_and_donts`. **Verify:** a model with deps in
      two roots names both; a model in one root names one; not-installed shows
      nothing.
- [ ] Pod LoRA resolver: append the extra roots in `_resolveLocalModelPath`
      ([routes/remotePodState.js:79](routes/remotePodState.js:79)) or an
      extra-root LoRA works locally and fails only on a Pod. Note it already
      scopes to `path.join(root, type)`, so its basename search is bucket-scoped
      — keep it that way, do not widen it. Ownership: `routes/remotePodState.js`.
      Briefings: `comfy_engine`. **Verify:** unit test resolves a LoRA seeded in
      a second root; on no delete path, so no GC risk.

## Phase 4: Root removal — CARRIES THE ONE OPEN DECISION

**DECISION RESOLVED** (Fabio, 2026-08-29): **do not delete by default**, and ask.

- [ ] Removal confirm: one `MpiOkCancel` dialog whose body names the affected
      models and the GB, plus an **`MpiCheckbox`, unchecked by default**, reading
      roughly *"Also delete the files from the folder you are removing?"*
      OK = Remove path (files kept unless the box is ticked); Cancel = abort,
      nothing removed.
      **Why a checkbox and not a third button:** three outcomes are needed —
      remove+keep, remove+delete, abort — and `MpiOkCancel` is two buttons. With
      Remove/Cancel alone, Cancel is ambiguous between "keep the files" and
      "don't remove the path". `MpiCheckbox` already exists; do not add a third
      button variant.
      **Verify:** in the isolated app, remove a root with the box unticked →
      files still on disk, root gone from `model_roots.json`; ticked → files
      deleted; Cancel → nothing changed at all.

> **Do not delete this prompt as a known no-op.** The uninstall dialog once had a
> "keep files" checkbox and it was removed for exactly that reason — see the
> comment at [MpiModelManager.js:282](js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js:282):
> install-state is statted from disk, so kept files just re-flagged the model
> INSTALLED. **That precedent does not apply here.** Removing a root also removes
> it from `getRoots()`, so the kept files stop being evidence because nothing
> searches that location any more — not because they were deleted. "Remove path,
> keep files" is a coherent end state; "uninstall, keep files" never was.
>
> The cost of keeping them is a known, accepted leak: those bytes are unreachable
> by sweep and uninstall until the user re-adds the path or deletes them by hand.
> That is the MPI-314/462 class, entered deliberately and with consent, which is
> why the prompt exists at all.
- [ ] Removal computes affected models **before** dropping the root, including
      models that never installed there — a shared dep that happened to land in
      the removed root breaks a model that lives elsewhere. This is the accepted
      cost of option A (space-optimal) over self-contained roots.
      **Verify:** temp-tree test — model Y installed to root B with a shared dep
      in root A; removing A lists Y as affected.
- [ ] Removal regenerates the YAML and calls `reloadExtraPathsWhenReady()` so a
      running engine stops searching the dropped root.
      **Verify:** in the isolated app, remove a root and confirm the affected
      models flip to Not Installed without a restart.

## Phase 5: Docs and rules

- [ ] Update [docs/models-path.md](docs/models-path.md) (the contract),
      `.claude/rules/comfy_engine.md` §5 (the "only loras and upscale_models"
      line is now wrong), `.claude/rules/downloads.md` (uninstall briefing,
      line 16), `tests/extra-model-folders.test.cjs`.
      **Verify:** every changed rule/doc names a symbol that still exists; ask
      before editing `.claude/rules/` (CLAUDE.md cardinal rule 5).

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

The card's payoff is a Settings surface and a Model Library surface Fabio has to
judge in the running app — free-space display, the roots list, the removal
confirm, and the per-model "where are the weights" line. Phases 1–3 are `auto`
and self-verify on tests; the Parallel Batch and Phase 4 are `user-ux`.

End-to-end criteria:

1. `npm test` green, `npm run lint` clean.
2. `git diff` shows zero changes inside `_localSharedDepsMap` / `_orphanedDepIds`.
3. In an isolated instance with two roots: a model too large for the main root
   installs whole to the second; uninstall reclaims every copy from every root;
   removing a root flips exactly the affected models to Not Installed.
4. `tests/plugin-dep-gc.test.cjs`, `tests/shared-dep-uninstall-direction.test.cjs`,
   `tests/dep-path-agreement.test.cjs`, `tests/partial-install-strands-weights.test.cjs`
   all still pass.

## Preservation Notes

- `docs/models-path.md` is the contract and must be updated, not appended to.
- Never widen `findFileRecursive` basename matching to extra roots — it would
  adopt a same-named different quant. MPI-654 just removed one such search; do
  not reintroduce it through a new door.
- No hash verification on adoption: a pre-existing file is trusted on filename,
  same as hand-dropping a weight into `G:\CubricModels` today. Not new, but more
  likely once extra roots exist. Worth a line in the release notes.
- Extra roots do **not** become `import-model` drop targets.
- Offline/unplugged root reads identical to "files deleted" — models flip to Not
  Installed, a reinstall duplicates onto another root. Safe (the sweep only
  deletes what `pathExists`), wasteful, recoverable. Name it in the docs.
- This card supersedes `~/.claude/plans/right-now-we-allow-radiant-rabin.md`.
  Its C1/C2/C3 candidates are dead; its "established facts" section is still good.
