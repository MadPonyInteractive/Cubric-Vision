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
  localStorage.
- **DO NOT read this as a bug (confirmed by the MPI-451 session, 2026-08-06):**
  acceptance receipts are filed under the **LICENCE id**
  (`minimax-h3-cla-2026-08-02`), NOT the model id. So accepting while installing
  fl2va ALSO satisfies **ref2va** — the second install runs straight through with no
  dialog. That is deliberate: the licence binds the person, so re-showing the identical
  25 clauses for the other variant of the same agreement buys no consent. Two models
  under genuinely different licences still get two dialogs. The receipt carries
  `acceptedVia` so you can see which install prompted it.
- The model detail drawer now carries a standing **LICENCE row** (licence name, Read the
  licence, Request authorization, Report misuse) for any model with a descriptor, so H3
  gets it the moment the ModelDef lands. **This may already discharge the "licence text
  ships and is reachable in-app" acceptance criterion** — decide whether that obligation
  needs the text bundled OFFLINE or whether linking the HF blob satisfies it. It is
  MPI-452's criterion, so it is MPI-452's call.
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
- **i2v ASPECT — raised 2026-08-06, then CLOSED the same day as a non-issue. Do not
  re-open it from the MPI-449 research.** That research (line 377) is correct about the
  node: in `MiniMaxH3ImageToVideo.execute`, `first_frame` gets `_resize(..., "disabled")` —
  a plain stretch the upstream comment calls a "geometry anchor" — while `last_frame` gets
  `"center"`. It concluded MPI-452 must fit the first frame before dispatch. **The shipped
  graph already does**, which the research predates: nodes **218** and **220**
  (`ImageResizeKJv2`, `keep_proportion: crop`, `crop_position: center`, `divisible_by: 32`)
  sit in front of BOTH frame paths and take `width`/`height` from `["167",0]`/`["168",0]` —
  the same pair feeding every H3 node's canvas. So each frame reaches the node already at
  canvas size and the node's stretch is W×H → W×H, a no-op.
  The one way it could come back is a canvas the resize cannot hit exactly, so that was
  checked too: all **15** entries in `MINIMAX_H3_RATIOS` are divisible by 32, matching both
  `divisible_by: 32` on the resize nodes and `CANVAS_MULTIPLE = 32` in the node itself.
  No mismatch is reachable. **Do not add app-side aspect fitting** — it would crop twice.

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

**Three of four written and verified 2026-08-06 12:36Z.** The agreement was re-read
verbatim rather than recalled (`MiniMaxAI/MiniMax-H3/raw/main/LICENSE`, 17,604 bytes);
the per-clause table is now in `docs/models/h3/README.md` § What each clause actually cost
us. Most of §III turns out to be *encouraged*, not owed.

- [x] **The licensor's verbatim NOTICE string** (§III.4) — `licences/minimax-h3/NOTICE.txt`,
      copied from the agreement's own line 33, not retyped:
      `MiniMax H3 is licensed under the MiniMax H3 Community License Agreement, Copyright © 2026 MiniMax. All Rights Reserved.`
      §III.4 strictly binds a *distributor* and we distribute nothing (publisher URLs), so
      this is belt-and-braces — it costs one file and removes the argument.
- [x] **Licence text reachable in-app — BUNDLED, and the "link vs bundle" question is
      settled by the licence, not by preference.** §III.1: "provide a copy of this
      Agreement to all such Third Parties who receive the MiniMax H3 Works **or use your
      products or services related thereto**". That second half reaches every Vision user
      who runs H3, and linking huggingface.co *names* a copy rather than providing one.
      `licences/minimax-h3/LICENSE.txt` is byte-identical to what the publisher serves.
      So the detail-drawer LICENCE row alone did NOT discharge the criterion — it does now
      that its link resolves to the bundled copy.
- [x] **"Powered by MiniMax H3"** — `poweredBy` on the descriptor, rendered in the Model
      Library detail drawer beside the licence name. Encouraged by §III.3.a, mandatory-ish
      via §IV.2, and committed to in our authorization request regardless.
      **Placed on the MODEL, not on Vision** (user's call, and the better reading): §III.3.a
      scopes the notice to a product "developed using MiniMax H3", which is the model entry.
- [ ] A better card preview clip. The shipped one is the previous session's test render
      ("neon-lit rain-slick street", 2.33 s, low tier) — real H3 output, so not
      misrepresentative, but 56 frames is BELOW the 124–362 trained range. Folds into the
      generation pass below, which needs a run anyway.

Proved, not assumed:

| Claim | How |
|---|---|
| Both files are served by the REAL server | Booted `server.js` on `CUBRIC_PORT=3977`; `LICENSE.txt` 200 / **17,604 bytes** / `text/plain`, `NOTICE.txt` 200 / 121 bytes. Not a harness — the actual middleware order |
| The bundled copy is the publisher's bytes | Byte count identical to the fetch; served line 33 matches NOTICE.txt exactly |
| A root-relative `licenceUrl` opens | `openExternal` now resolves against `location.href`; `/licences/…` → `http://127.0.0.1:<port>/licences/…`, both existing `https://` URLs unchanged. Port is NOT hardcodable (`CUBRIC_PORT`, MPI-448) |
| It ships in the portable | Ran the real `shouldExcludeAppPath` from `scripts/build-portable.mjs` over all four paths — all `shipped`. `APP_COPY_EXCLUDES` is a denylist and `licences` is not on it |
| Suite still green | `npm test` — **459/459** |

`tests/licence-gate.test.cjs` pinned `licenceUrl` to `/^https:\/\//`, which is exactly the
assumption §III.1 overturns; it now accepts a root-relative path **and stats it on disk**,
because a typo'd bundled path would open a 404 and silently discharge nothing.

**Still needs eyes in the app** (folds into §1 below): that the `Powered by MiniMax H3` row
actually renders in H3's drawer, and that "Read the licence" opens the bundled text.

### 5c. Test setup in place — RESTORE THIS when the pass is done

`minimax_h3_audio_vae_fp32.safetensors` (605,254,808 B, the smallest of the four H3 weights
by an order of magnitude — next is 5.21 GB) was **moved, not deleted**, out of
`G:\CubricModels\vae\` so H3 reads as not-installed and the licence gate can be exercised
for a 0.61 GB download instead of 53 GB. If the download is not being tested, restore it:

```powershell
Move-Item -LiteralPath 'C:\Users\Fabio\AppData\Local\Temp\claude\c--AI-Mpi-Cubric-Vision\dfdc1838-4937-48a2-aa47-1a90ab653c2b\scratchpad\minimax_h3_audio_vae_fp32.safetensors' -Destination 'G:\CubricModels\vae\minimax_h3_audio_vae_fp32.safetensors'
```

The scratchpad is session-scoped, so once a real download has replaced the file the copy
there is disposable. Step-by-step runbook for the whole pass: `checklist.md`.

### 5b. Apps built on a gated model — a gap, deliberately not closed

The acceptance gate is free for apps (it lives in `downloadService.start()`, which every
install path funnels through). **The standing licence row is not** — `MpiAppLibrary`'s
drawer has no equivalent of `MpiModelManager`'s `#detail-licence-row`, so an app built on
H3 would show a user no attribution and no route to the agreement. No app uses H3 today, so
this is documented rather than built: `docs/playbooks/add-app/01-descriptor-and-ops.md`
§ "A GATED model in `requiredModels`…". Both drawers already share the `.mpi-detail__*`
classes, so the markup ports directly when one is needed.

> **Rename pending:** "App"/"App Library" is being renamed repo-wide by a parallel agent.
> That playbook block was written 2026-08-06 ~12:33Z and may postdate the sweep's scan.

## Known non-blocking observations

- `getModelRatios('h3')` defaults to the `medium` tier (640x640) while the ratios.js
  comment calls `low` (864x480) the natural default. Not a bug — the app's default tier
  is its own concept — but worth a look when the tier radio is first used.
- Concurrent generations would both write the stage-1 latent to the same baked filename
  (`mpi_stage1_2`). Harmless today because the app collects the latent from `/history`
  right after the run and lanes are serial, but it is a real race if parallel lanes
  ever land.
