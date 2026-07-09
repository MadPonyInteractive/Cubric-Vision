# Remove Local LLM / LLaMA Runtime Before Release

## Current State

Cubric Vision still contains dormant local LLM/LLaMA plumbing from the previous app direction. The user confirmed this feature has moved to another app and can be removed from this release. The physical `llama_engine/` and `llama_models/` folders are safe to delete, but only after code/config references are removed.

Investigation found active references in:

- Backend routing and startup: `server.js`, `routes/llm.js`
- Shared backend state and engine paths: `routes/shared.js`, `routes/platformEngine.js`
- Engine provisioning: `routes/engine.js`
- Renderer service/settings/state: `js/services/llmService.js`, `js/shell/memoryOps.js`, `js/state.js`, `js/core/storage*.js`, `MpiSettings`
- Config and packaging: `dev_configs/llm_models.json`, `dev_configs/system_dependencies.json`, `.engine-config.json`, `.husky/post-checkout`, `electron-builder.yml`
- Active docs: `docs/PROJECT.md`, `docs/worktrees.md`, `docs/versioning.md`

Important constraints:

- Keep ComfyUI memory release (`/comfy/unload`, F5/Ctrl+F5, memory monitor).
- Do not delete `engine/ComfyUI_windows_portable/**/llama*`; those are dependencies inside ComfyUI/Python packages.
- `axios` remains used after LLM removal by `routes/comfy.js` and `routes/system.js`. Run `npm audit fix` after cleanup, not during the LLM removal.
- `.claude/rules/` contains stale LLM references, but project rules require explicit user permission before editing rule files.

## Completed

- [x] Read project routing instructions and relevant rules/docs.
- [x] Ran parallel investigation across backend, frontend, config, docs, and packaging.
- [x] Confirmed `package-lock.json` app name metadata was updated separately.

## Remaining Work

## Phase 1: Implementation Prep

- [x] Capture the current working tree state and confirm whether there are unrelated dirty files before edits. **Verify:** `git -c safe.directory=C:/AI/Mpi/Cubric-Vision status --short` is reviewed and unrelated changes are not touched. Result: only `.claude/mpi-kanban/kanban.md`, `package-lock.json`, and the plan file dirty — all expected.
- [x] Reconfirm active LLM references immediately before editing. **Verify:** `rg -n -i "llm|llama|ollama|llm_models|llamaServer" --hidden --glob '!node_modules/**' --glob '!engine/**' --glob '!logs/**' --glob '!.git/**' .` output is saved or summarized for comparison. Result: 36 matches across runtime (server.js, routes/llm.js, routes/shared.js, routes/platformEngine.js, routes/engine.js, routes/comfy.js, routes/system.js, routes/logger.js), renderer (js/services/llmService.js, js/shell/memoryOps.js, js/state.js, js/core/storage.js, js/core/storageKeys.js, MpiSettings, MpiGalleryBlock, MpiModelsModal), config (dev_configs/llm_models.json, dev_configs/system_dependencies.json, .husky/post-checkout, .gitignore), docs (docs/PROJECT.md, docs/worktrees.md, docs/versioning.md, docs/plans/**), rules (.claude/rules/comfy_engine.md, component-state.md, component-mounts.md, mpi-version-bump.md), tests (tests/desktop/fullscreen-titlebar.spec.js), and kanban+lockfile.

## Parallel Batch: Runtime Removal

This batch can run with `mpi-execute-parallel` because ownership is disjoint. Workers are not alone in the codebase; each worker must preserve edits outside its ownership and avoid reverting others.

- [x] Backend worker: removed local LLM route/runtime and LLaMA engine provisioning. Deleted `routes/llm.js` and `dev_configs/llm_models.json`. Stripped LLaMA from `server.js`, `routes/shared.js`, `routes/platformEngine.js`, `routes/engine.js`, `dev_configs/system_dependencies.json`. **Verify:** server no longer imports `routes/llm`; `/engine/status` and `/engine/download` are Comfy-only; `system_dependencies.json` has no `llamaServer`.
- [x] Frontend worker: removed renderer LLM service, settings UI, storage keys, and legacy state. Deleted `js/services/llmService.js`. Stripped from `js/shell/memoryOps.js` (Comfy unload preserved), `js/state.js` (g_abortControllers + currentLoadedModel), `js/core/storage.js`, `js/core/storageKeys.js` (OLLAMA_URL), MpiSettings (Llama API URL field). **Verify:** F5/Ctrl+F5 still call `/comfy/unload`; MpiSettings shows no Llama/Ollama field; no `llmService` imports remain.
- [x] Packaging/docs worker: updated `electron-builder.yml` (exclusions added), `.engine-config.json` (LLaMA keys removed, file kept for `enginePath`), `.husky/post-checkout` (LLaMA worktree provisioning removed), `docs/PROJECT.md`, `docs/worktrees.md`, `docs/versioning.md` (LLAMA_VERSION + llamaServer references removed; Comfy intact). **Verify:** worktree config no longer writes `llamaPath`/`llamaModelsPath`; packaging excludes `.engine-config.json`, `llama_engine/**`, `llama_models/**`; docs are Comfy-only.
- [x] Follow-up sweep (main agent): removed dead `stopLlamaServer` import from `routes/comfy.js`, swapped `'llm'` JSDoc example in `routes/logger.js` to `'comfy'`, stripped Llama Q3 + version-bump steps from `.claude/skills/mpi-version-bump.md`.

## Phase 2: Integration Cleanup

- [x] Reconcile parallel changes and run a full stale-reference scan. **Verify:** after sweep, remaining `llm|llama|ollama|llm_models|llamaServer` hits are: (1) historical `docs/plans/**` entries — out of scope per plan; (2) intentional packaging exclusions in `electron-builder.yml` (`!llama_engine/**`, `!llama_models/**`); (3) defensive `.gitignore` rows (`llama_engine/`, `llama_models/`) and the row mention in `docs/worktrees.md`; (4) `.claude/rules/` drift (component-state.md, component-mounts.md, comfy_engine.md) pending Phase 2 approval; (5) false-positive substrings (`installedAllModels`, `_installModel`, `MpiModelsModal`, `fullMessage`, `shellMarginTop`); (6) `.claude/mpi-kanban/kanban.md` + `package-lock.json` (unrelated). No active runtime/config references remain.
- [x] Deleted physical local LLaMA artifacts: `llama_engine/` (545 MB) and `llama_models/` (7.2 GB). **Verify:** `ls llama_engine llama_models` reports both missing.
- [x] Updated `.claude/rules/comfy_engine.md` (removed `getLlamaBin()`, `llama` from `resolveDownloadConfig` return, `routes/llm.js` from import list), `.claude/rules/component-state.md` (removed `g_abortControllers` + `currentLoadedModel` rows), `.claude/rules/component-mounts.md` (removed Ollama URL MpiInput row from MpiSettings mount notes). **Verify:** `rg -i "llm|llama|ollama|llamaServer" .claude/rules` returns no matches.

## Phase 3: Dependency Hygiene

- [x] Ran `npm audit fix` — pre-fix: 4 vulns (axios high; brace-expansion, follow-redirects, uuid moderate). Post-fix: 0 vulnerabilities.
- [x] axios no longer flagged after fix — no replacement needed in `routes/comfy.js` / `routes/system.js`.

## Verification

- [x] `npm run lint` — 0 errors, 29 pre-existing warnings (unchanged by this work).
- [x] Server boots — confirmed via `node server.js` smoke; module loads cleanly, listens on port 3000, no `routes/llm` import.
- [x] Backend health routes — `/engine/status` returns `{success:true, exists:true}` (Comfy-only); `/comfy/status` returns `{running:false}`; `/llm/health` returns 404 Express default (route gone).
- [ ] Exercise UI settings + memory release. **Defer:** requires interactive Electron run; visual confirmation pending user. Code path: MpiSettings no longer mounts Ollama input; memoryOps.js still calls `/comfy/unload`.
- [ ] Run `npm run smoke:app`. **Defer:** not run; user discretion.
- [x] Final reference audit — only intentional residues remain: packaging exclusions, `.gitignore` defensive entries, historical `docs/plans/**` text, kanban/lockfile noise, false-positive substrings (`installedAllModels`, `MpiModelsModal`, etc.).

## Plan Drift

- None yet.

## Preservation Notes

- Do not remove `engine/ComfyUI_windows_portable/**/llama*`; those are third-party ComfyUI/Python package files.
- Keep `.gitignore` entries for `llama_engine/` and `llama_models/` unless the user explicitly wants to remove defensive ignores.
- Historical planning docs under `docs/plans/**` can keep references unless the release cleanup scope expands to archival rewriting.
- Do not edit `.claude/rules/` without explicit user approval.
- After dependency cleanup, expect `package-lock.json` and possibly `package.json` to change.
