# GitHub Release Checklist

Use this checklist when drafting a GitHub Release or early-access release note
for Cubric Studio Vision portable artifacts. Keep the release body aligned with
`portable-distribution-contract.md`.

## Required Asset Names

Full portable artifacts:

- `CubricVision-windows-x64-v<version>.zip`
- `CubricVision-linux-x64-v<version>.tar.gz`
- `CubricVision-macos-arm64-v<version>.zip`
- `CubricVision-macos-x64-v<version>.zip`

Update bundles, when available:

- `CubricVision-windows-x64-update-v<version>.zip`
- `CubricVision-linux-x64-update-v<version>.zip`
- `CubricVision-macos-arm64-update-v<version>.zip`
- `CubricVision-macos-x64-update-v<version>.zip`

Do not publish Vision assets with legacy `CubricStudio` artifact names.

## Platform Disclosure

Include this disclosure, adjusted only when validation evidence has been
recorded for the exact artifact being published:

- Windows: tested locally on the maintainer Windows development machine. Not
  yet validated on a separate clean Windows host unless a later validation note
  says otherwise.
- Linux: install and launch validation only on the maintainer's weak Ubuntu
  laptop. Generation support is unvalidated unless a stronger Linux host or a
  contributor validates it.
- macOS: artifacts are produced mechanically but are maintainer-untested.
  Community validation is needed before stronger macOS support language is used.

Do not claim a platform is supported because an artifact was built. Record the
artifact name, OS version, CPU architecture, GPU and driver stack when relevant,
clean extract location, launch result, engine setup result, generation result
when hardware allows, and app log tail before strengthening release language.

## Scope Guard

Release copy should describe Cubric Studio Vision as a local image and video
generation app. Do not add claims about bundled language-model, assistant, or
prompt-intelligence features; those are outside Vision release scope.

## Contributor Validation Request

Ask contributors to include these fields when reporting a validation result:

- Platform and OS version
- CPU architecture
- GPU and driver stack
- Artifact name and version
- Clean install or update path tested
- Launcher result
- Engine setup or repair result
- Whether generation was tested
- App log tail from the failed or validated run

For macOS reports, also ask for Gatekeeper behavior and whether the app was
launched through Finder, Terminal, or both.
