# MPI-259 — Apps v2 (follow-ups to MPI-256)

MPI-256 shipped Apps v1 (dev-gated): App Library overlay, MpiBaseApp frame, first app (Image Regen, single model sdxl-nsfw), run→gallery-card, reuse-reopens-app, in-app result + latents. See `docs/apps.md` + MPI-256 card.

## Deferred here (v1 explicitly did NOT do these)
1. **Install-an-app flow** — App Library "Install models" button end-to-end (drives each missing model's `downloadService.start`; badge flips Get-models→Ready; then Open). Wired but not exercised.
2. **Uninstalled-app path** — an app whose required model is absent: badge, detail install state, submit-guard warning, reuse routing to Library. Logic verified headless, not live.
3. **Multi-model apps** — an app with 2-3 `requiredModels`: availability = all installed; Install drives all; per-model rows in the detail slide-over.
4. **App overlay UI design pass** — layout/style (MpiBaseApp + MpiAppLibrary + MpiAppImageRegen). Currently minimal/functional. Follow the Stage design baseline.
5. **2nd app** — to fully exercise app-to-app reuse routing (v1 could only test one app).
6. **Remaining pending-ux from MPI-256** — staged-build (`BUILD_HASH!=='dev'`) hides BOTH entry points; full reuse matrix on real cards (app-card restore survives restart; normal-card PromptBox unchanged; uninstalled-model app routes to Library).
7. **Install progress bar** — the App Library detail Install button drives `downloadService.start` but has no live progress feedback in-app. Show install progress (mirror the Model Library's `_patchTile`/tile-progress + `download:progress` pattern) so the user sees the model downloading, then the badge flips to Ready/Open. Applies to both single- and multi-model apps.
8. **Verify install from BOTH entry points** — the App Library is reachable from the **Landing (project page) nav** AND the **Gallery radial**. Confirm the install flow (Install → progress → Ready → Open) works identically from both; the Open button is Gallery-only (disabled + toast on Landing), so from Landing the user installs then must go into a project to Open — verify that hand-off reads sensibly.

9. **Audio + video inputs** — v1 MpiBaseApp has ONE image upload slot only. Support apps whose `inputSchema` declares audio and/or video source inputs (BaseApp upload slots per declared type; `uploadMediaFile` already handles video; audio path TBD). Mirror the op's `mediaInputs` title mapping (`Input_Audio`/`Input_Video`).
10. **Multi-output apps** — some apps produce MULTIPLE images or videos from one Run (batch). Handle N results: N gallery cards (the queue/placeholder path already supports `extraTempIds`/`extraPlaceholders`), and the in-app result pane showing all N (not just the first). Reuse must restore correctly for multi-output cards.

## Open (user will remember more)
User flagged there are likely MORE fixes not yet recalled — treat this list as a living backlog; add items as they surface before starting the plan.

## Notes
- Dev-gate (`APP_CONFIG.dev_mode`) stays until >=4 apps exist (user decision) — this card likely adds apps 2-4.
- `operation_registry.json` is a hand-maintained superset (never regenerate) — new app ops hand-added.
- Add-an-app checklist lives in `docs/apps.md`.
