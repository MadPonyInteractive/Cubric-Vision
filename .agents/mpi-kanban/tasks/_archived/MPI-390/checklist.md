# MPI-390 Checklist

- [x] `skipLocalEngine` default in `js/core/storage.js` — **plus the `normalizeRunpodConfig` whitelist entry**, which the default alone does not cover
- [x] Boot gate branch + `engine:install-skipped` resolution in `js/shell.js`
- [x] Hatch + direct RunPod video link on the MpiEngineInstall setup phase
- [x] BEM styles for the hatch
- [x] Re-arm toggle in MpiRunpodSettings
- [x] No-engine gate on project entry (`_blockedByNoEngine` in `js/shell/projectUI.js`), both call sites
- [x] Automated checks: `node --check` + eslint clean on all 5 files; suite 279/279 (275 baseline + 4 new); new test negative-controlled
- [x] Gate on the three landing-page doors (project entry, Model Library, App Library) via the shared `js/services/engineGate.js`
- [x] Re-arm: toggling the skip OFF raises the install modal immediately; pressing Skip on it flips the switch back ON
- [x] Verify (user-ux) — **user-verified in the app 2026-07-30**
