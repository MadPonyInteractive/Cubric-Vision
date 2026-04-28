# Plan: Revert Raw GPU Pipeline + Two-Canvas Refactor

**Created:** 2026-04-28
**Goal:** Revert four commits (raw GPU pipeline + two-canvas stack + dependent header commit) using `git revert` (additive, history-safe). Preserve all unrelated in-between commits. Two-canvas benefits captured separately in `2026-04-28-mpicanvas-two-canvas-refactor.md`.

**Approach:** `git revert` only. No cherry-pick, no rebase, no force-push. Safety branch first.

---

## Target commits (newest → oldest, revert in this order)

| SHA | Message |
|-----|---------|
| `03853ae` | feat(MpiToolOptionsRaw): add Reset/Bypass header + per-control dblclick reset |
| `0e5a130` | feat: two-canvas stack + CSS transform pan/zoom for MpiCanvas |
| `182756b` | fix: resolve GPU pipeline crashes and texture errors in raw tool |
| `3221984` | feat: GPU raw image adjustments pipeline (PixiJS v8) replacing Sharp |

## Preserve untouched (in-between commits)

| SHA | Message |
|-----|---------|
| `9321253` | docs: clarify playwright-cli is global |
| `29a8767` | Skill and gitignore update |
| `85eeb38` | fix: correct qs import path depth in MpiHelp |
| `f24e76a` | plan update, claude.md file changes |
| `f10d802` | plan cleanup |

**Note:** `85eeb38` touches `MpiHelp.js`, which `0e5a130` also touched. Conflict possible at to-do 4 — `85eeb38` qs fix MUST be preserved.

---

## To-Dos

- [ ] **1. Stash uncommitted work**

  **What:** Stash current uncommitted changes (`js/utils/rawGpuPipeline.js` mods, `docs/plans/2026-04-27-raw-gpu-validation.md` mods, untracked `nul` file).

  Commands:
  ```
  git stash push -u -m "pre-revert raw-gpu attempt"
  ```

  **Verify:** `git status` shows clean working tree. `git stash list` shows the new stash entry.

- [ ] **2. Create safety branch**

  **What:** Branch current HEAD as `backup/raw-gpu-attempt` so the four commits remain reachable for future reference. Stay on `master`.

  Commands:
  ```
  git branch backup/raw-gpu-attempt
  ```

  **Verify:** `git branch` lists `backup/raw-gpu-attempt`. `git rev-parse backup/raw-gpu-attempt` returns the same SHA as `git rev-parse HEAD`.

- [ ] **3. Run git revert (no commit, all four at once)**

  **What:** Revert the four target commits in newest-first order, no auto-commit, so we can land them as a single squashed revert commit.

  Commands:
  ```
  git revert --no-commit 03853ae 0e5a130 182756b 3221984
  ```

  **Verify:** `git status` shows staged changes. If conflicts: status shows "both modified" for at least one file — proceed to to-do 4. If clean: skip to to-do 5.

- [ ] **4. Resolve conflicts (preserve `85eeb38` qs fix in MpiHelp)**

  **What:** Most likely conflict is `js/components/Compounds/LandingPages/MpiHelp/MpiHelp.js` — `0e5a130` touched it for ESLint qs fix; `85eeb38` is a separate qs fix. After revert, MpiHelp must end in the state defined by `85eeb38` (post-fix), NOT pre-`0e5a130`.

  Resolution rule:
  - For `MpiHelp.js`: keep `85eeb38`'s qs import + usage. Drop any other `0e5a130`-introduced changes.
  - For any other conflict: prefer the pre-`3221984` version.

  After all conflicts resolved:
  ```
  git add <resolved-files>
  ```

  **Verify:** `git status` shows no "both modified" entries. `grep -n "qs" js/components/Compounds/LandingPages/MpiHelp/MpiHelp.js` shows the qs import + usage from `85eeb38` intact.

- [ ] **5. Single revert commit**

  **What:** Commit all reverted changes as one commit with clear message pointing to the future refactor plan.

  Commands:
  ```
  git commit -m "revert: drop raw GPU pipeline + two-canvas refactor

Reverts:
- 03853ae feat(MpiToolOptionsRaw): Reset/Bypass header
- 0e5a130 feat: two-canvas stack + CSS transform pan/zoom
- 182756b fix: GPU pipeline crashes
- 3221984 feat: GPU raw image adjustments pipeline (PixiJS v8)

Two-canvas benefits captured for future re-implementation in
docs/plans/2026-04-28-mpicanvas-two-canvas-refactor.md (no Pixi).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

  **Verify:** `git log -1 --oneline` shows the new revert commit. `git show --stat HEAD` shows files reverted (rawGpuPipeline.js, MpiCanvas.js, MpiToolOptionsRaw.js, etc.).

- [ ] **6. Uninstall pixi.js**

  **What:** Remove pixi.js from dependencies and lockfile. Commit separately so the dep cleanup is bisectable.

  Commands:
  ```
  npm uninstall pixi.js
  git add package.json package-lock.json
  git commit -m "chore: remove pixi.js dep (no longer used after raw GPU revert)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

  **Verify:** `grep '"pixi.js"' package.json` returns nothing. `node -e "require('pixi.js')"` errors with MODULE_NOT_FOUND.

- [ ] **7. Verify removed/restored files**

  **What:** Confirm revert correctly removed Pixi-only files and restored Sharp-era files.

  Check existence:
  - **Should NOT exist:** `js/utils/rawGpuPipeline.js`, `routes/imageBake.js`
  - **Should exist:** `routes/imageAdjust.js`

  If any "should NOT exist" file still present → `git rm` it, commit `chore: clean up leftover Pixi files post-revert`.

  **Verify:** Run a directory listing/grep:
  - `ls js/utils/rawGpuPipeline.js 2>&1` returns "No such file"
  - `ls routes/imageBake.js 2>&1` returns "No such file"
  - `ls routes/imageAdjust.js` returns the path
  - `grep -rn "imageBake" routes/ server*.js 2>/dev/null` returns nothing
  - `grep -rn "imageAdjust" routes/ server*.js 2>/dev/null` shows route registration

- [ ] **8. Verify MpiToolOptionsRaw uses server preview path**

  **What:** Confirm the reverted `MpiToolOptionsRaw.js` calls `/api/image/adjust` for previews and has no Pixi imports.

  Checks:
  - `grep -n "image/adjust" js/components/Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.js` shows fetch call
  - `grep -n "rawGpuPipeline\|pixi" js/components/Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.js` returns nothing
  - `grep -rn "rawGpuPipeline\|from 'pixi" js/ 2>/dev/null` returns nothing

  **Verify:** All three greps match the expected output above.

- [ ] **9. Delete obsolete plan files**

  **What:** Remove the three plan files that drove the reverted work. They are now historically captured by the revert commit + the new refactor plan.

  Delete:
  - `docs/plans/2026-04-26-raw-gpu-pipeline.md`
  - `docs/plans/2026-04-27-mpicanvas-pixi-display-refactor.md`
  - `docs/plans/2026-04-27-raw-gpu-validation.md`

  Commit:
  ```
  git rm docs/plans/2026-04-26-raw-gpu-pipeline.md docs/plans/2026-04-27-mpicanvas-pixi-display-refactor.md docs/plans/2026-04-27-raw-gpu-validation.md
  git commit -m "chore: remove obsolete raw-gpu plan files post-revert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
  ```

  **Verify:** `ls docs/plans/2026-04-2[67]-*.md 2>&1` returns "No such file". `ls docs/plans/2026-04-28-*.md` shows this plan + the future two-canvas refactor plan.

- [ ] **10. Smoke test in Electron**

  **What:** Launch desktop app, open a project in history workspace, open raw tool, drag a slider, confirm server preview fires (NOT GPU).

  User actions:
  1. Start Electron desktop app
  2. Open any project with images
  3. Navigate to history workspace
  4. Click an image, open raw tool
  5. Drag exposure slider
  6. Open dev tools console

  **Verify:** Console shows no errors. Network tab shows `POST /api/image/adjust` requests on slider change. No `pixi` or `rawGpuPipeline` references in console. Image updates (debounced server preview, NOT real-time GPU). `logs/app.log` tail shows raw adjust route hits, no Pixi-related errors.

- [ ] **11. Drop or trash stash**

  **What:** Decide fate of stash from to-do 1. Default: drop (the work was experimental and superseded). User may inspect first.

  Commands (after user confirms):
  ```
  git stash drop stash@{0}
  ```

  **Verify:** `git stash list` no longer shows the `pre-revert raw-gpu attempt` stash.

---

## Post-completion

- Plan 2 (`docs/plans/2026-04-28-mpicanvas-two-canvas-refactor.md`) ready for future execution via `/mpi-execute-next`.
- `backup/raw-gpu-attempt` branch retained indefinitely for reference. Delete only when two-canvas refactor is fully shipped + validated.
