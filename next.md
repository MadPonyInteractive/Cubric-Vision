## Comfy mappings
If an existing control in the app does not exist in the workflow, 
gray it out (disable it) | hide it

# add pre resources for comfyui installation??
detectors for example (they are small and would be a lot to download all of them)

## Reintroduce Enhancer
# Presets for the enhancer
- SDXL
- FLUX 
- NANO BANANA
- WAN
- LTX
- KLING
- SEEDANCE

## Custom ComfyUI Workflows (auto detect and create params)???
## One Trainer integration (with possible RunPod connection)


## Console log Terminal (context menu access?)

## Add generation time in history


## Drag to tool
Drag any image to a specific tool
## * Introduce Project templates *

## Patreon integration
### Sign in
### Access to exclusives depending on tiers
### Make sure to have a version with everything for YT Creators


# FIXES
* unload cache from comfy as well as models (Maybe done, not sure)







create and only implement in the test page: @beautifulMention the following primitives:
slider/range (listen to mouse wheel)
Toast (brief notifications that disappear)







Prompting MpiAiSuite Agents — Gemini Flash Guide
Flash is fast but context-light. These patterns get the best results:

Start every session with the slash command
/start
This forces the agent to read 02_status.md and 01_overview.md before touching anything. Without it, Flash will guess at the architecture and often get it wrong.

Be specific about the file, symptom, and expected behavior
❌ "the upscaler is broken"
✅ "upscaler: when I drop an image the canvas stays empty. No error in console. It worked before I changed the seed logic in upscaler.js"

Flash doesn't explore well — give it the file name and the symptom together.

One problem per session
Flash loses track fast across many edits. One bug or one feature per session, then /finish.

Name the tool you want to use
❌ "add a setting for that"
✅ "add a max-steps slider to the Upscaler tool — in templates/tpl-upscaler.html and js/tools/upscaler.js"

If the agent starts touching the wrong files, stop it immediately
Say: "don't touch shell.js, fix it only in [file]". Flash will often over-reach into files it shouldn't.

Testing handoff phrase
After any fix, if the agent doesn't say "please test", nudge it:
"hand off to me for testing"

Reference the workflow directly for new tools
/implement_new_tool
Flash follows step-by-step instructions reliably when they're this explicit.





## Crop Extract: Extra features
in our ctx menu and actions we need to implement a new action and option, the usual save action/option should save the video at its current state (timeline crop and ratio crop) as a mp4 file and we need to implement in the existing menu a new action (Save Frame) both should save the respective file type in the library. the tools displayed in the ctx menu should @beautifulMention @beautifulMention 






# Convert this plan into executable engineering tasks .md file

















## read dev_docs/01_overview.md
Page/Tool: Crop & Extract
Goals:
1. add a + icon in the control layout on the far left, this icon should trigger the modal media library. Use the already implemented tools and componets and keep consistency with other pages that use the same icon/button.
2. remove the interaction: left click on the video area that is not cropped opens the library modal, it should do nothing
3. remove the button icon: Extract Clip (MP4)
4. The following options should only be changed/added to the ctx menu while in the cropExtract page.
4.1. add option to ctx menu: Save Video
4.2. add option to ctx menu: Download Video
4.3. change option display name in ctx menu: Save (change to Save Frame)
4.4. change option display name in ctx menu: Download (change to Download Frame)
5. Add audio control: a speaker icon to the left of the play button that when hovered displays a vertical slider to control audio with click drag and mouse wheel

Critical: keep style consistency for both dark and light mode, use what is already there, keep a modular approach and avoid copy paste code or placing code in places where are not related.

Most Relevant files:
cropExtract.js
mediaActions.js
mediaContextMenu.js
tpl-cropExtract.html
toolUtils.js









## Tool: cropExtract
Goals:
1. fix issue where the vertical volume slider displays compressed and horizontaly (image 1 as reference)
2. fix ratio state - issue: when navigating to another page and returning the ratio display returns to default
3. fix media galery and modal display of videos (videos get cropped not displaying their correct ratios)
4. fix issue of context menu: downloading a video also saves to library
5. fix video preview modal - upon opening a video, it display to the right and user cant relocate its position and if an image was previously previewed it also displays as you can see in image 2

















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
## Phase 3.4: Load comfy engine popup [X]


## Error Handling & Logging [X] TODO: connect to services





## MpiPromptBox ReVamp [to-accomodate-new-system]
* Model Selector dropdown [default-option->-Model-Downloads]
- models in the dropdown should have icons indicating their type [img/vid] or we use a radio
- and badges indicating their supported operations [i2v/t2v/t2i/etc]
* Contextual Operation Type dropdown based on [model/mask/images-present]
[i] Options some models do not support [i2i/change/remove/edit]
- Mask on [detail/change/remove] [img-models-only]
- Mask off 
    - Images present [i2i/upscale/edit]
    - No Images present [t2i]

[change]    = Inpaint (or image editor with stitch)
[remove]    = Inpaint removal (or image editor with stitch)
[edit]      = Image edit
[detail]    = Mask Detailer



## GALLERY (Media Items)
* Controls
- Display names toggle -> when on it displays a name badge on every item card [upscaled/detailed/generated/etc]
* Filtering
- Favs/imgs/vids/audio
- Type (uploaded/generated/detailed/upscaled)
- Media type (img/mp4/mp3)
* order (new to old/old to new)
* Media naming convenction based on source (uploaded/generated/detailed/upscaled)
* Interactions
- Drag/Drop functionality [from the canvas to the prompt box and from the file system to the prompt box]
- ctrl+click for Multiple selection [use badges for selection order numbers]
this should change options on the radial for workflows with multiple inputs[compare/edit/startframe-endframe]??
- click to select
- dblClick to enter Media Item Workspace

* PromptBox here will behave based on inputs

## Media item history/workspace --------------------------------------------------------------------------------------
Media items will possibly be files with a history, they are the thing represented in the gallery.
Double Clicking one in the galery will open a separate workspace for altering the file, creating new versions with alterations.
This workspace should consist of: 
- icon tool pallete on the left [crop/mask-for-images-only]
- the image preview in canvas using most of the screen space with modes: [display/compare-widget/mask/crop]
- the history cards on the right with [name/image/prompt/dimensions/btn-icons]
Each History entry should be a selectable card component.
Every history entry has [btn-icons]: 
- 'Make Unique' btn, that creates a new Media item from the media
- 'Set as main' toggle to make it be the item used and seen in the galery [gets-a-feedback-badge]
- 'Delete'

User should be able to select 2 entries at a time holding [ctrl], when this happens the main area converts into the `compare widget` with both images loaded into it.

Converting an image to a video or extracting a frame from a video will create a new Media Item automatically, so each media item always has one type, img, video or audio.

Here the tab radial menu is used contextualy. 
* 1 entry           = tools to use [upscale/edit/animate]
* 1 entry masked    = tools to use [remove/change/detail]
Selecting one of these will change the MpiPromptBox to the appropriate variant with a dropdown to select model and its own unique params.

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
