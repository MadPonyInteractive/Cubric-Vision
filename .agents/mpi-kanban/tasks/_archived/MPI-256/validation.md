# MPI-256 — Validation

**State:** VALIDATING. All 6 phases coded + auto-verified (lint 0 across all MPI-256 files; `inject-params-titles.test.cjs` 3/3; headless-Chrome structural checks per phase). Most user-ux surfaces confirmed live by Fabio on real Electron. **Nothing committed yet** (branch 1.2.0) — commit at session close by explicit pathspec.

## Auto-verified (done)
- Lint: 0 errors on appService, generationService, MpiBaseApp, MpiAppImageRegen, MpiAppLibrary, appsRegistry, MpiOverlay, MpiQueuePanel, and all wiring files.
- `tests/inject-params-titles.test.cjs` — 3/3 (incl. the App workflow case).
- Headless (live :3000): App Library grid + badges + detail Open/Install; `apps:open`/`app:open` wiring; BaseApp mount + per-app controls + Back; `openAppFromReuse` (available/unknown/missing-model paths) + reuse-open-survives-close-all-popups; in-app-latent preview guard; MpiOverlay `.main-area` child-order idempotent across open/close.
- `operation_registry.json` valid + `poseReference` present.

## User-confirmed live (Fabio)
- App gen runs → lands as a gallery card; coexists with a PromptBox gen.
- Queue card reads "IMAGE REGEN" (not "UNIVERSAL WORKFLOW / APPIMAGEREGEN").
- Status bar stays at the bottom while the App overlay is open AND after closing it (DOM-order fix).
- In-progress "Generating…" card + live latents show on the gallery card.
- Result shows in the App's result pane on complete.
- Reuse on a freshly-generated app card reopens the App with inputs restored.

## PENDING user-ux (final sign-off)
- [ ] Watch a live latent animate in the **App's result pane** during an app gen (positive path — guard already verified).
- [ ] Full reuse matrix on real cards: app-card → App restored (survives restart via sidecar); normal-card → PromptBox unchanged (MPI-247 op re-assert intact); app-card with an uninstalled required model → routes to the App Library.
- [ ] Staged build (`BUILD_HASH !== 'dev'`) hides BOTH app entry points (Gallery radial + Landing nav).

## Deferred (explicit, not blockers)
- App overlay **UI design pass** (layout/style) — after the plan.
- A **2nd app** to fully exercise app↔app reuse routing.
- MPI-250 (mask-clear-on-history-reuse) is a SEPARATE card.

## Not committed
All Foundations→Phase 6 code + the docs/rules edits are uncommitted on branch 1.2.0. `operation_registry.json` hand-sync must be reconciled (not regenerated) at the next `/mpi-version-bump`.
