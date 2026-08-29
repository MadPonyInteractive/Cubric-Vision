# MPI-655 Brief

> **UPDATE 2026-08-29 — read this before the trace below.**
>
> **1. Its sibling brief was disproved by its own repro.** MPI-654 shipped
> (`03b78041`). Its brief — same author, same method, same session as this one —
> named a repro case that **does not reproduce**. The harness showed both readers
> already agreeing on the scenario the brief claimed they disagreed on. The real
> bug ran the opposite way and was found only because the agent built the repro
> *before* trusting the write-up.
>
> **Treat everything below as a hypothesis, not a finding.** It is a code trace.
> It has not been executed. If your repro contradicts it, the repro is right —
> say so plainly and follow the evidence, exactly as MPI-654 did.
>
> **2. A harness already exists to copy.** `tests/dep-path-agreement.test.cjs`
> (from MPI-654) sandboxes a temp tree via `CUBRIC_ENGINE_ROOT` /
> `CUBRIC_MODELS_ROOT` plus a fake `extra_model_paths.yaml`, then calls the REAL
> functions. The user's engine is never touched. Start from that pattern rather
> than inventing one — and note it lets you drive the GC/UI-state question
> without launching the app at all.
>
> **3. Line references below are verified current** as of `03b78041`:
> `_localModelsCheck:829`, `anyInstalled:662`, `_localSharedDepsMap:155`,
> evidence gate `:214`, MPI-310 comment block `:179`. MPI-654 removed ~45 lines
> from `routes/comfy.js` but did not move these.
>
> **4. What MPI-654 changed underneath you.** `_localModelsCheck` no longer
> carries its own resolution ladder — it delegates to `resolveComfyPath`, and
> that search is now bucket-scoped (`_findFile` is gone). Step 1 of the trace
> below still holds: a genuinely-missing common dep still reports `false`. But
> read the current function, not the description.
>
> **The trap in "THE TRAP" section is unaffected by any of the above and still
> stands. Read it before proposing a fix.**

Found while brainstorming MPI-656 (multiple model roots). **Pre-existing and
reproducible today with a single root** — multiple roots only turn a rare manual
accident into a one-click Settings action.

## The defect

Lose ONE common dep of a model (hand-delete a shared VAE from
`G:\CubricModels`) and the model's remaining weights become **held and
unreachable**: the GC deliberately protects them, and the UI hides the only
button that could remove them.

Traced path, model Y with exclusive transformer `T` and common VAE `V`:

1. `_localModelsCheck` → `T: true`, `V: false`, `allPresent: false`.
2. `_localSharedDepsMap` ([routes/downloadManager.js:155](routes/downloadManager.js:155))
   → exclusive evidence for Y is `[T]`, `T` is present → **Y passes the gate**.
   `installedOps` is empty, so `resolveDeps(model, null, …)` resolves Y's **full
   universe** and `T` lands in the protected map.
3. `_orphanedDepIds` → `T` is protected → **not an orphan**. The sweep skips it.
4. Card: `anyInstalled = model.installed === true || installedOps.length > 0 ||
   (installedArch.length > 0 && _commonDepsOnDisk(model))`
   ([MpiModelManager.js:662](js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js:662)).
   `deriveInstalledOps` requires `commonComplete`; `V` is missing → `installedOps`
   empty → **`anyInstalled` false → the card shows Install, never Uninstall**
   ([MpiModelManager.js:988](js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js:988)).

`T` is defended by the collector and invisible to the remover. This is the
MPI-462 stranding pattern, and the sweep built to catch it structurally cannot,
because the sweep asks the protection primitive and the primitive says keep.

Failure direction: bytes **kept**, never destroyed.

## THE TRAP — read before proposing a fix

The tempting fix is *"make the evidence gate also require `commonComplete`"*, so
Y stops defending `T` and the sweep collects it.

**That is exactly the `fullyInstalled` gate that destroyed 5.24 GB in MPI-310.**
The instant a shared common dep goes missing, every model needing it stops
defending its own weights and the next uninstall takes them permanently. The
comment block at [routes/downloadManager.js:179](routes/downloadManager.js:179)
was written to stop this precise line of reasoning.

**Do not touch the evidence rule. The bug is not in the decision layer.**

## Proposed direction (verify against a repro first)

`anyInstalled` is doing two jobs:

- deciding whether the model is **usable** — drives the green Installed chip.
  Correct as-is.
- deciding whether the user may **remove its bytes** — wrong. Should be "does
  this model have any weight on disk at all?"

Split them, so a model with any dep on disk offers a removal affordance even
when it is not usable. Uninstall already deletes and already respects
`sharedKeep`, so a sibling's shared deps stay safe. **Zero lines in the decision
layer.**

## Reproduce first

Code trace, not an observed failure. Step one: install a model, hand-delete one
of its common deps, confirm the card shows Install with no way to reclaim the
remaining weights, and confirm the orphan sweep leaves them.

## Notes

- Separate from MPI-654 — different layer, no file overlap, parallel-safe.
- Blocks MPI-656: multiple roots make this reachable via a Settings button.
- Regression tests that must keep passing: `tests/plugin-dep-gc.test.cjs`,
  `tests/shared-dep-uninstall-direction.test.cjs`.
- Read `.claude/rules/root-cause.md` and `.claude/rules/downloads.md` first.

## Ownership (when this moves to doing)

`js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js`
