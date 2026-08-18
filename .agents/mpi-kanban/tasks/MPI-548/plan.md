# MPI-548 plan

Two defects behind one report — see `brief.md` § "The two defects, separated". They ship
independently. **A** is Fabio's actual bug and needs one fact from him plus one from the
Pod. **B** is proven by reading and can be built now.

## Current State

2026-08-18: **Defect A is root-caused and FIXED** (Phase 2 below). Fabio confirmed the
laptop icon was showing, so the override was ON; the sweep then found that `forceLocal` is
threaded per call site and **8 of 10 dispatch sites never pass it**. Fixed structurally in
`generationService` (derive once in the funnel) plus the one site that bypasses the funnel.
Verified live in an isolated instance: 629/629 tests, eslint clean, and three probe cases
proving the derivation.

Next action: Fabio's own run with a Pod connected (`validation.md` cases 1-3) — the card is
`validating` on that. Phase 3 (Defect B, engine-blind asset list) is untouched and
independent; Defect A′ needs a Pod session and no evidence yet.

## Ownership

`files.json` — `js/services/assetService.js`, `routes/comfy.js`,
`js/services/commandExecutor.js`, `js/data/modelRegistry.js`, `js/shell.js`,
`js/components/Compounds/MpiModelSettings/MpiModelSettings.js`,
`js/components/Organisms/MpiToolOptionsUpscale/MpiToolOptionsUpscale.js`.

## Completed

### Phase 0 — re-diagnose (2026-08-18)

- Traced `lora_missing_remote` to the Pod-side ComfyUI rejection, not the pre-dispatch
  guard; the hot-store toast pins the frozen engine to `'remote'`.
- Identified the file as the BAKED dep `klein-lora-nsfw` in `klein_t2i.json` node 38 —
  never in `state.availableLoras`, so the original root cause cannot apply.
- Confirmed offline that `resolveDeps(klein-4b, ['t2i'], …, 'remote')` includes that dep,
  so the `isOperationInstalled` gate had it in scope and passed anyway.
- Ruled out separator heal, hot-store staging, and `_uploadRemoteModels`.
- Rewrote `brief.md`, `checklist.md`, `validation.md`.

### Phase 1 — the two facts (2026-08-18)

- **Fabio: the LAPTOP icon was showing** → the override was ON. Decisive: this is a
  local-only bug, no Pod needed to find or fix it.
- Pod volume check **not run** — Fabio noted a CPU pod may not be connectable for it, and
  once the laptop answer landed it stopped gating anything. It survives as Defect A′.

### Phase 2 — fix Defect A (2026-08-18)

`forceLocal` is threaded per call site; 8 of 10 sites never pass it (table in `brief.md`).
Fixed in the funnel instead of at the sites:

- `generationService.enqueueGeneration` — `opts.forceLocal ?? (state.engineOverride === 'local')`,
  resolved before `_buildQueueDisplay` so the Cue engine chip is fixed too. `??` keeps an
  explicit value authoritative (the loop re-fire's lane pin must not be re-derived).
- `generationService.startGeneration` — same derivation, for a direct call bypassing the queue.
- `MpiToolOptionsResize` — the one site that bypasses the funnel; reads `state.engineOverride` itself.

**Verified:** `npm test` 629/629, eslint clean on both files, and three live probes in an
isolated instance (`validation.md` § Phase 2).

## Remaining Work

### Phase 2′ — Defect A′, residual, needs a Pod

A cloud Klein t2i whose baked dep the Pod lacks should be blocked by the op gate
(`commandExecutor.js:1375`), not by ComfyUI's `value_not_in_list`. `resolveDeps` proves the
dep is in the checked set, so if this reproduces the remote install-state was stale —
`syncModelInstalled()` never runs *while* connected (the uncarded MPI-208 poll). No
evidence yet; do not build for it. Reproduce first, in one deliberate Pod session.

### Phase 3 — fix Defect B (independent)

1. `/comfy/list-files` gains an `engine` param and a **remote branch** via
   `routes/remoteModels.js`, so a remote list is the Pod's real content. Keep the local
   branch and its `path.sep` labelling untouched for local.
2. `assetService.loadAll()` passes the effective engine (`remoteEngineClient.effectiveEngine()`).
3. Re-derive on BOTH edges: the existing `comfy:ready` call site (`shell.js:414`) plus a new
   `Events.onState('engineOverride')` re-fetch beside the existing `syncModelInstalled()`
   one at `shell.js:1598`.
4. Sweep every consumer: `MpiModelSettings` (options + "missing" styling),
   `MpiToolOptionsUpscale`, `_resolveModelName`, `_resolveUpscaleParam`, `_findMissingModel`.
5. Preserve `_findMissingModel`'s MPI-82 semantics — a user LoRA for a remote gen is
   uploaded from local disk, so it must still block on local absence — and its fail-OPEN on
   an empty list.

**Verify:** `node --test "tests/*.test.cjs"` green; the separator cases in `validation.md`
(a subfoldered LoRA still resolves on Windows-local and on the Pod).

## Verification

**Verify mode:** `user-ux`

Phase 3's unit-testable half self-verifies (`npm test`), but every case that matters here
crosses a live Pod and a dropdown, so the card closes on Fabio's run, not on a green suite.

## Plan Drift

- **2026-08-18** — Card re-planned from scratch. The 2026-08-12 plan (empty, "blocked on the
  semantic question") asked whether the override or the asset list was the bug. Neither
  framing was right: the reported failure is a Pod-side enum rejection the pre-dispatch op
  gate should have caught, and the asset-list gap is a separate defect that cannot produce
  that toast. The old A/B question is retired; the new fork is the Phase 1 table.
- **2026-08-18 (same session)** — Phase 1 answered in one line (laptop icon), so Phase 2
  landed immediately and the Pod check was never needed. The original card framing WAS
  half-right about the override — "the override is the bug" — but for the opposite reason
  it proposed: nothing clears `state.engineOverride`, and no hop drops `forceLocal`. Most
  dispatch sites simply never read it. That is why the fix is in the funnel and not on a
  hop. `.claude/rules/dos_and_donts.md` candidate: a per-gen routing flag threaded through
  `opts` by hand is a defect generator — 8 of 10 sites got it wrong over ~10 months.
