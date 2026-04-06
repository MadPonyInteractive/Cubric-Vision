# Task: Prompt Builder R8 Architecture Refactor

**Goal**: Systematically migrate the Legacy Prompt Builder (Stage 11) to the new R8 Component Architecture using the `ComponentFactory`, strictly following the **Primitive > Compound > Block** hierarchy.

# 🤖 IMPORTANT for agents 
## CRITICAL Must Read: `dev_docs/05_components.md`
## Use JSDocs extensively
## Use the `styles/01_base.css` as the source of thruth for styles
## USe `js/utils/dom.js` for shorthands
## use `js/utils/` where appropriate
## Do not commit git
## Do not test
## Ask questions if goal not clear
## Work on your assigned phase but the read the other phases for context
## Remember to update `js/shell.js` and `js/components/types.js` if adding or removing components
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
***task 1*** - [x] **Ovelay**: Primitive main area Overlay with:
    - `X` icon on top right to close
    - Large MpiIcon on top centre
    - Large Title 
    - Small Text 
    - `container` that takes in components
    - Small Text 
    *   **Architecture**: Uses the **Stash Pattern**. Moves current tool DOM into a hidden container instead of clearing it, preserving background state and portaled popups.
    *   **Management**: Registers with `OverlayManager` for queueing and emits/listens for global close events.
    Side bar, status bar and app header remain visible (occupies main area only)
    ***Update Component Gallery***: the `js/pages/components.js` and `templates/tpl-components.html` need to be updated by adding this new component (use a MpiButton to trigger the overlay and add a MpiBadge to the overlay container for display purposes)
*Target: js/components/Compounds/*
***task 2*** - [x] **MpiOkCancel**: Compound  with:
    - Large Title
    - Text area
    - optional MpiInput field
    - `OK` MpiButton
    - optional `Cancel` MpiButon
***task 3*** - [x] **MpiInstalledDisplay**: Compound Container with:
    - Title Text on top left
    - Small text on top right
    - Text area
    - MpiIcon and text
    - MpiBadge `Installed`
    - Optional MpiButton on left `Delete Models` (toggle) 
    - MpiButton on right `Delete`


## Phase 3.4: New Project popup and button on landing page [X]
# Reimplement settings/about/help in projects page [X]
## Phase 3.4: Implement confirm for project delete [X]
### Phase 3.4: MpiProjectCard [X]
## Phase 3.3: Radial Menu [X]


## Phase 3.4: Status Bar (Info Bar) [Create Component and Implement the Progress into it] [X]
## Phase 3.4: Load comfy engine popup []


## Error Handling & Logging [X]


## MpiPromptBox ReVamp [to-accomodate-new-system]



## GALLERY (Media Items)
* Controls
- Display names
- Select Multiple [use badges for selection order numbers]
this should change options on the radial for workflows with multiple inputs[compare/edit/startframe-endframe]
* Filtering
- Favs/imgs/vids/audio
- Type (uploaded/generated/detailed/upscaled)
- Media type (img/mp4/mp3)
* order (new to old/old to new)
* Media naming convenction based on source (uploaded/generated/detailed/upscaled)
* Drag/Drop functionality [to the canvas/screen and from the canvas to the prompt box]
* PromptBox here will behave based on inputs

## Media item history --------------------------------------------------------------------------------------
Media items will possibly be files with a history, they are the thing represented in the gallery.
CLicking one in the galery will open a separate workspace for altering the file, creating new versions with alterations.
This workspace should consist of: 
- icon tool pallete on the left [crop/mask]
- the image preview in canvas using most of the screen space with modes: [display/compare-widget/mask/crop]
- the history cards on the right with [image/prompt/btn-icons]
Each History entry should be a selectable card component.
Every history entry has: 
- 'Make Unique' btn, that creates a new Media item from the media
- 'Set as main' toggle to make it be the item used and seen in the galery [gets-a-feedback-badge]
- 'Delete'

User should be able to select 2 entries at a time, when this happens the main area converts into
the `compare widget` with both images loaded into it.

Converting an image to a video or extracting a frame from a video will create a new Media Item automatically, 
so each media item always has one type, img, video or audio.

Here the tab radial menu is used contextualy. 
* 1 entry           = tools to use [upscale/edit/animate]
* 1 entry masked    = tools to use [remove/change/detail]
Selecting one of these will change the MpiPromptBox to the appropriate variant with a dropdown to select model
and its own unique params.

**Video differences**
* tool pallete [crop]
* 1 entry           = tools to use [upscale/snapshot]



## DOWNLOADER with resume
UI states:
- Queued: "Waiting to download..."
- Downloading: "Downloading SDXL (2.3GB / 6.9GB) - 33%"
- Paused: "Download paused. Click to resume."
- Verifying: "Verifying file integrity..."
- Failed: "Download failed. Retry?"
- Complete: ✓

Model Manifest Schema (Revised)
{
  "id": "sdxl_base",
  "file": "sd_xl_base_1.0.safetensors",
  "source": "huggingface",
  "repo": "stabilityai/stable-diffusion-xl-base-1.0",
  "path": "sd_xl_base_1.0.safetensors",
  "sha256": "...",
  "size": 6938078208,
  "requiredForWorkflows": ["txt2img-sdxl"],
  "minTier": 2
}

Download Strategy
Use HuggingFace's direct download URLs:
https://huggingface.co/{repo}/resolve/main/{path}
Implementation via modelDownloader.js:

Check if model exists locally (verify checksum)
If not, queue download
Use streaming download with progress (Node.js https + fs.createWriteStream)
Verify SHA256 after download
Move from temp to models folder
Update installation.modelsDownloaded state
Critical: Resumable downloads

HuggingFace supports HTTP range requests. If download fails midway:

Save partial file + metadata (how many bytes downloaded)
Resume with Range: bytes=X- header
Libraries that handle this:

got (Node.js, supports resume)
node-downloader-helper (built for this)
DIY with native https (more control, more code)
Recommendation: Use got with retry logic.


## Build feature gating system (new workflows and tools) ?? 
## updates??
## State persistence (project system, settings survive restart)


## 




## Phase 3.5.1: Video preview (crop grid + snapshot)
## Phase 3.5.2: Video Controller (play/stop, vol, seek, repeat) 
## Phase 3.5.3: Video Region Select

## Phase 3.5: Media Previewer (Mask separate?)
*Target: js/components/Blocks/*
## Phase 3.6: Media Gallery (small popup VS full overlay??)
*Target: js/components/Blocks/*


## Phase 4: Overlay pages (Foundation Complete)
*Target: js/components/Blocks/*
- [ ] **Download Manager**: Refactor `provisioning.js` logic into an `MpiOverlay` block.
- [ ] **Advanced Settings**: Refactor `provisioning.js` logic into an `MpiOverlay` block.
*   **Requirement**: Must use `MpiOverlay.show()` to ensure background tool persistence.
*   **Requirement**: Must listen for `ui:close-all-popups` to clean up sub-page selectors.


## Phase 5: Main Orchestration (Tier 3 - Block) ??? its a page
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

## Phase 6: Integration & Deletion (Cleanup)
- [ ] **Router Update**: Update `js/toolRegistry.js` to mount the `MpiPromptBuilder` Block.
- [ ] **`elements.js` Cleanup**: Delete all `pb-` and `pe-` element references once encapsulated.
- [ ] **`formBuilder.js` Retirement**: Deprecate the legacy procedural form builder once all tools are converted to R8 Compounds.

## Phase 7: All systems ready
**Regenerate the lock file:**
    rm package-lock.json
    npm install
    This will rebuild package-lock.json based on your current package.json

**Verify it's correct:**
    npm list  # Check that dependencies resolve properly

---

## 🎨 Design Rules (Strict Compliance)
1. **Tier 1 (Primitives)**: Pure UI, 0 dependencies.
2. **Tier 2 (Compounds)**: Imports **Primitives only**. No internal cross-imports between compounds.
3. **Tier 3 (Blocks)**: Imports **Primitives & Compounds**. Orchestrates the page/tool lifecycle.
4. **Active States**: High-contrast neon borders for active layers and selected presets.
