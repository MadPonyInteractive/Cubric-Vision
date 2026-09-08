# MPI-709 — validation evidence

## What landed this session

`scripts/portable/apply-update.cjs` gained the missing precondition. Before it, the applier
validated `appId` and `platform` and nothing else, so a delta bundle applied onto any
installation and reported success either way.

- `readInstalledVersion(portableRoot)` reads the app's own `package.json` —
  `resources/app/package.json` (Windows) or `app/package.json` (Linux/macOS), the same two
  layouts `loadExtractZip` already walks.
- `assertBundleApplies(manifest, root)` returns immediately for a FULL bundle
  (`fromVersion: null`), and otherwise requires the installed version to equal
  `manifest.fromVersion`. An unreadable installed version is a refusal, not a guess.
- The call sits after the `files` check and **before `fs.mkdirSync(rollbackRoot)`** — the
  first write. A refused bundle therefore leaves the installation byte-identical.

## The mid-fix correction, which is the useful part of this record

The guard was first written against `resources/cubric/update-manifest.json` `toVersion`,
which looks like the obvious source and is wrong. Measured on the real install
(`D:\cubric-install-test\CubricVision-windows-x64-v1.3.0`):

| Signal | Value | Age |
|---|---|---|
| `resources/app/package.json` | **1.5.0** | current |
| `js/core/appVersion.js` | **1.5.0** | current |
| `resources/cubric/update-manifest.json` | **1.3.0** | `createdAt` 2026-08-01 |
| `resources/app/resources/cubric/update-manifest.json` | **0.0.11** | `createdAt` 2026-06-10 |

The top-level manifest is stale across **two** separate in-place updates (1.4.0 on Aug 10,
1.5.0 today) even though MPI-523 made the applier copy it explicitly and that unit test
passes. Keying the guard off it would have refused legitimate deltas for anyone whose
manifest had drifted — the opposite of the bug being fixed, and it would have shipped
undetected without the real-artifact repro.

**That staleness is a second, separate defect and is NOT fixed here.** It needs its own
card: MPI-523's fix does not hold in the field.

## Evidence

**Full suite: 906 pass, 0 fail** (`npm test`).

`tests/portable-update-apply.test.cjs` — 4 tests, all green. The three new ones seed
`package.json` and the manifest with *deliberately disagreeing* versions, so a regression
back to the manifest fails loudly:

- a FULL bundle applies onto an install four releases behind
- a mismatched delta is refused, and the app file, the version and the manifest are all
  untouched with no rollback directory created
- a delta is refused when the installed version cannot be read

The pre-existing MPI-523 test needed `app/package.json` added to its fixture — every real
install has one because Electron needs it to find `main`, so this is fixture parity rather
than a workaround.

**Against the real shipped artifact.** The actual
`CubricVision-windows-x64-update-v1.5.0.zip` from the install's own `update/downloads/`,
extracted and read: `fromVersion: 1.4.4`, `toVersion: 1.5.0`, 116 files, 0 deletes — which
confirms the root cause on the shipped bundle rather than by inference. Replayed against a
scratch copy of the install's real version signals (nothing written to the install itself):

```
This installation is 1.5.0, so the 1.5.0 update was not applied. It expects 1.4.4.
Nothing was changed. A repair release that installs over any version is on the way —
take that update when it is offered.
  exit: 1
  sentinel still: untouched
  rollback dir created: False
```

The message deliberately never tells a user to reinstall or download a full build: a fresh
download lands in a new folder with no `engine/`, costing them the whole ComfyUI download
(Fabio, 2026-09-08).

## Release decision — 1.5.0 is cancelled, not superseded

`gh api .../releases/tags/v1.5.0` reported **2 total downloads**, both on
`CubricVision-windows-x64-update-v1.5.0.zip`, both Fabio's own test runs. Zero on every
full artifact, zero on Linux and macOS. **No external user ever had 1.5.0.**

That removes the objection to deleting it — the semver-stranding problem only affects people
already on 1.5.0. So 1.5.0 is deleted and re-cut carrying this fix, rather than a 1.5.1
being issued, and there is no phantom version to explain.

Three things must travel with the deletion, verified present on origin at the time of
writing:

1. `refs/tags/v1.5.0` — deleting the release does not remove the tag, and the version cannot
   be re-cut while it exists.
2. `refs/heads/1.5.0` at `a8691834` — the maintenance branch cut by MPI-706.
3. **The three `release-baselines/*.json`, currently stamped `toVersion: 1.5.0`** by
   `22239f5e`. If 1.5.0 never shipped, the newest version any user holds is 1.4.4, so a
   baseline claiming 1.5.0 makes the next build emit a `1.5.0 → next` delta that no user can
   apply. Removing the files entirely is better than reverting them to 1.4.4: mpi-ci treats
   an absent baseline as "ship a FULL bundle", which serves 1.4.4 and everything older.
   Restamp from the published full build afterwards, as the existing post-publish step does.

## The release gate — closed 2026-09-08

### Why the old leg passed a corrupt build

`docs/playbooks/install-test/README.md:75` asserted one thing: *"confirm `user-data\`
SURVIVES"*. On the broken install it did — projects, secrets and settings were all intact,
because the applier never touches those prefixes. The leg had no way to fail.

Two conditions were missing, and both are now required by § 3 of that playbook:

1. **A gap.** Updating from one version behind passes even with the applier completely
   broken: a delta's `fromVersion` IS the previous release, the single install it fits. The
   test now requires a source install at least two released versions behind.
2. **A working app.** The new leg runs a real generation and opens the output. In the 1.5.0
   failure the server was healthy and only the renderer was dead — every automated signal
   the old leg could have read was green.

### The gate is executable, not a checklist line

`scripts/release-health-check.mjs` gained `checkUpdateEvidence(appVersion)`, mirroring the
MPI-467 smoke-evidence gate. It reads `dev_configs/update-evidence.json` and fails on:
missing file · `toVersion` ≠ `APP_VERSION` · `fromVersion` absent, unpublished, or only one
release behind · no `generation.ok` + named artefact · `userDataSurvived` not recorded. It
skips with a warning when fewer than two releases precede this one.

**It runs only under `--publish` (`npm run release:check:publish`).** `release:check` is run
at the version-bump gate (mpi-release step 2), long before CI has produced an artifact to
install-test, so an unconditional gate would refuse every bump. The default run now prints
that the update-test evidence was not checked, and `mpi-release` step 6 runs the publish
mode before `gh release create`.

### Evidence

Five fixtures against the live repo (`APP_VERSION` 1.4.2; published tags … 1.4.0, 1.4.1),
each written to `dev_configs/update-evidence.json`, run, then removed:

| Fixture | Result |
|---|---|
| `fromVersion 1.4.1` (one behind) | REFUSED — *"only ONE release behind … Re-run from 1.4.0 or older"* |
| `fromVersion 1.4.0` (two behind), generation ok | accepted, no update-evidence failure |
| `generation.artifact` empty | REFUSED — *"records no real generation after the update"* |
| `toVersion 1.5.0` on a 1.4.2 build | REFUSED — *"that run tested a different build"* |
| `fromVersion 9.9.9` | REFUSED — not a published version, and it lists the ones that are |

The semver sort is numeric, not lexical — the published list comes back
`0.0.5, 0.0.6, 0.0.7, 0.0.12, 1.0.1 …`.

`node scripts/release-health-check.mjs` with no flag reports exactly one failure, and it is
**pre-existing and unrelated**: the engine pin moved 0.31.0 → 0.34.0 and
`smoke-evidence.json` (2026-09-05) is older than the `node_lock.json` change
(2026-09-06T18:14:27+01:00), so the MPI-467 gate calls it stale. `git diff` confirms
`checkSmokeEvidence` is untouched apart from hoisting its local `git()` helper to module
scope for reuse. `node --test tests/smoke-evidence-merge.test.cjs` — 3/3 pass.

**That stale smoke evidence blocked the 1.5.0 re-cut** — and the diagnosis above turned out
to be wrong in a way worth recording. See the next section.

## The staleness was real, the blast radius was not (2026-09-08)

The handoff said the core engine pin had moved and the evidence predated it. Half right. The
`0.31.0 -> 0.34.0` text is the gate's *bumpNote*, measured against `v1.4.2`; the evidence
already recorded `want 0.34.0 / got 0.34.0 / proven true`, so the engine-version check
passed. What actually tripped the gate was the timestamp anchor: `node_lock.json` last
changed at `ace2161e` (2026-09-06 18:14), which moved the **MpiNodes** pin `8505769 ->
287edb8`. One line of that file.

That hop changed four classes, established by comparing each class's own source across the
two commits (`scripts/engine-drift.mjs`):

| class | what changed | reaches a shipped graph? |
|---|---|---|
| `MpiClearVram` | body lifted verbatim into a module-level `_clear_vram()` helper it now calls — same four operations, same order | yes, nearly all of them |
| `MpiClearVramEnd` | new node | **no** — only `raw/` and `scripts/workflow_generation/` templates, which are never dispatched |
| `MpiSaveVideo` | `RETURN_TYPES () -> ("STRING",)`, `ui` payload byte-identical | 15 runtime graphs |
| `MpiWindowedSampler` | new node | the two H3 runtimes only |

Everything else in `sampler.py`, `video.py` and `vram.py` is byte-identical across the hop.

**No smoke run was needed, and none was run.** Three independent facts:

1. `f91438ca` (2026-09-06 18:31, "bake the windowed sampler into both H3 runtimes") is what
   genuinely invalidated the 09-05 H3 rows — verified by reading the graph at each commit,
   where the `MpiWindowedSampler` count goes 0 → 1 that evening.
2. Fabio then ran all three H3 ops against the post-bake graphs on **2026-09-07 14:57–15:37Z**
   in `Documents/Cubric Vision/Projects/RTX5090 H3 Tests` — `ref2v_ms` ×7, `t2v_ms` ×5,
   `i2v_ms` ×6, every one a multi-MB mp4 with a decoded thumbnail, and partly for the express
   purpose of checking the new sampler. That exercises both `MpiWindowedSampler` and
   `MpiSaveVideo` (which wrote all 18 files) on the graphs that ship.
3. `git log --since=2026-09-07T15:37Z -- comfy_workflows/ dev_configs/node_lock.json` is
   **empty**: what ran that afternoon is what ships.

`MpiSaveVideo`'s new socket is also connected nowhere — 15 runtime graphs contain the node,
0 nodes consume any of its outputs — so no shipped graph's execution can differ.

### What changed in the gate

`scripts/engine-drift.mjs`, called by **both** twins (`release-health-check.mjs` and
`smoke-workflows.mjs`'s `loadMergeBase`) so they cannot drift apart. Per-class, not
per-module: a module *shell* change still condemns every class in that module, because a
shared helper moving can carry behaviour with it — which is exactly why `MpiClearVram` is
flagged rather than silently cleared. Anything unanswerable (core bump, third-party pin,
missing sibling checkout) returns the blunt refusal, unchanged.

`dev_configs/engine-attestation.json` carries the human half, pinned to this exact
`from`/`to` hop so it expires the instant either pin moves. `MpiClearVramEnd` is
**deliberately not attested** — the narrowed rule clears it on its own, which is the worked
example that the aim is right.

Verified: `npm run release:check` → **passed**, reporting `no shipped graph loads a changed
class (attested: MpiClearVram, MpiSaveVideo, MpiWindowedSampler)`.
`node scripts/smoke-workflows.mjs --self-check` → OK. `npm test` → **914/914**, including the
new `tests/engine-drift.test.cjs` (4) and `tests/updater-rename-bridge.test.cjs` (3).

## MPI-708 Phase 0b rode this cut

All three updater-bridge changes landed, so an install shipped under the old name can still
find and apply a Cubric Studio-named release. The updater that runs is the one already on
disk, which is why none of this can wait for 2.0.

- Asset pattern widened to `^Cubric(Vision|Studio)-…-update-v.*\.zip$` on all three
  platforms (`win-update.cjs`, `linux/update.sh`, `macos/update.command` ×2 arches).
- Relaunch/runtime exe resolution tries `CubricStudio.exe` then `CubricVision.exe`
  (`win-update.cjs`, `windows/update.bat`, `windows/update-from-zip.bat`).
- `apply-update.cjs` accepts either `cubric.vision` or `cubric.studio`; builds still stamp
  `cubric.vision`, and a foreign appId is still refused with the install left byte-identical.

`tests/updater-rename-bridge.test.cjs` asserts each of Phase 0b's Verify clauses, including
that a FULL build name is still **not** mistaken for an update bundle. The test caught one
real thing on the way: it failed on `update-from-zip.bat` because a stale comment named the
old exe before the new resolution, so the comment was corrected.

Also swept, same MPI-387 drift: `install-test/README.md` (3 places — the app-root listing,
the `CUBRIC_USER_DATA_ROOT` claim, and the "launch both ways" step), `DEVELOPMENT.md:123`,
and `scripts/portable/dev-setup/setup.bat:28`, which told a developer to launch with two
deleted files. `build-portable.mjs`'s `RETIRED_PATHS` still names them **deliberately** —
that is the list that deletes them from an updated install, and it must stay.

Sibling: `mpi-ci` commit `ac45b4f` syncs the pod's `node_lock.json` to MpiNodes `287edb8`
(committed, **not pushed**). Code-only pack, no image rebuild.

## Not done — Fabio's GitHub steps

Delete `refs/tags/v1.5.0` (`fa655783`, pointing at `a8691834`) and delete or re-point
`refs/heads/1.5.0`. Both are destructive and outward-facing, so they stay with Fabio.
The three `release-baselines/*.json` are now removed, so the next build emits a FULL bundle
— restamp them from the published full build afterwards. Spin-out card for the stale
top-level `update-manifest.json`: **MPI-710** (todo / research).

## The fix was on the wrong branch — found 2026-09-08, route A taken

The whole MPI-709/708 body of work was committed to **master**. v1.5.0 was never cut from
master. Tag `v1.5.0` = `fa655783` -> `a8691834`, which sits on the **`1.4.2` maintenance
branch** (worktree `C:/AI/Mpi/Cubric-Vision-1.4.x`). Master forked from it at `372c1895`
(stamp 1.4.2, 2026-08-15) and is 879 commits ahead / 34 behind. 1.4.3, 1.4.4 and 1.5.0 all
shipped from the 1.4.x line while master ran on toward 2.0.

Measured before deciding anything:

| | master `c4d88ed2` | branch `1.4.2` `b4ca625d` |
|---|---|---|
| stamped version | 1.4.2 | **1.5.0** |
| `apply-update.cjs` fromVersion guard | 4 refs | **0** |
| `release-baselines/*.json` | removed | **present, `toVersion: 1.5.0`** |
| `checkUpdateEvidence` / `release:check:publish` | present | **absent** |
| `scripts/engine-drift.mjs`, `tests/updater-rename-bridge.test.cjs` | present | **absent** |

Two consequences the earlier sessions did not catch:

1. **The green `npm run release:check` proved a 1.4.2 release, not a 1.5.0 one.** It reads
   `APP_VERSION` from the tree it runs in, and master's is `1.4.2`. `checkUpdateEvidence`
   refuses when `evidence.toVersion !== appVersion`, so `update-evidence.json` could never
   have been written against master.
2. **`2092f07e` dropped the baselines on the wrong line.** The 1.4.x branch still carried
   `release-baselines/win32-x64.json` at `toVersion: 1.5.0`, which is exactly the file that
   would have made the re-cut emit another unusable delta.

**Fabio chose route A (2026-09-08): re-cut from the 1.4.x line.** Landed as `34639329` on
branch `1.4.2` — cherry-picks of `7caae2c9`, `37247fac` and `3d11f948`, all three clean with
zero conflicts, plus the three baselines deleted. `npm test` 673/673. `release:check` passes
and now prints the "evidence was NOT checked" warning; `release:check:publish` correctly
refuses on the missing `update-evidence.json`.

**`2fded019` was deliberately NOT carried across.** It narrows the smoke-evidence staleness
rule, and this branch's gate is already green on its own 44-op evidence
(`dev_configs/smoke-evidence.json`, 2026-09-07T22:42, ComfyUI 0.34.0). Carrying it would be
dead weight and it references `scripts/engine-drift.mjs`, which this line does not have.
Verified afterwards: `grep -c engine-drift scripts/release-health-check.mjs` = 0 on the
committed tree, so nothing dangles. It stays on master for 2.0.

`js/data/releaseNotes.js` was deliberately left untouched, so `.approved-1.5.0.json` stays
valid. 1.5.0 reached no external user, so from a user's side it is still a first release and
the applier guard is invisible to them — and any edit after approval re-drifts the hash and
fails the CI build outright.

### Install-test source install — staged 2026-09-08

`D:\CVTest\CubricVision-v1.4.2\`, a fresh extract of the published
`CubricVision-windows-x64-v1.4.2.zip` (6509 entries, no top-level folder). 1.4.2 is **two**
releases behind 1.5.0 (1.4.3 and 1.4.4 sit between), so it clears the gate; 1.4.4 would not.
Fabio's note: the old `D:\cubric-install-test\...v1.3.0` folder is unusable — it is the
corrupted victim, now reading 1.5.0, and its 1.3.0 base had already been updated to 1.4.0.

`engine/` (6.3 GB) and `models/` (12 GB) were **moved** in from
`D:\CVTest\CubricVision-v1.5.0\` — same volume, so 0.04s, versus an 11 GB bootstrap plus
every weight. That folder now has neither; move them back to restore it.

`extra_model_paths.yaml` was repaired as memory predicted — it carried
`base_path: D:/CVTest/CubricVision-v1.5.0/models` and nothing self-heals it. Now points at
`D:/CVTest/CubricVision-v1.4.2/models`.

**Git Bash `tar` cannot read a zip** ("This does not look like a tar archive", exit 0 under
`2>/dev/null`). Use `/c/Windows/System32/tar.exe` — bsdtar, 6509 entries in seconds.

## The update leg FAILED — 2026-09-08, and it is release-blocking

The leg ran exactly as § 3 prescribes: genuine published 1.4.2 install
(`BUILD_HASH 372c18958356`), two releases behind, real project and a real generation made
first so a later failure would be attributable. Then `update-from-zip.bat` with the re-cut
FULL bundle. It **failed**:

```
UNKNOWN: unknown error, copyfile
  '...\CubricVision-v1.5.0-update-only\icudtl.dat' -> 'D:\CVTest\CubricVision-v1.4.2\icudtl.dat'
APPLIER_EXIT=1
```

### Root cause

`copyManifestFile` (`scripts/portable/apply-update.cjs`) retries through `evictBusyFile`
only when `isBusyError(err)` is true, and that predicate lists
`EBUSY, EPERM, EACCES, ETXTBSY`. Windows/libuv reports **`UNKNOWN`**
(`ERROR_USER_MAPPED_FILE`) when overwriting a **memory-mapped** file, and `icudtl.dat` is
ICU data Electron maps at startup. So the eviction machinery that already exists — and that
had just successfully swapped the 222 MB `CubricVision.exe` three files earlier — is skipped
for `icudtl.dat`, and `main().catch` aborts the whole run.

**Why it has never been seen:** every Windows update bundle ever shipped was a small delta —
v1.4.1 **51** entries, v1.4.2 **130**, v1.4.3 **29**. Electron runtime files do not change
between patch releases, so they were never in a bundle. The re-cut FULL bundle carries
**6523** entries and is the first to include them. No full bundle has ever been applied in
place on Windows.

**There is no rollback.** `main().catch` prints the message and sets exit 1. The
`update/rollback/<stamp>/` tree is filled as it goes but nothing restores it and the error
never mentions it. The run left `CubricVision.exe.old` behind and the install mixed.

### The measurement that reframes it

Every file the applier wrote before dying was **byte-identical** to what was already there:

| file | 1.4.2 installed vs 1.5.0 bundle |
|---|---|
| `icudtl.dat` | same (`5bfd3eef…`) — the one it died on |
| `CubricVision.exe` | same (`d8916507…`) — 222 MB, evicted for nothing |
| `chrome_100_percent.pak`, `chrome_200_percent.pak` | same |
| `d3dcompiler_47.dll`, `dxcompiler.dll`, `dxil.dll`, `ffmpeg.dll` | same |

So the applier aborted an update, and evicted the running binary, to rewrite files that had
not changed. **The test install is therefore unharmed** — `resources/app` was never reached,
`user-data` md5s are identical, and the seven files it did write were the same bytes. It is
still a usable 1.4.2 source install; it just carries a stray `CubricVision.exe.old` plus
`update/rollback/` and `update/tmp/` dirs.

The obvious fix is to **skip the copy when the target already matches the manifest's
`sha256`** — the manifest carries one per file and `applyDelta` already uses them. No copy,
no eviction, no lock to lose. That is a root fix, not a guard at the crash site: the lock
conflict is a consequence of unnecessary I/O.

### Why fixing it does NOT unblock 1.5.0

`scripts/portable/win-update.cjs:154` resolves
`const applyScript = path.join(root, 'update', 'apply-update.cjs')` — the applier **already
on the user's disk**. A 1.4.2 user updating to 1.5.0 runs their own 1.4.2 applier. Confirmed
on this install: `grep -c fromVersion update/apply-update.cjs` = **0**.

So neither the `fromVersion` guard nor a skip-identical fix reaches anyone updating *to*
1.5.0. Both protect the update *after* the one that installs them. Consequences:

- Shipping the FULL bundle: every Windows user more than zero versions behind aborts on
  `icudtl.dat`, **after** their `CubricVision.exe` has been evicted, with no rollback.
- Shipping a 1.4.4 delta: 1.4.4 users are fine; everyone older runs their own unguarded
  applier and gets the original MPI-709 corruption. That is the status quo, unfixed.

**The publish gate did its job.** `checkUpdateEvidence` is the reason this was found before
publication instead of by users, which is precisely the leg 1.5.0 walked straight through.

## The delta leg — 2026-09-08, and a launcher that rewrites itself mid-run

Source install `D:\CVTest\CubricVision-v1.4.4`, a fresh extract of the published
`CubricVision-windows-x64-v1.4.4.zip`, provenance proven: `BUILD_HASH 8b28b230783e` equals
the `v1.4.4` tag sha. Engine `0.31.0` = 1.4.4's own pin, so no repair download. Real
`user-data` seeded from the 1.4.2 run.

Bundle verified before it went near the install: `fromVersion "1.4.4"`, `toVersion "1.5.0"`,
120 files, `BUILD_HASH 43b22c407b61` — 121 entries against the FULL bundle's 6523.

**The update applied.** `Applied Cubric Vision update to 1.5.0.` App version 1.5.0,
`BUILD_HASH 43b22c407b61`, all three `user-data` md5s byte-identical, the installed applier
now carries the `fromVersion` guard (0 refs → 4). The app boots, bumps the engine
`0.31.0 → 0.34.0`, shows the 1.5.0 changelog and renders the full landing screen with all
37 projects — the exact screen the 1.5.0 corruption never reached.

### The stale update-manifest is MPI-710, not a regression

After the update `resources/cubric/update-manifest.json` still read `toVersion 1.4.4`
(mtime 2026-09-03, the build date — never touched), and the nested copy read `0.0.11`.

Cause found, and it is the same shape as everything else here: the applier that RAN is
1.4.4's own, and `grep -c UPDATE_MANIFEST_REL` on the backed-up copy in
`update/rollback/<stamp>/update/apply-update.cjs` is **0** — it does not even define the
constant. MPI-523's manifest refresh is not in 1.4.4. The 1.5.0 applier now installed has it
at line 368, so the manifest refreshes from the next update onward. Nothing to fix here; the
unit test passes because it tests the CURRENT applier, which is never the one that runs.

### A launcher replaced while it is executing

The run printed success and then:

```
'_EXECUBRIC_PORTABLE_ROOTCUBRIC_PORTABLE_ROOTf1"' is not recognized ...
This installation is 1.5.0, so the 1.5.0 update was not applied. It expects 1.4.4.
APPLIER_EXIT=1
```

The delta replaces `update-from-zip.bat`, and **cmd re-reads a batch file at its byte offset
between commands**. It resumed mid-line inside the NEW file, produced garbage, and invoked
the applier a second time. The `fromVersion` guard refused that second run, which is the only
reason nothing broke — the guard caught a bug it was not written for. Net effect: a
successful update ends in an error and a non-zero exit code.

Blast radius, measured rather than assumed:

| path | launcher | re-read hazard |
|---|---|---|
| Windows, in-app (`run-update`) | `main.js:1232` spawns `update/win-update.cjs` through the app binary as node | **None** — node reads the whole file at load. MPI-387 made Windows skip `.bat` precisely because Smart App Control blocks it |
| Windows, offline `update-from-zip.bat` | cmd | **Observed.** Cosmetic: update succeeds, then errors and exits 1 |
| Linux / macOS, in-app | `main.js:1232` spawns `update.sh` / `update.command` | **Same class, and it is the PRIMARY path there.** The linux delta ships `update.sh` and `update-from-zip.sh`; sh also reads scripts incrementally |

Not fixed here, and not blocking the Windows release. The standard remedy is to wrap the
launcher body in a function invoked on the last line, so the interpreter has parsed the whole
file before any of it can be replaced.
