# MPI-414 Validation

## Fix

**Client — `MpiEngineInstall.js:305-336`.** Retry routes on
`/engine/version-check` (`installed !== null`), not `/engine/status`.

**Server — `routes/engine.js` `/engine/repair-deps`.** Refuses an engine with no
`.mpi_engine_version` and hands off to `_runEngineDownload()` instead of
installing custom nodes and broadcasting `engine:complete` over a ComfyUI that
cannot boot. Defence in depth: the server no longer trusts the client's routing.

**Docs — `docs/comfy.md`.** The engine bootstrap retry contract said
`/engine/status`; corrected, with the reason.

## Why the version stamp is the right question

`/engine/status` answers *"does the venv python exist"*. On the uv path
(Linux/macOS) that is true from step 1, long before ComfyUI is cloned. Windows
never exposed it because its archive lands python and ComfyUI together.

The stamp is written only after a successful `comfy install`
(`routes/engine.js:574-580`), and `/engine/version-check` deletes a stamp whose
python has gone (`:659-667`). So `installed !== null` means *a complete install
finished*, which is the actual precondition for a deps-only repair.

## Evidence — measured on the failing machine, before the fix

From `brief.md`, probed on the broken Linux engine on 2026-07-31:

| probe | result | route it selects |
|---|---|---|
| `/engine/status` | `exists: true` | `/engine/repair-deps` ← **wrong, this was the bug** |
| `/engine/version-check` | `installed: null`, `needsInstall: true` | `/engine/download` ← **correct** |

The two endpoints disagreed on the real broken engine, and the one now used gave
the right answer. This is the field measurement, not a reconstruction.

`/engine/download` then recovers rather than re-downloading, because MPI-411
already made `comfy install` pass `--restore` over an existing clone.

## Blast radius

- `/engine/status` — one live consumer, the Retry button. Now none. Route left
  in place (flagged, out of scope to delete).
- `/engine/version-check` — 3 consumers (`shell.js:262`, `shell.js:396`,
  `engineGate.js:57`), none changed; this fix only adds a fourth reader.
- `/engine/repair-deps` — 2 client callers: Retry (fixed) and the boot
  `repairing` modal (`MpiEngineInstall.js:411`), which `shell.js` already gates
  behind version-check. The server guard covers both.

## Deliberately not done

- **No stamping from any other path.** A stamp only exists when `comfy install`
  exited 0. Stamping elsewhere produces the green-stamp-on-a-broken-engine the
  brief calls worse than no stamp.
- **No live python-import readiness probe.** Second source of truth, startup
  cost, and the stamp already implies a successful install. Revisit only if a
  *stamped* engine is ever seen failing to boot.

## Outstanding — the one leg that needs hardware

Both changed branches are code-verified and backed by the measurement above, but
the **interrupted-install → Retry** sequence has not been re-run end to end. The
Windows archive install into a separate folder (already on the 1.3.0 plan, user
offered his box) is exactly that scenario: start the install, quit partway, come
back, press Retry. Expected: it reaches `/engine/download` and finishes, instead
of a success toast over a dead engine.
