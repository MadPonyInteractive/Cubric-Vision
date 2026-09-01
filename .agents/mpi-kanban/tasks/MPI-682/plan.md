# Uninstall a flow — free a deps-only flow's weights from the Flow Library drawer

## Current State

Nothing built. Root cause and precedent fully established (`brief.md`) — **do not re-derive
them**, every claim below was read from the code on 2026-09-01.

Facts established at planning time:

- **Footer states live in one place.** The footer block at the end of `openDetail()`
  (`MpiFlowLibrary.js:371`, footer at `:406-455`) — installing → `Cancel`, available →
  `Open`, else → `Install`. The `available` branch mounts `Open` and nothing else.
- **The server would refuse a flow uninstall today.** `_flowRequiredDepIds()`
  (`routes/downloadManager.js:407`) takes no exclude arg and protects unconditionally; it is
  read at **two** call sites, one per engine guard — `:268` (`_localSharedDepsMap`) and
  `:499` (the remote `keep` set). Both already thread `excludeModelId` for the plugin twin
  one line below, so the plumbing exists.
- **The exact fix already exists for plugins.** `_pluginRequiredDepIds(excludeUninstallId)`
  (`:373-395`) — the same function *with* the exclude, and a header comment explaining why.
- **The UI precedent already exists too.** `_uninstallPlugin()` (`MpiModelManager.js:1324`):
  `MpiOkCancel` confirm → `downloadService.uninstall(pluginDepKey(id), deps, true)`. The
  `deleteFiles` arg is vestigial — the Model Library always passes `true` (`:282-285`:
  install state is derived by statting disk, so a "kept" file just re-reads as installed).
- **`MpiOkCancel` is a shared Compound** (`js/components/Compounds/MpiOkCancel/`), mounted
  per-consumer. The Flow Library mounts its own; nothing is extracted or shared.
- **Repaint after uninstall is already wired** — verify, don't build. `downloadService`
  re-syncs on `download:uninstalled` (`downloadService.js:809`), and MPI-681 made that sync
  fan out `models:checked`, which `MpiFlowLibrary` listens to → `_patchAllAffected()`.
- **Nothing outside `MpiModelManager` reports an uninstall result.** Its
  `download:uninstalled` handler (`:1535`) owns the removed/kept toast, and it only exists
  while the Model Library is mounted. The Flow Library needs its own.

## Decisions (settled — do not re-open)

1. **A flow uninstall frees the flow's OWN `requiredDeps`. Nothing else.** Not
   `requiredModels` (the Model Library owns models; MiniMax does not get to delete Krea2),
   not a `requiredPlugin`'s deps. Read `flow.requiredDeps` directly — **not**
   `getFlowDependencies()` / `flowDepIds()`, which union plugin deps in for the *install*
   payload. No flow declares `requiredPlugins` today; write it correctly anyway.
2. **The button appears only when the flow has own deps AND is available.** A models-only
   flow shows `Open` alone — its uninstall lives in the Model Library, where the weights do.
3. **Deps shared with another flow are kept**, by the same last-owner-standing rule plugins
   use. `chatter-box` ∩ `voice-changer` = 3 deps, so this is live, not hypothetical.
4. **No "keep files" checkbox.** Match the Model Library: always delete, server-side guards
   decide what actually goes.

## Phase 1 — unblock the server guard

Owner: `routes/downloadManager.js`

- Give `_flowRequiredDepIds` an `excludeUninstallId` param, skipping the flow whose
  `flowDepKey(id)` matches — a direct mirror of `_pluginRequiredDepIds`, including a header
  comment saying flows are the second entity with a user-facing Uninstall.
- Thread the existing `excludeModelId` through **both** call sites (`:268`, `:499`). Dual
  guard = both twins in one pass, or the remote engine silently keeps the files.
- Export it beside `_pluginRequiredDepIds` (`:3445`) for the test.

**Verify:** a `tests/flow-uninstall-guard.test.cjs` asserting, against the real `FLOWS`:
`_flowRequiredDepIds('flow:minimax-music')` omits the 3 MiniMax deps; passing another
flow's key (or nothing) still protects them; and `_flowRequiredDepIds('flow:voice-changer')`
still protects the 3 deps `chatter-box` shares with it. Mutation-check it — remove the
exclude branch and the first assertion must fail.

## Phase 2 — the Uninstall button

Owner: `js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js` (+ its `.css`
only if the footer needs a second-button rule)

- Mount one `MpiOkCancel` alongside the existing detail wiring; destroy it in `destroy()`.
- In `openDetail()`'s `available` branch, when `(flow.requiredDeps || []).length`, append a
  secondary `Uninstall` beside `Open`.
- `_uninstallFlow(flow)`: confirm text names the flow and the size freed (sum of its own
  deps' `size`, plus the "files shared with other installed flows will be kept" line), then
  `downloadService.uninstall(flowDepKey(flow.id), deps, true)`.
- Add a `download:uninstalled` listener: toast the result and `_patchAllAffected()`. Push
  its unsubscribe onto `_unsubs` like every other listener in the file.

**Verify:** with the drawer open and no restart — footer swaps `Open` → `Install models`,
the `Extra dependencies` row flips back to `Install`, the tile badge leaves READY and the
header count decrements.

## Phase 3 — live proof, on the case that started this

- Uninstall **MiniMax Music** from the drawer. 13.4GB freed on disk, drawer repaints without
  a restart.
- Re-install it and confirm MPI-681's fan-out still lands — **this is also the live check
  MPI-681 could not run**, so close that loop here.
- Uninstall **`voice-changer`** and confirm `chatter-box` survives: its 3 shared deps stay on
  disk and its tile keeps whatever badge it had.

## Files

- `routes/downloadManager.js`
- `tests/flow-uninstall-guard.test.cjs` (new)
- `js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js` (+ `.css` if needed)
- `docs/flows.md` — the uninstall contract (own deps only, last-owner-standing)
- `docs/download-manager.md` — one line beside the MPI-310 plugin-guard entry

## Not in scope

- Uninstalling a flow's required MODELS (Model Library's job, already works).
- A flows section in the Model Library — the user asked for it on the flows page.
- The `deleteFiles` argument's remaining callers, and MPI-462's orphan sweep.
