# MPI-682 — validation

## Machine

| Check | Result |
|---|---|
| `npm test` | 874/874 pass (873 + the new guard test) |
| `npx playwright test --config=playwright.desktop.config.js` | 46/46 pass |
| `npx eslint` on both changed source files | clean |

**`tests/flow-uninstall-guard.test.cjs`** — the server half, against the real `FLOWS`:
`_flowRequiredDepIds('flow:minimax-music')` omits its 3 deps; no-arg and any other key
still protect them; `_flowRequiredDepIds('flow:voice-changer')` still protects the 3
`chatter-box` shares with it; and head-swap's exclusion releases exactly its own deps and
nothing another flow claims.
*Mutation:* drop the `if (flowDepKey(flow.id) === excludeUninstallId) continue;` line →
`AssertionError: a flow uninstalling itself must not self-protect minimax-music3-dit`.

**`tests/desktop/flow-uninstall-button.spec.js`** — the UI half, real renderer: the footer
offers Open + Uninstall only for a Ready flow with own deps (`Open` alone for a models-only
flow, `Install models` when not installed), the dialog names the flow and 13.4GB, the POST
goes out as `flow:minimax-music` carrying the flow's own three deps, the toast fires, and a
`/comfy/models/check` follows the uninstall.
*Mutations, three, each failing on its own assertion:* pass `flow.id` instead of
`flowDepKey(flow.id)`; drop the `requiredDeps.length` gate; drop `reSyncInstalledModels()`.

## Live — 2026-09-01, real weights, isolated instance

The user's app was busy (another agent running GPU smoke tests in their engine), so this
ran on `npm run app:isolated` with its own profile, port 60764 and its own
`CUBRIC_ENGINE_ROOT`. Their `:3000` was never touched.

**The weights were real.** `CUBRIC_MODELS_ROOT` pointed at a sandbox dir whose files were
**hardlinks** (`fs.linkSync`, `nlink=2`) to the actual weights in `G:/CubricModels` — the app
stats a real 4.58GB file, the uninstall deletes a real directory entry, and the original
name keeps the data. G: had 10.6GB free against a 13.4GB flow, so copies were never an
option. Engine root seeded per `tool_sandbox_isolated_app_seed_uw_deps` (stamp + python
binary + every `custom_nodes`/`engineAsset` dep stubbed); boot log had zero
repair/drift/download lines.

| | before | after |
|---|---|---|
| footer | `Open` · `Uninstall` | `Install models` |
| `Extra dependencies (13.4GB)` row | Installed | Install |
| tile badge | Ready | Get models |
| header | 4 ready · 10 need models | 3 ready · 11 need models |
| dep-status cache | all `true` | all `false` |
| disk | 3 files present | 3 files gone |

Toast: *"Music Maker uninstalled."* No restart, no reload.

**Shared-dep case, also live.** Uninstalling **Voice Changer** deleted nothing — all three of
its deps are Chatter Box's too. Both tiles stayed Ready, both weights stayed on disk, and
the toast said *"Voice Changer — every file is still needed by another installed flow."*
At the HTTP layer the server reported them `keptShared` against the `(flow)` holder.

**Run twice, on BOTH resolver branches.** The first pass had no
`extra_model_paths.yaml`, so `getCustomRoot()` returned null and `resolveComfyPath` took its
`else` branch (`getDefaultModelsRoot()`). The user's engine carries that file
(`base_path: G:/CubricModels`), so their uninstall takes the **customRoot** branch instead —
direct path, then a recursive search inside the dep's own bucket, then a default-root
fallback. That is the resolver MPI-607 and MPI-654 both broke invisibly, so the second pass
copied their yaml with `base_path` repointed at the sandbox. `/comfy/get-path` confirmed
`isDefault: false`, and every row of the table above came out identical: files deleted,
drawer repainted, cache flipped, same toast.

**The user's data is intact.** `G:/CubricModels` re-counted after each teardown: 132 files,
193.3GB, and all three MiniMax weights back at `nlink=1`. Sandbox roots deleted, both times.

## 2026-09-02 — REOPENED. The uninstall was refused, app-wide, and no test could see it

The user ran it on their own app and Text to Speech freed **0 bytes**. Disk re-counted
after: `engine/…/ComfyUI/models/chatterbox/` still 13 files, 6.95GB. Their `app.log`
carried the answer rather than a guess — 11 lines at `04:34:00`:

```
[WARN] [download] uninstall: refused to trash outside managed models root:
C:\AI\Mpi\Cubric-Vision\engine\...\ComfyUI\models\chatterbox\chatterbox\t3_cfg.safetensors
```

**Root cause.** One function disagreeing with itself 30 lines apart. The loop resolves a
`targetPath` dep under the ENGINE on purpose (MPI-222, `downloadManager.js:3055`), then
the rail tested containment against `managedModelsRoot` (`customRoot ||
defaultModelsRoot`) — which an engine-anchored path is never inside. The rail won every
time. **Every `targetPath` weight in the app was undeletable**, the Model Library
included; 14 deps, all 13 chatterbox weights plus the rife ckpt. It never surfaced as an
error: the refusal lands in `keptModelFiles`, which the toast renders as *"model files
kept on disk; still installed"*.

Phases 1–3 could not have caught it. MiniMax Music declares no `targetPath` dep, so the
live sandbox run took the one path where the rail and the resolver agree.

**A second bug in the same read.** `isInModelsFolder` used the same fixed root, so it
read false for every engine-anchored weight — meaning `deleteFiles: false` ("keep files
on disk") *deleted* the exact class of weight it had just promised to keep. Same shape as
the MPI-97 remote bug that cost a user ~30GB, pointed the other way. Not reachable from
the Flow Library (it always passes `true`), reachable from the Model Library.

**Fix.** `_uninstallAllowedRoot(dep, { managedModelsRoot, defaultCustomNodesRoot })`
returns the root that dep's own class is anchored to; the two rails collapse into one
that tests against it, and `isInModelsFolder` uses it too. The rail is **aimed, not
widened** — each class stays confined to its own root.

| Check | Result |
|---|---|
| `tests/uninstall-allowed-root.test.cjs` | 5 assertions, over the real `DEPS` |
| `npm test` | 875/875 (was 874 + this file) |
| `npx playwright test --config=playwright.desktop.config.js` | 45 pass, 1 fail — `flow-enhance-writes-textarea`, MPI-664's, see below |
| `npx eslint` on both changed source files | clean |

*Mutations, both bite:* restore `managedModelsRoot` for a `targetPath` dep →
`a targetPath weight is engine-anchored (MPI-222); testing it against the models root
refuses every delete`. Defeat `_isInsidePath` → `targetPath: a path outside its root
must still be refused` — the assertion that stops this fix becoming a data-loss hole.

**The desktop failure is not this card's.** `flow-enhance-writes-textarea.spec.js` fails
on `ENHANCED-SENTINEL` not clearing a Flow text field. MPI-664 committed
`js/data/flowsRegistry.js` and its enhance work mid-session (the file was 162 lines dirty
when this session started and clean an hour later). This card's diff is
`routes/downloadManager.js` + `MpiModelManager.js`; neither is on that spec's path.

**C — the double toast.** Both `MpiModelManager` and `MpiFlowLibrary` listen to
`download:uninstalled`, so a flow uninstall fired two toasts, the Model Manager's naming
the raw key (`flow:chatter-box — model files kept on disk; still installed`). Two causes:
its holder filter `/^\((installing|app|plugin)\)$/` never learned MPI-304's `(flow)`
sentinel, so `(flow)` printed as a holder name; and it has no business speaking for a
flow at all. Fixed by adding `flow` to the filter and returning early on a flow key.
Plugins stay — their row lives on that page. **Not machine-pinned:** the desktop spec
mounts only `MpiFlowLibrary`, so the collision cannot reproduce there, and a source-text
assertion would rot. Verified by eye instead.

## 2026-09-04 — LIVE, in the user's own app. Both directions proven. Card closes.

Text to Speech uninstalled and re-installed by the user, on their engine, on the
customRoot resolver branch their machine actually takes. The server's own line:

```
[07:52:06] [download] uninstall flow:chatter-box: removed 11, kept 1 universal,
                      2 shared, 0 model files, 0 pip-installs, swept 0 orphaned
```

`0 model files` is the fix: that bucket held all 11 refusals two days earlier. `2 shared`
is the Voice Changer pair, `1 universal` the Fill-ChatterBox node, `swept 0` confirms the
orphan sweep took nothing extra.

| | before | after uninstall | after re-install |
|---|---|---|---|
| `models/chatterbox/` on disk | 13 files, 6.95GB | 2 files (`chatterbox_vc/`) | 13 files, 6.95GB |
| footer | Open · Uninstall | Install models | Open · Uninstall |
| `Extra dependencies (6.9GB)` | Installed | ↓ Install | Installed |
| tile badge | Ready | Get models | Ready |
| header ready count | — | −1 | +1 |
| Voice Changer | Ready, 1.0GB Installed | **Ready, unchanged** | Ready |

No restart in either direction — `[comfy] Model cache reseeded via /object_info (no
restart needed)`.

**The install direction is now proven**, which is what this card had never been able to
show. `models:checked` fans out for a deps-only change on the way IN as well as OUT: the
badge, the deps row, the footer and the header count all flipped back on their own.
MPI-681's fan-out no longer rests on the uninstall half alone.

**Partial free, also new.** Phases 1–3 only ever covered all-shared (Voice Changer, frees
nothing) and nothing-shared (Music Maker, frees everything). This is the middle case —
11 freed, 2 held by a sibling — and the sibling stayed Ready throughout.

**C verified by eye.** Exactly ONE toast: *"Text to Speech uninstalled (some shared files
kept)."* — `MpiFlowLibrary.js:732`, naming the flow. The Model Manager's duplicate, which
printed the raw `flow:chatter-box` and the `(flow)` sentinel, is gone.

*Read at the time and discarded:* the header went 13 ready → 10 → 11, with Add Foley and
Upscale Video showing Get models. Not this card — the user uninstalled LTX in the two days
this session sat on standby. The `before` figures above are re-counted from disk and the
07:52 log, not from the stale 09-02 screenshots.

## Not verified here — the install direction (SUPERSEDED 2026-09-04, see above)

Re-installing Music Maker is a 13.4GB download and was not run. So `models:checked` is
proven to fire for a deps-only change in the **uninstall** direction only (that is what
repainted the drawer); MPI-681's install-direction fan-out is unchanged by this card and
still rests on its own evidence. The user is re-installing to check it on their own machine.

## What the live run caught that neither test did

The plan said *"repaint after uninstall is already wired — verify, don't rebuild"*, and the
first live run proved that wrong: the files were gone from disk while the drawer still read
**Ready / Installed** and the header still counted the flow.

Root cause, not guessed — `downloadService._eventSource` read `false`. The re-sync lives
only inside the **SSE** `download:uninstalled` listener, and the EventSource is created
lazily by the first download; a session that has installed nothing has none, so that
listener can never fire. `downloadService.uninstall()` itself never re-syncs. The Model
Library's `await reSyncInstalledModels()` after each uninstall is therefore load-bearing,
not redundant — dropping it was the defect.

Fixed by awaiting the uninstall and re-syncing, which re-reads disk and ends in
`models:checked` → `_patchAllAffected()`. Re-ran the same live sequence: every row in the
table above flipped. Pinned by the spec's `/comfy/models/check`-after-uninstall assertion.

## Known and deliberate

The dialog quotes the flow's full declared size, not the freeable remainder — Voice Changer
says "1.0GB will be freed" and frees nothing. Computing the true figure client-side means a
second implementation of the shared-dep rule in the renderer, which is the mistake
`docs/download-manager.md` catalogues. The dialog's second sentence and the toast carry it,
and the Model Library's plugin dialog is worded the same way.

Spotted here and filed out of scope: `MpiOkCancel` rendered `\n` as nothing (no
`white-space` rule on `.mpi-ok-cancel__text`), so the Model Library's `\n• ` bullet dialogs
had always run together. This card's dialog was written as prose to avoid a fourth copy of
that bug — **MPI-683 has since shipped the shared `white-space: pre-line`** (d0c31d9c), so
the prose is now a preference rather than a workaround, and it stays because it is the
wording that was live-verified above.
