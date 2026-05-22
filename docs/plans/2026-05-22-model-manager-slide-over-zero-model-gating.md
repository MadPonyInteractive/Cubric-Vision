# Model Manager Slide-Over and Zero-Model Gating

## Current State

Model management is currently owned by `MpiModelsModal`, mounted once in
`js/shell.js` as a shell-level singleton. It opens on `models:open`, auto-opens
when Gallery sees zero installed models, and emits `models:closed` so Gallery can
mount PromptBox after the first model install.

The current model manager is a blocking overlay, not a right-edge slide-over. Its
content logic and overlay chrome are coupled in
`js/components/Blocks/MpiModelsModal/MpiModelsModal.js`: it renders installed and
available model cards, owns refresh/install/uninstall, subscribes to download
events, and patches model cards in place.

The project page already exposes `Settings`, `Help`, and `About` through
`MpiSlideOver`. The rules describe these as content components mounted into
slide-over chrome via `Events.emit('slide-over:open', { title, component })`.

PromptBox currently exposes two nearby concepts in the same settings popup:
model settings for the active model and the global model manager/download
button. This causes mistaken clicks and puts global model management in a place
users do not naturally look for it.

Zero-model support currently forces Gallery and History to juggle PromptBox
mounting, hiding, remounting, and repeated `models:open` behavior. Opening an
existing project with zero models is useful mostly for read-only review of
existing media; creating or opening an empty project without any model installed
is close to a dead end.

Testing is expensive because true install verification can require large model
downloads and first-run engine installation. The existing cross-platform
portable distribution plan already needs a first-run engine install and one
generation test. This plan should share that manual test pass instead of
requiring a duplicate install session.

Relevant files and docs:
- `js/components/Blocks/MpiModelsModal/MpiModelsModal.js`
- `js/components/Blocks/MpiModelsModal/MpiModelsModal.css`
- `js/components/Compounds/MpiSlideOver/MpiSlideOver.js`
- `js/shell.js`
- `js/shell/projectUI.js`
- `js/components/Organisms/MpiPromptBox/MpiPromptBox.js`
- `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`
- `js/data/modelRegistry.js`
- `js/services/downloadService.js`
- `.claude/rules/components.md`
- `.claude/rules/component-events.md`
- `.claude/rules/component-mounts.md`
- `.claude/rules/workspaces.md`
- `.claude/rules/downloads.md`
- `docs/workspaces.md`
- `docs/shell.md`
- `docs/plans/2026-04-30-cross-platform-portable-distribution.md`

## Completed

- [ ] Nothing yet.

## Remaining Work

## Phase 1: Refactor Model Manager Content

- [ ] Extract model-manager body logic from `MpiModelsModal` into a reusable content component, likely `MpiModelManagerContent`, without changing behavior. The new component owns model card rendering, refresh, install, pause/resume/cancel, uninstall confirmation, installed-state refresh, and download event subscriptions. **Verify:** current `models:open` path still opens a working manager; install progress, pause/resume/cancel, uninstall confirmation, and `models:closed` behavior still work.

- [ ] Keep overlay hosting temporarily while the content extraction lands, so the behavior change is isolated from the shell/navigation change. **Verify:** no visual or lifecycle regression in the existing overlay path before introducing the slide-over path.

## Phase 2: Add Project-Page Models Slide-Over

- [ ] Add a `Models` project-page action beside `Settings`, `Help`, and `About`, using the existing slide-over pattern. The slide-over should host the extracted model-manager content and use the same install/download logic as the overlay path. **Verify:** from the project page, `Models` opens a right slide-over; card actions work; closing the slide-over cleans component subscriptions.

- [ ] Adjust `MpiSlideOver` only if necessary to support model-manager content. Keep it generic chrome: title, close, scrollable body, optional footer. **Verify:** Settings, Help, and About still open and close correctly.

## Phase 3: Retire PromptBox Model Manager Entry Point

- [ ] Remove the global model manager/download icon from the PromptBox settings popup. Keep the active model settings gear, because it is contextual to the selected model. **Verify:** PromptBox still supports model selection, operation selection, model settings, and generation controls; there is no adjacent wrong-icon path to global model management.

- [ ] Decide whether any secondary in-workspace model-manager access remains necessary. If needed, use a clearer command path than a small icon next to model settings. **Verify:** no hidden dependency still expects PromptBox to emit `models:open`.

## Phase 4: Replace or Remove Blocking Models Modal

- [ ] Convert `models:open` to route to the slide-over for normal/user-initiated opens. Remove `MpiModelsModal` if the slide-over is sufficient for all model-manager flows. **Verify:** `shell.js` no longer mounts stale model-manager overlay chrome, and `rg "MpiModelsModal"` returns only intentional historical docs or none in runtime files.

- [ ] Preserve a single close/completion signal for hosts that need it. Either keep `models:closed` as a host-agnostic event from the slide-over content/host, or replace consumers with a clearer event. **Verify:** Gallery still reacts correctly after the first model install and does not require reopening/reclosing a modal to mount PromptBox.

## Phase 5: Define Zero-Model Product Behavior

- [ ] Implement zero-model behavior as a simpler explicit gate:
  - Existing project with media can open in read-only/no-prompt mode.
  - Empty project or new project creation with zero installed models opens the Models slide-over first.
  - Gallery with zero installed models shows a calm no-model state and an action to open Models.
  - PromptBox is mounted only when at least one installed generation model is available.
  **Verify:** zero-model app state no longer repeatedly opens model manager or remounts PromptBox; the user has a clear path to install models from the project page.

- [ ] Remove obsolete zero-model juggling made unnecessary by the gate. Avoid preserving fallback branches that only existed to keep PromptBox alive with no installed model. **Verify:** code paths around `installedAllModels.length === 0`, `models:open`, and `models:closed` are smaller and have one clear responsibility each.

## Parallel Batch: Follow-Up Implementation Slices

These can run in parallel only after Phase 1 has established the reusable
content component API. Use `mpi-execute-parallel` only if the workspaces are
clean and ownership can remain disjoint.

- [ ] Shell and project-page slide-over host. Ownership: `js/shell.js`, `js/shell/projectUI.js`, `js/components/Compounds/MpiSlideOver/*`, `index.html` if needed. Briefings: components, events, workspaces, shell. **Verify:** project-page Models action opens the slide-over and does not regress Settings/Help/About.

- [ ] PromptBox and workspace zero-model simplification. Ownership: `js/components/Organisms/MpiPromptBox/*`, `js/components/Blocks/MpiGalleryBlock/*`, `js/components/Blocks/MpiGroupHistoryBlock/*`. Briefings: components, events, state, workspaces, component-mounts. **Verify:** PromptBox no longer exposes global model manager; zero-model Gallery/History behavior is explicit and stable.

- [ ] Documentation and rule drift updates. Ownership: `docs/workspaces.md`, `docs/shell.md`, `.claude/rules/component-events.md`, `.claude/rules/component-mounts.md`, `.claude/rules/workspaces.md`, possibly `.claude/rules/components.md`. Briefings: docs/rules only. **Verify:** docs describe Models slide-over and no longer describe removed runtime `MpiModelsModal` behavior.

## Phase 6: Verification and Test Strategy

- [ ] Add or update focused automated tests where practical for event routing and UI presence, without requiring real model downloads. Prefer browser/desktop smoke tests that can stub installed-model state or inspect component wiring. **Verify:** tests cover project-page Models access, PromptBox icon removal, and no installed-model crash paths.

- [ ] Use one combined manual install session with the portable distribution plan. Fresh-install test sequence:
  1. Start from a clean portable app/user-data/engine state.
  2. Run first app launch and engine install/repair.
  3. Land on project page and confirm Models is discoverable.
  4. Open or create a project with no models and confirm the intended zero-model gate/read-only behavior.
  5. Install at least one model from the Models slide-over. If avoiding download, seed/move model files and dependencies into the expected model root, then run refresh/resync through the UI.
  6. Confirm first installed model unlocks PromptBox/generation.
  7. Generate one image.
  8. Restart app and confirm installed model detection persists.
  **Verify:** one manual session satisfies this plan's fresh-install/model-manager checks and the portable distribution plan's first-run engine/generation checks.

- [ ] Document any manual shortcuts used during verification, such as moving large model files into the configured models folder instead of downloading them through the UI. **Verify:** final notes clearly distinguish "download path tested" from "installed-state/resync path tested."

## Plan Drift

- None yet.

## Verification

Final verification should include:
- `npm run build`
- relevant desktop/browser smoke test if available
- project page opens `Models`, `Settings`, `Help`, and `About` slide-overs
- PromptBox has no global model-manager/download icon
- zero installed models: existing media project can be inspected read-only, empty/new generation path opens Models
- first model install or seeded-file refresh updates installed state and unlocks PromptBox
- one generation succeeds after install
- stale runtime references to removed `MpiModelsModal` are gone

## Preservation Notes

- Do not bypass `downloadService` for model install/uninstall UI. Download state must continue to flow through the single SSE bridge and `Events`.
- Do not create new global state outside `js/state.js`. Prefer explicit events for host open/close and existing `s_installedModelIds`.
- If component wiring changes, ask before updating `.claude/rules/` unless the user has explicitly approved docs/rule updates for this implementation session.
- Coordinate manual fresh-install testing with `docs/plans/2026-04-30-cross-platform-portable-distribution.md` to avoid repeating large engine/model install tests.
- Be explicit in handoff/final notes about whether real downloads were tested or local seeded model files were used.
