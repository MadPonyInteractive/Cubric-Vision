# Portable Distribution Contract

This document defines the Cubric Vision portable release contract used by
MPI-8. It is a reference for build scripts, update scripts, release notes, and
manual validation. The historical planning detail remains in
`docs/plans/2026-04-30-cross-platform-portable-distribution.md`; this document
is the current release contract for implementation.

## Build Process

This is how portable artifacts are produced. The contract below (names, layout,
manifests) describes the *output*; this section describes *how to create it*.

### Canonical builds run in CI, per-OS

Portable artifacts are built by the private GitHub Actions workflow
`MadPonyInteractive/mpi-ci/.github/workflows/cubric-vision-portable.yml`, one
job per OS (Windows, Linux, macOS). **This is the only correct way to produce a
shippable artifact.** Each runner does a native `npm ci`, so `node_modules`
carries that platform's native binaries (Electron, ffmpeg). These cannot be
cross-built: a Linux or macOS artifact must be built on its own OS. A Windows
machine cannot produce a working Linux/macOS tarball.

Triggers:

- Manual dispatch in the private `mpi-ci` repo:
  `gh workflow run cubric-vision-portable.yml --repo MadPonyInteractive/mpi-ci --ref main -f source_repo=MadPonyInteractive/Cubric-Vision -f ref=<branch-or-tag> -f version=<version>`
- Optional dispatcher in Cubric-Vision:
  `.github/workflows/build-portable.yml` requests the private `mpi-ci` workflow
  and does not build or upload artifacts in the source repository. It requires
  a Cubric-Vision secret named `MPI_CI_WORKFLOW_TOKEN` that can dispatch
  workflows in `MadPonyInteractive/mpi-ci`.

Each job calls `scripts/build-portable.mjs` with an explicit `--stage-dir`
under `${{ runner.temp }}` and uploads the full artifact plus update bundle as a
private GitHub Actions artifact named `cubric-vision-<platform>-<arch>`
(`retention-days: 1`). Public source-repo workflows must not upload early-access
portable artifacts. CI does **not** publish a GitHub Release and cannot write to a
local disk - see "Collecting CI artifacts" below.

**Every dispatch costs storage, released or not (MPI, 2026-08-05).** One run
uploads ~1.8 GB (win 925 MB + linux 481 + mac 450) and GitHub meters Actions
storage **by the hour**, so the 2 GB plan is really ~1460 GB-hours/month. Between
2026-07-30 and 08-02 there were 16 dispatches and only 2 releases: the 14
build-iteration runs nobody collected still spent ~137% of the month's whole
allowance and tripped the 100%-used alert. This is why retention is 1 day, and
why **any dispatch you are not about to release from should have its artifacts
deleted as soon as you have what you came for** — same loop as the release flow's
in `.claude/skills/mpi-release/references/build-dispatch.md`. Iterating on the
build script? Prefer a single-OS matrix over a full three-OS run.

### Local dev builds

`scripts/build-portable.mjs` can be run locally for the current OS only
(`--platform`/`--arch` default to the host). Useful for inspecting layout or
iterating on launcher scripts — **not** for shipping a cross-OS artifact.

- Output folder: on the maintainer Windows workstation the default
  `--stage-dir` is `D:\CubricStudio\Vision\Builds` (used when the `D:` drive is
  present). Elsewhere it falls back to the repo's `dist/portable`. Override with
  `--stage-dir <path>`.
- `--no-update-bundle` skips the update zip; `--no-archive` stages folders only.
- `--no-node-modules` is dev/test only — it produces a non-runnable tree and
  must never be used for a real artifact.
- **Pass `--no-source-manifest` for any verification build.** Without it the run
  mirrors its manifest over the tracked `resources/cubric/update-manifest.json`,
  which for a Windows build is a ~32k-line diff of pure build output sitting in
  your working tree.
- A real (non-dry-run) build needs a release-notes approval token
  (`docs/releases/.approved-<version>.json`, written by
  `node scripts/release-notes-approval.mjs approve`). Those tokens are **tracked
  files** — CI reads the committed one. A dotfile does not show up in a plain
  `ls`, so check with `git status` before assuming one is yours to delete.
- **The token is a HASH of the notes, so ANY edit to `js/data/releaseNotes.js`
  stales it — including a peer's.** CI then fails the gate before doing any work,
  which reads as an unrelated build failure. Check before dispatching:
  `node scripts/release-notes-approval.mjs check`; re-approve with
  `approve --yes` (the old `printf 'y\n' |` pipe is blocked by the Bash
  classifier and reads as a hang). Verify the token's `hash` actually changed.
  Batch notes edits with the re-approval — each edit costs another cycle.

### Collecting CI artifacts

`D:\CubricStudio\Vision\Builds` is the canonical local home for finished build
distributions. CI runs in the cloud and cannot write there, so pull artifacts
down explicitly:

```sh
gh run download <run-id> -n cubric-vision-linux-x64 -D "D:\CubricStudio\Vision\Builds"
```

**`gh run download` REFUSES to overwrite** — it aborts with
`error extracting "<file>": ... The file exists.` and downloads nothing. Move the
previous set aside first (the `SUPERSEDED-<reason>/` convention already in that
folder), then download. Also pin the dispatch to a **SHA**, not `master`: `ref`
accepts one, and a peer pushing mid-build otherwise changes what you built. It
must be the **full 40-character** SHA — `actions/checkout` resolves a short one
as a branch or tag name and dies at the checkout step with `A branch or tag with
the name '20f1e743' could not be found`, ~40s in, which reads like the ref was
never pushed. `git rev-parse HEAD`, not the short hash `git log --oneline` shows.

Then verify the archive carries executable bits before trusting it (see next
section).

### Executable bits and symlinks

`build-portable.mjs` writes archives with a hand-rolled tar/zip writer, not a
system `tar`. Two consequences a builder must know:

- It does not preserve symlinks (`node_modules/.bin/*` shims are dropped), and
  it only sets the executable bit on entries `isExecutableEntry()` recognises
  (launcher scripts, `node_modules/electron/dist/electron`, the macOS Electron
  binary, `uv/uv`, and `node_modules/.bin/` entries).
- Because the `.bin/electron` shim does not survive archiving, the Linux/macOS
  launchers invoke the Electron binary directly
  (`node_modules/electron/dist/electron`) and `chmod +x` it at startup, falling
  back to the shim then `npm start` only if absent. Do not reintroduce a launch
  path that depends on the `.bin` shim surviving an archive.

Verify a Linux tarball before shipping:

```sh
tar -tvzf CubricVision-linux-x64-v<version>.tar.gz | grep 'electron/dist/electron$'
# expect -rwxr-xr-x, not -rw-r--r--
```

On Windows Git-Bash, GNU tar treats a `D:\…` path as a remote host and fails
with `Cannot connect to D: resolve failed` — add `--force-local` to any `tar`
command reading a build artifact off a drive letter.

## Release Channels

Cubric Vision uses one portable distribution model with one channel: a public
GitHub Release cut from master.

| Channel | Delivery | Source |
| --- | --- | --- |
| Public release | Full portable artifact **plus** matching update bundle | GitHub Releases |

Every release attaches both the full builds (fresh installs) and the update
bundles (in-place updates via the online `update.*` script — GitHub is the only
update source). A portable artifact contains readable app source, dependencies,
launch scripts, and resources; there is no code obfuscation or installer
licensing. The derived stage (`alpha`/`beta`/`release`, from `APP_VERSION`) is a
label on the same public artifact, not a separate distribution channel.

## Artifact Types

Every release should distinguish full artifacts from update artifacts.

### Full Portable Artifacts

Full portable artifacts are for new installs, clean validation, or users who
prefer replacing an entire app folder manually.

Expected public asset names:

| Platform | Artifact |
| --- | --- |
| Windows x64 | `CubricVision-windows-x64-v<version>.zip` |
| Linux x64 | `CubricVision-linux-x64-v<version>.tar.gz` |
| macOS arm64 | `CubricVision-macos-arm64-v<version>.zip` |

Do not use legacy `CubricStudio` artifact names for Vision releases. Release
copy may use the product name "Cubric Studio Vision", but release asset names
use `CubricVision`.

> **The Windows full zip carries NO inner root folder (MPI-387).** Linux
> (`.tar.gz`, which always has one) and macOS (`ditto --keepParent`) keep theirs;
> only `win32` passes `includeRoot: false` at `build-portable.mjs:1062`.
> Reason: the zip basename and the inner root were the same 31-char string, and
> Explorer's "Extract All" names its destination after the zip — so the name
> landed **twice** and cost 32 characters. A clean Windows 11 install measured
> **266 characters against the 260 MAX_PATH limit** and pip died writing
> `site-packages/diffusers/.../pipeline_stable_diffusion_attend_and_excite.py`.
> Extract All still produces exactly one folder from a rootless zip; only a shell
> "Extract Here" sprays, and the engine-install depth preflight
> (`installPathDepthError`, `routes/engine.js`) covers whatever the user does next.
> **Budget: the engine root must be ≤ 89 chars** (260 minus the measured 171-char
> deepest engine-relative file). Repacking the Windows zip with an inner root
> re-breaks a default Downloads extract.

### Update Bundles

Update bundles are for existing portable folders. They replace app-owned files
and preserve user-owned folders.

Expected public asset names:

| Platform | Artifact |
| --- | --- |
| Windows x64 | `CubricVision-windows-x64-update-v<version>.zip` |
| Linux x64 | `CubricVision-linux-x64-update-v<version>.zip` |
| macOS arm64 | `CubricVision-macos-arm64-update-v<version>.zip` |

Update bundles are simple changed-file bundles for the first portable updater.
Do not implement binary deltas for MPI-8.

> **The ARCHIVE name above is FROZEN. Do not rename it (MPI-369).** Every already-
> installed folder carries its own updater that matches this asset **by glob** —
> `update.bat` (`CubricVision-windows-x64-update-v*.zip`), `update.sh`
> (`^CubricVision-linux-x64-update-v.*\.zip$`), `update.command` (same shape) —
> and those scripts ship inside the user's copy, not the release. Renaming the
> asset makes every 1.0.1 / 1.1.0 / 1.2.0 install fail its next update with
> "No matching update asset found", including the in-app update prompt (MPI-334).
> If it must change, dual-upload the same bytes under both names for two or three
> releases first, then retire the old name once installs have rolled over.

> **The extracted ROOT FOLDER is `CubricVision-v<version>-update-only`** — and that
> IS free to change, because the applier walks down to find the manifest. It was
> `CubricVision-v<version>` through 1.2.0, which is visually indistinguishable from
> the full artifact: it holds `app/`, `resources/` and the launchers, but NOT the
> Electron runtime (the delta prunes it as unchanged). A user who unzipped it and
> ran `start.vbs` got `start-with-terminal.bat` falling through to `npm start`,
> which a normal machine does not have — it exits in milliseconds behind a hidden
> window, with no log, because nothing ever ran. Keep the version early in the
> name (MPI-62: Safari truncates long basenames and the version is what gets lost).

Baseline manifests for the delta diff live in `release-baselines/` — see that
folder's README for the per-release restamp step and the extraction recipe.

### Delta update details (MPI-56)

`scripts/build-portable.mjs --from-manifest <path>` emits a true delta bundle (only changed/added files). Diff is file-level SHA256 only — never binary delta (contract forbids it). A file is included iff its sha256 is absent or different vs baseline; paths gone from the new set go in `manifest.delete[]`. `delete[]` always excludes PRESERVE prefixes (engine/, models/, user-data/, Documents). `alwaysKeep` = update-manifest.json + connector-manifest.json + launchers. Omitting `--from-manifest` = FULL bundle (`fromVersion:null`, first-release safe).

## Portable Root Layout

**There are two layouts, and the split is deliberate.** Linux and macOS keep the
script-launched layout; Windows uses the standard Electron layout because Smart
App Control leaves it no choice (see below). `PLATFORM_CONFIG` in
`scripts/build-portable.mjs` is the single source of truth — `appDirRel` and
`electronRoot` per platform.

Linux / macOS:

```text
CubricVision-<platform>-<arch>-v<version>/
  app/                          <- app source + node_modules (incl. Electron)
  resources/
  engine/  models/  user-data/  update/  uv/
  start.<ext>  start-with-terminal.<ext>
  update.<ext>  update-from-zip.<ext>
```

Windows (MPI-387 fix D — **no inner root folder**, see the full-artifact note above):

```text
CubricVision.exe                <- renamed electron.exe; THE double-click target
*.dll *.pak *.bin locales/ …    <- Electron's dist, extracted to the root
resources/
  app/                          <- app source + node_modules (Electron dist pruned)
  cubric/  icons/  ffmpeg.exe  ffprobe.exe
engine/  models/  user-data/  update/
update.bat  update-from-zip.bat
README.txt
```

Electron resolves `<exeDir>/resources/app` **relative to the exe**, so this stays
portable — the folder can be extracted anywhere. `resources/` does not collide:
MPI owns `resources/cubric|icons|ffmpeg.exe`, Electron contributes
`resources/app` + `default_app.asar` (the build deletes the latter, since
`resources/app` shadows it). The staged app tree's own
`node_modules/electron/dist` is pruned: shipping the runtime twice wasted ~200MB
**and** left an unrenamed `electron.exe` in the folder — the exact
worst-reputation binary the relayout exists to remove.

Path budget is unaffected: the deepest app-relative path measures 107 chars, so
`resources/app/…` reaches 121 against the engine's binding 171.

### Launcher split details

| Platform | Start | Notes |
| --- | --- | --- |
| Windows | `CubricVision.exe` | **No start script exists.** |
| Linux | `start.sh` + `start-with-terminal.sh` | `start.sh` detaches via `setsid --fork nohup` |
| macOS | `start.command` | `.app`-style true-hide deferred |

App logs go to `<root>/user-data/logs/app.log` regardless of how the app is
started.

> **Windows has no start script because Smart App Control hard-blocks every
> scripting extension we could use (MPI-387 fix D, SHIPPED).**
> SAC is on by default after a clean Windows 11 install and blocks
> `.appref-ms .bat .cmd .chm .cpl .js .jse .msc .msp .reg .vbe .vbs .wsf` with **no
> per-file allowlist and no override in the dialog**. The old chain was three
> blocked hops before the exe: `start.vbs` → `start-with-terminal.bat` →
> `node_modules/.bin/electron.cmd` → an unrenamed `electron.exe`. An exe is
> reputation-*evaluated* (standard SmartScreen, with "More info → Run anyway");
> scripts are simply dead.
>
> - **Do not reintroduce a Windows start script**, not even as a convenience
>   alongside the exe. It is blocked on exactly the machines that need it.
> - **`.lnk` is REJECTED — do not re-propose it.** Verified empirically: a shortcut
>   stores an **absolute** target path, so it breaks the moment a portable folder is
>   moved or extracted anywhere but the build machine's path.
> - **Signing does not fix SAC.** EV no longer grants instant SmartScreen
>   reputation, OV is now equivalent, and SAC blocks signed binaries whose
>   reputation is unknown. Signing starts the reputation clock; it does not skip it.
> - `electron-builder.yml` in this repo is **dead config** — `electron-builder` is
>   not in devDependencies and nothing runs it.

### No launcher means no launcher environment

The start scripts were the only thing exporting `CUBRIC_ENGINE_ROOT`,
`CUBRIC_MODELS_ROOT`, `CUBRIC_USER_DATA_ROOT` and `MPI_RESOURCES_PATH`, so a
Windows launch now starts with **none** of them set. `main.js` derives all of
them from `resolveMainPortableRoot()` instead (`app.isPackaged` is true and
`process.resourcesPath` is real once the app lives at `resources/app`).

This is not optional politeness. `routes/shared.js` `getDefaultModelsRoot()`
falls back to `<engine>/mpi_models`, **not** `<root>/models`, and
`app.setPath('userData')` never fires without `CUBRIC_USER_DATA_ROOT` — so
skipping the derivation buries models inside the engine folder and writes
`user-data` (and therefore `logs/app.log`, the one artifact a bug report carries)
into `%APPDATA%`. Verified on a staged build: a bare `CubricVision.exe`
double-click resolves all four roots inside the portable folder.

### Retiring a path across the relayout

`applyDelta` scopes `delete[]` to the path roots the **new** bundle ships, which
is correct for a normal delta but structurally cannot express "this root is
gone". `RETIRED_PATHS` in `build-portable.mjs` force-includes such paths, and
win32 lists `start.vbs` + `start-with-terminal.bat` — without it an updated
install keeps a `start.vbs` that still does `pushd %ROOT%\app` and dies.

**`app/` is deliberately NOT retired.** The applier that runs a transition update
is the user's **old** one, executing `app/node_modules/electron/dist/electron.exe`
as node, and Windows cannot delete a running image — `rmSync` throws EBUSY and
aborts the whole update. The stale `app/` tree is left on disk and the release
notes tell the user it is safe to delete.

### Updater — no host tools assumed

The portable updater must assume NO host tools — `curl` is absent on minimal Linux. The only guaranteed runtime is the bundled Electron binary. All network work goes through `scripts/portable/fetch-release.cjs` (pure Node `https`, redirect-aware), run via `ELECTRON_RUN_AS_NODE=1 <bundled electron>`. Exec-bit self-heal has THREE layers: (1) `restoreExecBit` per-delta-file; (2) `restoreLauncherBits()` final manifest-independent sweep in `apply-update.cjs`; (3) `chmod +x` sweep in `update-from-zip.{sh,command}`. Bootstrap trap: a broken updater can't self-deliver its fix — permanent escape hatch = offline `update-from-zip.{sh,command}` on Linux/macOS, and a fresh full download on Windows.

Platform extensions:

| Platform | Start | GitHub update | Local update |
| --- | --- | --- | --- |
| Windows | `CubricVision.exe` | in-app, or `update.bat` | `update-from-zip.bat` |
| Linux | `start.sh` | `update.sh` | `update-from-zip.sh` |
| macOS | `start.command` | `update.command` | `update-from-zip.command` |

> **Windows update orchestration lives in `scripts/portable/win-update.cjs`, not
> in the `.bat`.** SAC blocks the `.bat` on the machines that most need updating,
> so `run-update` in `main.js` spawns `process.execPath` (i.e. `CubricVision.exe`)
> with `ELECTRON_RUN_AS_NODE=1` on that file directly — no blocked hop anywhere in
> the chain. `update.bat` is a second entry point onto the same file, kept for
> non-SAC machines. There is one implementation.
>
> **The applier must survive its own binary being updated.** On Windows the
> updater runs *through* `CubricVision.exe`, and Windows refuses to overwrite or
> delete a running image — but it does allow **renaming** one. `apply-update.cjs`
> catches `EBUSY`/`EPERM`/`EACCES`, renames the live file to `<file>.old`, and
> writes the replacement in its place; the leftover is swept on the next update.
> Without this an Electron bump aborts the whole update.
>
> `apply-update.cjs` resolves `extract-zip` from **both** `resources/app` and
> `app` — those are two live layouts, not a migration shim. Losing either breaks
> the *second* update on that platform, not the first, so it passes a naive smoke
> test.

The `update/` directory may hold helper scripts, manifests, temporary
extraction folders, and rollback data. Users should run the root update script;
they should not manually copy files between folders.

### In-app update prompt (MPI-334, MPI-629)

On startup, **portable builds** check GitHub for a newer release and offer a
one-click update — the in-app trigger for the `update.*` scripts above. Main
`check-for-update` (main.js) gates on `resolveMainPortableRoot()` (empty in dev →
skipped), fetches `releases/latest`, and returns `{portable, current, latest}`
(current = `package.json` version). The renderer (`js/services/updateChecker.js`,
called from `js/init.js`) runs `compareSemVer`; if newer it shows an `MpiOkCancel`.
**OK** → `runUpdate()` → `run-update` (main.js) spawns the platform `update.*`
script detached + `app.quit()`. Dev escape hatch: localStorage
`mpi_dev_force_update=<version>` drives both surfaces in a non-portable build.
Note: the prompt only fires once a GitHub release exists to compare against.

**There are TWO routes, and the mute silences only one (MPI-629).** The popup
carries a **"Don't ask again"** checkbox and offers on EVERY boot until it is
ticked; ticking it writes `{version, muted:true}` to localStorage
`UPDATE_DISMISSED`, which stops the popup for that version alone. Settings then
carries an **Update section as its first section, rendered only while an update
is due** — `getPendingUpdate()` answers from the boot check and answers
regardless of the mute, so a muted user still has a route to the update and a
user who simply wants one can ask. Both surfaces call the same `runUpdate()`,
which reports a failure (no IPC, or a `run-update` error) through `showError`
rather than no-op'ing silently.

> Before MPI-629 `UPDATE_DISMISSED` held `{version, count}` and the popup muted
> itself after 3 declines. That was correct for a nag and a dead end for
> everything else: the popup was the ONLY route, so three Laters left the user
> with no way back to that update short of clearing localStorage, and no way to
> ask for one. A pre-MPI-629 record has no `muted` key and therefore reads as
> not muted — an upgrading user is offered the update once more, then chooses.

> **`stdio: 'ignore'` means the updater can never capture a child's stdout
> through a shell redirect.** Proven live 2026-08-01 (MPI-387). `run-update`
> spawns detached with `stdio: 'ignore'`, so the child's STDOUT handle is the NUL
> device. The pre-1.3.0 Windows `update.bat` fetched the asset with a PowerShell
> one-liner and captured the downloaded path via `> latest-update-path.txt`, then
> `set /p`. Under that spawn the redirect file is **created and stays 0 bytes** —
> `Write-Output` lands in NUL — so `update-from-zip.bat` was called with an empty
> argument, printed its usage, exited 2, and the console closed with nothing
> applied and no relaunch. The 451 MB download completed perfectly first, which is
> what makes it read as "the update worked and then did nothing".
>
> **Size is irrelevant and so is the console:** reproduced identically with a
> 6 KB download under the same spawn, and the *same* PowerShell command run from
> a normal `cmd /c` console captured 170 bytes and exited 0. Double-clicking
> `update.bat` yourself has always worked; only the in-app button was broken.
>
> `win-update.cjs` is immune by construction — it runs helpers with
> `spawnSync(..., stdio: ['ignore', 'pipe', 'inherit'])` and reads
> `result.stdout` in-process, so it never depends on the parent's stdout handle,
> and it hard-fails on `!bundle || !fs.existsSync(bundle)` instead of continuing
> with an empty path. **Never re-introduce a shell-redirect capture into an
> updater.**
>
> **Consequence for the fleet:** every pre-1.3.0 Windows install that CAN launch
> (Windows 10, or Windows 11 with SAC off) has a broken in-app update button.
> They cannot be reached by shipping code — the batch is already on their disk.
> Their only route to 1.3.0 is a full download, which is why the Windows update
> bundle was pulled from the v1.3.0 release on 2026-08-01 and Windows deltas
> resume at 1.4.0. macOS and Linux use `curl`-based updaters on a different code
> path and kept their bundles.

#### The updater logs and relaunches (MPI-422)

Because `run-update` spawns detached with `stdio: 'ignore'`, the updater has no
console on ANY platform — every diagnostic went to NUL, and nothing ever
relaunched the app despite the prompt promising *"the app will close, update, and
reopen"*. Both are fixed; the contract each updater now honours:

- **Log.** `win-update.cjs` tees everything (its own lines PLUS both helpers'
  stdout and stderr) to `<root>/update/update.log`, truncated per run. The shell
  updaters `exec >>"$LOG" 2>&1` only when stdout is not a tty, so a
  double-clicked run keeps its live terminal output and its exit status (never
  pipe to `tee` — the status becomes `tee`'s).
- **Relaunch on BOTH outcomes.** Success or failure, the app comes back. Windows
  targets `<root>/CubricVision.exe` — by construction the freshly written image,
  whatever `evictBusyFile` did — and strips `ELECTRON_RUN_AS_NODE` or the app
  boots as node and exits. Linux calls `start.sh` **unbackgrounded** (it
  double-forks itself out of the process group); macOS uses `nohup … &` because
  `start.command` runs Electron in the foreground.

  > `process.execPath` would in fact also have worked, contrary to what MPI-422's
  > brief assumed. Measured 2026-08-03: with the running image renamed aside
  > mid-flight, a live electron-as-node process still reported
  > `D:\…\CubricVision.exe` — Node captures execPath once at bootstrap and never
  > re-queries, so it keeps naming the original path, which eviction leaves
  > holding the NEW binary. The root path is preferred for being explicit rather
  > than dependent on that timing. Do not "fix" the relaunch back to execPath on
  > the strength of this note — there is no reason to.
- **A failure reaches the user.** The updater writes
  `<root>/update/update-result.json` (`{ok:false, error, at}`) carrying the last
  helper *stderr* line, not the useless `"<script> exited with code 1"`. Main's
  `update-last-result` IPC reads-and-deletes it on the next boot and
  `updateChecker.js` raises `showError`; that boot skips the update POPUP so the
  user gets one message, not two stacked dialogs. The update stays "due", so the
  Settings section still offers the retry (MPI-629) — the suppression is of the
  second dialog, never of the route.

**Testing the updater without cutting a release.** Both halves that look like they
need a newer GitHub release do not — neither needs an upload (proved 2026-08-03):

- *A genuinely newer release.* `check-for-update` reads
  `require('./package.json').version`, so editing a test install's
  `resources/app/package.json` (plus `appVersion.js` for the header) back one
  version makes the CURRENT live release genuinely newer. Everything downstream
  is then real — semver compare, prompt, click, fetch, apply, relaunch.
- *A bundle with arbitrary contents, e.g. to hit `evictBusyFile`.*
  `apply-update.cjs` accepts an already-extracted DIRECTORY as `--bundle` (the
  MPI-62 Safari path), so a folder holding the files you want plus
  `resources/cubric/update-manifest.json` naming them is a complete bundle — no
  zip, no upload. `files[]` entries only need `path`; size/sha are not verified on
  apply. Put `CubricVision.exe` in it and run through `CubricVision.exe` as node
  and the target is genuinely busy.
- *A failure path.* `CUBRIC_GITHUB_REPO=<owner>/<nonexistent>` makes
  `fetch-release.cjs` fail for real.

Restore the install afterwards and hash-check it against the shipped files.

> **A fix to the updater only helps the release AFTER next.** The updater that
> runs is the one already on disk, so 1.3.1 → 1.4.0 still executes 1.3.1's silent,
> non-relaunching `win-update.cjs`. These fixes first take effect 1.4.0 → 1.5.0.
> Same structural reason the pre-1.3.0 batch could not be repaired by shipping
> code. **1.4.0's release notes must tell users to reopen the app manually after
> updating.**

## Portable Environment

Launchers must set portable environment variables before starting Electron or
the server.

| Variable | Value |
| --- | --- |
| `CUBRIC_PORTABLE_ROOT` | Portable artifact root |
| `CUBRIC_ENGINE_ROOT` | `<portable-root>/engine` |
| `CUBRIC_MODELS_ROOT` | `<portable-root>/models` |
| `CUBRIC_USER_DATA_ROOT` | `<portable-root>/user-data` |
| `MPI_RESOURCES_PATH` | `<portable-root>/resources` |
| `CUBRIC_UV_BIN` | `<portable-root>/uv` on Linux/macOS when uv is staged |

Prompt-intelligence runtime paths are out of scope for v1. Do not add
`llama_engine` or `llama_models` to the required portable layout unless a later
release explicitly changes this scope.

## Host Dependencies (Linux / macOS engine install)

The Windows engine install downloads a prebuilt ComfyUI archive and has no host
dependency beyond the bundled runtime. The Linux/macOS engine install instead
bootstraps ComfyUI with `uv` + `comfy-cli`, and `comfy-cli` clones ComfyUI and
custom nodes through GitPython, which **requires a real `git` binary**.

The app does not assume git is present. `routes/gitProvision.js` runs before the
uv venv is created and:

1. Uses host `git` if found (PATH or common locations).
2. Otherwise installs it via the host package manager — Linux elevates with
   `pkexec` (a graphical password dialog that works even on a no-terminal
   launch), falling back to `sudo` only when a TTY is attached; macOS uses
   Homebrew (no sudo) or points the user at `xcode-select --install`.
3. If neither works (offline, no package manager, no graphical elevation), the
   install fails with an actionable message naming the exact manual command,
   surfaced on the install screen — never a cryptic GitPython dump.

The resolved git path is passed to `comfy install` as
`GIT_PYTHON_GIT_EXECUTABLE` (with `GIT_PYTHON_REFRESH=quiet`) so GitPython uses
it without depending on PATH. Git is **not** bundled into the artifact; the
install-or-use model above is intentional. `uv` is still bundled at
`<root>/uv/uv` as before.

## Update Sources

The updater has two sources and one preservation model.

| Source | Script | Use |
| --- | --- | --- |
| GitHub Release | `update.*` | Users update from the latest compatible release manifest |
| Local zip | `update-from-zip.*` | Offline or manually downloaded update bundle |

Both scripts must apply the same manifest rules. The only difference is where
the update bundle comes from.

The first updater is manual. The app can link users to releases or future
update instructions, but MPI-8 does not add silent background patching,
`electron-updater`, or a hub-managed updater.

## Preservation Rules

Update scripts must preserve user-owned data and replace only app-owned files.

Always preserve:

- `engine/`
- `models/`
- `user-data/`
- Local project folders under the user's Documents directory
- User-created media and history files
- User-edited local config files explicitly marked as preserved by the update
  manifest

Replace from update bundles:

- The app tree — `app/` on Linux/macOS, `resources/app/` on Windows
- `resources/`
- The Electron runtime — under the app tree on Linux/macOS, at the portable root
  (`CubricVision.exe` + dlls + `locales/`) on Windows
- Root launcher scripts
- Root update scripts
- Connector manifest files
- Update manifest files
- App-owned release metadata

Do not ask users to manually merge folders. If an update cannot apply cleanly,
the script must fail with a clear message and leave either the previous app
working or a rollback folder available.

## Manifest Contract

Each staged full artifact and each update bundle must include
`resources/cubric/update-manifest.json`.

Required fields:

```json
{
  "schemaVersion": 1,
  "appId": "cubric.vision",
  "displayName": "Cubric Studio Vision",
  "platform": "win32",
  "arch": "x64",
  "fromVersion": null,
  "toVersion": "0.0.1",
  "protocolVersion": "0.1.0",
  "connectorManifestPath": "resources/cubric/connector-manifest.json",
  "connectorManifestHash": "<sha256>",
  "files": [],
  "preserve": [],
  "delete": [],
  "createdAt": "2026-06-06T00:00:00Z"
}
```

`connectorManifestHash` must be computed from the staged connector manifest,
not from an assumed source-tree path.

## Connector Manifest

Vision is a **live connector responder** (MPI-5) — it was manifest-only through MPI-8, and that
is history, not the current contract. `@cubric/connector` is a `file:` dependency on
`../Cubric-Studio/packages/connector` (`package.json`), loaded via dynamic `import()` in
`services/brokerBoot.js` + `services/connectorResponder.js`, and Vision answers
`system.memory.release` by freeing VRAM through its own `/comfy/unload` route. Everything is
best-effort: no broker, no responder, Vision still runs standalone.

**The ownership boundary has not moved.** The Cubric Studio hub owns the contract and the
runtime — `@cubric/connector` and `@cubric/broker` — and product apps consume them. Never move
SDK or broker source into this repo (the hub's `README.md` states the same boundary from the
other side).

Every staged artifact must include:

```text
resources/cubric/connector-manifest.json
```

Smoke assertions (`assertConnectorManifest` in `scripts/build-portable.mjs`):

- `appId` is `cubric.vision`.
- `protocolVersion` is `0.1.0`.
- `capabilities` includes `system.memory.release` — this **replaced** the old
  `metadata.manifestOnly === true` assertion, which would now fail (the shipped manifest says
  `manifestOnly: false`).

The `file:` dependency on a sibling repo is why `assertNoDanglingSymlinks(appRoot)` sweeps the
WHOLE staged app tree (MPI-416): npm leaves a symlink for it, `copyAppTree`/`ditto` faithfully
recreate it, and a shipped macOS .zip once carried a link pointing at `../../../Cubric-Studio/…`
on every user's disk. Nothing crashed — all consumers dynamic-import in try/catch — but our own
documented `xattr -dr com.apple.quarantine` first-run command printed "No such file" for every
Mac user. A dangling link in an artifact throws the build; do not downgrade it to a warning.

## Platform Disclosure

Release copy must describe validation truthfully.

| Platform | Release language |
| --- | --- |
| Windows | Locally tested on the maintainer Windows development machine. Not yet validated on a separate clean Windows host unless a later validation note says otherwise. |
| Linux | Artifact can be install/launch tested on the maintainer's Ubuntu laptop. Generation support is unvalidated unless a stronger Linux host or contributor validates it. |
| macOS | Artifact is produced mechanically but maintainer-untested until community or maintainer Mac validation is recorded. |

Do not claim a platform is supported because the artifact builds. Record the
exact host, artifact name, architecture, launch result, engine setup result,
and generation result before strengthening platform language.

## Validation Gate

Before a platform artifact is published as validated for that platform, record:

- Artifact name and version.
- OS version and CPU architecture.
- GPU and driver stack when generation is tested.
- Clean extract location outside the repository.
- Launcher result.
- Resolved portable root, engine root, models root, user-data root, and
  resources path.
- Engine install or repair result.
- On Linux/macOS: whether host git was used or auto-installed (and via which
  package manager / pkexec / brew), or the manual fallback shown.
- Model Manager discoverability.
- Zero-model gate/read-only behavior.
- Installed model detection after refresh or restart.
- One image generation result when hardware allows.
- Folder-open behavior.
- Video extraction or crop behavior.
- Error-report labels, including stage/version/build hash when implemented.
- Update-from-zip result on a copied portable folder when update bundles exist.

macOS contributor validation should also record Gatekeeper behavior and whether
the artifact was launched through Finder, Terminal, or both.

## Non-Goals

MPI-8 does not implement:

- NSIS, DMG, AppImage, Flatpak, Snap, `.deb`, or `.rpm` installers.
- Git-based user updates.
- Manual merge instructions for users.
- Silent background updates.
- Runtime connector integration.
- LLM or llama packaging for Vision v1.
- Claims that macOS is maintainer-tested before it is.
