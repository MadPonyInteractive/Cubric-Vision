# Task: Prompt Builder R8 Architecture Refactor

**Goal**: Systematically migrate the Legacy Prompt Builder (Stage 11) to the new R8 Component Architecture using the `ComponentFactory`, strictly following the **Primitive > Compound > Block** hierarchy.

# 🤖 IMPORTANT for agents 
## Must Read: `dev_docs/05_components.md`
## Use JSDocs extensively
## Ask questions if goal not clear
## Work on your assigned phase but the read the other phases for context
## use `js/utils/` where appropriate
---

## Phase 1: Primitives Expansion (Tier 1 - No Dependencies)
*Target: js/components/Primitives/*

- [x] **MpiDropdown**: Create a lightweight primitive for dropdowns/selects.
    - *Note*: This replaces the old legacy MpiDropdown compound. All existing consumers must be updated.
    - Props: `options[]`, `value`, `placeholder`, `disabled`, `direction up/down`.
    - Events: `change`.
- [x] **MpiRadioGroup**: Create a primitive for horizontal button-style selection.
    - Props: `options[]`, `value`, `name`.
    - Events: `select`.
- [x] **MpiInput**: Ensure it supports `readonly` and optional `auto-height`.
- [x] **Update Component Gallery**: the `js/pages/components.js` and `templates/tpl-components.html` need to be updated by replacing the old MpiDropdown compound with the new MpiDropdown primitive and add the new MpiRadioGroup with a couple of variants for display purposes
---

## Phase 2: Functional Compounds (Tier 2 - Imports Primitives only)
*Target: js/components/Compounds/*

- [x] **MpiToolbar**: A reusable bar combining `MpiDropdown` (Primitive) and action `MpiButton` (Primitive).
    - Use-cases: Global Presets, Tool-specific Presets.
- [x] **MpiVideoScene**: Configuration unit for video scenes (formerly "Shot"). 
    - UI: Uses `MpiInput`, `MpiProgressBar`, `MpiDropdown`.
- [x] **Config Compounds**: Create individual Compounds for each tool category:
    - `MpiCameraConfig`
    - `MpiLightingConfig`
    - `MpiStyleConfig`
    - These compounds contain the specific business logic and radio/select groups for their domain.
- [x] **Update Component Gallery**: the `js/pages/components.js` and `templates/tpl-components.html` need to be updated by adding these new components
---

## Phase 3.1: Update Components
*Target: js/components/Compounds/*
- [x] **MpiToolbar**: Add a optional area to the Left Side of dropdown containing:
    - Optional MpiBadge `Title`
    - Optional `Model` strenght with MpiBadge on top and MpiInput (number) on bottom
    - Optional `Clip` strenght with MpiBadge on top and MpiInput (number) on bottom
- [x] **Update Component Gallery**: the `js/pages/components.js` and `templates/tpl-components.html` need to be updated by adding this new variant

## Phase 3.2: New Components
*Target: js/components/Primitives/*
- [ ] **Ovelay**: Primitive main area Overlay with:
    - `X` icon on top right to close
    - Large MpiIcon on top centre
    - Large Title MpiBadge
    - Small Text MpiBadge
    - `container` that takes in components
    - MpiBadge Small 
    Side bar, status bar and app header remain visible (occupies main area only)
*Target: js/components/Compounds/*
- [ ] **MpiOkCancel**: Compound  with:
    - MpiBadge
    - optional MpiInput field
    - `OK` MpiButton
    - optional `Cancel` MpiButon
- [ ] **MpiInstalledDisplay**: Container with:
    - Title MpiBadge on top left
    - Small MpiBadge on top right
    - Text area
    - MpiIcon and MpiBadge
    - MpiBadge `Installed`
    - Optional MpiButton on left `Delete Models` (toggle) 
    - MpiButton on right `Delete`


## Phase 4: Overlay pages
- [ ] Download Manager
- [ ] Advanced Settings

## Phase 5: Main Orchestration (Tier 3 - Block)
*Target: js/components/Blocks/*

- [ ] **MpiPromptBuilder**: The top-level tool orchestrator.
    - **Architecture**: 
        - Cannot "import up" or import other Blocks. 
        - Must handle its own layout and high-level logic (orchestrating presets and tool-swapping).
    - UI Components:
        - Top: `MpiToolbar` (Global Presets).
        - Right: `MpiDragList` (Prompt Layers).
        - Left (Editor Area): Dynamically mounts the active Config Compound (Camera, VideoScene, etc.).
        - Bottom: `MpiPromptBox`.
    - Logic: Handle reordering, synthesis of final prompt string, and communication with `state.js`.
- [ ] **Update Component Gallery**: the `js/pages/components.js` and `templates/tpl-components.html` need to be updated by adding this new component
---

## Phase 4: Integration & Deletion (Cleanup)
- [ ] **Router Update**: Update `js/toolRegistry.js` to mount the `MpiPromptBuilder` Block.
- [ ] **`elements.js` Cleanup**: Delete all `pb-` and `pe-` element references once encapsulated.
- [ ] **`formBuilder.js` Retirement**: Deprecate the legacy procedural form builder once all tools are converted to R8 Compounds.

---

## 🎨 Design Rules (Strict Compliance)
1. **Tier 1 (Primitives)**: Pure UI, 0 dependencies.
2. **Tier 2 (Compounds)**: Imports **Primitives only**. No internal cross-imports between compounds.
3. **Tier 3 (Blocks)**: Imports **Primitives & Compounds**. Orchestrates the page/tool lifecycle.
4. **Active States**: High-contrast neon borders for active layers and selected presets.
