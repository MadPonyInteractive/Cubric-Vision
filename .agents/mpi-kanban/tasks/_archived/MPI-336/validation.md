# MPI-336 — validation

## Real root cause (deeper than the original card)

The card title ("turbo not saved in the sidecar") was one symptom of a **systemic** flaw:
perModel PromptBox controls persisted/snapshotted/restored via **three hand-maintained
key-lists** that duplicate what each control's `scope` already declares. Miss a list →
silent break. Two concrete bugs stacked:

1. **List drift (the historic "not in sidecar"):** the sidecar snapshot cherry-picked a
   hardcoded key list for the model bucket, while `_shared`/`_op` cloned wholesale.
   `krea2Turbo` (and any new perModel control) was missing → absent from the sidecar.
2. **Stale read (what the user reproduced):** the snapshot ran at generation
   **completion**, reading LIVE `getModelSettings`. Changing controls during the gen
   corrupted it. Proven by sidecar `d147a004`: `injectionParams` (frozen at dispatch) had
   turbo=2/style=0/stab=1/enhance=false/1K — all correct — while `controlState.model` had
   the user's later-changed turbo=false/style=1/stab=0.39/enhance=true/2k. Only ratio
   survived (it alone was reconciled from injectionParams).

## Fix (structural, scope-driven — not a key-add)

- **`generationService._snapshotControlState`** (new helper): snapshot the 3 buckets at
  **dispatch** (`enqueueGeneration`, synchronous, before controls can drift). Model bucket
  = `clone(modelSettings[id])` **minus `operations`** → every perModel key auto-included,
  op-tree excluded (so reuse's shallow-merge can't clobber sibling ops). Completion just
  consumes the frozen `config._controlSnapshot`. Mirrors the App `s_appInputs` design.
- **`_emitUpdate` (PromptBoxControls)** emits `modelWide: true` for perModel; the
  **projectService guard** trusts the flag instead of the `_MODEL_WIDE_KEYS` allowlist.
  `_MODEL_WIDE_KEYS` trimmed to the two legacy non-control keys (`loras`, `upscaleModel`).
- **Reuse:** fast path already clones `controlState.model` wholesale → restores everything
  once the snapshot is correct. Legacy loop kept + `krea2Turbo` added for old sidecars.
- **Docs (the recurrence guardrail):** new `docs/playbooks/common/prompt-box-controls.md`
  (scope = SoT; "declare scope, done"); referenced from add-model/04, add-app/03,
  common/README; pointer added to `.claude/rules/dos_and_donts.md`.

Net: a NEW perModel control now needs ZERO edits to any persistence list — declare `scope`
and it persists, snapshots, and restores. Matches the `perOp` "just works" experience.

## Verified
- `node --check` clean: generationService, projectService, PromptBoxControls, promptReuse.
- Round-trip logic test (scratchpad `mpi336_roundtrip.mjs`) PASS: every perModel value
  round-trips; `operations` excluded from the model bucket; a brand-new perModel key auto-
  rides the wholesale clone.
- Grep-confirmed only `MpiModelSettings.js` emits `settings:model:update` unflagged
  (loras/upscaleModel) → safe to trim the control keys from `_MODEL_WIDE_KEYS`.

## PENDING (live test — user)
- Restart app (renderer + main both touched? No — all renderer; Ctrl+R reloads).
- Krea2 t2i: set turbo OFF + a style + stab 0.39 + 2K, generate. **While/after it runs**,
  change all those controls. Reuse the card → controls must snap back to the GENERATED
  values, not the drifted ones. Repeat inverted (turbo ON, no style, 1K).
- Confirm a fresh perModel change persists across an app restart (project.json) with no
  `_MODEL_WIDE_KEYS` entry — proves the `modelWide` flag path.
- Cross-model reuse still clamps qualityTier (unchanged path).
