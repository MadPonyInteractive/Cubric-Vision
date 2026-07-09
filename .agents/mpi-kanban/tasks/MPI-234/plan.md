# MPI-234 — Plan (rewritten 2026-07-08 after evaluation)

## RESOLUTION (2026-07-08, post-repro-gate) — supersedes the phases below

Phase 0 ran: symptom SURVIVED the double-fire fix, deterministically (all 3 Stop
timings). N/M was sane (status-bar tqdm twin = dead, killed by the double-fire fix).

TRUE ROOT (not in the phases below, not in the original card): the gallery PromptBox
**Stop handler itself** — `pb.on('cancel')` in MpiGalleryBlock.js. It calls
`cancelRunningCueJob()` (inside which the armed-loop re-fire runs SYNCHRONOUSLY and
the new gen's placeholder gets correctly mounted by `generation:cancelled` →
`_rebuildAfterEnd`), and then unconditionally ran
`grid.el.setGroups(_visibleProjectGroups())` — no placeholders — WIPING the
just-mounted placeholder as the last write. Explains the whole symptom set: card
invisible all run; previews fire but `grid.updatePreview` silently no-ops (tempId not
in `_cardMap` = the old "inCardMap=FALSE" log); pops at finish; and why all 6 MPI-226
point-fixes failed — they patched the lifecycle handlers, the wipe came AFTER them.

FIX SHIPPED (1 line): Stop handler reconciles —
`grid.el.setGroups([..._placeholdersForFirst(), ...currentGroups])`.

FIX 1 USER-VERIFIED (2026-07-08, all 3 Stop timings): card + latents live. Residual:
status bar stuck IDLE for the re-fired run.

FIX 2 (statusBar.js `_reconcileFromStore`): every bar-kill path nulls `_activeGenId`,
so the next store broadcast would normally revive the bar — EXCEPT when a driving
tool:* event `_latch()`es the new genId while the bar is idle. Then the owner-equality
check (`job.genId !== _activeGenId`) skipped re-arming forever: bar idle,
tool:progress/stage no-op when idle, stuck "IDLE" the whole re-fired run. Fix: re-arm
when `(genId !== _activeGenId || _state !== 'active')` — store truth wins in both
directions (mirror of the running=[] self-heal). `genId !== null` guard preserved
(tool-panel previews stay silent); completion-flash window safe (tool:idle nulls the
latch before complete(), so the flash is never stomped).

Remaining validation (checklist on card): bar live on re-fired gen ×3 timings; plain
Stop with loop OFF still clears placeholders; normal completion flash + toast intact.

---

## (Historical) original evaluation plan — Phase 0 ran, Phases 1-4 overtaken by the find

## Verdict on the original card

The instrumented evidence ("inCardMap=FALSE for the ENTIRE run", 6 failed point-fixes)
was ALL gathered while the DOUBLE-FIRE bug (MPI-226 Bug 1) was still live — 2-3
overlapping gens per Stop. The double-fire guard shipped + gallery point-fixes were
reverted at the END of that session, and the display symptom was **never re-tested**
in that final state. The card's "needs an idempotent-reconcile rewrite" conclusion is
therefore premature.

Code-walk of the CURRENT tree (original gallery code + double-fire guard) says the
original code **self-heals**: even though `generation:started(NEW)` fires synchronously
inside `activeGenerations.cancel(OLD)` (old still status:'running' → NEW's mount is
skipped because `_firstRunningEntry()` = OLD), the `generation:cancelled(OLD)` emitted
at the end of `cancel()` always runs `_rebuildAfterEnd` → by then OLD is removed →
`_placeholdersForFirst()` = NEW → `setGroups` mounts NEW's placeholder. One re-fire
(post-guard) has no permutation that leaves NEW unmounted. The old "invisible for the
entire run" behavior is best explained by the SECOND phantom gen of the double-fire era.

Also corrected: the card's status-bar suggestion "add a gen-id/prompt-id filter to the
SSE step-progress consumer" is NOT implementable as written — `comfy:step-progress`
frames are parsed from ComfyUI **stdout tqdm lines**, which carry no prompt id
(commandExecutor.js:1446-1460). The implementable variant is the executing-gate in
Phase 3 below.

## Phase 0 — REPRO GATE (user, ~5 min) → verify before any code

Prereq: current working tree (gallery revert + double-fire guard) loaded — reload the
app window (renderer refetch is enough, no restart).

Arm Loop → start a gen → press Stop mid-gen. Repeat 3× (timing race → try Stop early
during model load AND late during sampling). Per Stop, observe the RE-FIRED gen:

1. Live placeholder card appears in the gallery immediately (not only at finish)?
2. Streaming preview latents paint on it?
3. Status-bar N/M sane (e.g. never 5/5 on a 2-stage SDXL)?
4. Exactly one re-fire (no phantom extra gens)?

## Phase 1 — Outcome A: all clean → close as subsumed

Root was the MPI-226 double-fire; the display symptom died with it.
- Ship the Phase-2 one-liner anyway as cheap hardening (it removes the inconsistent
  window at the source; zero behavior change otherwise). Optional but recommended.
- Commit the outstanding MPI-226/234 working-tree files (pathspec:
  `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js js/services/generationService.js
  js/services/projectService.js tests/persist-groups-retry.test.cjs` + kanban files).
  **CRITICAL:** HEAD (commit d4a528f) accidentally contains MPI-226's instrumented
  failed-fix in MpiGalleryBlock.js — the working-tree diff is the cleanup revert. If it
  is not committed, the failed experiment ships.
- Close MPI-234 (done/complete) with the corrected root note.

## Phase 2 — Outcome B: placeholder still invisible → registry-order fix (1 line)

`js/services/activeGenerations.js` `cancel(id)` — move the status write ABOVE the
exec cancel:

```js
function cancel(id) {
    const entry = _registry.get(id);
    if (!entry) return;
    const tempId = entry.tempId ?? null;
    const extraTempIds = entry.extraTempIds ?? [];
    entry.status = 'cancelled';   // ← MOVED UP: the exec.cancel() below synchronously
                                  //   drains the lane + loop-re-fires a NEW gen; every
                                  //   'running' query during that window must already
                                  //   see this entry as dying (MPI-234).
    entry.exec?.cancel?.();
    end(id, { revokePreview: true });
    Events.emit('generation:cancelled', { id, tempId, extraTempIds });
}
```

Why this and not the gallery rewrite: it kills the inconsistency at the SOURCE for
every consumer (`_firstRunningEntry`, `_syncPreviewQueueState`, PromptBox `_anyRunning`,
GroupHistory queries, statusBar) instead of teaching one consumer to tolerate it. With
this, `generation:started(NEW)` mounts NEW's placeholder immediately (first-running =
NEW even inside the sync window); the later `_rebuildAfterEnd` is a no-op confirmation.

Risk swept: nothing in the `exec.cancel()` chain reads the dying entry's `status`
(store cancel is jobId-keyed; `cancelRunningCueJob`'s own `status === 'running'` lookup
at generationService.js:449 runs BEFORE calling cancel; comfyController.js:813 reads a
/history entry, unrelated).

Guard test: node test that mocks Events + an exec whose `cancel()` synchronously calls
`activeGenerations.start(NEW)` and asserts the started-handler's view
(`listFor('gallery').find(running)`) is NEW, not OLD.

Then re-run Phase 0. Expect clean.

## Phase 3 — Outcome C: STILL failing after Phase 2 → gallery reconcile (card's idea, scoped)

Only if a grid-level permutation survives (e.g. debounced `_rerenderJustified` card
reuse dropping the placeholder). Extract ONE `_syncPlaceholders()` helper =
`grid.el.setGroups([..._placeholdersForFirst(), ..._visibleProjectGroups()])`, called
from started/complete/error/cancelled handlers — registry-derived only, no event
payloads, idempotent. **KEEP first-running-only semantics** — the original card's
"mount ALL running gens' placeholders" silently changes queue-mode UX (later queued
gens are intentionally invisible until promoted); that is a product decision, not a
bug fix. Instrument `MpiGalleryGrid.updatePreview`/`_getCardEntry` first to pin the
actual drop point before touching the grid.

## Phase 4 — status-bar N/M twin (conditional, separate commit)

Only if Phase 0 check #3 still shows inflated totals. Fix = gate
`comfy:step-progress` consumption in commandExecutor until OUR prompt is the one
executing server-side (WS `executing`/ack carries `prompt_id`; ComfyUI executes
serially, so "our prompt started executing" exactly separates the doomed gen's
draining bars from ours). Do NOT try to filter the SSE frames by prompt id — stdout
tqdm has none.

## Success criteria

- Stop during armed Loop → re-fired gen shows placeholder + streaming preview from the
  start, N/M correct, exactly one re-fire. 3/3 Stops clean.
- Guard test green; existing tests (lane-agreement, persist-groups-retry, node-drift)
  untouched/green.
- Working tree committed by pathspec; MPI-226 leftovers no longer floating.
