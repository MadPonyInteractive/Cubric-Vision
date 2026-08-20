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
- [x] **Fabio:** one real upscale through the Flow (media hop + gallery commit) — DONE, seven
      of them in the `cowboys` project on 2026-08-20. `ltxVideoUpscale_002` is the one the art
      is cut from: sidecar `flowId: 'ltx-upscale'`, role `inputVideo`, denoise 0.675, source
      `ref2v_ms_005.mp4` 864×480 → 1728×960, audio through.
- [x] **Fabio:** `/mpi-flow-graphics` — `flow-ltx-upscale.webp` (70 KB, 896×1120) + `.mp4`
      (1.38 MB, 1280×720, 4.14 s), cut from that run.
      > SOURCE↔RESULT PROVEN BEFORE BUILDING, per the playbook: `psnr` of the source scaled 2x
      > against the result reads **y 26.3 dB** — the same shot re-rendered (a re-encode lands
      > 30–42, a different clip under 15).
      > THE WIPE IS AN ALPHA MASK, NOT `xfade`. `xfade` shifts B by `offset`, so on moving
      > footage the wagon appears twice either side of the seam; and a growing `crop` width does
      > not animate (only `x`/`y` are per-frame), which renders the full frame and exits 0. Both
      > now in playbook 06's trap table.
      > Full-frame at 446 px read as "nothing happened" — the shipped crop is punched in on the
      > driver, chosen off stacked before/after stills at the real hero width.
      > LIVE-VERIFIED: both assets 200 with exact byte counts; hero `paused:false` `muted` `loop`,
      > `currentTime` rising, measured 444 px wide.
      > **PAIRED WITH MPI-504 (Fabio, 2026-08-20).** The graphics for BOTH flows are one
      > session: this card's `flow-ltx-upscale.webp`/`.mp4` and MPI-504's
      > `flow-character-sheet.webp` + hero clip. Do them together in a single
      > `/mpi-flow-graphics` pass rather than one card at a time — they are the two flows
      > with no art, and they are the 404s in Fabio's console (neither is a bug). MPI-504's
      > handoff `state/handoffs/30b5a47a-dde7-4cf6-8c42-caeb68d37664.json` carries the full
      > context, including the throwaway project `MPI-504 sheet verify` that Fabio kept ON
      > PURPOSE as graphics source.
- [x] **Fabio:** decide whether a frame/resolution cap gets its own card - NO CAP, closed
      2026-08-20. His words: the user hits OOM, he knows his card cannot handle it, it is that
      simple. The description already warns that cost grows with length. Do not re-open this as
      a card; the ceiling is documented in MPI-579 validation Phase 5.
- [x] **Fabio:** dev gate — REMOVED ENTIRELY, 2026-08-20. Flows ship to users in the next
      release, so this stopped being a per-card question. Carried by MPI-589, with the
      quick-access button and the Tab cycle.
