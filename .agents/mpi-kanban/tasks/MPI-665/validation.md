# MPI-665 — validation

## The failure

CI run 33373667728 (master, commit `2cc888cd`, docs-only) failed one desktop spec and
blocked every push via `.husky/pre-push`:

```
tests\desktop\fullscreen-titlebar.spec.js:5:1 › F11 fullscreen hides the custom titlebar
  Expected pattern: /window-fullscreen/
  Received string:  "page-landing"
    2 × locator resolved to <body>…</body>          - unexpected value ""
    7 × locator resolved to <body class="page-landing">…</body>
```

The two `""` polls are the tell: at the moment F11 was pressed the shell had not booted
at all. The previous run (33371816031) was green and the triggering commit touched only
docs — a pre-existing race, not a regression.

## Root cause

`tests/desktop/shellWindow.js` returns the shell window at `domcontentloaded`. The
renderer boots asynchronously *after* that: `js/init.js` awaits `initPaths()` and only
then `initShell()`, whose **step 0** is `Hotkeys.init()` — where F11 (`system.fullscreen`,
`js/managers/hotkeyRegistry.js:588`) is bound.

So the helper can hand a spec a window with no F11 handler. Every other desktop spec
survives by accident: its first action is a locator, which auto-waits. This spec's first
action is `window.keyboard.press('F11')`, which does **not** auto-wait. The key lands in a
renderer that is not listening, no `window-fullscreen` IPC is ever sent, and nothing later
recovers it — `bindWindowControls`' `invoke('window-state')` only re-reads a fullscreen
state that was never entered.

## Proof of the mechanism

Probe — is the shell booted when `shellWindow()` returns today?

```
{"run":0,"msToDomcontentloaded":1531,"atShellWindowReturn":{"bodyClass":"page-landing","booted":true},"extraMsUntilBooted":50}
{"run":1,"msToDomcontentloaded":935, "atShellWindowReturn":{"bodyClass":"page-landing","booted":true},"extraMsUntilBooted":28}
{"run":2,"msToDomcontentloaded":843, "atShellWindowReturn":{"bodyClass":"","booted":false},"extraMsUntilBooted":41}
```

Run 2 reproduces the exact CI state (`bodyClass: ""`). Pressing F11 at that moment, over
6 launches:

```
{"run":3,"bootedAtPress":false,"wentFullscreen":true}
{"run":4,"bootedAtPress":false,"wentFullscreen":true}
{"run":5,"bootedAtPress":false,"wentFullscreen":false}   ← the CI failure, locally
→ 5/6 reached fullscreen
```

(Runs 3–4 show the fatal window is narrower than "not booted": F11 landing after
`Hotkeys.init()` but before the body class still works. The gate below is strictly
earlier than the class, so it covers both.)

## Fix

`shellWindow()` now waits for the shell to have booted, not merely parsed, before
returning — `focusModeService` puts the `page-*` class on `body` from `_bootApp()`, the
last thing `initShell` does, so it marks the whole shell live (hotkeys at step 0,
`bindWindowControls` at step 4, both strictly earlier). One file, test-side only; no
product code changed.

## Evidence

- Same 10-launch harness with the gate applied: **10/10 reached fullscreen**.
- `npx playwright test fullscreen-titlebar --repeat-each=6` → **6 passed** (14.4s).
- `npm run test:desktop` → **40 passed** (3.0m).
- `npm test` → **817 pass / 0 fail**.
- Board validator: 1 violation, pre-existing and not mine — an untracked, gitignored
  `state/files/` claim belonging to the live MPI-591 session.
