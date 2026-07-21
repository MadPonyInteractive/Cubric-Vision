# MPI-276 — Validation

**Verify mode:** user-ux (Phase 8). Phases 1–7 auto-verified per-phase (see plan.md Plan Drift + commits).

## Phase 8 — Automated rail (agent-run)

Date: 2026-07-14. Branch: 1.2.0. Node v24.14.0.

### Lint — PASS
`npm run lint` (`eslint js/ --max-warnings=9999`) → **0 errors, 18 warnings** (all pre-existing style warnings in unrelated shell/component files; gate is `--max-warnings=9999` → pass).

### Tests — PASS (MPI-276 scope)
Ran every `tests/*.test.cjs` (no `npm test` script — invoked each via node). **34 pass / 6 fail.**

All MPI-276-relevant suites green:

| Suite | Result |
|---|---|
| install-store | PASS (25) |
| install-progress | PASS (11) |
| install-reconciler | PASS (12) |
| uninstall-guards | PASS (10) |
| model-footer-settling | PASS |
| node-install-batch-resilience | PASS (4) |
| node-drift | PASS (23) |
| node-install-progress | PASS |
| requirements-only-reconcile | PASS |

### The 6 failures — all pre-existing, NOT MPI-276 regressions
Working tree clean for every download/install/remote/test file (all MPI-276 work committed), so these fail on committed HEAD independent of this session.

| Failing test | Last touched by | Why it fails (unrelated to MPI-276) |
|---|---|---|
| download-completion | MPI-276 P2b.1 `0ae5fa07` (rename-only) | `testDownloaderResumesMarkedPartial` `resumeFromFile` assertion — dead against the cancel-only transport (NDH never resumes). Fails on pristine `cae5e6bd` too. Flagged for prune when resume-dead tests are cleaned (handoff pending item). The rename commit only updated the class name; it did not cause the assertion. |
| optional-media-placeholder | MPI-242 `b9eb932f` | Asserts `placeholder.png` + `ltx_silence.wav` present — both KILLED by MPI-272. Stale test owned by MPI-242/272. |
| controlnet-aux-torch-guard | MPI-242 `b9eb932f` | Out of MPI-276 scope. |
| image-resident-classification | MPI-244 `8a6b754c` | Out of MPI-276 scope. |
| output-prompt-capture | MPI-242 `b9eb932f` | Out of MPI-276 scope (actual 11 vs expected 10). |
| runpod-remote-hardening | MPI-90 `1373fb7e` | Out of MPI-276 scope (actual 502 vs expected 409). |

**Rail verdict: PASS.** Every MPI-276 suite green; zero failures attributable to this card.

## Phase 8 — Live matrix (user-judged)

Verify mode user-ux — the agent cannot self-approve. User walks the live matrix at port 3000.

_(filled in as the user confirms each row)_

| # | Check | Result |
|---|---|---|
| 1 | Cold-boot phantom check — zero progress bars/Verifying on jobless cards; `GET /comfy/downloads/status` → `jobs:[]` | **PASS** — after restart backend `jobs:[]`; the % bars on jobless cards (LTX 33%, Wan5B 36%) are legitimate **idle partial-progress** (shared-dep coverage on disk), NOT phantom active jobs. No card shows a live/active bar without a backing job. |
| 2 | Local small-pack install — pending → real progress <10s, no Install-flash, pruned after resync | **PASS** (after fix below) — SDXL Realistic: click → Cancel holds, progress bar streams. |

### Phase 8 fix — detail-footer stomp on immediate reinstall (`downloadService.js`)
Found live in row 2. Uninstall → immediate reinstall left the detail-panel footer stuck on "Install" while the grid tile correctly showed progress. Caught via temp console instrumentation (since removed).

**Root cause:** `download:started` fires twice (client emit in `start()` + backend SSE echo). Between them a `download:snapshot` broadcast arrives while `_firePost` has optimistically flipped the job `pending→downloading` but the backend hasn't yet registered it in the snapshot. The snapshot wholesale-replace preserved only client-`pending` jobs → **dropped the `downloading` job** → the trailing SSE `download:started` echo found `job=undefined` → `openDetail` recomputed `_modelState` with no job → footer branch fell through to Install.

**Fix (2 edits, `js/services/downloadService.js`):**
1. Snapshot replace preserves client-owned `pending` **and** `downloading` jobs absent from the snapshot (the backend-registration gap).
2. SSE `download:started` echo only re-emits `Events.emit('download:started')` when the FE actually holds the job (belt against a stomp from a jobless echo).

MPI-276-scoped, no backend/signature changes, G4 preserved. `npx eslint` clean; `model-footer-settling.test.cjs` green. User-verified live (row 2 PASS).

**Note:** peer session `uninstall-ux-cleanup` committed `987cd539` — removed the dead "Also delete model files from disk" checkbox (uninstall now always deletes files). No collision (their edit = MpiModelManager.js, mine = downloadService.js). Message resolved.
| 3 | Swallowed-request drill — server stopped mid-session → ~10s revert + warning toast | **PASS** — wifi off, click Install → Cancel button ~0.5s then reverted to Install; `ui:warning` toast "You're offline — connect to the internet to download models." (toast, NOT error dialog); console `POST /comfy/models/download/start 503`. No stuck spinner, no ghost active job. |
| 4 | Cancel mid-download — `.cubricdl` scrubbed, card→Install, partial-bytes correct (MPI-123-local), 2nd cancel idempotent | **PASS** — SDXL NSFW cancelled at ~15%: partial `.safetensors` + `.cubricdl` both scrubbed from `G:\CubricModels\checkpoints`, backend job dropped, card→Install instantly, 2nd Cancel = no 404/error toast. Closes MPI-123-local. |
| 5 | Uninstall matrix — shared-dep sibling survives, tier-family BOTH delete (MPI-258 B1), custom-node folder removed, truthful log | **FAIL (fixed, needs live re-test)** — found TWO real bugs (below). Old code: uninstalling Wan 5B while Wan Smooth I2V-only installed cascaded BOTH to uninstalled (deleted shared `umt5` clip). Fix shipped; unit tests green; live re-test PENDING on the freshly-restarted app. |

### Phase 8 fix — BUG 1: op-partial shared-dep guard (`routes/downloadManager.js`)
Live repro (Row 5): Wan 2.2 Smooth installed **I2V-only** + Wan 2.2 5B installed → uninstall 5B → **both** dropped to uninstalled; disk showed the shared `umt5_xxl_fp8_e4m3fn_scaled.safetensors` (needed by both) was DELETED; toast falsely said "some shared files kept".

**Root cause:** both uninstall shared-dep guards (`_localSharedDepsMap` + remote twin `_remoteSharedDepIds`) protected a sibling's deps only when it was **whole-universe installed** (`entry.installed === true` — every op complete). An **op-partial** install (Wan Smooth with only I2V) failed that gate → protected NOTHING → 5B uninstall reaped the shared clip → Wan Smooth broke → cascade. (The MPI-258 whole-model gate that broke the tier-family cycle was too strict for op-partial installs.)

**Fix:** protect the deps of the sibling's **installed ops** via the existing `deriveInstalledOps` (returns `installedOps` + `fullyInstalled` = common + ≥1 op complete) → `resolveDeps(model, installedOps, null, null)` (null engine = union). commonDeps (the shared clip/VAE/nodes) ride along whenever ANY op is installed. **MPI-258 tier-cycle stays broken**: an absent-transformer tier has no complete op → `fullyInstalled:false` → protects nothing → still deletable. Applied to BOTH local + remote guards ([[feedback_check_both_engine_paths]]). Test: `tests/uninstall-guards.test.cjs` new case "op-partial sibling still protects its shared deps" (exercises the real `deriveInstalledOps`+`resolveDeps`); suite 11/11 green. `npx eslint` clean.

### Phase 8 fix — BUG 2: queued job dropped by download:snapshot (`js/services/downloadService.js`)
Live repro: Install SDXL Realistic (downloading) → click Install ILL Anime Beauty → ILL entered the queue (`start()` logged `willQueue=true`) then **silently reverted to Install**; live probe showed `_inFlight: 2` but `state.downloadJobs` held only `[['sdxl-realistic','downloading']]` — ILL's queued job GONE. Intermittent (timing-dependent on a snapshot landing while a job is `queued`).

**Root cause:** the `download:snapshot` SSE handler wholesale-replaces `state.downloadJobs` from the backend snapshot, preserving only client jobs absent from the snapshot whose status is `pending`/`downloading`. A **`queued`** job (2nd+ install waiting its turn in the serial chain, **no POST fired yet** → legitimately absent from the backend snapshot) was NOT preserved → wiped → `_firePost` later found no job (`if (!job) return false`) → skipped the POST → tile reverted to Install while `_inFlight` still counted it. Silent vanish.

**Fix:** preserve `queued` client jobs too in the snapshot merge (+ count `queued` in `downloadQueueActive`). One status-set addition. Test: `tests/snapshot-preserves-queued.test.cjs` (4 cases incl. queued-survives + terminal-not-resurrected); 4/4 green. `npx eslint` clean. FE-only.

**Both fixes are on disk AND loaded in the freshly-restarted app** (served FE confirmed: 0 `TMP-Q`, queued-preserve present; backend fresh boot → guard fix live). Temp `[TMP-Q]` instrumentation added during diagnosis has been fully removed. NEITHER fix live-retested yet.

**Also observed (NOT bugs, for the record):** (a) the quit dialog copy "will resume from the existing partial file on next launch" implies AUTO-resume, but code does NOT auto-resume on launch (downloadManager.js:478) — a partial resumes only on the next manual Install click. Minor copy/behavior mismatch, candidate for its own tiny card. (b) Duplicate-download protection across models sharing a dep already works (deps keyed by id in `_depJobs`, one download shared) — user's concern confirmed handled.
| 6 | Reload mid-download — snapshot restores live bar, no phantom rehydrate | **PASS (restore)** — reloaded SDXL NSFW at 12% (dev `location.reload`; real users can't reload), bar restored at 99% after fixes below. Missed-terminal-at-99% surfaced + fixed (backstop). |

### Phase 8 fix — reload snapshot-restore + missed-terminal backstop (`downloadService.js` + `MpiModelManager.js`)
Row 6 found two gaps (both fixed):

**Gap A — snapshot didn't repaint the grid on reload.** The `download:snapshot` SSE handler mutated `state.downloadJobs` but emitted no Events signal; MpiModelManager filters `state:changed` to `s_installedModelIds` only and had no `download:snapshot` listener → the reloaded grid never repainted the recovered job (card stuck on Install while the download ran server-side). **Fix:** snapshot handler now `Events.emit('download:snapshot', ...)`; MpiModelManager listens → sig-guarded `renderList()`. Result: reload restored the live bar. ✅

**Gap B — missed terminal at completion (pre-existing SSE-delivery gap).** The download *completed* during the reload's SSE-reconnect window, so the terminal `download:complete` was lost → card stuck at 99% until manual refresh. Reconciler idles once the store job is terminal, so no corrective snapshot re-broadcast. **Fix (user chose "add backstop now"):** while the Library holds any active job, a 5s quiet `awaitReSync({quiet:true})` poll self-corrects a lost terminal against disk truth; self-idles when no job active. Reuses the exact recovery the refresh button does. Scope note: real users can't reload the app, so this race is dev-only via DevTools — the backstop is a cheap belt for ANY SSE gap (network blip / sleep), not a common-path bug.

Verify: `npx eslint` clean; `model-footer-settling` + `install-store` + `install-reconciler` + `uninstall-guards` green. Both files UNCOMMITTED at handoff.
| 7 | Remote pass (Pod, wrapper 0.2.37) — install/uninstall small dep, hot-store evict + pipPins in wrapper log, no local state mutated by remote | |
| 8 | User verdict — phantom-free churn feel | |

---

## Phase 8 CLOSE (user-verified, 1.2.0) — 2026-07-14

Both Row-5 fixes LIVE-RETESTED on the freshly-restarted app; all rows resolved.

**Row 5 BUG 2 (queued not wiped) — PASS.** Ran twice on fresh 0% models. Install A (SDXL Realistic) downloading → install B (SDXL NSFW): B showed `Queued…`/0%-bar, held through multiple `download:snapshot` broadcasts while A climbed, then A→Verifying→done, B→downloading. Never reverted, never vanished. Console: 0 `[TMP-Q]` (clean bundle). Earlier a real disk-out interrupted the first pair (6.6GB needed / 4.6GB free) — B's revert there was the correct disk guard, not the bug (see disk-toast fix below).

**Row 5 BUG 1 (op-partial shared-dep guard) — PASS (live + disk).** Setup: Wan 2.2 Smooth installed I2V-only (disk: `Wan_22_i2v_High/Low` present, no `t2v` → op-partial) + Wan 2.2 5B installed (`wan2.2_ti2v_5B_fp16` 9.3GB + turbo-lora + `wan2.2_vae`). Uninstalled 5B. Result: toast "Wan 2.2 5B updated (some shared files kept)" (correct — real model-share); **Wan Smooth stayed ✓ INSTALLED, no cascade**; LTX stayed. Disk-verified: 5B-unique (model/lora/vae) DELETED; **`umt5_xxl_fp8_e4m3fn_scaled` SURVIVED**; Wan Smooth i2v High+Low SURVIVED. Old guard would have deleted umt5 (Wan Smooth not whole-universe-installed) → cascade. Fix confirmed.

**Row 7 (remote Pod) — PASS (core).** Fresh EU-RO-1 Pod, image `cubric-vision-pod:v0.16.0-cpu`, clean 150GB volume. Installed SDXL Realistic remotely → ✓ INSTALLED, local cards untouched (no local state mutation from remote events). Uninstalled → toast "SDXL Realistic updated." (plain — engine-only deps kept, wording fix confirmed on the REMOTE path), card → Install. Hot-store evict + pipPins wrapper-log line: **spot-checked / deferred** (RunPod Logs tab scrolled past capture; not gating any fix under test — the same op-partial guard + wording fixes are the tested surface and both passed).

**Row 8 (user verdict) — ACCEPTED.** User: churn feels phantom-free/honest. One enhancement requested (not a bug): stronger queued feedback. Shipped a text `Queued…` label this session; mascot-on-thumb follow-up carded **MPI-284**.

### Three UX fixes folded into MPI-276 (surfaced by the Phase 8 matrix, same subsystem/files)

1. **Disk-out error → toast, not GitHub-report dialog** (`downloadService.js`). The pre-flight statfs gate (`downloadManager.js`) rejects with a friendly `"Not enough disk space to install this model. X GB needed, Y GB free."` — no OS errno. `_isOutOfSpaceError` only matched errno strings (`errno 28`, `no space left`) → missed the pre-flight message → fell through to the `ui:error` dialog. Fix: added `not enough disk space` to the matcher. Asserted against the real string.

2. **Uninstall toast wording — "shared" only when a MODEL shares** (`MpiModelManager.js`). `download:uninstalled` lumped all four kept-buckets into `keptTotal`; any kept file (incl. `keptUniversal`/`keptPipInstalls` = engine-owned VAE/custom-nodes/pip env, shared with NO model) triggered "some shared files kept" — false when the user just removed every model using those files. Fix: gate the "shared" message on `keptShared.length + keptModelFiles.length > 0`; engine-only kept → plain "updated". Verified live on the remote SDXL uninstall.

3. **Queued indeterminate label** (`MpiModelManager.js`). A serial-queue `queued` job showed a silent 0% bar (reads as stuck). Added an indeterminate `Queued…` state row mirroring the `pending`→`Starting…` pattern. Mascot-on-thumb polish → MPI-284.

**Verify:** `npx eslint` clean on both edited JS files; `tests/uninstall-guards.test.cjs` + `tests/snapshot-preserves-queued.test.cjs` 15/15 green.

| 7 | Remote pass — install/uninstall small dep, no local state mutated by remote | **PASS (core)** — install+uninstall on fresh Pod, local untouched, remote wording fix confirmed; hot-store/pipPins log spot-checked-deferred |
| 8 | User verdict — phantom-free churn feel | **PASS** — accepted; queued-feedback enhancement → text label shipped + MPI-284 for mascot |
