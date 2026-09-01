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

## Not verified here — the install direction

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
