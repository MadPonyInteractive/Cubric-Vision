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
private GitHub Actions artifact named `cubric-vision-<platform>-<arch>` (14-day
retention). Public source-repo workflows must not upload early-access portable
artifacts. CI does **not** publish a GitHub Release and cannot write to a local
disk - see "Collecting CI artifacts" below.

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

### Collecting CI artifacts

`D:\CubricStudio\Vision\Builds` is the canonical local home for finished build
distributions. CI runs in the cloud and cannot write there, so pull artifacts
down explicitly:

```sh
gh run download <run-id> -n cubric-vision-linux-x64 -D "D:\CubricStudio\Vision\Builds"
```

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

### Delta update details (MPI-56)

`scripts/build-portable.mjs --from-manifest <path>` emits a true delta bundle (only changed/added files). Diff is file-level SHA256 only — never binary delta (contract forbids it). A file is included iff its sha256 is absent or different vs baseline; paths gone from the new set go in `manifest.delete[]`. `delete[]` always excludes PRESERVE prefixes (engine/, models/, user-data/, Documents). `alwaysKeep` = update-manifest.json + connector-manifest.json + launchers. Omitting `--from-manifest` = FULL bundle (`fromVersion:null`, first-release safe).

## Portable Root Layout

Build scripts should stage each full artifact with this root shape:

```text
CubricVision-<platform>-<arch>-v<version>/
  app/
  resources/
  engine/
  models/
  user-data/
  update/
  start.<platform-extension>
  update.<platform-extension>
  update-from-zip.<platform-extension>
```

### Launcher split details

Two launchers per desktop platform: Windows — `start.vbs` (default, hidden console) + `start-with-terminal.bat`; Linux — `start.sh` (detached via `setsid --fork nohup`) + `start-with-terminal.sh`; macOS — `start.command` only (`.app`-style true-hide deferred). Windows `.bat` always shows a console — VBS is the only true zero-flash path. App logs go to `logs/app.log` regardless of which launcher is used.

### Updater — no host tools assumed

The portable updater must assume NO host tools — `curl` is absent on minimal Linux. The only guaranteed runtime is the bundled Electron binary. All network work goes through `scripts/portable/fetch-release.cjs` (pure Node `https`, redirect-aware), run via `ELECTRON_RUN_AS_NODE=1 <bundled electron>`. Exec-bit self-heal has THREE layers: (1) `restoreExecBit` per-delta-file; (2) `restoreLauncherBits()` final manifest-independent sweep in `apply-update.cjs`; (3) `chmod +x` sweep in `update-from-zip.{sh,command}`. Bootstrap trap: a broken updater can't self-deliver its fix — permanent escape hatch = offline `update-from-zip.{sh,command}`.

Platform extensions:

| Platform | Start | GitHub update | Local update |
| --- | --- | --- | --- |
| Windows | `start.bat` | `update.bat` | `update-from-zip.bat` |
| Linux | `start.sh` | `update.sh` | `update-from-zip.sh` |
| macOS | `start.command` | `update.command` | `update-from-zip.command` |

The `update/` directory may hold helper scripts, manifests, temporary
extraction folders, and rollback data. Users should run the root update script;
they should not manually copy files between folders.

### In-app update prompt (MPI-334)

On startup, **portable builds** check GitHub for a newer release and offer a
one-click update — the in-app trigger for the `update.*` scripts above. Main
`check-for-update` (main.js) gates on `resolveMainPortableRoot()` (empty in dev →
skipped), fetches `releases/latest`, and returns `{portable, current, latest}`
(current = `package.json` version). The renderer (`js/services/updateChecker.js`,
called from `js/init.js`) runs `compareSemVer`; if newer it shows an `MpiOkCancel`.
**OK** → `run-update` (main.js) spawns the platform `update.*` script detached +
`app.quit()`. **Cancel** is counted per version (localStorage `UPDATE_DISMISSED`);
after 3 declines that version is muted until a newer one lands. Dev escape hatch:
localStorage `mpi_dev_force_update=<version>` forces the dialog in a non-portable
build. Note: the prompt only fires once a GitHub release exists to compare against.

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

- `app/`
- `resources/`
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

Vision remains manifest-only for v1.

Every staged artifact must include:

```text
resources/cubric/connector-manifest.json
```

Smoke assertions:

- `appId` is `cubric.vision`.
- `protocolVersion` is `0.1.0`.
- `metadata.manifestOnly` is `true`.

Do not add a runtime import of `@cubric/connector`, broker startup, PromptBox
connector actions, permission/trust UI, or disabled promotional connector
controls as part of MPI-8.

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
