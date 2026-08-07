# MPI-473 Checklist

- [x] `commandExecutor.js` — drop `params['Preview_Only']`, compute `Video_Latent.is_preview` from payload, fix the 662/838 comments
- [x] `comfyController.js:1217-1235` — delete the unreachable guard + its `clientLogger.warn`
- [x] `generationService.js` — jsdoc (690-691) + the dead `Preview_Only` destructure (982-986)
- [x] Stale comments — `PromptBoxControls.js:322`, `MpiGroupHistoryBlock.js:1118`, `generate_h3.py:14`, `tests/resolve-model-deps.test.cjs:369`
- [x] Correct (not delete) the H3 gate claim — `models.js:1251`, `resolveModelDeps.js:233` → `Input_Video_Latent.is_preview` / `.is_continue` widgets
- [x] FOLDED IN — the twin `params['Is_Continue']`, dead by the same grep (0 JSON nodes), on the adjacent line
- [x] Verify (offline) — `npm test` 482/0, zero producers/consumers of the removed keys, live wire byte-identical
- [x] Verify (live) — user-verified in the app 2026-08-07: preview stops at preview, Continue resumes from the staged latent, warning gone from the console
- [x] Docs + rules — 11 live sites across 6 rule files and 5 docs (permission granted 2026-08-07); `docs/archive/` deliberately untouched
