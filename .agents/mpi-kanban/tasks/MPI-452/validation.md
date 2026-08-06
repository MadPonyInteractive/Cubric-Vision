# MPI-452 — validation

Code is written and committed (`bb50b55e`). **Everything below the line was proved
against the ENGINE directly (port 48188), not through Vision.** The app layer is
entirely unverified, which is why this card is `validating` and not `complete`.

## Proved — 2026-08-06, local engine 0.30.0

| Claim | How |
|---|---|
| Engine bump is safe for existing models | All **167** class_types used by every shipped runtime workflow register on 0.30.0, 0 missing; all 14 node pins unchanged |
| `python_deps.txt` regeneration is a no-op | Regenerated against v0.30.0 constraints — only the constraint filename changed, no package version moved |
| The shipped H3 graph is valid | `POST /prompt` accepted `minimax_h3_fl2va.json` with no validation error |
| t2v produces video AND audio | Output mp4 = `h264 864x480 24fps` + `aac stereo 32000 Hz`, one sampler pass |
| Frame grid | 56 frames for a 2 s request (17x3+5, 2.33 s) — `MpiH3Length` snapping correctly |
| Two-stage works in one file | single 145 s / 2 bars, preview 54 s / 1 bar, stage2 98 s / 1 bar |
| The lazy `enabled` gate really skips stage 1 | The stage2 run emitted **no latent** and **only** the 15-step bar |
| Preview gating | preview run emitted `Output_Preview` + latent and **no** `Output_Video` |
| The latent handshake the app needs | Live round trip: save reports `ui.latents` -> `/view` serves it -> staged into engine `input/` -> `MpiLoadLatent` finds it -> re-saved |
| Dep bytes are the bytes users get | All 4 publisher URLs return 200 with content-length **identical** to the local files whose sha256 is in the registry |
| Loader paths match deps | Every `unet_name`/`clip_name`/`vae_name` in the runtime graph resolves to a declared dep |
| ModelDef resolves | `type: 'h3'`, 5 deps all resolving, both workflow files exist, preview asset exists, no duplicate model id |
| Licence gate binds | `MODEL_LICENCES['minimax-h3']` -> `minimax-h3-cla-2026-08-02`, territory-restricted |
| Ratio ladder | mode `quality`, 5 tiers, resolves through `BUILTIN_RATIOS.h3` |
| Regression on the node_lock bump | User ran klein_t2i and qwen_edit in the app and confirmed both work with the now-lazy `MpiBlocker` |
| Suite | `npm test` — **459/459 pass** |

---

## NOT proved — this is the whole remaining scope

### 1. Install through the app (the licence gate's first real exercise)
- H3 tile appears in the Model Library with the right size/VRAM figures (the trade
  table is computed from dep `size` strings — check it reads sanely, ~53 GB of weights).
- Clicking install shows **MpiLicenceGate** BEFORE any byte downloads, the restrictions
  pane scrolls, and accept is required.
- To re-show the dialog after accepting: clear `mpi_model_licence_accepted` in
  localStorage (contract supplied by the MPI-451 session).
- The download resolves from the **publisher** URLs, not `models.cubric.studio`. Watch
  for a mirror-rewrite attempt — there should be none, because `_mirrorUrlsFor` only
  rewrites URLs under the R2 path prefix.
- **The weights are already on `G:/CubricModels`**, so a fresh download is not needed to
  test generation — but it IS needed to test the gate. Consider testing the gate against
  a deliberately-removed file, or accept that the gate fires and skip the 53 GB pull.

### 2. Generate through the app
- t2v and i2v both dispatch. i2v = the same graph with `Input_Start_Frame` filled; there
  is no op boolean, so confirm the app's media injection actually populates that node.
- **Injection silently skips a title that matches no node.** Confirm `Input_Duration`,
  `Input_Width`/`Input_Height`, `Input_seed`, `Input_Positive` and the six
  `Input_Lora_*` slots all land. A wrong-but-plausible video is the failure mode.
- Progress bar reads `1/2` then `2/2` on a single run (`PROGRESS_STAGES` says
  `single: 2`).
- **The app prunes nothing; the browser prunes muted nodes.** This graph was authored on
  the bench, so watch for a node that only worked because the browser dropped it.

### 3. Preview -> Continue through the app
This is the piece most likely to break, because it is the only path that exercises the
`a6e5d5e` node change through the app's own staging rather than my round-trip harness:
- Preview run produces a preview card.
- The app COLLECTS the latent from `/history` (needs `ui.latents` — the new bit).
- Continue stages it into engine `input/` under a per-run name and stage 2 loads it.
- The finished video replaces or accompanies the preview correctly in the gallery.

### 4. Gallery handling of video+audio
H3's audio is muxed INSIDE the mp4 rather than arriving as a separate `audio` output
(LTX's shape). Confirm the gallery plays sound and that nothing tries to mux a second
time on save.

### 5. Remaining deliverables (not verification — unwritten work)
- The licensor's verbatim **NOTICE** string.
- **"Powered by MiniMax H3"** attribution on the product surface.
- Licence text reachable in-app (MPI-451's gate LINKS the HF blob; confirm that
  satisfies the acceptance criterion or bundle the text).
- A better card preview clip. The shipped one is this session's test render
  ("neon-lit rain-slick street", 2.33 s, low tier) — real H3 output, so not
  misrepresentative, but 56 frames is BELOW the 124–362 trained range.

## Known non-blocking observations

- `getModelRatios('h3')` defaults to the `medium` tier (640x640) while the ratios.js
  comment calls `low` (864x480) the natural default. Not a bug — the app's default tier
  is its own concept — but worth a look when the tier radio is first used.
- Concurrent generations would both write the stage-1 latent to the same baked filename
  (`mpi_stage1_2`). Harmless today because the app collects the latent from `/history`
  right after the run and lanes are serial, but it is a real race if parallel lanes
  ever land.
