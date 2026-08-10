# MPI-519 Validation

Driven live in an isolated app instance (`npm run app:isolated`, port 50555, own
profile) through `playwright-cli`, on the dev component gallery — never the user's
:3000 session. Screenshots taken at 1440x900 and 520x900.

## Behaviour

| Check | Evidence |
|---|---|
| `show('installing')` opens on the choice phase | `[data-phase="choose"].style.display === "block"` after the gallery trigger |
| **Local + Remote** reveals the setup phase | `[data-phase="setup"].style.display === "block"` after `chooseLocal.click()` |
| **Back** returns to the choice | `[data-phase="choose"].style.display === "block"` after `backToChoose.click()` |
| **Remote only** keeps MPI-390's contract | `state.runpodConfig` went `enabled:false, skipLocalEngine:false` → `enabled:true, skipLocalEngine:true`, and `engine:install-skipped` fired (listener saw it) |
| Modal width follows the phase | 760px on choose, 520px on setup / progress / error, animated over `--t-base` |
| Cards collapse to one column | at a 520px viewport the grid is 1-up, `min-height` reserve suppressed below 620px |
| Browse and the path field are one row | row 38.19px, field 38.19px, button 38.19px (was 47 / 38.19 / 47) |

## Suites

- `npm test` — **546 passed, 0 failed** (16.9s).
- `npx eslint` on `MpiEngineInstall.js`, `js/pages/components.js`, `js/components/types.js`
  — clean.
- `npm run test:desktop` — **17 passed** (46.8s), including `popup-contract`,
  `runpod-settings-extract` and the four `workspace-sweep` specs.

The desktop specs release the boot gate with `Events.emit('engine:install-skipped')`
(`tests/desktop/workspace-sweep.spec.js` `releaseBootGate`, and the same shape in
`popup-contract.spec.js`), not by driving this modal's markup, so removing the old
`skipToRunpod` hatch cannot reach them. Grep confirms no test, doc or route referenced
`skipToRunpod`, `Let's Set Up ComfyUI`, or the hatch copy — the only remaining
`__hatch` user is MPI-427's repair escape on the error phase, which is untouched.

## Not exercised

The Install button still posts `/comfy/set-path` then `/engine/download`. That path is
unchanged (the edit was `size: 'lg'` → `size: 'md'`) and was deliberately NOT fired:
the isolated profile shares the default engine root, so pressing it would have
started a real multi-GB engine install against the user's engine.

Progress and error phases were rendered by hand (phase display + a mounted
`MpiProgressBar` + `errorMessage` text) rather than by a real `/engine/upgrade` POST,
for the same reason. Both were checked visually for the left-alignment change only.
