# Engine Version System Refactor — Single Source of Truth

## Context

The previous session ("Cross-platform engine constants & GPU detection") introduced `platformEngine.js` to read `system_dependencies.json` and handle GPU detection. However, the version-check flow still imports `COMFY_VERSION` from `appVersion.js` instead of `platformEngine.js`, creating two out-of-sync sources of truth. When the user edited `system_dependencies.json`, the upgrade screen never appeared because `engine.js` was comparing against the wrong constant.

**Goal:** Eliminate the sync problem by making `system_dependencies.json` the single source of truth, with `platformEngine.js` as the access point.

---

## Critical Files to Modify

1. **`routes/engine.js`** (line 18)
   - Change: import `COMFY_VERSION` from `platformEngine.js` instead of `appVersion.js`
   - This makes `system_dependencies.json` → `platformEngine.js` the flow for version checks

2. **`js/core/appVersion.js`** (line 15)
   - Remove: `export const COMFY_VERSION = '0.18.0';`
   - Keep: `APP_VERSION` and `SCHEMA_VERSION` (app release version, unchanged)
   - Add: comment explaining engine versions now come from `platformEngine.js`

3. **`docs/versioning.md`**
   - Update: Section on `COMFY_VERSION` to clarify it is read from `system_dependencies.json` via `platformEngine.js`, not hardcoded in `appVersion.js`
   - Add: diagram showing the flow: `system_dependencies.json` → `platformEngine.js` → `engine.js` + `downloadManager.js`

4. **`.claude/skills/mpi-version-bump.md`** (move + update)
   - Move: from `C:\Users\Fabio\.claude\skills\mpi\mpi-version-bump.md` to `C:\AI\Mpi\MpiAiSuite\.claude\skills\mpi-version-bump.md`
   - Update Step 4a: Remove instruction to edit `COMFY_VERSION` in `appVersion.js`; instead edit `dev_configs/system_dependencies.json`
   - Update Step 4b onwards: Remove references to "sync appVersion.js with system_dependencies.json"
   - Add: Note explaining `platformEngine.js` is now the access point for version constants

---

## Implementation Steps

1. **Update `engine.js`** — rewire import
2. **Update `appVersion.js`** — remove `COMFY_VERSION`
3. **Update `docs/versioning.md`** — clarify single source of truth
4. **Move and refactor skill** — relocate to project `.claude/skills/` and update procedure

---

## Verification

- Bump a version in `system_dependencies.json` and confirm the upgrade screen appears on app boot
- Run the skill `/mpi-version-bump` interactively and confirm it only asks about `system_dependencies.json`, not `appVersion.js`
- Check that no code imports `COMFY_VERSION` from `appVersion.js` except `js/data/modelRegistry.js` if it does (search needed)
