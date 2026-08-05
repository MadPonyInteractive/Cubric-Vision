# MPI-404 — validation

Built 2026-08-05. Two halves on one card: the hero models slot (MPI-404) and the
Stage-all-models toggle (absorbed MPI-405).

## What the fix actually changes

The card's root trace said the count was "the untouched initial 0". Measured while
building: it is worse than untouched. `_localModelsCheck` (`routes/comfy.js`) does not
fail without an engine — `getCustomRoot()` returns null, `getDefaultModelsRoot()` points
inside an engine that was never provisioned, every dep stats absent, and the route
answers **HTTP 200 with every model not-installed**. `syncModelInstalled` then emits
`models:checked` with an empty set (the diff gate compares against `null` on the first
run, so the empty emit does go out), and the hero renders `0 / 18` from a real response.

That does not change the decision — it sharpens it. A 200 that looks exactly like a
measurement is why the display, not the counter, is where the honesty has to live.

## Evidence

| Check | Result |
|---|---|
| Probe: real `heroStats.js` loaded under Node with DOM/`fetch` stubs, `skipLocalEngine` on | boot → `—`; `models:checked []` with no engine → `—`; engine present + `[]` → `0 / 18`; 3 ids → `3 / 18`; engine gone again → `—`. **PASS** |
| `npm test` | 451 pass, 0 fail |
| `npm run test:desktop` | 17 pass |
| `tests/desktop/runpod-settings-extract.spec.js` (extended this card) | asserts that with no API key saved the AutoConnect / AutoRetry / **StageOnConnect** plates are all hidden and SkipEngine stays visible. **PASS** |
| Negative control on the same spec | the `_applyEnabled` line for StageOnConnect commented out → spec FAILS with `locator resolved to <div id="mpiSettingsRunpodStageOnConnectGroup">  - unexpected value "visible"`. Restored, re-ran, pass. The check can fail. |
| `npx eslint` on both edited files | 0 errors (5 `require-destroy-on-events` warnings — the pre-existing app-lifetime-listener class in this file, 4 of them predate this card) |
| `validate_board.py .` from the repo root | exit 0, `Board validation passed.` |

The probe is a throwaway (scratchpad, not committed): it stubs `localStorage`,
`document` and `fetch`, then imports the REAL `js/shell/heroStats.js` — so it also
proves the new `engineGate` import loads cleanly in the module graph, which is the part
that could have broken boot.

## Acceptance

1. **Decision honoured** — no app-level models root, no server change at all. ✅
2. **Hero does not read `MODELS 0 / 18` with the skip on** — renders `—`. ✅ (probe)
3. **Model Library coherent on a cloud-only machine** — already true before this card and
   verified by reading: `models:open` is gated by `blockedByNoEngine()` (`js/shell.js`),
   so the Library never opens onto an empty shelf; the user gets "No engine to generate
   with. Connect a Pod in Settings → RunPod, or turn off *Skip the local engine install*".
   That is the "states plainly why it cannot" branch. No code needed. ✅
4. **`extra_model_paths.yaml` still written from the stored root** — `routes/engine.js`
   step 6 untouched; it already honours `chosenModelsRoot` from the `/engine/download`
   body. ✅ (unchanged code, read to confirm)
5. **Both engine paths** — remote-connected makes `hasNoEngine()` false at rung 2, so the
   Pod volume's count paints exactly as before; local-with-engine unchanged. Only the
   no-engine state moved. ✅

## The one live check left to the user

Nothing here reproduces a genuine cloud-only first run, because this machine has a local
engine installed (so `hasNoEngine()` correctly returns false on it). On the real portable
extract, first run, RunPod escape hatch taken:

- the home hero's **models** slot reads `—`, not `0 / 18`;
- Settings → RunPod with no API key saved shows **no** "Stage all models on connect"
  switch, while "Skip the local engine install" is still there to turn back off;
- after connecting a Pod, the models slot shows the volume's real count.
