# Model Cross-Restart Download Resume Safety

## Current State

Project mode: scalable-foundation.

Model dependency downloads are managed by `routes/downloadManager.js` with `node-downloader-helper` 2.1.11. In-session pause/resume works through the same `ResumableDownloader` instance and `resumeFromFile()`, but app restart clears the in-memory job maps. NDH writes directly to the final filename, so a process killed mid-download can leave a truncated model at the canonical path.

The unsafe installed-state checks are confirmed in current code:

- `routes/downloadManager.js` uses bare `fs.pathExists(installedCheckPath)` when starting model downloads and universal workflow dependency installs.
- `routes/comfy.js` uses bare `fs.pathExists(depPath)` in `POST /comfy/models/check`.
- No `.cubricdl` sidecar, central completion helper, fresh-instance disk resume path, or close-app active-download warning exists yet.

`js/data/modelConstants/dependencies.js` is the dependency registry that carries optional `sha256` values. Several large Hugging Face model deps still have `sha256: null`; `scripts/computeDepHashes.py` exists to stream-compute and write hashes for Hugging Face deps that lack one. `custom_nodes` GitHub branch archives should remain hashless because those zips are regenerated.

The existing NDH constructor must not be changed to `resumeIfFileExists` or `override`; that path was verified to break early pause behavior.

## Implementation

- [ ] Implement model download completion tracking and cross-restart resume end to end. Add a sidecar marker such as `<file>.cubricdl` when a managed file download starts and remove it only after verified completion; add a central completion helper so all model/dependency installed checks require `exists && no sidecar`; update model download start, universal workflow dependency install checks, and `/comfy/models/check` to use the helper; build missing Hugging Face `sha256` values in `dependencies.js` so completed model files can be verified wherever stable hashes are available; add fresh-instance resume logic that detects an existing partial plus sidecar and calls `resumeFromFile()` explicitly instead of relying on NDH constructor options; harden pause with deferred abort if needed; add an active-download status endpoint and Electron close warning that distinguishes resumable model downloads from engine downloads that restart from scratch. **Verify:** focused automated coverage for the helper and resume decision paths, plus real desktop validation: start a large model download, quit mid-download, relaunch, confirm the model is not marked installed, resume continues from existing bytes, in-session pause still works after resume, a verified complete file clears the sidecar, and files with registry hashes fail safely on mismatch.

## Completed

- [ ] Nothing yet.

## Remaining Work

- Implement the planned change end to end.

## Plan Drift

- None yet.

## Verification

Run targeted Node/module tests or smoke checks for the completion helper and download-start decision path. Run `python scripts/computeDepHashes.py --dry-run` first when network is available, then write hashes intentionally for stable Hugging Face deps. Then run real Electron desktop validation with an interrupted model download: quit mid-download, relaunch, confirm installed checks reject the partial, resume continues from the partial, pause/resume still works, and completion removes the sidecar. Also verify engine-download quit messaging remains honest: engine downloads restart from scratch by design.

## Preservation Notes

- Update `docs/comfy.md` and `.claude/rules/downloads.md` if implementation changes the download-manager contract from `.part` assumptions to `.cubricdl` completion markers.
- Preserve the `project_ndh_resumable_downloads` memory fact that `resumeIfFileExists` breaks pause; update it after validation if the implemented sidecar/resume behavior is proven.
