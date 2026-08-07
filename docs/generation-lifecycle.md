# Generation Lifecycle

Dispatch → progress → completion/cancel semantics that span `generationService`, `commandExecutor`,
`generationStore`, the status bar, and every per-gen UI surface. Read this before touching Stop,
Cue, queue drain, progress display, or any listener on `generation:*` / `tool:*` events.
Verify a named file/function/flag still exists before relying on an entry.

## Dispatch guard — empty-media ops never reach ComfyUI (MPI-109)

Pressing Cue/Q with an empty PromptBox on a media op used to dispatch a generation with no media
injected. The workflow JSON ships baked-in default filenames on LoadImage/LoadVideo nodes (authoring
residue) that exist locally but not on a clean Pod → `prompt_outputs_failed_validation` / 503 →
bug-report dialog. Guard lives at the TOP of `startGeneration` (`generationService.js`) — single
chokepoint covering Q hotkey / Cue button / loop re-fire. Required-slot unsatisfied → `ui:warning`
toast + `return null`.

The same chokepoint also gates `requiresMask` ops (detail/inpaint) with no `maskDataUrl`
— `_needsMaskButHasNone` + `_warnMissingMask`, mirrored at enqueue + dispatch (MPI-337). A missing
requirement toasts + `return null`; it NEVER switches the op (the op stays selected, dimmed).
Op availability is data-driven from `commandRegistry` `mediaInputs` slot count + `requires*`:
`getAvailableCommands` admits an op only when `requires* ≤ staged count ≤ #slots of that type`
(+ `requiresMask`) — so a type's MAX capacity = its declared slot count.

## An UNINSTALLED operation is undispatchable — the gate is the mechanism (MPI-453)

Per-op weights used to be opt-in (`models.js` `operations[].deps`), so a model could be installed
for one operation and not another — Wan 2.2 with the i2v pair but no t2v. MPI-470 deprecated Wan's
`t2v_ms` and the shape was removed on 2026-08-07, so **every model is one install unit now** and the
partial-install state is unreachable. The gate still matters, for a different reason: a model can be
installed and still not run an op it no longer declares (a legacy history item naming `t2v_ms`,
whose graph is deleted). `isOperationInstalled` therefore requires the op to be in `supportedOps`
BEFORE it asks about weights — without that, a flat model answers "yes" for any op string. The
weights predicate is `deriveInstalledOps` (`resolveModelDeps.js`); every op-picking surface reaches
it through `modelRegistry`:

- `installedOpsForContext(model)` → the `installedOps` ctx key `getAvailableCommands` filters on.
  **It returns `null`, not `[]`, when the dep-status cache is unseeded** — null means *unknown* and
  falls back to the static `supportedOps`; `[]` would hide every op on a cold boot (MPI-122's
  contract). Consumers: the PromptBox strip (via its own `_ctxWithInstalledOps`) and
  `MpiGroupHistoryBlock._opOptions`.
- `firstInstalledOp(model)` → what a fallback seeds. **Never seed from `supportedOps[0]`** — that
  static list opened Wan 2.2 on `t2v_ms` regardless of what was on disk, and the strip (which DOES
  filter) then shows a selection it never offered. Fixed at all three `MpiGalleryBlock` sites; the
  remembered op (`getSelectedOp`) is re-checked too, since an uninstall leaves it dead but selected.
- The hard net is in `commandExecutor`, beside the MPI-209 arch-weight guard: op declares its own
  deps + dep-status cache present + not installed → `ui:warning` naming the operation, and no
  dispatch. The UI is where the op is CHOSEN, never where undispatchability is proven — a reused
  card or a stale memory can name an op no surface offered.

Both guards skip when the dep-status cache is empty: unknown is not absent, and a false block would
refuse a generation whose weights are present. When one slips through anyway, ComfyUI's
`value_not_in_list` on `unet_name` is caught and toasted by name — `docs/comfy.md` § the 400 body.
Do NOT fix this class by splitting a model into one Library entry per operation — that is a
different question from the (removed) per-op INSTALL groups. A model gets its own card when it is
its own model: MiniMax H3 and MiniMax H3 Reference are separate cards because they are separate
transformers with different inputs (MPI-475), not because their ops are separately installable.

## The op never forces DOWN — two named exceptions only (MPI-337/356/388)

MPI-337 killed the blanket force-DOWN: losing a required input leaves the op selected and dimmed,
and Run toasts. Exactly two exceptions drop the op to the model's text-only op, and both call the
SAME `_dropToTextOp()` in `MpiPromptBox.js` — never fork it:

1. **Last chip leaves the box** (MPI-356) — the media→zero *transition* inside `_emitMediaChange`.
2. **Workspace entry** (MPI-388) — `el.dropToTextOpIfEmpty()`, called by `MpiGalleryBlock` after
   `_wirePromptBox` + the count sync. Needed because the Gallery seeds its op from
   `getSelectedOp(activeModelId)` (the MPI-247 per-model memory), which happily replays a
   media-hungry op onto a box that mounts empty; exception 1 can't fire, having seen no transition.

Both pass `programmatic: true`, so `s_selectedOpByModel` keeps the user's real pick and
`_pickFallbackOp` restores it when media returns. Both are skipped in History video-continuation
mode (`filterNoInputOps` HIDES text ops — MPI-281). The which-op decision is
`pickTextOnlyOp(mediaType, model, ctx)` in `commandRegistry.js`; it excludes `requiresMask` ops, so
an empty box never lands on `inpaint`. Reuse Prompt is authoritative and gets NEITHER exception.

## History dispatch — the SELECTED entry is the media (MPI-351)

The History workspace runs one op on one entry, so `_generationFromPromptPayload`
(`MpiGroupHistoryBlock.js`) ignores the PromptBox chip rail: an image group resolves to the
selected entry alone, whatever the op strip offers. It used to prepend that entry only when the
rail was EMPTY, and chips persist per workspace in `state.promptMedia[wsKey]` and re-inject on
every mount — so ONE image staged once owned `Input_Image` for every later run, invisibly (the
panel hides behind the History prompt rail tool). Read it as: a wrong-looking output here means
reading the `.meta` sidecar's `generationSettings.mediaItems`, not the output size.

Video is NOT collapsed to the entry — `i2v` requires an IMAGE `startFrame` a video entry can never
fill. There, role-tagged `startFrame`/`endFrame` (the dedicated slots in `MpiToolOptionsPrompt`,
plus the Extend/New-shot last-frame capture) and non-image chips survive; untagged rail images do
not. Multi-image ops belong in the Gallery. Reuse no longer injects images in an image group, and
the mount clears the restored chip.

## Progress pipeline — ComfyUI stdout is the truth, WS events are useless (MPI-147)

The status-bar progress bar is driven by **parsing ComfyUI's stdout**, NOT the WS `progress`/`progress_state` events. Why: ComfyUI 0.26's WS reports the SLOW phases (model-init, VAE decode) as binary `0/1` nodes, and LTX samplers are tiny (3-7 steps, done in seconds) — so a WS-weighted bar froze at 0%, snapped to a wrong %, or hung at 90%. The rich signal (tqdm `N/M [elapsed<eta]` per step + `Model Initializing` markers) exists ONLY on stdout. Flow: `routes/comfy.js _handleComfyOutput` parses tqdm → broadcasts `comfy:step-progress` (and `comfy:tile-progress` for `USDU:` bars, `comfy:segment-total` for detailer `# of Detected SEGS:`) over the `/comfy/events/stream` SSE → `commandExecutor.js` SSE listeners → `phaseProgress.js` (createStageProgress) → `tool:stage` + `tool:progress` → statusBar.

Model: the bar runs **0-100% PER tqdm bar** and the status bar shows `Stage N/M` so each reset reads as "next stage", not a bug. `M` (bar count) is RECORDED per workflow+run-mode in `js/data/progressStages.js` (can't be derived from JSON; same file = different count single/preview/stage2). Self-declaring nodes need no `single` entry: UltimateSDUpscale (`USDU: t/T` = tiles), detailer (`SEGS: N` = areas) — their bar **overrides** any recorded total, so a `single` for them is dead weight. But a pass that runs AFTER the tiles (krea2's upscale refiner, MPI-350) is invisible to tile mode, so it records `postTile: N` instead — a DELTA added to the live tile count, never a total. Two traps here: (a) `routes/comfy.js` forwards the RAW tqdm value, so T tiles emit **T+1** `comfy:tile-progress` events — the trailing `T/T` fires AFTER the last tile's inner bar, which is why tile mode only re-arms its post-tile detector while `tileIndex < tiles`; (b) tile mode ends on the second inner bar with no tile bar in front of it, which assumes ONE inner bar per tile — true only while every USDU card runs `seam_fix_mode: "None"`. ImageUpscaleWithModel (ESRGAN) emits NO signal → indeterminate pulse (`shell-info__fill--indeterminate`). Which kinds open the SSE: `STEP_EMITTING_KINDS` in commandExecutor + `buildWeightMap` kinds in progressAggregator. Timer/card/toast all anchor at `prompt_ack` (`tool:accepted`) so they match + exclude ComfyUI cold-start boot. REMOTE (MPI-147, wrapper ≥0.2.19): the Pod wrapper now ALSO parses ComfyUI stdout — `wrapper.py` spawns ComfyUI with `stdout=PIPE` (stderr merged) and a reader task drains it as raw CHUNKS (not `readline` — tqdm `\r`-redraws a live bar with no `\n` until done, so readline would collapse per-step progress into one final event) and broadcasts the SAME `comfy:step/tile/segment` SSE events the local engine does (`_parse_comfy_line` is a direct port of `_handleComfyOutput`). `remoteProxyForward.js` (MPI-175 split; was remoteProxy.js) relays `/wrapper/events/stream` → `/comfy/events/stream` unchanged, so the app's listeners are identical local vs remote — no app change. Verified live on an A4500 Pod: LTX t2v showed Stage 1→2→3 with per-step fill, same as local. (The old WS-aggregator fallback still kicks in only if a Pod runs a pre-0.2.19 wrapper that emits no step events.)

## Per-gen identity doctrine — stop/cancel + two lanes (MPI-195/203/208/245)

The recurring hazard around **Stop** and **cloud+local concurrency (MPI-74 P6)**: several pieces of app state are singletons that assume ONE generation at a time, but two things break that assumption — (a) ComfyUI `/interrupt` is **advisory**, so a Stopped gen can still finish with real output and emit a LATE terminal; (b) two lanes (`_lanes.remote`, `_lanes.local`) run concurrently, so two gens emit lifecycle events into the same singleton. A late/foreign event corrupting shared state was the root of five bugs in one saga. The fix pattern is always the same: **tag the event with the gen's id and guard the consumer on identity.**

- **Gallery card / group-history viewer** (`MpiGalleryBlock`, `MpiGroupHistoryBlock`): Stop deletes the id from `_myGenIds` synchronously; a gen that finishes anyway then had its `generation:complete` dropped and the saved card never rendered (silent loss — `addGroup` persisted it but the grid never rebuilt). Fix: `_stoppedPendingComplete` bridge set — record ids Stopped-but-maybe-finishing, re-admit their late complete, prune on error/empty-cancel.
- **Missed terminal WS** (`comfyController._reconcileFromHistory`): remote terminal events are `broadcast=False` + not replayed; when reaped, the reconcile resolved the `runWorkflow` promise but **nobody consumes that value** → gen wedged (card RUNNING forever, output stranded in `/history`). Fix: reconcile REPLAYS synthetic `executed` + `execution_success` through the prompt's own listener so the normal completion path drives (card + bar + lane). commandExecutor dedups replayed nodes via `_executedSeenNodes`.
- **Cue lane** (`generationService._dispatchNextCue` wrapper): a Stopped job's late settle called `finishCueDispatch` and freed the lane a SECOND time — after the stop already promoted the next job — wiping the successor's active slot (queue 0 JOBS, successor unstoppable). Fix: identity guard — free the lane only if `_lanes[lane].active === next`.
- **Status bar** (`statusBar.js`): a global singleton keyed only on `tool === 'groupHistory'`, no gen identity. A late terminal from a Stopped gen reset the bar off a running successor; and with two lanes, one lane's events stomped the other (a LOCAL gen ran with an idle bar). Fix: every DRIVING `tool:*` event carries `id` (from `exec.genId` / `_regId`) and `_latch(id)`s the bar (last-active-wins); a terminal clears the bar ONLY if it still owns `_activeGenId`; a surviving lane's next event re-latches (fallback). Untagged null id = legacy explicit cancel, honored unconditionally.
  - **MPI-208 Phase 4 — the bar now DERIVES ownership + idleness from `generationStore`, not the tool-event race.** The `tool:*` listeners still paint visual DETAIL (label, %, stage), but a `generation-store:changed` subscription answers the two questions the race got wrong: (a) **survivor re-latch** — when the bar's owner leaves `running` but another lane is still live, re-derive the display job from the store's `running` set and re-latch (fixes "empty bar while a gen runs"); (b) **self-heal to idle** — store has no running job → force idle, gated on `_activeGenId !== null` so a normal completion flash isn't stomped (fixes stuck-bar / missed-terminal). The store job's `genId` === the `tool:*` `id` (wired via `startGeneration → payload.genId → store.register`), so the snapshot correlates to `_activeGenId`. The `job.genId !== null` re-latch guard is LOAD-BEARING — it excludes suppressed tool-panel previews (MpiToolOptionsResize `runCommand`, no genId, no `tool:*` events) from flashing "Starting". `_stageText` cleared on display-job change fixes the stale "4/4" suffix bleeding onto a later non-upscale gen.
- **Dead STOP on an orphaned card** (`generationService.cancelRunningCueJob`, MPI-245): the Cue panel renders its RUNNING row from `_lanes[lane].active` (`getGenerationQueueSnapshot`), but STOP resolves the job through the `activeGenerations` **registry**. When a gen dies early (ComfyUI rejects the prompt), `exec.onError` → `activeGenerations.end()` **deletes the registry entry** while the lane intent survives → the panel still shows a live STOP whose lookup finds nothing and hard-returns `false`. Silent no-op, card stuck forever, pending job never promotes. No race, no timing window — just two surfaces disagreeing about whether the job exists. Fix: when the registry has no entry, fall back to draining the orphaned lane (`_onLaneDrain`).

- **A registered job that never settles kills its lane FOREVER** (`commandExecutor` `_failBail`, MPI-463): `generationStore.register()` takes a **lane slot**, and `_laneBusy` is *derived* from the store's `running` list (INV-6) — so from register() onward, every exit path owes the store a terminal. Eleven pre-dispatch bails (op-not-installed, arch weight, workflow resolve/fetch, trimmed-video prep, missing LoRA, empty media slot, model-not-local, injector, input defaults, preview-latent staging) called `exec.onError` and returned without one, so `_dispatchNextCue` skipped that lane until the app restarted. It does not read as an app bug: the next gen sits on **QUEUED** while the ENGINE queue is EMPTY and the server log is silent — i.e. exactly like a dead ComfyUI. Fixed structurally: **`_failBail` settles to `PHASES.ERROR` then reports, and every pre-dispatch bail routes through it** — the twin of the post-dispatch catch, which already settles once at its own top (that is why ITS nine `exec.onError` branches are correct). Pinned by `tests/lane-settle-on-bail.test.cjs`, which bounds the region by its two anchors and fails on any unsettled bail. **When you add a bail there, call `_failBail`** — that is the whole point of it existing.

Rule of thumb when adding ANY new per-gen UI/state: if two gens (or a Stopped gen's late echo) can touch it, tag the signal with the gen id and reject foreign ids — don't key on `tool` alone. And if a control is *rendered* from one source of truth, it must *act* on that same source — a button drawn from `_lanes` but wired to `activeGenerations` is a dead button waiting to happen.

## Mask detects are a UTILITY LANE — never a queue job (MPI-421)

An auto-mask detect (Detect / Points / Text) is a real ComfyUI workflow, but it does **not**
enter `_cueQueue` or `generationStore`. Three reasons, and the first is the one that bites:

1. **It would gate itself off.** A store job raises `state.generationQueueCount`, and both
   `MpiCanvasViewer._isCueBusy()` and `MpiMaskDetectRow._syncGate` disable the detect row while
   that count is non-zero — a detect occupying the queue disables its own Stop button.
2. **It cannot queue behind a generation anyway.** That same gate already makes detects and the
   cue queue mutually exclusive, so the "stuck behind a long gen" risk never existed.
3. **The queue's completion machinery is media-shaped.** `generationService` reads a zero-media
   completion as a cancel, and `notificationService` folds every `generation:complete` into the
   coalesced "N generations finished". A mask detect returns no media and deserves neither.

So it drives `StatusBar.progress.*` **directly** (`prepare` + `setIndeterminate` + `startClock`,
`complete()`/`cancel()` on settle) instead of emitting `tool:*`. That is not laziness: `tool:*`
would `_latch(id)` an owner the store can never confirm, and the MPI-208 self-heal above force-
idles exactly that. A null owner leaves the self-heal inert. Indeterminate is honest — SAM3
emits no tqdm, so there is no percentage to show. A gen starting mid-detect simply re-latches
the bar to itself, and the detect's terminal is ignored because it no longer owns it.

Rule this generalises to: **a non-generation ComfyUI run gets the bar, not a lane.** If it has
no media output and no gen id, keep it out of the store and drive the display directly.

**Stopping it exposed a bar bug that was never detect-specific.** `progress.cancel()` never
removed `shell-info__fill--indeterminate` — only `complete()` did, on its way to the 100% flash —
so ANY stopped no-progress job (an ESRGAN upscale just as much as a detect) left the fill sweeping
under an `IDLE` label until the next job's `_beginActiveCycle()` cleared it on the way in. That
next-job cleanup is why it survived this long. The removal now lives in **`_setIdle()`**, the one
funnel every terminal reaches — same argument as the MPI-111 timer hard-stop sitting there. Enter
and exit clear the identical class list, and `tests/status-bar-idle-clears-pulse.test.cjs` holds
them equal.

## Post-cancel UI writes must reconcile — loop re-fire is SYNCHRONOUS (MPI-234)

An armed-loop re-fire runs **synchronously inside any cancel call** (`activeGenerations.cancel` / `cancelRunningCueJob`): store cancel → lane drain → loop callback → `enqueueGeneration` → `startGeneration` all complete BEFORE the cancel call returns — a NEW gen is running (registry entry, mounted placeholder, latched status bar) by the next line. Any UI write placed AFTER a cancel must reconcile from the registry/store, never assume idle. Two stompers shipped this way: the gallery Stop handler's `setGroups(projectGroups)` wiped the re-fire's just-mounted placeholder (fix: `setGroups([..._placeholdersForFirst(), ...groups])`); statusBar's store reconcile only healed active→idle, so a `_latch` while idle left `genId === owner` and the owner-equality check skipped re-arming forever (fix: re-arm when a live store job exists and the bar is idle — store truth wins BOTH directions). Cost 6 failed point-fixes in MPI-226 because every patch targeted the lifecycle handlers while the stomper ran after them.

## Completion notifications COALESCE (one per WHOLE-queue drain)

Per-gen completion feedback is NOT per-gen — neither the toast nor the OS notification. `notificationService` owns it: every `generation:complete` just `_doneCount++`; ONE notification fires when the **whole queue** drains, routed at flush time — unfocused + pref on → one OS notification "N generations finished."; else → one in-app summary toast (which rings the chime once). `progress.complete()` mounts NO toast.

**Drain signal = `state.generationQueueCount === 0`, NOT `generationStore.depth`.** The cue queue (`generationService._cueQueue`) feeds the store ONE job at a time, so the store's own depth hits 0 between every item → keying on it fires per-gen. `generationQueueCount` = `_cueQueue.length + running` is the true whole-batch depth. **Flush is debounced ~150ms via a SINGLE timer** (`_flushTimer`, never stacked): the last item's `generation:complete` and the count reaching 0 fire from decoupled paths in either order, and pressing Cue again re-derives the count. A count going NON-zero (queue refilled) CANCELS the pending flush — the new batch flushes when IT drains, so `_doneCount` carries across rapid re-cues and folds into one "N generations finished." Without the cancel, a slow pending flush from a finished cue fired "as the next cue starts." Re-check the count is still 0 inside the timer.

**Arm the flush from BOTH edges, not just count→0 (single-gen fix).** `generationService` calls `activeGenerations.end(_regId)` — which releases the store lane → `generationQueueCount` recomputes to 0 — BEFORE it emits `generation:complete` (which does `_doneCount++`). So on a SINGLE gen the count→0 edge lands while `_doneCount` is still 0: if only that edge armed the flush it bailed (`_doneCount <= 0`) and nothing re-triggered → **no completion toast on a single gen** (multi-gen "worked" only because an earlier item had already bumped `_doneCount`). Fix: a shared `_maybeArmFlush()` is called from BOTH `generation:complete` (after the `++`) and the count→0 `onState` edge; whichever lands last with `count==0 && _doneCount>0` arms the single timer, and the timer's fire-time re-check still settles a Cue-refill in the gap.

**Sound (unchanged design; the coalescing is what made per-gen completion sound safe again):**
- **OS notifications already ring their own OS sound** (`main.js showOsNotification` keeps `silent: false`). So when a completion goes to the OS path (unfocused + that type's pref on), the in-app chime does NOT also fire — no double. Don't pass a `sound`/`silent` flag through the `notify-*` IPC to gate it.
- **In-app chime** = `MpiToast`'s burst-start `notify.wav`, gated by `getToastSound()` (key `TOAST_SOUND`, the "Play sound on notification" setting) and by `props.sound !== false`. It rings once at the START of a burst (empty stack). Because completions coalesce to ONE toast per queue-drain, a long queue = one chime, not a per-gen flood (the reason it was previously suppressed). User-triggered actions (Connect/Install/Cue) still pass `sound:false` so a click never rings.
