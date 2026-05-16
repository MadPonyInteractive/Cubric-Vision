# Cubric Source Grounding

Use this reference to choose the app sources to read before drafting user documentation.

## Orientation

Start with:

- `C:\AI\Mpi\CubricStudio\docs\PROJECT.md`
- `C:\AI\Mpi\CubricStudio\docs\workspaces.md`
- `C:\AI\Mpi\CubricStudio\docs\data.md`

Then read only the files relevant to the requested page or feature.

## Pages And Likely Sources

### Getting Started

- `docs/PROJECT.md`
- `docs/comfy.md`
- `docs/projects.md`
- `routes/downloadManager.js`
- `js/components/Compounds/MpiModelsModal/` when documenting model install flow

### Projects

- `docs/projects.md`
- `docs/project-integrity.md`
- `routes/shared.js`
- `routes/projects.js`
- `js/shell/projectUI.js`
- `js/data/projectModel.js`

Check claims about portability carefully: project data lives in the project folder, while model files live separately under the engine.

### Gallery

- `docs/workspaces.md`
- `.claude/rules/workspaces.md`
- `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`
- `js/components/Compounds/MpiGalleryGrid/`
- `js/services/PromptBoxService.js`
- `js/data/commandRegistry.js`

### History And Tools

- `docs/workspaces.md`
- `.claude/rules/workspaces.md`
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`
- `js/components/Organisms/MpiHistoryTools/`
- `js/components/Organisms/MpiToolOptions*/`
- `js/components/Primitives/MpiCanvas/`
- `js/data/commandRegistry.js`

### Models

- `docs/data.md`
- `docs/comfy.md`
- `js/data/modelRegistry.js`
- `js/data/modelConstants/models.js`
- `js/data/modelConstants/dependencies.js`
- `js/data/commandRegistry.js`

Do not list operations from registry entries alone. Cross-check that a current model supports the operation in `models.js`.

### Workflows

- `js/data/commandRegistry.js`
- `js/data/modelConstants/models.js`
- `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`
- workflow-specific tool option components

Prefer "recommended sequence" language over "workflow" when the user might confuse it with a ComfyUI graph.

### Hotkeys

- `js/managers/hotkeyRegistry.js`
- `js/components/Compounds/LandingPages/MpiHelp/MpiHelp.js`
- `docs/shell.md`

The visible Help overlay is hand-authored and can differ from the registry. If they differ, report the drift before changing docs.

## Accuracy Checklist

Before finalizing docs:

- Verify UI labels against source or captured screenshots.
- Verify shortcuts against both `hotkeyRegistry.js` and `MpiHelp.js`.
- Verify model/operation claims against both `commandRegistry.js` and `models.js`.
- Verify project storage/location claims against `docs/project-integrity.md`, `docs/projects.md`, and route code.
- Mark any future/planned features as planned, not current.
