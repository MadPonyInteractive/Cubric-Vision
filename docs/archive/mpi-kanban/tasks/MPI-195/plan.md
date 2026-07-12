# Stop mid-generation must keep the finished card (no silent loss)

## Current State

Pressing **Stop** during a generation can lose the output entirely: the gen
runs to completion, emits real latents/output, but no card appears in the
gallery and the latent preview vanishes. Reproduced by the user on an LTX
multi-stage gen — stopped while moving into stage 2; ComfyUI ignored the
interrupt, finished, and the gallery showed nothing.

**Root cause — a race between the synchronous Stop path and the async
completion path, both keyed on the same `_regId`:**

1. Stop → `MpiGalleryBlock` `pb.on('cancel')` → `cancelRunningCueJob` →
   `activeGenerations.cancel(id)` (`js/services/activeGenerations.js:113`).
   This runs **synchronously**: calls `exec.cancel()` (POSTs ComfyUI
   `/interrupt`), sets `status='cancelled'`, `end(id)` **deletes the registry
   entry**, and emits `generation:cancelled`.
2. `MpiGalleryBlock`'s `generation:cancelled` handler
   (`MpiGalleryBlock.js:1316`) → `_rebuildAfterEnd` → **`_myGenIds.delete(id)`**
   (line 1299) and removes the placeholder card + preview.
3. ComfyUI `/interrupt` is **advisory**. For LTX multi-stage it lands between
   stages (nothing sampling at that instant) and the workflow runs to full
   completion, emitting a real output.
4. Late `exec.onComplete(urls, ...)` fires (`generationService.js:584`). `urls`
   is non-empty, so it takes the **save** branch: builds groups, `await
   addGroup(g)` (line 1016) **persists the card to `state.currentProject.itemGroups`
   and disk**, then `activeGenerations.get(_regId)` (line 1008) returns
   `undefined` (already ended) → `tempId=null`, and emits `generation:complete`.
5. `MpiGalleryBlock`'s `generation:complete` handler
   (`MpiGalleryBlock.js:1306`): `if (!_myGenIds.has(id)) return;` — id already
   deleted in step 2 → **event dropped**, `setGroups` never re-runs. Card is on
   disk + in state but the grid never rebuilds. **Silent data loss** — appears
   only on reload/nav.

`MpiGroupHistoryBlock` has a parallel `_pb.on('cancel')` path
(`MpiGroupHistoryBlock.js:836`) with the same `_myGenIds`-style guard —
must be fixed the same way.

**User decision (2026-07-05):** KEEP the card. Stop means "stop the queue /
don't start more", not "discard a result that already finished". The output is
valid and already saved; render it.

Secondary (note only, not this card's fix): ComfyUI's interrupt is weak for LTX
inter-stage — it cannot guarantee an instant abort. The keep-the-card fix
removes the user-visible symptom regardless, so we do not chase a stronger
interrupt here.

## Two-lane constraint (MPI-74 P6) — must not break parallel local+remote

While remote-connected, the PromptBox "Run locally" toggle (`forceLocal`) routes
the next dispatch onto a **separate LOCAL lane** that runs concurrently with the
REMOTE (Pod) lane (`generationService.js` `_laneOf`, `_lanes.{remote,local}`).
So **two `scope:'gallery'` gens can be in flight at once**, both registered in
the block's `_myGenIds`, each with its own `_regId`. Stopping one lane must not
disturb the other (the service already guarantees this). The `_myGenIds.has(id)`
guard is the block's **ownership + which-gen test** — it cannot simply be
removed, or a completion from the other lane (or, in group-history, another
block instance) would trigger a spurious rebuild. Both `generation:cancelled`
and the late `generation:complete` carry the SAME `id` (= the cancelled entry's
id / `_regId`), so the fix can bridge them precisely without widening scope.

## Implementation

- [ ] Bridge a Stop'd-then-finished gen back to its owning block WITHOUT
  widening the ownership guard (two-lane safe). In each block, add a small
  `_stoppedPendingComplete = new Set()`. On `generation:cancelled` for an id the
  block owns (`_myGenIds.has(id)`), before deleting it from `_myGenIds`, record
  it in `_stoppedPendingComplete` (only if ComfyUI could still finish — i.e.
  always, cheap; it's cleared on the next complete/error). Then in
  `generation:complete`, accept the event when `_myGenIds.has(id)` **OR**
  `_stoppedPendingComplete.has(id)`; on accept, `_stoppedPendingComplete.delete(id)`
  and run the existing render path.
  - **GalleryBlock** (`MpiGalleryBlock.js:1306`): accepted late complete →
    `_rebuildAfterEnd(id, tid, extraTempIds)` (idempotent; pulls the real card
    from `state.currentProject.itemGroups` via `_visibleProjectGroups`, removes
    any orphan placeholder). The event's `tempId` is null after stop — fine, the
    placeholder was already removed by the cancel path and the grid reconciles
    from state.
  - **GroupHistoryBlock** (`MpiGroupHistoryBlock.js:595`): accepted late
    complete → repaint the viewer from the event's `item`/`group` (already in the
    payload) via `_reloadViewerWithEntry`, matching the normal-complete path.
  - Prune `_stoppedPendingComplete` on `generation:error` too (line 645 gallery /
    error handler) so a stopped gen that then errors doesn't leak the id.
  - Service side: the gallery `generation:complete` emit
    (`generationService.js:1022`) currently passes `tempId: _galleryTempId` read
    from the (post-stop, dead) registry entry → null. Switch it to the already-
    present `_stableTempId` / `_stableExtraTempIds` snapshot (introduced by
    `b0d1e0d` for the sibling cancelled emits) so `removeCard(tempId)` targets the
    real placeholder, not null. This is the exact pattern `b0d1e0d` applied to the
    empty-output / cacheHit / error emits — we extend it to the complete emit.
  - Do NOT loosen `generation:preview` / `preview-reset` (must stay scoped to a
    live first-running entry). Do NOT change the empty-output cancel at
    `generationService.js:585` (stop-before-any-output stays genuinely no-card;
    that path emits `generation:cancelled` with no matching late complete, so the
    bridged id simply expires unused — harmless).
  **Verify:** (a) live LTX multi-stage gen, Stop entering stage 2; when ComfyUI
  finishes, the card appears in the gallery (no reload), preview replaced, no
  duplicate/orphan placeholder. (b) Empty-output cancel (Stop early, before any
  output) → still NO card. (c) **Two-lane:** remote gen + local "Run locally"
  gen concurrently; Stop ONE, let both finish — the stopped-then-finished lane's
  card appears, the untouched lane is unaffected, no cross-lane spurious rebuild.
  (d) Same on the group-history surface.

## Completed

- [ ] Nothing yet.

## Remaining Work

- Implement the keep-the-card reconciliation on late completion for both the
  gallery and group-history cancel paths.

## Plan Drift

- 2026-07-05: User flagged the RunPod two-lane parallel-local system (MPI-74 P6)
  as a likely cause. Confirmed: P6 (commit `47d2cdb`) made Stop settle the lane
  **locally and synchronously** (`cancelRunningCueJob` → `activeGenerations.cancel`
  → `end()` immediately, rather than waiting for an engine terminal event). That
  is what ends the registry entry BEFORE the interrupted-but-finished gen's late
  completion arrives — the race window. Fix must stay two-lane-safe (see the
  "Two-lane constraint" section) — added the `_stoppedPendingComplete` bridge so
  the ownership guard is preserved, not removed.
- 2026-07-05: Found prior art — commit `b0d1e0d` "reconcile Stop-at-completion
  cancelled" already fixed the SIBLING case: Stop → gen returns EMPTY → late
  `generation:cancelled` with a stabilized `_stableTempId` so the placeholder
  reconciles. **It did not cover our branch:** Stop → gen returns REAL output →
  late `generation:complete` (a different event), whose guard (`_myGenIds.has`)
  and tempId (dead-registry → null) were never patched. This card finishes that
  work. `b0d1e0d`'s own message notes a "documented-open MPI-111 stale-thumbnail"
  they couldn't reproduce ("likely a path changed by MPI-74 P6") — that residual
  is almost certainly this MPI-195 (they were Stopping empty-output gens; LTX
  multi-stage returns real output on inter-stage Stop, hitting the uncovered
  branch). Our fix reuses `b0d1e0d`'s already-present `_stableTempId` /
  `_stableExtraTempIds` snapshot for the complete emit rather than the dead
  `_galleryTempId` read at `generationService.js:1008-1009`.

## Verification

**Verify mode:** user-ux

This is a UI/UX timing bug the user must feel in the running app. Self-checks
(read-back, no console errors) are necessary but not sufficient — the human
must watch a stopped LTX gen finish and see the card land. Verify path is the
**app**, either engine; the LTX inter-stage interrupt gap is the reliable
repro. Desktop Electron test (`npm run test:desktop`) can cover launch/nav but
cannot easily drive a real multi-stage generation — treat the live manual run
as the acceptance gate.

Acceptance:
1. LTX gen, Stop mid-stage-2, ComfyUI finishes → card appears immediately, no
   reload, preview replaced, no orphan placeholder.
2. Stop very early (no output produced) → still no card (empty-output cancel
   path unchanged).
3. Group-history surface behaves the same for both cases.
4. No duplicate card, no `_myGenIds`/registry leak (stop → finish → grid state
   consistent with `state.currentProject.itemGroups`).

## Preservation Notes

- If the fix changes the cancel/complete event contract between
  `generationService` and the two Blocks, update
  `.claude/rules/component-events.md` (component event wiring) — ask before
  editing rule files per CLAUDE.md.
- This is a stop/cancel UX correctness fix; if it hardens a durable
  convention, the home is `docs/ui-gotchas.md`, not `docs/gotchas.md`.
- Feedback memory `feedback_no_toast_user_stop` applies: keep it silent on the
  user's Stop — no toast for the recovered card (user action is self-evident).
