# Uninstall a flow — free a deps-only flow's weights from the Flow Library drawer

## Current State

**All three phases shipped, 2026-09-01. Card is in `done`.** Evidence: `validation.md`.
Commits: 7dd159da (guard + button), 664d2a43 (the repaint fix), bb1b6f59 (customRoot
re-run), 2287a542 (component maps). 874/874 node tests, 46/46 desktop specs, every new
assertion mutation-checked.

**Phase 2 shipped WRONG and phase 3 caught it.** The plan below asserts the repaint was
already wired and only needed verifying. It was not: `downloadService` re-syncs only inside
its `download:uninstalled` **SSE** listener, and `_eventSource` is created lazily by the
first download — so a session that has installed nothing has none, that listener can never
fire, and `downloadService.uninstall()` itself never re-syncs. Measured live
(`_eventSource === false`), not guessed. `_uninstallFlow` now awaits the uninstall then
`await reSyncInstalledModels()`, exactly as the Model Library does. Read `validation.md`
§ "What the live run caught" before trusting any repaint claim in this file.

**One thing is still unverified: the INSTALL direction.** Re-installing Music Maker is a
13.4GB download and was never run, so `models:checked` is only shown firing for a deps-only
change on the uninstall side. That is what the next session does, on the user's own app —
they will uninstall and re-install Music Maker themselves.

Root cause and precedent were fully established at planning time (`brief.md`) — **do not
re-derive them**, every claim below was read from the code on 2026-09-01.

Facts established at planning time:

- **Footer states live in one place.** The footer block at the end of `openDetail()` in
  `MpiFlowLibrary.js` (grep `// Footer: installing`) — installing → `Cancel`, available →
  `Open`, else → `Install`. The `available` branch mounts `Open` and nothing else.
  **Anchor by symbol, not line number: this file moved ~49 lines under MPI-666 during the
  hour this card was written.**
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
