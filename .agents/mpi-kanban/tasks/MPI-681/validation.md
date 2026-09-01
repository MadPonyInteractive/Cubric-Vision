# MPI-681 Validation

## The fix

`js/data/modelRegistry.js` — `syncModelInstalled()` builds a third diff key from the flow
and plugin dep slices the same sync just unpacked (`flow:<id>=<installed dep ids>`,
`plugin:<id>=…`, both already namespaced by `flowDepKey`/`pluginDepKey`), and the early
`return true` now compares it alongside the installed-model and drifted keys. The key parts
are accumulated inside the two existing `setFlowDepStatus` / `setPluginDepStatus` loops —
one primitive, both twins, no consumer taught to poll.

The gate MPI-326 added is intact: it is now keyed on *everything the sync rewrote* instead
of a subset, so a steady-state heartbeat re-sync still returns early.

## Machine verification — PASSED

`tests/deps-only-install-fanout.test.cjs` (new). Stubs `fetch` for `/comfy/models/check`,
picks a real flow whose install is deps-only (no `requiredModels`), and drives five edges:

| # | edge | expected | got |
|---|---|---|---|
| 1 | first sync of the session | emits (keys start `null`) | ✅ |
| 2 | two no-change re-syncs | silent — MPI-326's heartbeat guard | ✅ |
| 3 | the flow's deps land on disk, no model moves | **emits** — the MPI-681 bug | ✅ |
| 4 | re-sync, same disk | silent again | ✅ |
| 5 | deps removed | emits (reverse edge) | ✅ |

**The test fails without the fix.** Proven by temporarily neutralising the new clause in the
gate: `AssertionError: a flow-deps-only install must fan out — without it the drawer never
repaints`. Clause restored, test green.

Regression run (the sync's neighbours), `node --test`: `node-drift`, `uninstalled-op-gate`,
`flow-model-choice`, `op-strip-availability`, `targetpath-dep-install-state`,
`remote-status-fail-closed` — **78 pass, 0 fail**. `npx eslint` on both touched files: clean.

## Consumer sweep (`plugin:` / `app:`)

- **MpiFlowLibrary** — subscribes to `models:checked` → `_patchAllAffected()` →
  `_patchTile()`, which already calls `openDetail(flow)` for the open drawer and
  `_renderSub()` for the header count. Repaint path was fully wired; only the signal was
  missing. Unchanged.
- **MpiModelManager** (the plugin rows) — does **not** ride `models:checked`; its
  `download:complete` → `awaitReSync()` re-syncs and calls `renderList()` directly, and its
  render signature already carries `pluginAvailability(p).installed` (MPI-310/MPI-579),
  which reads the plugin dep cache. No hole, no edit needed. The extra emit is also free
  here — the signature short-circuits a redundant rebuild.
- **heroStats / MpiPromptBox / shell.js / MpiGalleryBlock** — all model-set consumers;
  behaviour unchanged for them since their key inputs did not move.
- `app:` — the `.startsWith('app:')` filter in the installed-set derivation is vestigial
  (flows are keyed `flow:` since MPI-304; no `appDepUniverse` exists). Left alone —
  out of scope.

## Not run

The live drawer check (install 13.4GB of Text to Music, drawer open, watch Cancel → Open)
was **not** re-run: the MPI-664 weights are already on disk, so reproducing the broken state
would mean uninstalling and re-downloading 13.4GB. The emit is proven deterministically
above and the repaint path it feeds is pre-existing and untouched.

## Docs

`docs/download-manager.md` — new entry next to MPI-607, which produces the identical
stuck-at-100% symptom from the opposite cause (there the disk read lied; here the read was
right and nobody was told).
