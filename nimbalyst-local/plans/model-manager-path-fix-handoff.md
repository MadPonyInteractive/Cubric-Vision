# Handoff: Model Manager / ComfyUI Path Fixes — Session 2026-04-19

## What Was Done

### Bug 1: Outdated model checkpoint filenames (ROOT CAUSE of "SDXL not installing")
**File:** `js/data/modelConstants/dependencies.js`

All 4 SDXL-image model checkpoint filenames referenced subfolders that no longer exist:
- `checkpoints/SDXL/SDXL_Realistic.safetensors` → `checkpoints/SDXL_Realistic.safetensors`
- `checkpoints/ILL/ILL_Anime.safetensors` → `checkpoints/ILL_Anime.safetensors`
- `checkpoints/ILL/ILL_Anime_Beauty.safetensors` → `checkpoints/ILL_Anime_Beauty.safetensors`
- `checkpoints/PONY/PONY_Mix.safetensors` → `checkpoints/PONY_Mix.safetensors`

Files confirmed present on disk at `D:/CubricModels/checkpoints/`.

**Fix:** Removed `SDXL/`, `ILL/`, `PONY/` subfolder prefixes from all 4 checkpoint filenames.

### Bug 2: Broken Bug 3 fix in MpiModelsModal (stale listener clearing)
**File:** `js/components/Blocks/MpiModelsModal/MpiModelsModal.js`

Previous fix referenced `card.display.listeners` which is `undefined` — the `listeners` Map is a private closure inside `ComponentFactory.mount()` and is NOT exposed on the returned instance. The fix had no effect.

**Fix:** Replaced with proper approach — on `download:started`, destroy the existing card, clear its wrapper, and create a fresh `MpiInstalledDisplay` with correctly-wired pause/resume/cancel listeners.

### Bug 3: Custom_nodes path attempts in routes (REVERTED — not a bug)
**Files:** `routes/comfy.js` (models/check), `routes/downloadManager.js` (startUniversalWorkflowInstall)

Attempts were made in a previous session to route custom_nodes downloads through `customRoot/custom_nodes/`. This was wrong — the `extra_model_paths.yaml` does NOT remap the `custom_nodes` type. ComfyUI's Python expects custom nodes in its own `{engine}/custom_nodes/` folder.

**Fix:** Both files reverted to use engine default path for custom_nodes type (`{engine}/custom_nodes/{filename}`).

### Rules Updated
- `.claude/rules/comfy_engine.md` — new model checklist item about checkpoint filename accuracy
- `.claude/rules/downloads.md` — note about custom_nodes path not being remapped by YAML

---

## Current State

All fixes applied and committed. App needs restart to test.

**Expected behavior after restart:**
1. Entering a project with SDXL installed should NOT show model manager (all deps detected correctly)
2. SDXL card should show "INSTALLED" badge, not progress bar or install button
3. UW deps (VideoHelperSuite, etc.) should install to `{engine}/custom_nodes/`
4. Pause/Cancel buttons on downloading models should work correctly

---

## Remaining Issue (Not Fixed)

### PromptBox missing after closing model manager
When the user closes the model manager modal (`models:closed` fires → `PromptBoxService.show()`), the shell-level `PromptBoxService` may not have its component mounted yet (workspace hasn't remounted PromptBox). This is a workspace/PromptBox remounting sequencing issue that was not investigated in this session.

**Symptoms:** After closing the model manager, the PromptBox is not visible in the workspace.

---

## Files Changed

| File | Change |
|---|---|
| `js/data/modelConstants/dependencies.js` | 4 checkpoint filenames corrected (SDXL/ILL/PONY subfolders removed) |
| `js/components/Blocks/MpiModelsModal/MpiModelsModal.js` | Bug 3 fix replaced with proper card destroy/recreate approach |
| `routes/comfy.js` | custom_nodes path reverted to engine default (adds comment explaining why) |
| `routes/downloadManager.js` | custom_nodes path reverted to engine default |
| `.claude/rules/comfy_engine.md` | New model checklist item about checkpoint filename accuracy |
| `.claude/rules/downloads.md` | Note about custom_nodes path not being YAML-remapped |

---

## Verification Steps for Next Session

1. Restart app fresh (Ctrl+Shift+R in Electron, or close/reopen)
2. Enter a project — model manager should NOT appear if SDXL is installed
3. Open Model Manager manually — SDXL should show "INSTALLED" badge
4. Test partial progress display on a model with some deps installed
5. Test Pause/Cancel buttons during an active download
6. Close model manager → PromptBox should be visible in workspace