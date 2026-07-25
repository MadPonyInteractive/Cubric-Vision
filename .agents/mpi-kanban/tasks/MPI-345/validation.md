# MPI-345 Validation

## Root cause (found by code read — no repro needed)

`MpiBaseApp` binds the GLOBAL `generation.run` hotkey at **setup** time:

```js
_unsubs.push(Hotkeys.bind('generation.run', _run));   // MpiBaseApp.js
```

but closing an app only HIDES its overlay:

```js
el.close = () => { overlay.el.hide(); };              // MpiBaseApp.js
```

and the shell destroyed the instance **only when a DIFFERENT app opened**:

```js
Events.on('app:open', ({ appId }) => {
    if (_activeApp) { _activeApp.el.destroy(); _activeApp = null; }   // shell.js — the ONLY destroy
```

So a closed Head Swap left a live `Ctrl+Enter` handler. `HotkeyManager.bind` allows
MULTIPLE handlers per id and `_handle` fires **all** of them, so the next `Ctrl+Enter`
in the main workspace ran the PromptBox's `_triggerRun` **and** the closed app's `_run`
— which re-collected the still-persisted `state.s_appInputs['head-swap']` and called
`submitAppGeneration` → a second, fully tracked queue job.

Every fact in brief.md follows from this:

- **Same parameters as the earlier deliberate run** (4 steps / Hyper tier / 896x1152) —
  the inputs were never cleared; `_run` re-submits the identical snapshot.
- **A real submission with its own prompt id, polled to completion** — it went through
  `enqueueGeneration`, not a replay.
- **Injector logged 8.5 min after the deliberate run** — one keypress enqueued both;
  the remote lane runs one job at a time, so the phantom dispatched (and logged its
  injector) only when the 1m41s Qwen edit drained. 16:42:12 − 1:41 ≈ 16:40:31 = the
  keypress.
- **Nothing to do with ComfyUI 0.28** — pure app-side lifecycle.

Not a queue/lane leftover and not a reuse/CUE re-fire (candidates 2 and 3 in brief.md);
candidate 1 was closest — stale app state — but the trigger was the surviving hotkey,
not the state.

## Fix

Closing an app now DESTROYS it (every open already mounts a fresh instance, so a closed
one is pure garbage that only holds live listeners):

- `MpiBaseApp.js` — re-emits the overlay's close outward: `overlay.on('close', () => { el.close(); emit('close', {}); })`.
  Fires once per close (MpiOverlay emits inside its `_isHiding` guard, so the `el.close()`
  re-entry cannot loop back).
- `shell.js` — on that `close`, nulls `_activeApp` and destroys the instance one tick later
  (the close arrives from inside `MpiOverlay.hide()`; destroying its DOM mid-emit is the
  same teardown race `openAppFromReuse` already defers around).

This kills ALL stale listeners, not just the hotkey (the `preview:frame` subscription too).

## Proof (live, real Electron shell)

`tests/desktop/app-close-destroys-instance.spec.js` — opens Head Swap, closes it, and
asserts the handler count on `down:control+enter` returns to its pre-open value.

```
WITH the fix:     ok 1 ... closing an App releases its generation.run hotkey (10.1s)   1 passed
WITHOUT the fix:  Expected: 0   Received: 1                                            1 failed
```

The negative control was run by `git stash`ing both source files — **the gate bites**.
The same probe passed in browser mode first (`baseline 0 → open 1 → closed 0`, vs
`closed 1` pre-fix).

## Blast radius swept

- `Hotkeys.bind` call sites (30): every other one lives in a block destroyed on navigation,
  or in `MpiCompareOverlay`, which already binds on open / unbinds on close. `MpiBaseApp`
  was the only hidden-but-alive component holding a global hotkey.
- The other shell singletons that hide rather than destroy (`MpiModelManager`,
  `MpiAppLibrary`) bind no hotkeys and dispatch no generations.
- Fix is in the shared frame, so it covers every App, not just Head Swap.

## NOT verified

The end-to-end phantom (two cards from one keypress) was never re-staged — it needs a Pod
plus a Head-Swap-capable session. The mechanism is proven in both directions instead, which
is strictly the same claim at the point where it breaks.

## Also noticed (untouched)

- `tests/desktop/electron-smoke.spec.js` FAILS on master, unrelated to this card:
  `firstWindow()` now returns `splash/splash.html`, so its `toHaveURL(/127\.0\.0\.1:3000/)`
  never matches. The new spec polls `app.windows()` for the shell window instead.
- `js/components/types.js` still carries a "PHASE 3 PENDING / APPLY IS INERT" note for
  MpiBaseApp; the code says Phase 3 was built and then removed after the UX pass.
