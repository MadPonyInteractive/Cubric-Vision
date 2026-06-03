# Changelog Overlay

## Current State

- Project mode: scalable-foundation.
- MPI-46 is in `todo` as an idea: "Add a changelog overlay on startup for version bumps/updates. Use existing components, possibly MPI overlay."
- Version source of truth is `js/core/appVersion.js` (`APP_VERSION`, `SCHEMA_VERSION`) and `dev_configs/system_dependencies.json` (`COMFY_VERSION`), documented in `docs/versioning.md`.
- Release-note markdown currently lives under `docs/releases/`, with `docs/releases/README.md` stating that `/mpi-version-bump` generates one file per release. There is no runtime-readable release-note manifest yet.
- Startup flow is in `js/shell.js`: `initShell()` mounts global singleton dialogs, navigates to Landing, gates on `/engine/version-check` and `/engine/deps-status`, restores dev state, wires Comfy/model events, then optionally auto-starts ComfyUI.
- Blocking overlay primitives already exist. New blocking UI should be a component using `ComponentFactory.create()`, `MpiModal`, existing primitives, BEM, registered CSS in `js/shell/preloadStyles.js`, and props documented in `js/components/types.js`.
- Storage keys are centralized in `js/core/storageKeys.js`; typed helpers live in `js/core/storage.js`. A changelog seen marker must not use raw localStorage key strings.
- MPI-8 distribution direction matters: portable releases publish full artifacts and later update bundles/scripts, not `electron-updater` or silent patching. The changelog overlay should describe the already-running app version after a bump/update; it must not become an updater or claim update-bundle support before MPI-8 lands.
- No sub-agents were spawned during planning because this session's delegation policy requires the user to explicitly request sub-agent work.

## Completed

- [ ] Nothing yet.

## Remaining Work

## Phase 1: Runtime Release-Note Contract

- [ ] Add a runtime-readable release-note data source keyed by app version, preferably `js/data/releaseNotes.js`, exporting a small current-release structure for `APP_VERSION` plus a fallback for missing notes. Keep markdown release files as archival/user-facing docs; do not parse markdown in the browser or rely on directory listing. **Verify:** importing the module in a browser/dev-server context returns the notes for `APP_VERSION` and a deterministic empty/fallback state for an unknown version.
- [ ] Update the release/versioning contract so future version bumps keep the runtime data source and markdown release notes aligned. Ownership: `docs/versioning.md`, `docs/releases/README.md`, and, if the version-bump skill exists in this repo, its instructions. **Verify:** docs clearly state that release-note markdown remains archival while the changelog overlay consumes the runtime module/manifest; no instruction says to hand-edit `operation_registry.json`.

## Phase 2: Changelog Modal Component

- [ ] Create a compound component such as `js/components/Compounds/MpiChangelogDialog/MpiChangelogDialog.js` and `.css`. Use `ComponentFactory.create()`, `MpiModal`, `MpiButton`, and existing icon primitives; add no raw SVG and no hardcoded colors. Suggested API: `open({ version, stage, notes })`, `show()`, `hide()`, and emits `dismiss` when the user closes it. **Verify:** component can be mounted standalone, opens as a blocking modal, Escape/backdrop/Done close paths cleanly release `Overlays`, and repeated `show()` calls are idempotent.
- [ ] Register component CSS in `js/shell/preloadStyles.js` and document props/methods/emits in `js/components/types.js`. Ask whether the component should be added to the component gallery before finishing implementation, per component rules. **Verify:** `rg "MpiChangelogDialog"` finds the implementation, preload registration, and type docs.

## Phase 3: Startup Display Logic

- [ ] Add a centralized seen-version storage key and helpers, e.g. `STORAGE_KEYS.LAST_SEEN_CHANGELOG_VERSION`, `Storage.getLastSeenChangelogVersion()`, and `Storage.setLastSeenChangelogVersion(version)`. Mark the current `APP_VERSION` as seen only when the changelog is dismissed/closed, not before it is visible. **Verify:** clearing the key causes the overlay to show again for the current version; dismissing stores exactly the current `APP_VERSION`.
- [ ] Wire a singleton changelog dialog in `js/shell.js`. Show it after engine install/upgrade/deps gates and dev-state restore, but before optional Comfy auto-start is triggered, so it never competes with mandatory engine provisioning. Skip when the seen version equals `APP_VERSION` or when no release-note payload exists. **Verify:** first launch after a simulated version bump shows the changelog once; second launch does not; engine install/upgrade modal still wins when `versionData.needsInstall` or `needsUpgrade` is true.
- [ ] Keep startup behavior update-aware but not updater-like. Do not add network checks, GitHub release polling, portable update scripts, or `electron-updater`; those remain MPI-8/portable-distribution scope. **Verify:** `rg "electron-updater|github.com/.*/releases|update bundle|update-script"` in runtime JS shows no new updater behavior from this task.

## Parallel Batch: Independent Polish And Tests

- [ ] Add focused storage/release-note unit coverage or smoke checks if the current test setup supports browser-importable modules. Ownership: storage helpers and release-note data module only. Briefings: versioning, utilities/storage. **Verify:** test/import proves the seen-version comparison and fallback note behavior.
- [ ] Add a browser or desktop smoke for startup display gating if the existing Playwright setup can run it without brittle engine downloads. Ownership: tests only, with app code read-only except test hooks if already established. Briefings: components, shell, desktop testing. **Verify:** test seeds localStorage to an older version, loads the app, observes the changelog, dismisses it, reloads, and confirms it stays hidden.

## Phase 4: Final Verification

- [ ] Run lint/build checks appropriate for touched files, likely `npm run lint` or a narrower component lint if available, and `npm run build` if the project uses it for syntax/bundle validation. **Verify:** commands pass or failures are documented as unrelated/blocking.
- [ ] Manually smoke the startup flow in browser or Electron: clear the changelog storage key, start the app, confirm the changelog appears after engine checks, dismiss it, reload, and confirm it does not return until `APP_VERSION` or storage changes. **Verify:** no overlay remains registered after close, Escape still closes the top modal, and auto-start Comfy behavior remains unchanged when enabled.

## Plan Drift

- None yet.

## Verification

The task is complete when the app has a changelog modal that appears once per `APP_VERSION` after successful startup gating, consumes a version-bump-maintained runtime release-note source, persists dismissal via centralized storage helpers, and does not introduce updater behavior outside MPI-8's portable distribution plan.

## Preservation Notes

- If code changes introduce component wiring or startup behavior that should become architecture policy, ask the user before updating `.claude/rules/`.
- If a new component is added, ask whether it should be added to `js/pages/components.js` before finishing.
- Preserve MPI-8's update model: full portable artifacts first; manual update bundles/scripts later; no silent auto-update flow from this changelog work.
- If implementation modifies the version-bump workflow, keep `docs/versioning.md`, `docs/releases/README.md`, and the workflow instructions in sync.
