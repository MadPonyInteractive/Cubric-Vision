# Portable Distribution Contract

This document defines the Cubric Vision portable release contract used by
MPI-8. It is a reference for build scripts, update scripts, release notes, and
manual validation. The historical planning detail remains in
`docs/plans/2026-04-30-cross-platform-portable-distribution.md`; this document
is the current release contract for implementation.

## Release Channels

Cubric Vision uses one portable distribution model across early-access and
public releases.

| Channel | Delivery | Source |
| --- | --- | --- |
| Early alpha | Full portable artifact plus optional local update bundle | Direct zip delivery through private community channels |
| Early beta | Full portable artifact plus optional local update bundle | Direct zip delivery through private community channels |
| Public release | Full portable artifact plus matching update bundle when available | GitHub Releases |

Early-access artifacts are not technically restricted. A portable artifact
contains readable app source, dependencies, launch scripts, and resources. The
early-access gate is distribution timing and community trust, not code
obfuscation or installer licensing.

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
| macOS x64 | `CubricVision-macos-x64-v<version>.zip` |

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
| macOS x64 | `CubricVision-macos-x64-update-v<version>.zip` |

Update bundles are simple changed-file bundles for the first portable updater.
Do not implement binary deltas for MPI-8.

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

Platform extensions:

| Platform | Start | GitHub update | Local update |
| --- | --- | --- | --- |
| Windows | `start.bat` | `update.bat` | `update-from-zip.bat` |
| Linux | `start.sh` | `update.sh` | `update-from-zip.sh` |
| macOS | `start.command` | `update.command` | `update-from-zip.command` |

The `update/` directory may hold helper scripts, manifests, temporary
extraction folders, and rollback data. Users should run the root update script;
they should not manually copy files between folders.

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

## Update Sources

The updater has two sources and one preservation model.

| Source | Script | Use |
| --- | --- | --- |
| GitHub Release | `update.*` | Public users update from the latest compatible release manifest |
| Local zip | `update-from-zip.*` | Early-access, offline, or manually downloaded update bundle |

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
