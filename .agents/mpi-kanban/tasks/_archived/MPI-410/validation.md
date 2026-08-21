# MPI-410 — validation

Reproduced and fixed 2026-08-05. Two halves: the splash (MPI-410) and the absorbed
install-screen strobe (MPI-412).

## A. The splash — REPRODUCED, ROOT CONFIRMED, FIXED

### The repro (the brief's "cold cache" is not the trigger)

The trigger is `server-ready` arriving AFTER the 5s fallback, so `createWindow()` runs
while Express is still down. A cold cache is only the natural way to get there. Two
temporary knobs make it deterministic on a warm machine — both were reverted after:

1. `server.js` — hold `app.listen` by `CUBRIC_DELAY_LISTEN_MS`.
2. Launch with a free port and throwaway user data:
   `env -u ELECTRON_RUN_AS_NODE CUBRIC_PORT=39411 CUBRIC_E2E_USER_DATA=<tmp> CUBRIC_DELAY_LISTEN_MS=8000 npx electron .`
   then read `<tmp>/logs/app.log`.

### Measured, before the fix

```
31.939  splash loadFile start
32.020  splash loadFile RESOLVED          (81 ms — it was never starved)
32.130  splash ready-to-show → shown
36.980  Server signal timed out → createWindow()
39.261  Renderer load failed (-102 ERR_CONNECTION_REFUSED) — retry 1
39.319  mainWindow ready-to-show  url=http://127.0.0.1:39411/   ← the ERROR PAGE
39.319  closing splash from mainWindow ready-to-show
40.403  Server started                    ← 1.1 s AFTER the splash was killed
```

**Candidate 1 confirmed, candidate 2 disproven.** `mainWindow.once('ready-to-show')`
fires on Chromium's network error page, so the splash was closed and the error page
revealed before the server was even listening. The splash was not starved — it loaded
in 81 ms. On a slow disk the same close lands while the splash's own `loadFile` is
still pending, which is the `ERR_FAILED (-2)` the report opened on. One handler, both
symptoms.

### The signal the fix keys off (measured, same boot)

| event | on the error page | on the real page |
|---|---|---|
| `did-finish-load` | **fires** (title `127.0.0.1:39411`) | fires (title `Cubric Vision \| …`) |
| `did-navigate` | **never fires** | `code=200 text=OK` |
| `getURL()` | the target URL | the target URL |

So `did-finish-load` and `getURL()` cannot tell them apart; `did-navigate` can. It
commits ~1 s before the page paints, so it is the gate, not the trigger — reveal is
`ready-to-show` + `did-navigate(code>=200)` + `did-finish-load`.

### One bug found and fixed during verification

A first cut set `appLoaded` on any `did-finish-load`. The error page's own finish made
it sticky, and the reveal fired **12 ms after the server bound** — before the real page
could have loaded. `did-finish-load` now only counts when it follows a real navigation.
That is why the `if (!navigated) return;` line exists.

### After the fix

| run | result |
|---|---|
| slow boot (8 s late listen) | splash alive the whole time; reveal at **+0.6 s after `Server started`**, `splashAlive=true`. Covered 8.8 s of boot. |
| normal boot (no knob) | splash shown at +0.2 s, revealed at +1.1 s. No error page, no regression. |
| `npm run test:desktop` | 17 pass — 17 real app boots, each of which would hang if the reveal gate were wrong |
| `npm test` | 451 pass |
| `npx eslint main.js` | clean |

Backstops added with it: reveal at the retry cap (60 × 500 ms) so a permanently failing
load shows the error page rather than nothing, and a 30 s timer so a load that hangs
without ever failing cannot leave the window hidden. Neither may be removed — a hidden
window is MPI-407's black window with extra steps.

## B. The strobe (absorbed MPI-412) — ROOT FOUND BY READING, FIXED, NOT SEEN LIVE

Two independent contributors, both fixed:

1. **`indeterminate` was a per-TICK flag.** `routes/downloadManager.js` computed
   `isNodeTick || totalBytes <= 0` on both the local and remote tick paths. Nodes and
   weights stream concurrently, so the display MODE flipped on whichever dep ticked
   last — sweep, ratio, sweep, ratio. `_byteRatioExcludingNodes` already excludes node
   bytes from both sides, so MPI-231's `203 MB / 15 MB` lie is prevented by the
   exclusion, not by this flag; the flag only added flicker. Now
   `totalBytes <= 0 || isNodeTickPending(deps)` — the rule
   `routes/install/computeProgress.js` already encodes and tests, now `require`d rather
   than re-implemented. **Same shape as MPI-164 one level up**: a per-dep condition must
   not drive a whole-job display.
2. **Two streams owned the same element.** `engine:extracting` (broadcast per uv/pip
   stdout line on the `_provisionUvEngine` path) and the UW dep byte ticks both wrote
   `progressInfo` and the loading class. `MpiEngineInstall` now gives the info line to
   whoever has honest bytes (`_uwBytesActive`); the phase keeps reporting in the
   subtitle, which is a different element. Ownership, not a debounce — a timer would
   only slow the flicker down.

`computeProgress.js` was extracted and tested by MPI-276 Phase 1 and then **never
required by anything** — the live path kept a divergent copy. That is the actual root
of half 1. The other consumers of that module are still un-wired; see below.

### Evidence

| Check | Result |
|---|---|
| `tests/install-progress.test.cjs` — 3 new cases | node tick while weights stream → determinate (no strobe); only the node phase left → sweep; node-only job → indeterminate. Pass. |
| Same file — source guard on the two live tick sites | asserts `isNodeTickPending(modelJob.deps)` appears **twice** (local + remote twin) and that no per-dep tick flag drives the display again. Comments are stripped before matching, since the fix's own note quotes the old expression. |
| Negative control | local site reverted to `isNodeTick \|\| total <= 0` → guard FAILS (`actual: 1, expected: 2`). Restored, re-ran, pass. |
| `npm test` / `npm run test:desktop` | 451 / 17 pass |

### What is NOT proven

**The strobe was never seen fire, before or after.** It needs a real engine install
(multi-GB, on a machine that already has an engine), so both halves of B are
code-verified plus unit-verified only. The next genuine first-run install on any
machine is the live check. Half A is fully reproduced and measured.

## Follow-ups deliberately not done here

- A permanent desktop spec for the slow-boot path would need a test-only listen-delay
  knob to stay in `server.js`. It would cover MPI-407's black window too, which nothing
  covers today. Not built unasked — it is a scope call, not a gap in this fix.
- `routes/install/computeProgress.js` still has no other consumer. Wiring the two tick
  sites onto it wholesale would change `phase`/verify semantics for the Model Library as
  well, which is past a cosmetic card and belongs on its own.
