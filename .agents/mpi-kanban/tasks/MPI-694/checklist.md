# MPI-694 — checklist

Derived from `plan.md` (the two-flow design, 2026-09-05).

## Flow A — `Song` (MPI-664's flow, subtractive)

- [x] Retitle `Music Maker` -> `Song`; `id`, op key and `workflow` unchanged
- [x] `Input_Instrumental` (toggle) removed from the UI
- [x] `Input_Structure` (Song structure box) removed from the UI
- [x] Both ids dropped from `enhance.from` (it is also the cache key)
- [x] The two `disabledWhen` clauses and one `hiddenWhen` clause that pointed at the
      dead toggle removed
- [x] Enhancer recipe: the two Instrumental rules and the Song-structure branch stripped;
      **the "never invent a running order / no clock times" rule KEPT**
- [x] Graph left wired — verified it bakes `Input_Instrumental: false` and
      `Input_Structure: ""`, so the false arm runs and `Lyrics_Gate` stays in place
- [x] `label` and `filePrefix` follow the title (`Flow: Song` / `flowSong`)

## Flow B — `Sound & Music` (new)

- [x] `comfy_workflows/raw/flow_stable_audio.json` — 19 nodes, 24 links
- [x] Converted against the live bench and installed as `comfy_workflows/flow_stable_audio.json`
- [x] Op registered in all four files (`commandRegistry`, `operationRegistry`,
      `operation_registry.json`, `universal_workflows`)
- [x] `FlowDef` in `flowsRegistry.js` — no `steps`, four run-slide fields
- [x] Three dep entries in `assetDeps.js`, every sha256 verified against HuggingFace's
      `X-Linked-ETag`, every `size` derived by `computeDepHashes.py`'s own formatter
- [ ] 🔴 **The licence gate in `licences.js`** — see `plan.md` § Before release
- [ ] Preview graphics (`/mpi-flow-graphics`)
- [ ] A real Generate, on Fabio's press

## Verification

- [x] `node --test tests/inject-params-titles.test.cjs` — 23/23
- [x] `npm test` — 902/902
- [x] `npx playwright test --config=playwright.desktop.config.js tests/desktop/flow-*.spec.js`
      — 13/13, re-run after the last registry edit
- [ ] Fabio's ears on a run from the app
