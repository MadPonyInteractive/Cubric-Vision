# MPI-663 — validation

## Live app run (2026-08-30, agent instance on :55689, GPU lease held)

Everything below ran in an isolated `npm run app:isolated` instance
(`CUBRIC_MODELS_ROOT=G:/CubricModels`), against project `MPI-663 Stems Probe`, on
`D:\WORK\Images\Outputs\audio\audio_minimax_music3_00008.mp3` (40s). The user's `:3000`
session was not driven.

**The node pack was NOT in the app engine — only ever on the bench.** `GET
127.0.0.1:48188/object_info/AudioSeparation` returned `{}` before the run. The boot's UW
deps repair installed it on the agent instance's first launch (zip → `custom_nodes/`,
`.mpi_node_commit` stamped), so the shipped path works; but the engine then needed a
restart to register it, and **an attached instance cannot restart the engine it did not
spawn** — `/comfy/stop` succeeds as a no-op. The route that works is
`POST /comfy/start {"isUserRestart": true}`, which writes the restart request the owning
instance picks up (MPI-484's delegation). After it, `/object_info/AudioSeparation` was
populated.

| Check | Result |
|---|---|
| Run 1 — all four stems, `combine: false` | ok, 36.3s wall / 4.4s generation |
| Four cards land | 4 audio groups, one item each |
| Per-card naming | `Bass_001` / `Drums_001` / `Other_001` / `Vocals_001`, flac, from each save's `filename_prefix` |
| Cards play | all four decode in a real browser `Audio()` — 40.00s each |
| Run 2 — drums+vocals, `combine: true` | ok, ONE card `flowStems_001.flac`, named for the op |
| Combined card plays | decodes, 40.00s |
| The clip trim fired live | `ffmpeg mix: sum peaks +0.71dB over full scale, trimming to fit` → `volume=-0.705dB`; the written file measures 0.00 / -0.07 dBFS per channel in float |
| Last selected stem locks | with Bass/Drums/Other off, the Vocals button is `disabled` and stays `is-active` |
| Combine greys below two stems | `disabled` at one stem; enabled again the moment a second is on |
| Flow Library opens clean | 0 console errors, 0 warnings — the FlowDef declaring no `preview`/`video` 404s nothing |

Screenshots: `.playwright-cli/page-2026-08-30T20-22-33-713Z.png` (all four on) and
`…T20-23-04-629Z.png` (one stem left — Vocals locked, Combine greyed).

**USER SIGN-OFF, 2026-08-30.** Fabio listened to the four stems and the combined track in
the app and looked at the tile and hero in the Flow Library — approved, no changes. That
closes the `user-ux` half, and the card with it.

## The art (2026-08-30)

`flow-stems.webp` 896×1120 / 96,562 B and `flow-stems.mp4` 1280×800 / 233,590 B, both
declared on the FlowDef and both serving 200 at those byte counts. The hero was proven
PLAYING in a live instance rather than merely present in the DOM: selected by `currentSrc`
(not `querySelector('video')` — an open project mounts several), `paused:false`, `muted`,
`loop`, `currentTime` +0.90s over 900ms, `getBoundingClientRect().width` 444px, poster =
the tile. Loop seam measured at **0.07/255 mean channel diff** between first and last frame.
`npm test` 815 pass; `tests/desktop/flows-tab-ring.spec.js` 4 pass — the spec that caught
the early art declaration is green with the art now real.

## Bench evidence (earlier in the card)

See `plan.md` § Completed and `checklist.md` § Verified — amix `normalize=0` measured at
+6.0 dB, the subset-sum overshoot table, and why the null test against the original was
discarded.
