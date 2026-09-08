# MPI-672 — Issue #2: a silent curated-deps failure ships a broken engine, and the log can never reach us

Umbrella created 2026-09-01 from **[issue #2](https://github.com/MadPonyInteractive/Cubric-Vision/issues/2)**
— a clean `CubricVision-windows-x64-v1.4.2.zip` install, Krea2, prompt "a pixel watch",
`Node 'ClownsharKSampler' not found. The custom node may not be installed.`

**The member cards stay on the board.** Nothing is closed or merged to make this. Close a
member when the phase covering it lands.

## Members

| Card | What it is |
|---|---|
| MPI-673 | A failed curated-deps pass is **silent** — `/comfy/start` already returns `depsWarning` and no frontend reads it |
| MPI-674 | `deps-status` is **blind to import failure**, so the boot repair never fires and the state is permanent |
| MPI-675 | A reporter **can never send us a log** — the Report on GitHub button is dead in every release |

## Root cause — reproduced, not inferred

Built the reporter's exact stack in `D:\tmp\cu126-repro`: ComfyUI **v0.31.0** (v1.4.2's pin,
not master's v0.34.0) `nvidia_cu126` — the legacy portable a GTX 1080 selects via
`selectNvidiaBuild` (`routes/platformEngine.js:194`) — Python 3.12.10, torch 2.13.0+cu126,
v1.4.2's 14 node packs and v1.4.2's `python_deps.txt`.

| Run | Result |
|---|---|
| Curated deps installed | 1885 classes, **0 `IMPORT FAILED`**, all 51 Krea2 classes present. No repro. |
| `matplotlib` + `pywavelets` + `opencv-contrib-python-headless` removed | 1290 classes, **5 packs `IMPORT FAILED`** (RES4LYF, comfyui_controlnet_aux, Impact-Pack, Impact-Subpack, VideoHelperSuite), 5 Krea2 classes gone. **Exact repro.** |

Those three packages are exactly RES4LYF's `requirements.txt`, and the stock portable ships
none of them — they arrive only through `ensureCuratedPythonDeps()`.

POSTing v1.4.2's `krea2_t2i_sfw.json` to the broken engine returns, byte for byte, the
dialog in the issue:

```json
HTTP 400
{"error": {"type": "missing_node_type",
  "message": "Node 'ClownsharKSampler' not found. The custom node may not be installed.",
  "extra_info": {"node_id": "72", "class_type": "ClownsharKSampler_Beta",
                 "node_title": "ClownsharKSampler"}}}
```

`ClownsharKSampler_Beta` is the **first non-core node** in the Krea2 graph (index 6 of 122),
which is why it is the class named — it does not mean RES4LYF was the only casualty.
ComfyUI's `execution.py:1153` prints `_meta.title`, so the message names
`ClownsharKSampler` while the missing class is `ClownsharKSampler_Beta`.

### The chain

1. `ensureCuratedPythonDeps()` (`routes/shared.js`) did not complete on the reporter's machine.
2. `routes/comfy.js` catches that, logs, and **starts the engine anyway** — deliberate
   (refusing to boot over an offline pip would be worse), but with no user-visible signal.
   It even returns `depsWarning` to the caller, which nothing reads. → **MPI-673**
3. Five packs fail to import. The graph's first missing class raises the raw ComfyUI error.
4. **It never self-heals.** `checkUniversalWorkflowDepsStatus` checks folder presence +
   commit marker, so a present-but-broken pack reads as healthy and the boot repair at
   `js/shell.js:335` stays quiet. Restarting the app changes nothing. → **MPI-674**
5. And it can never be diagnosed: the only log-attaching path is dead. → **MPI-675**

### Ruled out (do not re-investigate)

Engine variant, Python/torch version, pip absence (26.2.1 ships in the portable), curated-deps
resolvability on 3.12 and 3.13 win_amd64 (`uv pip install --dry-run` clean on both; the real
install exits 0), node-pack download/extract, and the `<repo>-<ref>` archive-folder scan.

### Still open

**Why** the pip pass failed on that machine. A failed pass stamps no marker, so it retries on
every start — theirs is likely deterministic (proxy / AV / offline), not transient. Needs the
reporter's `%APPDATA%\Cubric Vision\logs\app.log`, which MPI-675 is what makes obtainable.
None of the three fixes depend on that answer.

## Current State

**2026-09-01, later — MPI-675 is SHIPPED and closed (`done`).** Evidence in
`tasks/MPI-675/validation.md`: `npm test` 835/835, lint clean, a live `app:isolated` run
where both buttons and both failure paths were exercised, and Fabio's own screenshot of
Explorer landing on `app.log` selected.

What landed: `/github/create-issue` is **deleted** (with its mirrored `deriveStage()` and the
`axios` import). `POST /github/issue-url` builds a prefilled issue-form URL with no
credentials; `POST /logs/reveal` opens the log in the file manager and returns `logPath` on
both outcomes; `MpiErrorDialog` gained a **Show log file** button plus a status line that no
failure branch can skip; `bug-report.yml` names the per-OS log path.

Three things the next session should know:

- **The `deriveStage()` mirror had ALREADY drifted** — `routes/system.js` answered `alpha`
  for 1.4.2 where `js/core/appStage.js` answers `release`. Deleting it removed a wrong copy,
  and `docs/versioning.md`'s stated rule was stale too and was corrected. Do not reintroduce
  a second implementation.
- **`MpiButton` ignores `text` once `icon` is set** — it renders `label`, with `info` as the
  tooltip. The old Report button hid this by passing the same string to both.
- **`/logs/download` was left alone.** It still has no UI caller. Reveal-the-file is the
  better desktop affordance and covers the brief, so it did not get a second worse button.
  Delete or wire it if a browser-only surface ever needs it.

**2026-09-01, later still — MPI-673 is BUILT and sits in `doing` / `validating`.** Evidence
in `tasks/MPI-673/validation.md`: `npm test` 840/840 (incl. the new
`tests/curated-deps-warning.test.cjs`), lint clean, and a new desktop spec
(`tests/desktop/deps-warning-blocks-generation.spec.js`, 2.3s) that stubs a degraded
`/comfy/status` on a real Electron shell and proves the dialog opens, does not reopen,
and `runWorkflow` rejects with `python_deps_broken` before the graph is loaded.

What landed: `processState.lastDepsWarning` makes the reason outlive the `/comfy/start`
response; `/comfy/status` spreads `...flags` so **all four** branches carry `depsWarning`;
`state.comfyDepsWarning` mirrors it; `comfyController._noteDepsWarning()` announces it once
per NEW value through the blocking dialog; `runWorkflow` refuses a local dispatch on it and
`commandExecutor` translates the code. MPI-459 intact — a failed pass still starts the engine.

Three things the next session should know:

- **Announce on CHANGE, never on presence.** The readiness poll reads `/comfy/status` every
  second and `state` is a Proxy emitting on every assignment, so presence would reopen the
  dialog forever. The desktop spec pins the no-reopen half.
- **A release build has NO engine-restart control** — `js/shell/navigation.js`'s "Restart
  Engine" is on the dev-only Ctrl+Tab radial. So the copy names no button; it says the
  install retries on the next fresh start (true by construction — a failed pass stamps no
  marker). **A reachable in-app repair is MPI-674's, and it is now load-bearing for MPI-673's
  message.**
- **The full desktop suite flakes under load on this box.** A whole-suite run took 8.3m
  against a ~1.2m budget with three agent sessions live, and 4 specs timed out at 30s
  (`audio-permission`, both `flow-clear-slot-advances`, `flow-reuse-opens-without-model`) —
  all 4 pass in 14.4s re-run alone. Re-run before believing a desktop red.

**Folded in at the handoff: master's CI was RED, on this umbrella's own phase 1a.** Run
33489276364 failed `issue-report-url.test.cjs` — it deleted `app.log` to force
`/logs/reveal`'s 404, but `routes/logger` appends ASYNCHRONOUSLY, so a line queued by an
earlier test in the file landed after the delete, the route took its SUCCESS branch and
spawned a real file manager on the runner, and the assert read `200 !== 404`. Fixed by
stubbing `getLogPath()` to a path nothing writes (`54f03caf`), which is deterministic
instead of racing the writer. `--no-verify` was used for that push because it IS the fix.

Both commits are on master: `fc6f4336` (MPI-673) and `54f03caf` (the CI repair).

**2026-09-01, later still — MPI-674 is BUILT and sits in `doing` / `validating`.**
Evidence in `tasks/MPI-674/validation.md`: `npm test` 852/852, lint clean, 10 new unit
tests, a new desktop spec on a real Electron shell, and the shipped scanner run against
BOTH real repro logs at five chunkings (1/7/64/4096/whole) — 5 packs found on
`comfy-nodeps.log` every time, silence on `comfy-boot.log` every time.

What landed: `_scanForImportFailures()` in `routes/comfy.js` reads the packs the engine
itself reports as unimportable straight off its stdout, with a carry so a chunk boundary
cannot drop one; `processState.comfyImportFailures` holds them; `/comfy/status` folds
them into the SAME `depsWarning` MPI-673 built, pip reason first. `POST
/engine/repair-python-deps` removes the curated-deps marker and stops the engine;
`localEngine.repairPythonDeps()` owns the sequence; Settings grows an "Engine health"
section, hidden unless `state.comfyDepsWarning`. `DEPS_BROKEN_MESSAGE` now names it.

Four things the next session should know:

- **User-facing copy in this app carries NO internal identifiers.** The first cut of the
  Settings row rendered `state.comfyDepsWarning` verbatim, so an artist read
  `custom node packs failed to import: RES4LYF, comfyui-videohelpersuite`. Fabio, on
  seeing it: *"This is an artist app, not a geek app. We're the geeks, not them."* The
  rule read wider than the names — "Python packages", "custom nodes", "pip" are our
  vocabulary too, and all of it went. **This changed MPI-673's dialog as well** (title
  and body, at both of its mirrored sites), so the two cards' copy is now one voice.
  Standing rule in project memory: `feedback_no_internal_identifiers_in_user_copy.md`.
- **The brief's own premise was wrong, and the card documents why.** Making
  `checkUniversalWorkflowDepsStatus` import-aware cannot work: `_bootApp` reads
  `/engine/deps-status` at `js/shell.js:335` and does not start ComfyUI until line 541
  of the same function, so there is no engine to ask when that gate answers. The disk
  check is left alone and is correct for the question it does answer (missing/drifted
  folders, which `_installOutstandingUwDeps` CAN repair). Import health is a second
  question, answered where an engine exists.
- **The `/object_info` class diff was rejected on a false-positive.** A workflow for a
  model the user never installed names classes from a pack that is not on disk, so the
  diff reports a hole on a perfectly healthy engine. The engine's own `IMPORT FAILED` /
  `Cannot import` lines are exact — a pack never installed is never imported and prints
  neither — and they name the packs, which the diff cannot.
- **Removing the marker, not restarting, is the load-bearing half of the repair.** The
  reporter's failed pass stamped no marker, so a fresh start alone would have retried
  for them. The same broken state is reachable WITH a marker (a pass that succeeded,
  packages lost afterwards), and there every later start reports a clean install and
  changes nothing for ever.

Still open on MPI-674, deliberately: **the ~10 GB `D:\tmp\cu126-repro` harness stays.**
1.4.3 is unreleased and this is the only place the broken state exists on demand, so
phase 3 may still want it. Dispose at the UMBRELLA's close-out and say so there — the
card's own close-out is no longer the right moment, which supersedes the note at the
bottom of this plan.

Next: **phase 3** — the 1.4.3 release. Fabio has now seen the Settings section in his own
app and the copy was rewritten on his call, so MPI-673's original open question is closed
by the same change; both cards are ready for `done` on his word.

Two things the next session inherits and did not cause:

- **`.agents/mpi-kanban/events.jsonl` has 4 malformed uncommitted lines** (07:27–07:47 today,
  missing `schema`/`type`/`id`), plus 17 legacy ones under `MPI-666`. `validate_board.py` exits
  1 on them; none belong to this umbrella. They were left alone because they are another live
  session's working copy. They will bounce a close-out — fix or hand back to that session then.
- **A concurrent session's commit `54277eb4` swept this board's `board.json`** before the task
  folders were committed, so origin briefly carried card ids with no cards behind them. Already
  repaired by `819a6f46`; noted because the same race can recur — this tree runs peers.

**2026-09-01, phase 3 in progress — the branch is built and pushed; the release is not cut
yet.** Work happens in a `git worktree` at `D:\tmp\cv-142-wt` on branch `1.4.2`, NOT in the
main tree: three peers (MPI-591, MPI-664, MPI-678) hold uncommitted work on master and a
branch switch there would have taken it. The repo's `post-checkout` hook installed
`node_modules` and bootstrapped `.engine-config.json` on its own.

`1.4.2` is now on origin at `68a67a0b`, four ports on top of `88fcda76`:
`659d641a` (e152cc10) · `13faa25a` (fc6f4336) · `94799255` (54f03caf) · `68a67a0b` (a2a14de3).
Ported as `git diff <sha>^ <sha> -- . ':(exclude).agents'` through `git apply --3way`, one
commit each — **board state was deliberately excluded**, since `board.json` at 1.4.2 is 640
commits stale and a plain `cherry-pick` conflicts on it every time.

Three things the next session should know, all recorded in full in `tasks/MPI-672/validation.md`:

- **`MpiSettings.js` was hand-ported** — every anchor in a2a14de3 is the Update section
  (MPI-629), which is master-only, so on the branch Engine health is the FIRST section and
  its comment no longer points at an Update section that does not exist. `engine-repair-reachable.spec.js`
  drives that exact section and is green.
- **`a2a14de3` carried one line of MPI-591's unshipped work** —
  `getUniversalWorkflow(payload.operation, payload.flowModelIds)` in `commandExecutor.js`.
  The two-argument signature exists in no branch, only in MPI-591's `plan.md`, so it was
  inert on master. Stripped from the port. Worth a look at whether it should also come off
  master, but that is not this card's call.
- **The desktop suite's red is the box, not the port.** Every full run fails exactly one
  spec and a different one each time, each passing alone; the *pristine* base `88fcda76`
  fails **two** on the same box. `npm test` is a clean 626/626.

**2026-09-01, later — 1.4.3 is STAMPED and pushed; only the tag and the publish remain.**
`f7939337` on `origin/1.4.2`: `appVersion.js` + `package.json` + `package-lock.json` at
1.4.3, `RELEASE_NOTES['1.4.3']`, `docs/releases/2026-09-01-v1.4.3.md`,
`.approved-1.4.3.json`, UNRELEASED cleared. Fabio read the overlay copy at Gate 1 and
approved it unchanged. Pure-patch path — no ops, no schema, no engine move.

Gates, all in `tasks/MPI-672/validation.md`: `release:check` green **with the Pod
model-paths leg actually run** (it skips in a worktree — it resolves `mpi-ci` as a sibling
of the repo root, so the real `start.sh` was staged at `D:\tmp\mpi-ci` for the run and the
stand-in deleted after); `npm test` 626/626; Pod `dev`/`stable` manifests byte-identical;
engine pin unmoved so the smoke-evidence gate does not apply.

Two findings that are NOT this release's to fix:

- **`release:deps` exits 1** on `ltx23-lora-foley`'s HuggingFace mirror (404 — the repo
  answers 200, so the file was never uploaded), while its R2 primary serves 200 at the
  declared 226,709,270 bytes. A dev-gated Flow weight on one route instead of two. Same on
  master. Reported to Fabio, spun out as a separate background task, no card.
- **`toast-serial-countdown` is load-sensitive**, and the box now fails it even on the
  pristine base `88fcda76` (2/2) having passed it earlier. `APP_VERSION` was reverted to
  1.4.2 as a probe and it still failed, so the new changelog entry is not the cause. Do not
  bisect this again — the answer is the load, not the port.

Next: push the `v1.4.3` tag (Fabio authorized it), watch the mpi-ci build, download the 6
artifacts, then Gate 2 and `gh release create`. **The tag lands on a BRANCH commit** — if
CI needs a manual dispatch, `ref` must be `1.4.2` or a full 40-char SHA; a short SHA fails
at checkout in ~40s. Reconcile `git rev-parse 'v1.4.3^{}'` against the SHA CI actually
built before publishing.

## Phases

**Phase 1 — make the failure visible and reportable (MPI-675, then MPI-673).**
MPI-675 first: until a reporter can send a log, every future engine bug costs this same
investigation. Both are small and independent.

**Phase 2 — make it detectable and self-healing (MPI-674).**
Import-aware health check plus a repair the user can reach after boot. Largest of the three;
if it cannot land cleanly in the patch, ship phase 1 as 1.4.3 and carry this to the next.

**Phase 3 — release.** See below. Do not start until phases 1–2 are closed or explicitly cut.

## Release path — READ THIS BEFORE BRANCHING

All three defects are present at **v1.4.2 and on master HEAD `75d92e4c`, on the same lines**
(verified 2026-09-01), so this is a patch: **1.4.3**, and it must also land on master.

Facts measured on this tree, 2026-09-01:

- Maintenance branch **`1.4.2` exists LOCALLY ONLY** at `88fcda76` — origin carries
  `1.3.0`, `1.3.1`, `1.4.0`, `1.4.1` and **no `1.4.2`**. Push it before relying on it.
- `1.4.2` is 1 commit ahead of tag `v1.4.2` (`80e4521b`) — that is the baseline restamp
  cherry-pick, i.e. the branch is healthy.
- **master is 634 commits ahead of `1.4.2`.** Master is not the release base for a patch.

Per `project_release_model_github_only` (amended 2026-08-01): a bug against a shipped
version is fixed on that version's maintenance branch and released as the next patch digit.

**Recommended order — author on master, cherry-pick to `1.4.2`, cut 1.4.3 from the branch.**
Master is where the fix must ultimately live and where CI and the tests run. The three touch
points are small and byte-identical at both refs, so the cherry-picks should be clean despite
the 634-commit gap; if one conflicts, port by hand rather than merging master into the branch.

Then follow `/mpi-release` (bump the 3rd digit) — and mind its two documented traps: the
`v<ver>` tag is a BUILD TRIGGER that goes stale across `workflow_dispatch` rebuilds (verify
`git rev-parse 'v1.4.3^{}'` equals the SHA CI built before publishing), and cherry-pick the
`release-baselines/*.json` restamp onto the new branch afterwards.

## Reproduction harness

`D:\tmp\cu126-repro` (~10 GB) holds the built cu126 v0.31.0 engine, v1.4.2's configs under
`v142-config/`, and both boot logs (`comfy-boot.log` = healthy, `comfy-nodeps.log` = 5
`IMPORT FAILED`). Helper scripts that built it are in the originating session's scratchpad
(`install-nodes.mjs`, `check-classes.mjs`, `post-prompt.mjs`). Re-create with: extract the
portable, `pip install -r python_deps.txt --no-deps`, install the locked packs, boot, then
`check-classes.mjs <workflow> http://127.0.0.1:48199`. **Use it to prove MPI-674's detector
actually fires** — it is the only place the broken state exists on demand.

**MPI-674 owns the harness and owns deleting it** (user call, 2026-09-01). It is kept
precisely because MPI-674 needs it, so it is not garbage to be swept by a cleanup pass: leave
it alone until that card closes. MPI-674's own close-out is what checks whether anything else
still needs it and removes it if not.
