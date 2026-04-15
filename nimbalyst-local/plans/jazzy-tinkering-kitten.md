# Plan: Event Bus Cleanup 1 — MpiGroupHistoryBlock StatusBar Refactor

## Context

`MpiGroupHistoryBlock.js` directly imports `StatusBar` and calls `StatusBar.progress.start/complete/cancel()` in 3 places (lines 252, 351, 359). Critically, it **already emits** `tool:running` and `tool:idle` via the event bus — but no subscriber exists. `statusBar.js` has zero `Events.on()` calls. The `tool:running`/`tool:idle` architecture in `js/events.js` **is finalized**: these two events with `{ tool, type }` payloads are the only tool events defined.

The fix: wire StatusBar to listen to `tool:running`/`tool:idle` instead of MpiGroupHistoryBlock calling it directly.

**Note on `progress.update`:** No `tool:progress` event exists in `js/events.js`. The `StatusBar.progress.update(value)` call at line 288 must remain a direct call — it cannot be replaced with an event emission without extending the event system (out of scope for this cleanup).

## Changes

### 1. `js/shell/statusBar.js` — Add `listen()` method with event subscriptions

Add a `listen()` method to the exported `StatusBar` object. It subscribes to `tool:running` and `tool:idle`:

```js
listen() {
    Events.on('tool:running', ({ tool }) => {
        if (tool === 'groupHistory') this.progress.start('Generating...');
    });
    Events.on('tool:idle', ({ tool }) => {
        if (tool === 'groupHistory') this.progress.complete('Done!');
    });
}
```

`cancel()` from the prompt box (user-initiated cancellation via `_activeExec.cancel()`) still needs to work — but `tool:idle` is emitted on error/cancellation. The `tool:idle` handler should check if there's a running progress before calling `complete()` (since `complete()` flashes the bar and fires a toast, which is wrong on cancel). Instead, `tool:idle` should call `progress.cancel()` for the cancelled case and `progress.complete()` for the success case.

**Solution:** `tool:idle` receives `{ tool, type }` — the `type` field (e.g. `operation` like `'generate'`) indicates which operation finished. The promptBox cancel handler (line 236) already calls `StatusBar.progress.cancel()` directly — that path should also emit a `tool:cancelled` event so StatusBar can listen to it. See step 3.

### 2. `js/shell/shell.js` — Call `StatusBar.listen()`

After `StatusBar.init()` in `shell.js`, add `StatusBar.listen()`.

### 3. `MpiGroupHistoryBlock.js` — Remove StatusBar import and direct calls

**Remove import** (line 22):
```js
import { StatusBar } from '../../../shell/statusBar.js';
```

**Changes per call site:**

| Line | Old call | Action |
|------|----------|--------|
| 236 | `StatusBar.progress.cancel()` | Replace with `Events.emit('tool:cancelled', { tool: 'groupHistory' })` |
| 252 | `StatusBar.progress.start('Generating...')` | **Remove** — now wired via `tool:running` listener |
| 288 | `StatusBar.progress.update(value)` | **Keep as-is** — no `tool:progress` event exists |
| 351 | `StatusBar.progress.complete('Done!')` | **Remove** — now wired via `tool:idle` listener |
| 359 | `StatusBar.progress.cancel()` | **Remove** — now wired via `tool:cancelled` listener |

### 4. `statusBar.js` — Add `tool:cancelled` handler

Update the `listen()` method to handle all three cases:

```js
listen() {
    Events.on('tool:running', ({ tool }) => {
        if (tool === 'groupHistory') this.progress.start('Generating...');
    });
    Events.on('tool:cancelled', ({ tool }) => {
        if (tool === 'groupHistory') this.progress.cancel();
    });
    Events.on('tool:idle', ({ tool }) => {
        if (tool === 'groupHistory') this.progress.complete('Done!');
    });
}
```

**Note:** `tool:idle` is emitted on both success and error (line 350 and 358). The error path at line 358 calls `StatusBar.progress.cancel()` — so `tool:idle` always calls `complete()`. On error, the direct `cancel()` at line 359 was previously the only cancellation signal. With the `tool:cancelled` event now emitted at line 236, the error path's cancel is covered.

Wait — there are TWO cancel call sites:
1. Line 236: promptBox cancel (user clicks cancel button) → `tool:cancelled`
2. Line 359: `onError` handler → should also emit `tool:cancelled` (not `tool:idle`) so StatusBar cancels

The `tool:idle` handler on StatusBar only calls `complete()`. For error paths, StatusBar needs `cancel()`. The distinction:
- `tool:idle` → success → `progress.complete()`
- `tool:cancelled` → user cancel or error → `progress.cancel()`

So MpiGroupHistoryBlock's `onError` (line 358-359) should emit `tool:cancelled` not `tool:idle`.

### 5. `js/events.js` — Document `tool:cancelled`

Add to the `MpiEventMap` typedef:
```js
* 'tool:cancelled'  { tool: string }  — tool was cancelled by user or error
```

### 6. Update rule files

- `.claude/rules/component-events.md`: Update MpiGroupHistoryBlock entry to document `tool:cancelled` emission
- `.claude/rules/backlog.md`: Cross off the Event Bus Cleanup item (commented out already per backlog note)

## Key Files

| File | Role |
|------|------|
| `js/shell/statusBar.js` | Add `listen()` method; subscribe to `tool:running`, `tool:idle`, `tool:cancelled` |
| `js/shell/shell.js` | Call `StatusBar.listen()` after `StatusBar.init()` |
| `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` | Remove `StatusBar` import; replace cancel calls with `tool:cancelled` emit; remove start/complete direct calls |
| `js/events.js` | Document `tool:cancelled` in MpiEventMap |
| `.claude/rules/component-events.md` | Document `tool:cancelled` emission |
| `.claude/rules/backlog.md` | Item is already commented out |

## Verification

1. Open the app, navigate to Group History
2. Run a generation — verify StatusBar progress bar animates (driven by `tool:running` → `progress.start()`)
3. Complete a generation — verify "Done!" toast fires (via `tool:idle` → `progress.complete()`)
4. Cancel a running generation — verify StatusBar resets without toast (via `tool:cancelled` → `progress.cancel()`)
5. Verify no `StatusBar` import remains in `MpiGroupHistoryBlock.js`
6. Search for any remaining direct `StatusBar` references outside `statusBar.js` and `shell.js` — only `StatusBar.progress.update(value)` should remain in MpiGroupHistoryBlock (line 288)
