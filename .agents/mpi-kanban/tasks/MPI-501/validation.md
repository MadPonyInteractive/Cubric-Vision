# MPI-501 — validation

**State: implemented, unit-verified. The live proof rides on the next GPU leg.**

## What shipped

Three callers of `restart-comfy` existed; all three restarted **unconditionally**.

| caller | change |
|---|---|
| `js/services/comfyController.js` (the generation gate) | drain-wait, 5 min ceiling, then **refuse** with `code: 'restart_blocked_busy'` and an actionable message |
| `js/shell/navigation.js` (dev radial) | same guard, 30s ceiling — an explicit human action refuses fast so they can Stop it or wait |
| `routes/remoteModels.js` (universal-node install, server-side) | drain-wait 10 min, then **skip the restart** and log an error naming the consequence |

The renderer helper is `comfyController.waitForIdleQueue({ timeoutMs })`, engine-aware via
`httpBase()` so one call covers local and remote. `routes/remoteModels.js` has a server-side
twin (`_waitForIdleQueue`) because it talks to the wrapper directly, not through `/proxy`.

**It deliberately does NOT reuse `getQueue()`.** That one folds a failed read into
`{running: [], pending: []}` — for a safety gate that reads as *idle* and green-lights exactly
the restart this exists to block. Here a failed read is UNKNOWN: a blip keeps waiting, three
consecutive misses mean ComfyUI is not answering at all, so there is no in-flight prompt left
to protect and the restart IS the repair (a wedged engine must stay fixable).

## Why the third caller refuses instead of waiting forever

`ensureUniversalNodesOnVolume` is fired **non-blocking** by `remotePodLifecycle`
(`_ensureUniversalNodes`, once per Pod on the first `comfy_ready` poll), so waiting there costs
nothing. But it cannot retry: on a later call the packs read as present, `missing` is empty and
no restart is attempted at all. So a 10-minute ceiling then a loud skip — which degrades to the
documented pre-MPI-438 behaviour (a generation needing the pack reports its own
`missing_node_type`), strictly better than silently destroying finished work.

## Verified

`node --test tests/restart-drain-wait.test.cjs` — drives the REAL `waitForIdleQueue` off
`js/services/comfyController.js` (it imports clean in bare node) with a stubbed fetch. 10 asserts,
all green:

- empty queue -> `true` on one read;
- `queue_running` non-empty past the deadline -> `false` (the whole card);
- `queue_pending` non-empty -> `false` too — a restart drops the queue as well;
- busy then drained -> `true`, having polled;
- ONE failed read -> keeps waiting, does not short-circuit to idle;
- three consecutive failed reads -> `true`, so a wedged ComfyUI stays repairable.

Also green after the change: `universal-nodes-remote`, `comfy-needs-restart`,
`remote-uninstall-reporting`, `remote-status-fail-closed`, `prompt-partial-validation`,
`orphan-sweep-remote`, `tab-flip-target` (19 asserts). `npx eslint` clean on all changed files
(the one warning in `routes/remoteModels.js:731` is pre-existing, not in this diff).

## Not proven yet

The live half: a matrix run with the app **left open** on the engine path, which is the exact
condition that orphaned `minimax-h3/t2v_ms` twice. The next GPU leg is that test — if the op
passes with the app live, the fix is proven in the only place it matters.


## 2026-08-09 04:15Z — the retry leg did NOT exercise this guard

`minimax-h3/t2v_ms` PASSED at 123s with the app **open** and the renderer live on the engine
path (14x `hot-store ensure HTTP 404 — generating from volume` at 04:16:12, `stage-on-connect
warmed 14 model(s)`) — the exact condition that orphaned it twice.

**But no restart was ever requested.** `app.log` has no `/proxy/restart-comfy` and records
`04:18:28 [runpod] universal nodes: 7/7 already on volume`, so `out.installed` was empty and
the server-side caller never fired either. The op passing therefore proves the op is healthy —
it does NOT prove the drain-wait works, because the drain-wait never ran.

**Cheapest live proof, no rental:** local engine, queue a long generation, then the dev radial
restart. Expect the `Restart blocked` toast and ComfyUI still running. That exercises
`navigation.js` -> `waitForIdleQueue` against a real non-empty `/queue`.

## 2026-08-09 19:00Z — PROVEN LIVE. The guard fired.

Fabio ran exactly that, in his own app on the LOCAL engine: queued a generation, then hit
the dev radial's Restart Engine while it was still running. **The restart was refused and
ComfyUI kept running.** That is `navigation.js` -> `waitForIdleQueue` against a real
non-empty `/queue` — the leg the 04:15Z GPU run could not supply, because nothing there
ever requested a restart.

The logic is proven. What the same run exposed is the SURFACE.

### Two defects in how the refusal was reported (both fixed, same file)

**1. It rendered as the crash dialog.** The refusal was emitted on `ui:error`, and
`js/shell.js:392` maps that to `showError(title, message)` — the modal with an
"Error Summary (optional)" box and a **REPORT ON GITHUB** button. The guard working
correctly was inviting a bug report against itself. `ui:warning` is the toast channel
(`js/shell/statusBar.js:579` -> `StatusBar.notify(message, 'warning', 6000)`), which is
what a by-design refusal should use.

**2. The wording told them to do what they had just done.** It read *"Stop it or let it
finish, then restart."* They had clicked **Restart Engine** a second earlier. And outside
this radial nobody restarts ComfyUI by hand at all: the radial is dev-only
(`navigation.js:310`, `if (!APP_CONFIG.dev_mode ...) return`), and every other restart in
the product is fired BY the app after a node install. Now reads:

> Restart cancelled — a generation is still running on the engine. Stop it, or wait for it
> to finish.

### The user-facing twin was already correct — checked, not assumed

`comfyController`'s gate emits `comfy:error`, which is NOT the GitHub dialog: `shell.js:386`
routes it to `_startingComfy.el.setError(message)`, the engine-start modal. Its wording
("New nodes need the remote engine restarted, but a generation is still running on it.
Wait for it to finish, then try again.") never asks the user to restart anything, because
in that path the app asked, not them. No change made there. The third caller
(`routes/remoteModels.js`) has no UI surface by design — it logs and skips.

`npm test` 530/530 green after the change; `npx eslint js/shell/navigation.js` clean.

**Remaining: one look.** Re-run the same steps and confirm the refusal now arrives as a
warning toast instead of the dialog. The logic is proven; this is the pixel.


## 2026-08-09 20:02Z — THE PIXEL. Toast confirmed, card closed.

Proven against Fabio's own running app on `:3000` (he was benching on the standalone
`:8188` install and cleared the app for use), with a `playwright-cli` real-pixel probe.
`ui:warning` was emitted from the renderer carrying the **exact string** that
`navigation.js:279` emits, and the DOM was read 400ms later:

```
mpi-toast mpi-toast--warning mpi-toast--open
mpi-toast__label  "Heads up"
mpi-toast__msg    "Restart cancelled — a generation is still running on the engine.
                   Stop it, or wait for it to finish."
crashDialogs: []      <- nothing matching /REPORT ON GITHUB|Error Summary/
```

Screenshot: `restart-refusal-toast.png` in this folder (copied out of `.playwright-cli/`,
which is gitignored and gets wiped). Warning-orange dot, 6s progress bar, mascot — the
ordinary toast, not the modal.

**What this proves and what it does not.** It proves the surface: the channel
`navigation.js` now emits on renders as a warning toast and cannot reach `showError`.
It does not re-prove the guard — that was proven live at 19:00Z by Fabio's own restart
click on a busy queue, and the emit sits **inside that same refusal branch**
(`navigation.js:271-282`, the `if (!await ... waitForIdleQueue(...))` body), so no third
state exists between "refused" and "this toast". Driving a real restart again was
deliberately NOT done: the engine root is shared with his live app, so a restart that
was *not* refused would have taken down the engine he is using.

**Closed.** All three callers shipped, 10 asserts on the real helper, the guard proven
live, and the refusal now reports as a by-design warning instead of a crash report.
