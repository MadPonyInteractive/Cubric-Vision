# MPI-647 — validation

## The race, confirmed at the source

`js/shell.js:1538` (`_initDataRegistries`) is the ONLY writer of
`state.s_installedModelIds`, and it writes on every `models:checked`. It registers
synchronously — `_initDataRegistries()` is called at boot step 7 (`js/shell.js:230`) and
the `Events.on('models:checked', …)` is its first statement, before any `await` — so
shell's listener is always in the bus **before** the spec's `window.evaluate` runs. That
ordering is what makes the fix deterministic rather than lucky.

The exposed window is not the stub assignment (synchronous, immediately followed by the
synchronous `openFlowFromReuse` call) but the **deferred read**: `openFlowFromReuse`
(`js/services/flowService.js`) emits `flow:open` and calls `_reuseModelToast` inside a
`setTimeout(…, 0)`, and the spec waits 80ms for it. A backend refresh resolving in that
gap replaces the stub before `flowAvailability` (`js/data/flowsRegistry.js:2173`) reads
it — the model reads as missing and the danger toast fires. That is exactly the shape CI
hit: case 1 passed and case 4 failed in the same run on identical state.

## The fix

The spec now re-applies its stub from a `models:checked` listener registered after
shell's. `Events` fans out over an insertion-ordered `Set` synchronously
(`js/events.js:59`), so a refusal-to-cooperate refresh is overwritten **inside its own
emit** — before any deferred reader can observe the backend value. The stub is
authoritative for the test's lifetime; `unstub()` runs after the four cases.

The 80ms sleep is UNCHANGED, per the card. Widening it moves the flake.

## Reproduced deterministically, not waited for

Waiting cannot reproduce this locally — the real models ARE installed here, so the boot
refresh never resolves empty. So the spec now **provokes** the CI condition instead:
`Events.emit('models:checked', { installedModelIds: [] })` fires synchronously inside the
window, which is precisely what a runner with no weights does, at the worst possible
moment.

Proof it bites, run on this machine:

| spec state | result |
|---|---|
| re-stub disabled (`if (false && stubbed)`), provocation live | **FAILED** — `substituted` got the danger toast instead of the tier-swap warning (`a substituted tier must warn` → `Received: undefined`) |
| re-stub enabled | **passed** |
| re-stub enabled, `--repeat-each=5` | **5 passed** (14.6s) |

The disabled-guard failure lands on the `substituted` case rather than CI's `legacyCard`
because the provocation fires in every case; CI's refresh happened to land in case 4.
Same mechanism, same writer, same window.

## Suite

Full desktop suite: **40 passed (2.9m)** — `playwright test --config=playwright.desktop.config.js`.
(MPI-645's close-out recorded 39 pass + 1 environmental; all 40 pass here.) `npm test`
cannot see this spec — it is the desktop Playwright suite, not `node --test`.

Nothing outside the spec file changed, so no app behaviour moved. `eslint` covers `js/`
only, not `tests/`.
