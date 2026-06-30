# Consolidate engine-variant into one per-model profile + resolve-engine-once

Unify the three smeared engine-variant mechanisms (deps `localDeps`/`remoteDeps`,
workflow `ggufWhenRemote`/`_toGgufFilename`, and per-consumer `isRemote()` threading)
into ONE `engines:` profile block resolved by a single `resolve(model, op, engine)`,
with the engine resolved ONCE per generation (fresh, post-`refresh()`) and threaded as
a `'local'|'remote'` string. Fixes the live Pod bug (bf16 workflow reaching the Pod)
and closes the half-wire class for good.

Project mode: **scalable-foundation** (front-loaded design; decisions resolved with the
user before this plan — Option A structure + phased delivery, both user-confirmed).

## Current State

The bf16-local / GGUF-Pod engine split (MPI-157 + MPI-163) is HALF-CONSOLIDATED. MPI-163
made the DEPS axis structural (`localDeps`/`remoteDeps`) + threaded the engine into the deps
resolver and live-verified it on a Pod (correct GGUF set installs). But the WORKFLOW axis
(`ggufWhenRemote` + `_toGgufFilename`) and the ENGINE SIGNAL were left as-is, and they broke
a live gen: the Pod received the bf16 workflow (`LTX_t2v.json`) and ComfyUI rejected it.

Investigation (4 parallel agents, see `research/investigation-summary.md`) found:

1. **Root of the live bug:** the workflow swap reads `remoteEngineClient.isRemote()` (a stale
   `_active` mirror) at the TOP of `runCommand`, but `_active` is only refreshed LATER inside
   `ensureServerRunning()`. The first gen after Pod connect reads stale `false` → bf16 locked in
   → runs on the Pod → reject. (`comfyController.js:31-33` already documents this race for deps.)
2. **Three engine signals disagree:** renderer `isRemote()` (`_active`, no podId), server
   `isRemoteActive()` (`active && podId`), per-gen `forceLocal`. `forceLocal` reaches the swap but
   not the deps resolver.
3. **Engine variance is 3 mechanisms for one concept** (`localDeps`/`remoteDeps`, `ggufWhenRemote`/
   `_toGgufFilename`, per-consumer `isRemote()`). Adding any new variant axis re-opens the half-wire.
4. **Residual union-fallback risks** beyond MPI-163: `_confirmWholeUninstall` (MpiModelManager:241),
   `_opUninstallDepIds` (:221-222, latent), `MpiPromptBox:137` (latent).
5. **`.claude/rules/comfy_engine.md` is stale** — never mentions engine-split / the swap.

Key constraints:
- Two dep-shape axes are ORTHOGONAL and both must keep working: the OPERATION axis (Wan
  `commonDeps` + `operations{}`, e.g. `ComfyUI-PainterI2Vadvanced` is i2v-only) and the ENGINE
  axis (LTX local/remote). A future model may have BOTH; resolution unions them.
- Shared git tree — commit by explicit pathspec, never `git add .`. Push is user-only.
- Resolver stays browser/DOM-free (node-unit-testable: `tests/resolve-model-deps.test.cjs`).
- Live Pod verification requires the user to spin a Pod (never autonomous). The Pod can stay
  terminated until Phase A and Phase B/C are each ready for live check.

### Target structure (Option A — user-confirmed)

```js
// engine AXIS in ONE block; operation AXIS unchanged
ltx-23: {
  dependencies: [...shared...],                 // both engines (op axis still allowed via commonDeps/operations)
  workflows: { t2v_ms: 'LTX_t2v.json', i2v_ms: 'LTX_i2v.json' },
  engines: {
    local:  { extraDeps: ['ltx23-transformer-bf16'],                       workflowSuffix: '' },
    remote: { extraDeps: ['ltx23-transformer-gguf', 'ComfyUI-GGUF'],       workflowSuffix: '_gguf' },
  },
}
```

`resolve(model, selectedOps, engine)` returns `{ depIds, workflowFile(op), nodes }` where:
- `depIds` = `dependencies` (or `commonDeps` + selected `operations[].deps`) + `engines[engine].extraDeps`
- `workflowFile` = `workflows[op]` + (`_stage2` if stage2) + `engines[engine].workflowSuffix`
  (suffix order must yield `..._stage2_gguf.json`, matching generate_ltx.py output)
- `nodes` = the `type:'custom_nodes'` deps within `depIds`
- `engine === null` = UNION of both `engines.*.extraDeps` (shared-dep protection only)

### The TWO axes are orthogonal and COMPOSE (the case the user flagged)

The OPERATION axis (which deps depend on *what the user does* — t2v vs i2v) and the ENGINE
axis (which deps/workflow depend on *where it runs* — local vs Pod) are independent. A model may
have neither, one, or BOTH. Resolution unions them — operations contribute their deps, the engine
block contributes `extraDeps`, and they never collide. No current model has both, but Phase B MUST
make this a first-class, tested case (today's `engineDepsOf` ignores operations — a latent bug).

Worked example — a hypothetical model that is BOTH op-keyed AND engine-split:

```js
{
  commonDeps: ['vae', 'encoder'],
  operations: {
    t2v_ms: { deps: ['t2v-high', 't2v-low'] },
    i2v_ms: { deps: ['i2v-high', 'i2v-low', 'ComfyUI-PainterI2Vadvanced'] },  // Painter is OP-only (i2v)
  },
  engines: {
    local:  { extraDeps: [],                 workflowSuffix: '' },
    remote: { extraDeps: ['some-pod-node'],  workflowSuffix: '_gguf' },        // pod-node is ENGINE-only
  },
}
// resolve(model, ['i2v_ms'], 'remote') =
//   commonDeps ∪ i2v_ms.deps (incl Painter) ∪ engines.remote.extraDeps (some-pod-node)
//   → Painter comes from the OPERATION; some-pod-node comes from the ENGINE; both present, no collision.
// resolve(model, ['t2v_ms'], 'remote') = commonDeps ∪ t2v.deps ∪ [some-pod-node]  (NO Painter — t2v)
// resolve(model, ['i2v_ms'], 'local')  = commonDeps ∪ i2v.deps (incl Painter) ∪ []  (NO pod-node — local)
```

The Phase B synthetic fixture must assert exactly these four combinations (op × engine) so the
two axes are proven independent + composable, not just LTX (flat) + Wan (op-keyed, engine inert).

## Completed

- [ ] Nothing yet (investigation done; captured in `research/investigation-summary.md`).

## Remaining Work

## Phase A: Resolve engine once + thread to swap and deps (FIXES THE LIVE POD BUG)

Smallest shippable change. Keeps `localDeps`/`remoteDeps`/`ggufWhenRemote` in place; ONLY fixes
the signal timing + threads the resolved engine to the workflow swap so it can't read stale.

- [ ] In `commandExecutor.js` `runCommand`, resolve the engine ONCE as a concrete string AFTER the
  per-gen `refresh()` has run (i.e. ensure `getEngine(forceLocal).ensureServerRunning()` — or a
  direct `await remoteEngineClient.refresh()` — completes BEFORE the workflow-file selection), then
  compute `engine = workingPayload.forceLocal === true ? 'local' : (remoteEngineClient.isRemote() ? 'remote' : 'local')`.
  Move the `ggufWhenRemote` swap to use this resolved `engine` (`engine === 'remote'`), not the
  pre-refresh `_remoteRun`. **Verify:** add a node-level unit/integration check (or a logged assertion)
  proving that for `forceLocal:false` + remote-active the selected file is the `_gguf` sibling; and a
  manual trace confirming the swap now happens AFTER refresh (read the code path back). Resolver tests
  still 10/10.
- [ ] Thread the SAME resolved `engine` string into the deps-touching calls inside the gen path that
  currently re-read `isRemote()` independently (only those in the gen dispatch flow; the model-manager
  UI calls stay as-is for Phase B). **Verify:** grep the gen path (`commandExecutor.js`,
  `generationService.js`) shows no second independent `isRemote()` read between engine-resolve and
  prompt submit; resolver tests pass.
- [ ] Live-verify on a fresh Pod (user spins it): connect Pod → first LTX t2v gen → the GGUF workflow
  is sent (no `...bf16... not in []` reject) → gen completes. Also test the connect-then-immediately-gen
  race (the original failure). **Verify (user-ux):** user confirms a Pod gen completes on the first try
  after connect, no bf16 reject in the error dialog or `app.log`.

## Phase B: Migrate deps + workflow to the `engines:` profile + one resolver

Structural. Introduce the `engines:` block and `resolve(model, op, engine) -> {deps, workflow, nodes}`;
make every consumer call the one resolver. Old fields still readable during migration for safety, deleted
in Phase C.

- [ ] Add `engines:` to the LTX entry in `models.js` (`local`/`remote` with `extraDeps` + `workflowSuffix`);
  keep `localDeps`/`remoteDeps`/`ggufWhenRemote` TEMPORARILY so nothing breaks mid-migration. **Verify:**
  a resolver unit test asserts the `engines:` block produces the same dep sets as the legacy
  `localDeps`/`remoteDeps` for both engines (parity check), and the workflow filename for both engines +
  stage2 (`LTX_t2v.json`, `LTX_t2v_gguf.json`, `LTX_t2v_stage2_gguf.json`).
- [ ] In `resolveModelDeps.js`, make `engineDepsOf` read `model.engines?.[engine]?.extraDeps` (fall back
  to legacy `localDeps`/`remoteDeps` during migration). Add `resolveWorkflowFile(model, op, engine, {stage2})`
  that returns `workflows[op]` + `_stage2?` + `engines[engine].workflowSuffix`. Add a thin
  `resolve(model, selectedOps, engine, {stage2, op})` returning `{ depIds, workflowFile, nodeIds }`.
  Keep `resolveDeps`/`resolveFullUniverse`/`deriveInstalledOps` working (they call the same `engineDepsOf`).
  **Verify:** resolver tests cover: flat+engine (LTX), op-keyed (Wan, engine inert), AND a synthetic
  op-keyed+engine-split fixture proving the two axes UNION correctly (Painter-style op node + a remote
  extraDep both present for `op=i2v, engine=remote`). Tests ≥ current count, all pass.
- [ ] Point the workflow swap (`commandExecutor.js`) at `resolveWorkflowFile(...)` instead of
  `_toGgufFilename`/`ggufWhenRemote`. **Verify:** unit/trace check that the gen path derives the workflow
  via the resolver; the `_gguf` + `_stage2_gguf` suffix order is preserved.

## Phase C: Delete old mechanisms + fix residual unions + update docs/rule

Cleanup once B is proven. Removes the smear so it can't recur.

- [ ] Delete `localDeps`/`remoteDeps`/`ggufWhenRemote` from `models.js` + the legacy fallbacks in
  `resolveModelDeps.js`; delete `_toGgufFilename` from `commandExecutor.js`. **Verify:** grep shows zero
  remaining references to all four symbols across `js/` + `routes/` (except historical kanban/gotchas);
  resolver tests pass; `node --check` on every edited file.
- [ ] Fix the residual union risk: `_confirmWholeUninstall` (MpiModelManager:241) resolves the
  current-engine universe (not the union) for uninstall; confirm the uninstall route still protects
  cross-model shared deps. **Verify:** a test (or logged trace) that a local LTX uninstall does NOT try to
  trash the gguf transformer and a Pod uninstall does NOT try to delete the bf16; shared-dep guard intact.
- [ ] Rewrite the stale `.claude/rules/comfy_engine.md` to document the `engines:` profile, the single
  `resolve(model, op, engine)`, the resolve-engine-once rule, and the two orthogonal axes (operation vs
  engine). Update `docs/gotchas.md` engine-split entry + the `feedback-engine-split-sweep-all-consumers`
  memory to point at the new single-resolver invariant. **Verify (user-ux):** present the rule rewrite to
  the user for approval (CLAUDE.md: rule files need explicit permission to change).
- [ ] Final live re-verify on a Pod: install LTX on a fresh GGUF-only volume → installed + prompt box +
  t2v gen completes; local bf16 gen completes; uninstall correct per engine. **Verify (user-ux):** user
  confirms end-to-end on both engines.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

The fix's payoff (Pod gen works, prompt box, correct install/uninstall) is only provable in the running
app on a real Pod, which the user must spin and judge. Phases A and C end on user-ux live checks; Phase B
is auto-verifiable (resolver parity tests) but its workflow-swap retarget should be smoke-checked before C.

End-to-end criteria:
- A fresh-connect LTX gen on a Pod sends the GGUF workflow on the FIRST try (the original failure mode gone).
- LTX installs the engine-correct set, reads installed, prompt box shows, t2v + i2v gen run on the Pod.
- Local bf16 gen runs; force-local while Pod-connected uses the LOCAL deps+workflow.
- Uninstall trashes only the current engine's files; cross-model shared deps protected.
- `localDeps`/`remoteDeps`/`ggufWhenRemote`/`_toGgufFilename` fully removed; resolver tests green.

## Preservation Notes

- Rewrite `.claude/rules/comfy_engine.md` (Phase C) — needs explicit user permission (CLAUDE.md rule).
- Update `docs/gotchas.md` engine-split entry + `~/.claude/.../memory/feedback_engine_split_sweep_all_consumers.md`
  to the single-resolver invariant once consolidated.
- MPI-164 (verify-bar at ~95%) is SEPARATE and stays its own card; do not fold it in.
- The original `ggufWhenRemote` swap bug + the engine-signal-stale race should land as a gotcha entry the
  moment Phase A is verified (so the timing rule — "resolve engine after refresh, thread it" — is durable).
- Investigation map preserved at `research/investigation-summary.md`.
