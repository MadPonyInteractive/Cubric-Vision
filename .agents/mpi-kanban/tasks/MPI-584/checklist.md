# MPI-584 Checklist

Playbook: `docs/playbooks/add-flow/` (hub read first, sections on demand).

- [x] Shape decided — model flow (`requiredModels: ['ltx-23-balanced']`), one video slot + 3 run-slide fields, output `video`
- [x] Workflow read from the JSON, not from prior notes — `Input_Positive` / `Input_Video` / `Input_Sigmas` / `Input_Prompt_Strength` / `Input_Seed` / `Output_Video`
- [x] Op REUSED (`ltxVideoUpscale`) — no registration in any of the 4 files, no `appVersionIntroduced`, no version bump
- [x] `FlowDef` added in `flowsRegistry.js`; `requiredDeps` deliberately absent
- [x] Media role matches the op's `mediaInputs` key — `inputVideo`, not the siblings' `video1`
- [x] Controls DECLARED (`fields`), copied verbatim from the plugin's `upscale.fields`; every one mounts a Primitive (verified in the live DOM)
- [x] Case added to `tests/inject-params-titles.test.cjs` — covers the plugin surface too
- [x] `node --check`, eslint, `npm test` (631 pass), `release:check`
- [x] Live render verified on my own isolated instance (tile, availability, fields, mapping, empty-run guard)
- [x] Flow's playbook page written — `docs/playbooks/add-flow/existing-flows/ltx-upscale.md`
- [ ] **Fabio:** one real upscale through the Flow (media hop + gallery commit)
- [ ] **Fabio:** `/mpi-flow-graphics` — `flow-ltx-upscale.webp` + `.mp4`, cut from that run
      > **PAIRED WITH MPI-504 (Fabio, 2026-08-20).** The graphics for BOTH flows are one
      > session: this card's `flow-ltx-upscale.webp`/`.mp4` and MPI-504's
      > `flow-character-sheet.webp` + hero clip. Do them together in a single
      > `/mpi-flow-graphics` pass rather than one card at a time — they are the two flows
      > with no art, and they are the 404s in Fabio's console (neither is a bug). MPI-504's
      > handoff `state/handoffs/30b5a47a-dde7-4cf6-8c42-caeb68d37664.json` carries the full
      > context, including the throwaway project `MPI-504 sheet verify` that Fabio kept ON
      > PURPOSE as graphics source.
- [ ] **Fabio:** decide whether a frame/resolution cap gets its own card
- [ ] **Fabio:** dev gate — 4th flow now exists, the gate's stated trigger
