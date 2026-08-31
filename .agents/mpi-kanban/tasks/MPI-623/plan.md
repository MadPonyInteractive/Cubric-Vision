# 3D scene generation - bake a navigable splat scene, re-enter it to shoot stills

Design approved 2026-08-26. Full rationale in [brief.md](brief.md). Investigation
notes in [research/](research/).

## Current State

> **Session note 2026-08-29 (handoff).** **Phase 0 is COMPLETE and its gate PASSED** -
> Brush trains SplatKit's COLMAP output and a held-out eval view at 5000 steps is
> unmistakably the source room. Tiers measured (Draft 5000 / Scene 30000). Amendments
> 6-10 below are new and supersede parts of decisions 2 and 3. Evidence:
> [research/phase0-log.md](research/phase0-log.md),
> [research/measurements.md](research/measurements.md), and the Phase 0/0b ticks in
> [checklist.md](checklist.md).
>
> **Session note 2026-08-29 (second handoff). PHASE 0b IS ALSO COMPLETE.** The Wan
> 4-rail bake finished (2h18m) and stopped deliberately on `on_split='stop'`; re-queued
> with `on_split='largest'` for 585s against the live bench cache. Brush re-run: 44.8min,
> 1,641,469 splats, 387MB, growth still freezing at 15000. **The scene is a room** -
> verified by held-out eval views, not by exit code. Amendments 11-14 are new. Committed
> as `850cae78` and `ce884943`.
>
> **Session note 2026-08-29 (third handoff). NO NEW MEASUREMENT - a REVISION.** Fabio
> pushed back that the bake looked far worse than the source video. Watching that video
> against the graph that actually ran found the cause: the four rail anchor strings are
> byte-identical to the shipped workflow defaults, i.e. paths Mickmumpitz hand-piloted for
> his village, flown unchanged through an interior. Amendments 15-17 and a revised Phase 2
> follow from that; measurements.md now warns that its QUALITY observations measure a
> mis-piloted bake while its COST numbers stand. Committed as `08ea0860`.
>
> **Session note 2026-08-29 (fourth). PHASE 1 IS COMPLETE - and it was a tenth of the
> written size.** Revisiting decision 2 against amendment 6 against the actual code
> collapsed it entirely: `'splat'` is NOT a media type, a Scene card is `type: 'image'`
> with a `splatPath` field, and NONE of the ~50 media-type branch sites needed touching.
> Two plan facts turned out to be wrong and are corrected below: **Vision has no zip
> export at all** (`routes/projects.js:1491/1552` is the derivatives backfill, not an
> export loop), and the `.ply` belongs in `.meta/` on the existing item-companion
> convention rather than in `Media/`. Four files changed, 791/791 tests green.
>
> **Phase 1's `user-ux` check is DEFERRED INTO PHASE 2, by Fabio's decision.** It is not
> blocking: Phase 2 depends on the Phase 1 *contract* (`splatPath` on an image item,
> `.meta/<id>.splat.ply`), which is landed and unit-tested. Checking it now needs
> hand-surgery on a sidecar to fake a Scene card; once Phase 2 emits a real one the same
> five checks happen for free inside Phase 2's own verification. **Do not tick Phase 1's
> last box until that happens.** One gap is worth closing sooner than that and needs no
> app: `add-from-cards`'s splat copy is asserted from SOURCE TEXT only, never executed -
> and its failure mode is a copied card silently pointing back into the source project.
>
> **Session note 2026-08-29 (fifth). The last no-GPU gap is CLOSED.** The
> `add-from-cards` splat copy is now a real executed test - router mounted, POST driven,
> destination sidecar read back - and both its branches were watched go red before being
> believed (amendment 21). 793/793, lint clean, `routes/projects.js` byte-identical.
> **The `## Parallel Batch`'s task 1 is now AUTHORED** - `MpiBrushTrain` in
> `c:\AI\Mpi\ComfyUi-MpiNodes\splat.py`, following that repo's own `new-node.md` inline.
> **Committed and pushed there by the MPI-575 agent, not by this session** - it swept
> both sets of changes into `5e07043` while this session was still writing. Verified
> afterwards that nothing was lost: changelog line present, all three `__init__.py`
> registrations, both bug fixes, `bin/` ignored, `check_splat.py` green on the committed
> tree. Vision's half is `6a65e7ec`. It is NOT bench-verified: that needs the GPU. Amendment 22 has
> the CLI corrections and the two bugs the self-check caught; **amendment 23 is an open
> question for Fabio** about publishing a binary-downloading node to a registry whose
> `latest_version` is still stuck. **Next when the GPU frees: run a graph containing only
> `MpiBrushTrain` against the Phase 0 dataset** (`G:\MPI-623-spike\`, binary already
> extracted at `G:\MPI-623-spike\brush\extracted\brush_app.exe`, so pass it as
> `brush_path` and skip the download). Batch task 2 (dep declarations + R2 uploads) is
> untouched and needs Fabio - it uploads multi-GB weights.
>
> **Session note 2026-08-29 (sixth). THE BENCH RAN. Batch task 1 is CLOSED, and the rail
> question is ANSWERED - with a correction to amendment 15.** `MpiBrushTrain` trained the
> Phase 0 dataset end to end (2000 steps, 23 s, `export_2000.ply`), and all three unproven
> assumptions held: the progress bar moves, the staged single-model root is what Brush
> consumes, and a cancelled prompt really does kill `brush_app.exe` - amendment 24.
> **Then the queued rail check, and it did not go as amendment 15 predicted.** The room was
> measured (horizontal radius p90 2.77; the shipped rails reach 2.95 and 2.60, so they DO
> leave it) - but scaling them x0.5 to fit still split SfM into 2 models. What merges it is
> a **shared look target**: same rails, `look_at_target` instead of `look_forward`, one
> model, 912 images. **That is Phase 2's preset rule** - amendments 25 and 26.
>
> **GPU: the bench ComfyUI on 8188 was launched under `gpu_lease.py run --`, which is how
> MPI-659's gap gets covered** (`guard-gpu` matches nothing for `brush_app.exe`, so the
> lease has to be taken by hand). Kill that process to release it.
>
> **Next:** batch task 2 (dependency declarations) is untouched and needs Fabio - it uploads
> multi-GB weights to R2. Task 3 (pin `5e07043` in `node_lock.json`) runs after it. Phase
> 1's `user-ux` box still stays unticked until Phase 2 emits a real Scene card.

> **Session note 2026-08-29 (seventh). THE BATCH IS RE-ORDERED - quality gates the uploads.**
> Fabio pushed back on task 2: nothing goes to R2 before a bake has been looked at. Correct,
> and task 2 is parked until then. Two findings that move the work: **task 3 is already
> done in the file** - `node_lock.json` carries MpiNodes `5e070436` from `6c35be5b` (the
> MPI-575 agent), so only its `**Verify:**` remains, and it is no longer gated by task 2.
> And **amendment 27**: the amendment 26 merged dataset trained at Draft in 30 s and its
> held-out renders are the room across the whole 0->160 range with no island gap. That
> proves the merge, not the look.
>
> **Next: the Wan re-run with the amendment 26 piloting** (scaled rails + `look_at_target`),
> which is the run that judges quality. **Fabio's decision: download Q4_K_M and run the test
> on it. fp8 is only reconsidered if Q4's hole-filling is wrong** - the thing being judged is
> whether Wan fills the unseen black regions correctly, NOT how sharp it is, because per
> amendment 28 the resolution comes from the HiRes composite after Wan, not from Wan. **G: has 5.6 GB free - the
> GGUF weight goes to `C:\AI\diffusion_models\` (131 GB free), which `ComfyUI-GGUF` does
> list: `unet_gguf` aliases to `diffusion_models` (`nodes.py:32`).** The bench on 8188 is
> Fabio's own instance (PID 3784) - use it, do not spawn another.

> **Session note 2026-08-29 (eighth). THE Q4 QUESTION IS ANSWERED - YES - AND THE RAILS WERE
> NEVER MICKMUMPITZ'S.** The GGUF landed (11 341 184 384 bytes, sha256 `ffecd91e…42a4`, both
> verified) and the amendment-26-piloted bake was queued - then its rail 1 came back **not a
> panorama**, with known-pixel correlation collapsing from +0.996 at frame 0 to -0.046 at frame
> 2 (amendment 31). Fabio called it on sight. Diffing `ds.json` against every working file
> found why: **the shipped rails already converge** (`look_at_target` / `per_point_look`) and
> our files carry `look_forward` with altered anchor positions - amendment 30, which unseats
> amendment 15's premise and re-frames 25/26. Restoring rail 27's shipped piloting fixed it
> completely: correlation 0.86-0.93 across all 81 frames, 99.91% of holes filled, a clean
> equirect, 29 min on Q4 - **amendment 32. fp8 is NOT needed and batch task 2's tier choice is
> answered on quality.** The interrupted run cost ~40 min of GPU and nothing else; `POST
> /interrupt` only, the bench was never killed, and **nothing went to R2 - task 2 stays parked.**
> Also found and fixed: the positive conditioning was wired to the NEGATIVE encode in every
> flattened graph, and at `cfg=1` that was the only thing steering the sampler (amendment 29).
>
> **Next, and it is a FORK, not a continuation:** Fabio found
> <https://fix-anything.github.io/> and wants it read BEFORE any more bake work - it may do the
> hole-filling job better than Wan does. **Read the paper first and give a verdict.** If it is
> not worth it, the continuation is the full four-rail bake with the shipped piloting restored
> on ALL four rails (~2.5-3 h) through composite -> SfM -> Brush Draft -> eval renders. If it
> is, we may implement it INSTEAD of the current Wan approach. Do not start the four-rail bake
> before that verdict.

> **Session note 2026-08-30 (ninth). THE FOUR-RAIL BAKE IS DONE, AND FIXANYTHING WAS
> DECLINED.** The fork resolved first: FixAnything (CMU, ECCV 2026) is a rank-64 LoRA on
> Wan2.1-I2V-14B-**480P** with video-to-video conditioning, 832x480, trained on perspective
> DL3DV renders. **Verdict: do not switch** - amendment 33, whose first reason Fabio pushed
> back on and which is withdrawn as overstated. It rests on the total absence of
> equirectangular support, with resolution / base weight / no-ComfyUI as cost. Parked as a
> **Phase 3** lever on post-Brush eval renders, where it is in domain.
>
> Then the bake, split into **six GPU leases** so Fabio kept the card between pieces
> (amendment 35) - the SplatKit nodes support it directly, `DatasetProject.reset` being
> documented resumable and `HiResComposite` being an `output_node`. All six `success`:
> four rails at 34.8-37.0 min, SfM 20.5 min, Brush Draft ~1 min -> **53.3 MB splat**.
> **Amendment 11 is superseded on its central claim** - the four rails MERGE into one model
> with the shipped piloting; the rails that split were the altered ones. Held-out eval
> (amendment 37): rail 27 excellent, rail 144 soft, **rail 122 carries a real hole** where the
> splat renders through a missing wall - verified by a pairing check, not assumed.
> **Amendment 38 is the trap worth carrying forward:** `hires_N` is JSON content, not a path,
> and a wrong string falls back to single-res SILENTLY - the first merge returned `success`
> having ignored the 8192 composites entirely.
>
> **Fabio's calls this session:** rail 122's hole is **Phase 2 work**, not chased now. Rail
> 157 (the fifth rail `ds.json` ships and no working file ever had) is **not blocking** and
> needs no decision - it costs ~1 h to add later (37 min bake + SfM + Brush) and matters as a
> **Phase 2 coverage input** when the canned presets are authored. Task 2 stays parked and
> nothing went to R2.

> **Session note 2026-08-31 (tenth). THE PUSH BLOCK IS GONE AND RAIL 157 IS BAKED.**
> The previous handoff's one live item closed itself: another agent fixed master's red
> (`41d1c62a`, MPI-665) and CI run `33379558218` is **green**, so the five docs commits
> are on the remote and **no decision was ever needed**. Fabio then freed the GPU for an
> hour, so rail 157 - the fifth rail `ds.json` ships and no working file ever had - was
> baked: `chunk6_rail157.json`, **success in 34.3 min**, `traj04` at 41 frames and
> 8192x4096 composites (amendments 40, 41). It has the **highest correlation floor of the
> five** (0.903-0.941) with mid-pack holes, though amendment 37 warns that neither
> predicts splat quality.
>
> **The structural finding is amendment 39: SfM takes FOUR rails and no more** -
> `spheresfm.py:170` is an explicit 4-tuple, verified in source as well as `/object_info`.
> A five-rail merge is impossible without patching SplatKit (third-party, MIT). So the
> only coverage experiment available was a **4-of-5 swap**, and **Fabio chose to run it**:
> 157 in place of 144 (amendment 42). It merges (`trajectory_lengths [41,41,41,41]`,
> `on_split` still `stop`), the weak slot lifts **+6.5 dB**, and the three untouched rails
> move by <=0.53 dB. Splat `G:\MPI-623-spike\swap157_brush_out\swap157_5000.ply`, 52.2 MB.
> **Rail 122's hole is unchanged and still the worst thing in the scene** - it was not
> what changed.
>
> **The live question for Phase 2** is therefore whether the canned presets adopt 157 over
> 144. The measurement supports it but does not settle it: the two rails fly different
> paths, so part of the gap is that 157's views are easier (worst hole 11.8% vs 94.3%),
> and wall COVERAGE is a question PSNR on held-out views cannot answer.
>
> **Nothing was overwritten** - the swap wrote to a new dataset name because
> `spheresfm_colmap.py:818-820` rmtree's `images/` and `sparse/` under `out_dir`; the
> original was verified intact. **Any future SfM re-run must take a new `output_name`.**
>
> **PATH CHANGE - THE SPIKE MOVED OFF G:.** Fabio's rule: **only weights the bench loads
> belong on `G:` or `C:/AI`** - those are its two load paths. The spike is scratch, not
> models, so `G:\MPI-623-spike\` is now **`D:\WORK\MPI-623-spike\`**. Every
> `G:\MPI-623-spike\...` path elsewhere in this plan resolves under that new root -
> apply the substitution, the filenames are unchanged. Verified: 1812 files /
> 8,025,205,532 bytes byte-identical before the original was removed, the six `.py`
> helpers repointed, and `eval_swap157.py` re-run from D: reproducing its table exactly.
> G: went 4.8 GB -> 13 GB free. The scripts this session wrote (`run_chunk.py`,
> `make_chunk6/7.py`, `brush_swap157.py`, `eval_swap157.py`) are now in that durable dir
> too, not only in session Temp.
>
> **Still on G: and NOT ours to clear:** `$RECYCLE.BIN` holds ~12 GB. Emptying it is
> Fabio's to do.
>
> **Uncommitted:** this plan's amendments 39-42 and this note. Nothing else changed; no
> product code was touched.

**Project mode:** `scalable-foundation`.

A user bakes a Gaussian-splat scene once from a 360 equirect image, then re-enters
it any time to capture stills from new angles. The goal is **environment
consistency across a series** - a room baked once, shot from real geometry
instead of re-prompted and re-drifted. Captured stills feed the existing
surfaces unchanged (i2v, krea2Edit, composite, control); no new "scene -> video"
path is built.

Pipeline source: Mickmumpitz, *"We Open Sourced World Generation"* (2026-08-25).
Both his free workflow JSONs were read directly - the node and weight bill in
brief.md comes from the files, not from the video.

### What the investigation settled (2026-08-26)

**Framework constraints - these shape the design, do not fight them:**

- Flow output `mediaType` is `'image' | 'video' | 'audio'` only. No folder or
  binary output exists. Capture matches node titles `Output_Image*` /
  `Output_video*` / `output_audio`. A `.ply` output needs a new capture branch.
- Per-flow `uiComponent` was **deleted in MPI-572**; `MpiFlowHeadSwap.js` went
  with it. A Flow-owned Organism is prohibited. Custom controls = a new `type`
  on `FlowStepField` (`js/utils/declaredFields.js`) + a Primitive.
  **We need none** - canned coverage presets are a dropdown, which already exists.
- **One `enqueueGeneration` per Flow** (`flowService.js:126`). Multi-pass work
  lives inside ONE graph, the way Character Sheet does.
- A gallery card CAN route somewhere other than Group History -
  `MpiGalleryBlock.js:225-227` intercepts `open-group`.
- Cross-project card copy is **single-file only** (`routes/projects.js` ~2099,
  one `item.filePath` -> one `fs.copy`). No companion-directory concept.
- `shaderBackground.js` already runs a WebGL loop, so this is not the app's first
  GL - but it would be the first GL context inside a ComponentFactory component.
  `MpiCanvas` has the teardown pattern to copy (RAF cancel -> `loseContext()` ->
  zero canvas dims -> null refs).
- Native-binary precedent exists: `services/ffmpegBinary.js`, bundled at BUILD
  time into `resources/`. There is **no precedent for downloading a native binary
  at runtime** in Vision's dep system.
- A non-ComfyUI job CAN drive the progress bar directly via the `StatusBar.progress`
  API - mask-detect already does this, deliberately bypassing `generationStore`.

**External facts:**

- **SplatKit** ships at `github.com/mickmumpitz/ComfyUI-SplatKit`, **MIT**. Not in
  the ComfyUI Registry or Manager list yet - pin by git URL + commit.
  Requirements are light and **pin no torch**: `opencv-python trimesh scikit-image
  click matplotlib huggingface_hub`. Python >= 3.10. No CUDA-compiled deps.
  `triton` is deliberately excluded; it falls back to pure-torch silently.
- SplatKit **produces datasets, not trained splats** - confirmed verbatim in its
  README. Training is always external.
- SplatKit **downloads two things at runtime**: the MoGe checkpoint (to
  `ComfyUI/models/MoGe`) and a `colmap_sphere` SphereSfM binary (to `bin/`, with
  SHA-256 verification, per-platform). **The SphereSfM binary is BSD-3-Clause,
  not MIT** - its NOTICE must be preserved on redistribution.
- The `MickmumpitzPano*` nodes live in the **separate** `ComfyUI-Mickmumpitz-Nodes`
  pack (MIT), under `nodes/panorama_tools/`.
- **Brush** (`github.com/ArthurBrussee/brush`) is **Apache-2.0** - commercial
  closed-source redistribution permitted, LICENSE/NOTICE must ship with it.
  Prebuilt v0.3.0 binaries exist for **exactly Vision's three targets**:
  `x86_64-pc-windows-msvc`, `aarch64-apple-darwin`, `x86_64-unknown-linux-gnu`,
  each with a `.sha256`. No Windows arm64, no Intel Mac - both already outside
  Vision's matrix.
- Brush CLI: `brush-app <PATH_OR_URL> --total-train-iters N --export-path DIR
  --export-name PATTERN --export-every N`. Headless is the default when a path is
  given. The shipped binary is `brush-app` (GUI+CLI combined); a headless-only
  `brush-cli` crate exists but is not released prebuilt.
- Brush's expected COLMAP layout (`sparse/0/{cameras,images,points3D}.{txt|bin}`
  plus `images/`) **matches SplatKit's default output**. No undistortion needed.
  Still to be proven live - see Phase 0.
- Brush progress is `indicatif`-wrapped: **strip ANSI first**, then match `N/M Steps`.
- **No viable fallback trainer.** The only other no-CUDA-toolchain prebuilt option
  found is Spirula Studio, **GPL-3.0**, which blocks commercial redistribution.
  Brush is load-bearing; Phase 0 must prove it before anything is built on it.

### Correction to one research finding

An investigation agent reported the `MickmumpitzPano*` class names as wrong.
**It is mistaken.** Verified directly against `pano.json`: the workflow resolves
`MickmumpitzPanoRollHorizontal`, `MickmumpitzPanoSeamMask`,
`MickmumpitzPanoKrea2Reference`, `MickmumpitzPanoHarmonizeBoundary`,
`MickmumpitzPanoWarp`. The internal Python class names are unprefixed; the
`NODE_CLASS_MAPPINGS` key is what a workflow binds to. **General gotcha: a node's
registered type is not necessarily its class name - trust the workflow JSON.**

### Architecture decisions (front-loaded per scalable-foundation)

1. **A Scene asset is a single `.ply` file.** The COLMAP dataset is intermediate
   and disposable - it is consumed once by the trainer. Re-baking needs only the
   source panorama (already its own card) and the coverage path text (a few
   hundred bytes, stored as generation params like any other). This dissolves the
   folder problem: no companion directory, so no copy-route change, no archive
   packaging, no export-loop change.
2. ~~**`'splat'` becomes a real 4th media type**, not a video card in disguise.~~
   **OVERTURNED 2026-08-29 by amendment 6 and then by the code itself - see
   amendment 18.** A Scene card is `type: 'image'` carrying a `splatPath`. The
   leak this decision feared does not exist: the cited `routes/projects.js:1491/1552`
   is not a zip-export loop, and Vision has no zip export to be excluded from.
3. **Brush runs as an MpiNodes ComfyUI node, not an app-side binary.** Decided on
   one fact: with a remote pod, app-side training would have to pull the entire
   COLMAP dataset - hundreds of images, GBs - back over the wire to train locally.
   Training must run where the dataset already is. As a node it also satisfies
   the one-dispatch-per-Flow constraint, inherits the existing progress/cancel/
   remote-pod machinery, and means Vision's app never gains a native-binary
   dependency at all. The runtime-download-with-SHA pattern is not new to the
   ComfyUI side - **SplatKit already does exactly this for `colmap_sphere`**, and
   we are pinning SplatKit regardless.
   *This is the one decision worth revisiting if Phase 0 surprises us. The
   alternative is the `ffmpegBinary.js` clone; it is written up in brief.md and
   costs remote-pod support.*
4. **No new `FlowStepField` type.** Coverage presets are a dropdown. The decision
   to ship canned presets instead of a spline editor removed this whole surface.
5. **Capture renders in-app, and the capture path is a separate render from the
   interactive one** - exact global depth sort, full SH degree 3, fp32, arbitrary
   resolution. Every renderer quality gap is a framerate compromise and capture is
   not framerate-bound. Without this the water loses its reflections.

### Amendments from Phase 0 (2026-08-29) - user decisions and measured findings

Evidence: [research/phase0-log.md](research/phase0-log.md),
[research/measurements.md](research/measurements.md).

6. **A Scene card is an IMAGE card that carries a `.ply`** (Fabio, 2026-08-29).
   The gallery card shows a still rendered from the bake; OpenGL is only needed
   once the user OPENS the card. This is strictly less work than decision 2 above:
   most of the ~25-site media-type sweep exists to give a splat a thumbnail and a
   viewer, and an image card already has both. The `.ply` still needs to survive
   `routes/projects.js:1491/1552` (the zip-export loops) and the cross-project
   copy, so the media-type work does not vanish - it shrinks to "an image card with
   an attached asset" instead of "a fourth media type with its own viewer".
   **Revisit decision 2 in that light before starting Phase 1.**
7. **Ship the fp8 Wan 2.1 tier first, not the GGUF** (Fabio, 2026-08-29). Offload is
   acceptable - this machine has run a 40 GB transformer at ~1 min per 2 s of video.
   A long bake is expected and fine: a scene is a **durable asset**, closer to
   training a LoRA than to a generation. So do not tier for speed by default, and
   do not treat a slow local bake as a defect.
8. **The Brush trainer node MUST hand Brush a clean dataset root.** A SplatKit
   dataset contains four COLMAP models; the two under `_spheresfm_work/` use camera
   model 11 (SPHERE) and Brush picks nondeterministically between them, failing with
   `Invalid camera model` on some runs and training fine on others. Delete
   `_spheresfm_work/` (disposable, 60% of the dataset) or copy `images/` +
   `sparse/0/` to a clean dir before invoking the trainer.
9. **Progress cannot be parsed from Brush's stdout** - it writes zero bytes when not
   a TTY. Poll `--export-path` for `export_{iter}.ply` instead. Silence is normal;
   the node must not treat it as failure.
10. **The Scene workspace camera must be constrained to the bake rail's
    neighbourhood.** 3DGS is only valid near its training poses - an unconstrained
    fly-anywhere camera renders floaters, and that is inherent, not a renderer bug.
    Measured: an outside-in orbit of an interior scene is pure soup while a held-out
    training view of the same `.ply` is a clean room.
11. **Camera coverage presets MUST be authored to overlap** (measured 2026-08-29,
    Phase 0b). Four independent rails radiating from the origin split SfM into two
    reconstructions — a 152-frame model plus a 12-frame island — and the shipped graph's
    default `on_split='stop'` turns that into a hard error rather than a scene. Proven
    by controlled test that this is **geometry, not matcher tuning**: 4x
    `max_num_features` and 4x `max_num_matches` reproduce the identical split down to the
    frame ranges. `on_split='largest'` is not a fix either — it silently discards the
    island, so a user loses part of what they asked to cover. Phase 2 plans to ship four
    canned rails; they must overlap, and the check is a re-run of SfM, not an eyeball of
    the rail layout (the split is not rail-aligned). See measurements.md § Phase 0b.
12. **A Scene costs ~3 h and ships 387 MB** (measured 2026-08-29 on a 16 GB 4060 Ti):
    2 h 18 m dataset bake + 45 min Brush, ~14 GB of disposable scratch, 1.64 M splats.
    The `.ply` is 2.9x the Wan-free estimate. ~~which lands on zip-export
    (`routes/projects.js:1491/1552`), cross-project copy and sync.~~ **Corrected
    2026-08-29 (Phase 1): there is no zip export** - see amendment 19. Where 387 MB
    actually lands is **cross-project copy** (`add-from-cards`, now an explicit
    `fs.copy` and the slow step of copying a Scene card) and any future sync.
    `--max-splats` is the lever if it proves too heavy; the default 10 M cap was
    nowhere near binding.

13. **A Scene card's still must be rendered from a BAKE POSE, never a default orbit**
    (measured 2026-08-29). Core `RenderSplat` with no `camera_info` orbits outside-in and
    renders an interior as unreadable soup. Verified it is the camera and not the bake by
    running the SAME orbit over the Wan-free `.ply` whose held-out view Phase 0 confirmed
    was a clean room — also soup, in fact worse. Meanwhile a held-out eval view of the Wan
    scene at only 5 000 steps is a sharp, obviously-correct room. Amendment 6 says a Scene
    card is an image card carrying a `.ply`; **this decides where that image comes from** —
    the bake must emit its own still from a training pose, because a thumbnail generated by
    a naive orbit would make every good scene look broken. Ties directly to amendment 10.
14. **Scene quality is not uniform across the rails** (observed 2026-08-29, Draft tier).
    Held-out views in the frame 0–69 range are crisp; views in 82–163 are recognisably the
    same room but visibly softer. This tracks the per-rail HiRes coverage spread
    (0.84 / 0.43 / 0.70 / 0.91 — the 0.43 rail leans hardest on Wan). Not yet isolated to a
    cause, and measured at 5 000 steps rather than 30 000, so treat it as a lead for Phase 2
    rather than a settled fact. **Beware the cube-face confound when checking this:**
    `perspective_00000004` faces a blank ceiling and renders as mush on *good* frames too —
    compare like face with like face.

15. **The Phase 0b bake flew MICKMUMPITZ'S VILLAGE PATHS THROUGH OUR ROOM** (found
    2026-08-29 by watching the source video against the graph that ran). The four rail
    anchor strings in `hires_api_largest.json` are byte-identical to the shipped
    workflow's defaults - the paths he hand-piloted for his Bavarian village demo. They
    were never re-drawn for an interior. Rail 2 reaches 2.44 units and rail 3 -2.27; in a
    street that is a stroll, in an abandoned games room it is **through the wall**, and
    the video states at 06:25 that flying through a wall makes Wan "generate a new fitting
    scene on the other side" - a DIFFERENT room. That single fact explains both open
    findings: the SfM split into 152 frames + a 12-frame island is two disjoint spaces
    (consistent with the controlled test - geometry, not matcher), and amendment 14's soft
    rails are the ones leaning hardest on invented space (the 0.43-coverage rail).
    **Amendment 11 is right but not deep enough:** rails must not merely overlap, they
    must FIT INSIDE THE SCENE. The source workflow never intended otherwise - 12:00-13:40
    of the video is nothing but piloting, previewing and fixing ("I'm crashing into this
    building here, so let me fix that"), and it ships an in-graph path editor plus a
    preview-video node for exactly that. Phase 2 presets in absolute units are therefore
    unshippable as-is; see the revised Phase 2.
16. **More coverage is an incremental RE-RUN, not a re-bake** (video 13:40, confirmed in
    the graph). `SplatKit_DatasetProject` runs with `reset=false` and the workflow ships a
    fifth, muted rail group that APPENDS its clip to the existing dataset on every run.
    The author's own answer to uneven quality is this, verbatim at 16:38: "the areas where
    we sent our drone to look better than the rest of the scene ... just send in a few more
    drones and map out this area even more." So per-rail softness (amendment 14) is
    expected behaviour with a known lever, not a defect to tune out. Product shape: a Scene
    should be extendable by adding coverage to an existing dataset, without paying the
    2h18m again.
17. **Two external references that are not currently ours** (video 15:45, 14:24).
    (a) **The splats showcased in the video were largely trained with LichtFeld, not
    Brush** - "we used a lot of LichtFeld for training ... but the easiest one is probably
    Brush". LichtFeld is GPL-3.0 so it can never ship in Vision, but it is the right BENCH
    yardstick to separate "our dataset is weak" from "Brush is weaker than the alternative".
    Do not benchmark our output against the video's without noting this.
    (b) **Sage Attention + Triton is the sanctioned speedup** for the Wan pass, which was
    76% of the 2h18m. It requires his Sage Attention patch - without it the workflow
    silently emits **black frames**. Neither is installed on the bench today.

### Amendments from Phase 1 (2026-08-29) - the media-type sweep collapsed

18. **There is no media-type sweep. `'splat'` is not a media type.** Amendment 6 said
    the ~25-site sweep would "shrink"; checked against the code, it **vanishes**. A
    Scene card is `type: 'image'` whose `filePath` is the bake-pose still and which
    carries one extra field, `splatPath`. Grep finds ~50 media-type branches (audio's
    own sweep, MPI-573) and **every one is already correct for an image**: filter tabs,
    hover-play, duration badge, viewer selector, `MpiProjectCard` thumbnail,
    `projectReconciler.js:165`, the derivatives backfill. Adding a fourth vocabulary
    entry would buy fifty branches that must learn it, to describe a card that already
    renders. `js/managers/projectReconciler.js` needs nothing either - it pushes the
    whole sidecar as the item (`hydratedHistory.push(meta)`), so a new field reaches
    the client for free. **Only the companion FILE needed work**, in three places:
    `DERIVATIVE_RE`, `add-from-cards`, and the `open-group` intercept.
19. **`routes/projects.js:1491/1552` are not the zip-export loops, and Vision has no
    zip export.** Cited four times across this plan, amendment 12 and two handoffs. The
    lines have drifted to `:1587/:1595` and are `/backfill-media-derivatives`, the
    thumbnail/proxy backfill - whose `meta.type !== 'image' && !== 'video'` skip is
    correct, and which would happily *process* a Scene card as the image it is. There
    is no `archiver` / `jszip` / `adm-zip` anywhere and no export route;
    `extract-zip` and `7zip-bin` are dependency-download plumbing. E2E criterion 5 was
    testing a feature that does not exist and has been re-scoped.
20. **The `.ply` lives at `.meta/<id>.splat.ply`, not in `Media/`.** It rides
    `DERIVATIVE_RE`, whose own comment says it is matched by PREFIX precisely so a new
    item-owned companion does not need three lists edited in lock-step. One word added
    to one alternation buys the delete sweep (`removeItemThumbs`), the pass-2 orphan
    GC, and the naming `add-from-cards` already copies against. Semantically inverted -
    the still is the derivative of the `.ply`, not the reverse - but "file owned by an
    item id, deleted with it" is exactly what that regex expresses. `Media/` was the
    briefed assumption and would have needed new cleanup code in the delete route with
    no orphan sweep behind it.

21. **A source-text assertion is not a test.** Phase 1's `add-from-cards` check matched
    `/srcSplat/` and the rewrite line against the route's own source. It would have
    passed on a route whose copy loop was reordered, whose `destSplat` was built from
    the SOURCE meta dir, or whose `fs.copy` never ran - every failure mode it was
    written to catch. Replaced with a mounted-router POST between two temp project
    dirs. The route is cheap to drive: `app.use(express.json()); app.use(router)` and
    `app.listen(0)`, the pattern `tests/settings-models-root-guard.test.cjs` already
    uses. **A new test is only proven when it has been seen to FAIL** - both branches
    were mutated in `routes/projects.js`, watched go red on their own assertion, and
    the file restored byte-identical (`git diff --exit-code`).

22. **The Brush trainer node, as authored - three corrections and two caught bugs.**
    The batch bullet said "strips ANSI and reports `N/M Steps`"; amendment 9 had already
    killed that, and the node polls the export dir instead. It also said `--total-train-iters`;
    the real flag is `--total-steps`. **Every flag the node passes was verified against
    `brush_app.exe --help` on the bench binary** - `--total-steps`, `--export-path`,
    `--export-every`, `--sh-degree`, `--max-splats` all exist with the defaults assumed.
    Two real bugs the self-check found, both of which would have been invisible until a
    45-minute bake went wrong:
    - **`except Exception` never catches a ComfyUI cancel.** `InterruptProcessingException`
      derives from **`BaseException`**, so the poll loop's kill branch would not have run
      and Brush would have kept the GPU for the rest of the bake with nothing left to
      collect it. Now `except BaseException`.
    - **A timestamped export dir is not a unique one.** Keying it on
      `<dataset>_<unix seconds>` let a second bake land in the first one's directory,
      where stale `export_*.ply` files read as this run's output - so a run that exported
      NOTHING reported success and returned a path from the previous bake. Now
      `tempfile.mkdtemp`.
    Also: **`bin/` had to be gitignored.** The node caches the 152 MB Brush binary there,
    and it was sitting untracked, one `git add` away from being published in the pack.
23. **Registry exposure - RESOLVED, and the docs that raised it are stale.** This was
    written up as an open question on the strength of `ComfyUi-MpiNodes`'s own
    `.claude/rules/registry-safety.md` and `CLAUDE.md`, which both still say
    `latest_version` is **stuck at 1.0.4** and the flag unresolved. **Fabio, 2026-08-29:
    that has been untrue for a long time - the registry is on 1.2.x and moving.** So there
    is no publishing hazard to weigh, and decision 3 stands unchanged. Two things were
    done anyway because they cost nothing: the subprocess is VHS-shaped (fixed arg list,
    no shell, no user string interpolated), and `brush_path` lets an installer manage the
    binary so the download path is never taken. **The lesson is the one this plan keeps
    relearning** - a rule file is a claim that decays exactly like a line number
    (amendment 19). Two files in that repo now carry a stale registry status; they belong
    to whoever owns that repo, so they are reported, not edited.

### Amendments from the Parallel Batch bench run (2026-08-29)

24. **`MpiBrushTrain` is bench-verified, and all three unproven assumptions held.** A graph
    of `MpiBrushTrain` -> `PreviewAny` (the node has no `OUTPUT_NODE`, so a *literally*
    single-node graph never executes - the sink is required, not scope creep), pointed at
    the raw Phase 0 dataset `G:\MPI-623-spike\out\mpi623_gate` with
    `brush_path=G:\MPI-623-spike\brush\extracted\brush_app.exe`, 2000 steps / export every
    250. **Full pass in 23 s**, returning
    `output/splats/mpi623_gate_88guot2p/export_2000.ply` (2.4 MB, 8 exports). What each
    watch-item actually showed:
    - **The progress bar moves.** Websocket `progress` events - what drives the UI bar -
      arrived 250 -> 500 -> 750 -> 1000 -> 1250 -> 1500 -> 1750, one per 2 s poll. The
      export-dir poll is a working progress source, not a theory.
    - **Staging works and Brush consumes it.** `_mpi_clean/` was created with `sparse/0`
      only (one model) and 96 images at `st_nlink=2` - hardlinked, not copied, as designed.
      No `Invalid camera model` on either run.
    - **Cancel really kills Brush.** `POST /interrupt` 12 s into a 30000-step bake:
      `execution_interrupted` at +0.1 s and `brush_app.exe` **gone from the task list**.
      The `BaseException` fix in amendment 22 is what makes this true.
    Two incidental confirmations: Brush zero-pads its exports (`export_0250.ply`), which
    `exported_step`'s `isdigit()` parse handles; and 2000 steps taking 23 s means a Draft
    tier is minutes, not the 45 minutes the 30000-step Scene tier costs.

25. **Scaling the rails into the room does NOT fix the SfM split - amendment 15 was only
    half right.** Measured Wan-free (MoGe reprojections only, the split was already shown
    to be geometry-driven, not Wan- or matcher-driven), holding everything at Phase 0b's
    values except the anchor scale: same four rail shapes, 81 frames each, `frame_stride=2`
    (164 fed), `exhaustive`, `on_split='stop'`. **The room's real extent, measured** by
    computing the MoGe scene-reference cloud (`SplatKit_CameraPlotSceneReference`, 40 000
    points, served by SplatKit's own `/splatkit/scene_points` route): horizontal radius from
    the start camera p50 **1.66**, p90 **2.77**, p98 **3.34**; y spans -0.62 to 1.05. The
    shipped rails reach r=2.95 (rail 2) and r=2.60 (rail 3) - past p90, i.e. into the wall,
    exactly as amendment 15 said. SplatKit's own `/splatkit/suggest_paths` proposes nothing
    beyond r=1.6, which is a second, independent read of what "fits".
    **Scaled x0.5 (max reach r=1.48, comfortably inside p50) it still split into 2 models:**
    `model 0: 134 frames [(0,93),(122,161)]`, `model 1: 27 frames [(95,121)]`. Cost: 305 s
    (151 s for four rail renders, 154 s for SfM).
    The island is again **inside a single rail** (rail 3 spans 82-122 at stride 2), as it
    was in Phase 0b at (70,81) - so it is not "one rail flew somewhere else", it is a
    stretch of one rail whose views share geometry with nothing, including the rest of its
    own rail. **Fitting inside the room is necessary but NOT sufficient. The remedy that
    matters is the one measurements.md already ranked first - trajectories must OVERLAP -
    and Phase 2 cannot ship canned rails on scale alone.**
26. **A SHARED LOOK TARGET merges the reconstruction - measured, and it is Phase 2's rule.**
    Same four scaled rails, same 164 frames, same matcher, `on_split='stop'`; the only
    change is `orientation='look_at_target'` with `look_at_target="0, 0.3, 0"` on all four
    (rail 4's `per_point_look` 6-float rows truncated to their positions). **One model.**
    `execution_success` in 325 s, `num_images=912` (= 152 registered frames x 6 cube faces),
    `sparse/` holding `0/` alone. Under `on_split='stop'` a merged run is the only way to
    reach success, so this is a positive result, not an absence of an error.
    Why it works is the mechanism, not luck: `look_forward` aims each camera down its own
    path tangent, so four rails radiating from one origin look four different ways and share
    almost nothing; aiming them all at one point makes every frame on every rail image the
    same region. **Phase 2's canned presets must therefore carry `look_at_target` (or
    `per_point_look` targets that converge), not `look_forward`** - and per amendment 6b a
    preset must ship its orientation with its anchors, which this makes load-bearing rather
    than tidy. Caveats to carry forward, neither of them blocking: this is the Wan-free
    dataset, and a shared target is not automatically the best COVERAGE of the walls - it is
    the shape that reconstructs. Not yet trained; the merged dataset is at
    `D:\WORK\Images\Outputs\mpi623_railshare` if a bake is wanted.

27. **The merged dataset TRAINS, and the room survives the merge - the converging-look fix is
    now visible, not just an exit code.** Amendment 26's `mpi623_railshare` (912 images,
    `sparse/0` alone) Brush-trained at Draft: **5000 steps in 30 s**, `railshare_5000.ply`
    28.6 MB, `--eval-split-every 8 --eval-every 5000 --eval-save-to-disk` giving 114 held-out
    renders in `D:\WORK\Images\Outputs\mpi623_railshare_brush\eval_5000\`. Compared
    like-for-like on face `perspective_00000000` (face 4 is the blank-ceiling confound) at
    frames 0 / 56 / 110 / 158: **every one is the room** - yellow wall and counter, red window
    frames with boarded panes, tiled debris floor, correct ceiling line - and frame 110 tracks
    its ground truth closely. **The eval frame indices run 0 -> 160 with no jump**, unlike the
    Phase 0b run where a `0...69` then `82` gap was the discarded island sitting in the
    filenames. One model in, no data thrown away.
    **What this does and does not prove.** It proves the merge is real and trainable, at a
    quality equal to its input. It does NOT answer "does it look nice": this dataset is MoGe
    reprojections only, so its detail ceiling is the warped panorama, and the black patches in
    the renders are unseen regions present in the ground truth too. The quality verdict needs
    a Wan run piloted with the amendment 26 fix. **Do not upload anything to R2 before that
    run has been looked at** - Fabio's call, and the reason batch task 2 is parked.

28. **The upscale is AFTER Wan, and it is `SplatKit_HiResComposite` - read off the graph that
    ran, not from memory.** Per rail: `SplatKit_WanI2VMaskedConditioning` -> `KSampler` ->
    `VAEDecode` -> `SplatKit_HiResComposite` -> `SplatKit_SphereSfMDatasetDualRes`. The
    composite takes three inputs - the decoded `wan_frames`, the ORIGINAL `panorama`, and an
    `upscale_model` (`UpscaleModelLoader`, `4x-UltraSharp.pth`) - and emits at
    `output_width=8192` from a `proxy_width=2048` working res, `base_mode='geometry'`.
    So Wan runs at its 720p ceiling and the composite is what buys the resolution back; there
    is no upscale before Wan. **Consequence for the Q4 test:** resolution is not what the GGUF
    run is judging. The question is whether Wan FILLS THE HOLES correctly - the black unseen
    regions amendment 27 shows in both render and ground truth - and Q4 is enough to answer
    that. fp8 only gets considered if Q4's fill is wrong, not if it is merely soft.

29. **THE POSITIVE PROMPT WAS NEVER CONNECTED - every flattened API graph fed the NEGATIVE
    text into the positive slot, and at `cfg=1` that is the only conditioning that steers.**
    Found while patching the graph for the Q4 run, by tracing the SOURCE workflow's
    `Bundle`/`UnbundleByName` pair instead of trusting the flattened file. In the shipped
    `ds.json`, `Bundle` node 102 takes `input_8` <- node 10 (the POSITIVE `CLIPTextEncode`)
    and `input_10` <- node 11 (the negative); `UnbundleByName` re-emits them as slots 6 and
    7, and all five `SplatKit_WanI2VMaskedConditioning` nodes take `positive` <- slot 6,
    `negative` <- slot 7. **The source is correct.** But the flattening this line of work did
    to obtain an API graph collapsed both to `["11", 0]`: `hires_api.json`,
    `hires_api_patched.json`, `hires_api_largest.json` and `hires_api_matcher.json` are ALL
    wired `positive: ["11",0], negative: ["11",0]`, leaving node 10 dead in every one of them.
    `hires_api_largest.json` is the file that produced Phase 0b's 2h18m bake.
    **So Phase 0b ran with "The video is not of a high quality, it has a low resolution.
    Distortion. strange artifacts." as its positive conditioning** - and because the lightx2v
    distill LoRA runs at `cfg=1`, ComfyUI skips the uncond pass, so the negative slot was
    inert and that text was the ONLY thing steering the sampler.
    This is a SECOND independent cause of "the bake looked far worse than the source video",
    alongside amendment 15/17's mis-piloted rails. It survived because the "Verified NOT
    drifted" list below checked weights, strengths, resolutions and `base_mode` - never the
    conditioning wiring. Fixed in the Q4 graph (`hires_api_q4.json`: `positive: ["10",0]` on
    all four). **Carry-forward: when Phase 2 authors its own graph, positive/negative wiring
    is a thing to ASSERT, not assume - and a flattened graph is not evidence about the
    source.**

30. **THE RAILS WE HAVE BEEN MEASURING ARE NOT THE RAILS MICKMUMPITZ SHIPPED, and amendment
    15's premise does not survive the diff.** `ds.json` is the shipped rail-bearing workflow -
    confirmed by elimination, since `pano.json` contains NO
    `SplatKit_CameraPlotRenderControlGeo` at all. Against it, the working files carry
    different piloting:

    | rail | ds.json (shipped) | `hires_ui_stripped.json` / every `hires_api*.json` |
    |---|---|---|
    | 27 | `look_at_target` @ `-0.108, 0.073, 1.953` | `look_forward`, target blank |
    | 122 | `per_point_look`, 6-float rows | `look_forward`, 3-float rows |
    | 133 | `per_point_look`, 6-float rows | `look_forward`, 3-float rows |
    | 144 | `per_point_look` | `per_point_look` (the one that survived) |

    **His rails already converge.** Amendment 15 recorded them as "byte-identical to the
    shipped workflow defaults ... flown unchanged through an interior"; that is wrong, and the
    anchor POSITIONS differ too, so it is not a plain truncation - rail 122's shipped row 2
    position is `0.430, 0.021, 0.843` where the working files carry `0.883, 0.021, -0.444`
    (only `y` survives). The divergence is already present in `hires_ui_stripped.json`, which
    still holds its 12 `Bundle` nodes, so it predates the flattening to an API graph and this
    session could not reconstruct which step introduced it.
    **What this costs the earlier amendments.** Amendment 25 measured "the shipped rails reach
    r=2.95 and 2.60, past the room's p90" - it measured the ALTERED rails. Amendment 26's
    finding that a shared look target merges SfM is still a true measurement, but it is not the
    discovery it was written as: the shipped workflow already had converging aims, and what
    amendment 26 really fixed was damage introduced upstream. Its chosen target `0, 0.3, 0`
    also sits essentially ON the camera start point, so cameras look BACKWARD as they pull
    away, where the shipped rail 27 aims ~1.95 units FORWARD.
    **Open, not concluded:** whether that backward aim is what made the Q4 run non-panoramic
    (amendment 31). A one-rail test with rail 27's shipped piloting restored is what settles
    it - `hires_api_q4_pilot.json`.

31. **THE Q4 RUN'S WAN OUTPUT IS NOT A PANORAMA, and the failure is structural, not
    quantization.** Rail 1 of the amendment-26-piloted Q4 bake, correlating Wan's output
    against the control render over the KNOWN (non-hole) pixels only: frame 0 **+0.996**,
    frame 2 **-0.046**, frame 20 -0.085, frame 40 -0.043. It collapses at **frame 2, where the
    hole is 1.1%** - i.e. with 98.9% of the frame carrying known geometry, Wan reproduces none
    of it. Wan anchors on the I2V reference frame and then discards the control entirely.
    Hole-filling itself is not the visible failure: zero black pixels remain (fill luminance
    117 at frame 40). The output simply is not equirect - the ceiling is not smeared along the
    top edge, rubble sits in the top corners - which Fabio called on sight.
    **Q4 is not indicted by this** - and amendment 32 went on to exonerate it outright.
    Quantization damage degrades gradually as the hole grows; this is a switch flipping between
    frame 0 and frame 2, which is the signature of the control conditioning not being honoured
    at all. Run interrupted at ~40 min on Fabio's call rather than spend ~2.5 h more on it; the
    bench was interrupted through `POST /interrupt`, never killed.
    Measured with `known-pixel corr`: resize the control to Wan's 1440x720, mask to
    `control.sum(axis=2) >= 12`, `np.corrcoef` over the masked pixels. **That metric is the
    cheap gate for any future Wan run** - it separates "soft" from "ignoring the control",
    which eyeballing a still does not.

32. **Q4_K_M FILLS THE HOLES CORRECTLY. The answer to Fabio's question is YES, and fp8 is not
    needed.** One rail (27), the SHIPPED piloting from `ds.json` restored, positive
    conditioning fixed, everything else identical - `hires_api_q4_pilot.json`, 21 nodes,
    `execution_success` in **1743 s (29 min)** for one rail on the Q4 GGUF.
    Known-pixel correlation vs the control, the amendment 31 metric, same rail and same weight
    with ONLY the piloting changed:

    | frame | hole | amendment 26 aim | shipped aim |
    |---|---|---|---|
    | 0 | 0.0% | +0.996 | +0.996 |
    | 2 | 1.1% | **-0.046** | **+0.932** |
    | 20 | 5.4% | -0.085 | +0.929 |
    | 40 | 4.9% | -0.043 | +0.925 |
    | 80 | 3.4% | +0.295 | +0.859 |

    It holds 0.86-0.93 across all 81 frames instead of collapsing at frame 2. Fill at frame 40:
    59 792 hole pixels, **52 still black** (99.91% filled), mean luminance 125, and the frame
    is unmistakably an equirect of the room - ceiling smeared along the top edge, floor along
    the bottom, arcade cabinet, counter, boarded windows, debris floor.
    **The shipped aim also leaves far less to invent:** hole fraction 5.8% / 4.0% at frames
    40 / 80 against amendment 26's 20.9% / 14.8% - 3.6x less, because aiming ~1.95 units
    FORWARD keeps the camera pointed where the panorama has data, while aiming at `0, 0.3, 0`
    points it back at the region it is reversing away from.
    **Consequence for batch task 2:** the tier question is answered on quality - GGUF Q4_K_M is
    good enough and no fp8 upload is justified by this evidence. VRAM is not what decides it
    either: Q4 peaks ~10.2 GB of 16 380 MiB, and fp8 already ran on this same card in Phase 0b
    via offload, so GGUF's saving is DOWNLOAD SIZE (11.3 GB vs 16.4 GB), not fit.
    **Limits, stated:** one rail of four, judged on raw Wan frames. The HiRes composite, SfM
    and a Brush eval still have to run before the quality question is closed end to end.

33. **FIXANYTHING IS NOT A REPLACEMENT FOR THE WAN HOLE-FILL - it is the same base model
    solving a DIFFERENT step, and its real home here is AFTER Brush, not before SfM.**
    *FixAnything: 3D-Consistent Rendering Refinement via Video Generative Priors* - Vuong,
    Ramanan, Narasimhan (CMU), ECCV 2026. <https://fix-anything.github.io/>, code
    <https://github.com/kvuong2711/fix-anything>, weights `kvuong2711/fix-anything`
    (`fixanything_lora.safetensors`, rank 64), Apache 2.0. Read from the project page, the
    GitHub README and the HF model card - **not from the PDF**; every disqualifier below is
    structural (format, pipeline position, base weight, no ComfyUI), so the paper is unlikely
    to move them, but the arXiv has not been read line by line.

    **What it actually is:** a rank-64 LoRA on **Wan2.1-I2V-14B-480P** - the same family we
    already run, one tier down. Stage I supervised finetune on ~20 paired videos, Stage II
    Flow-DPO with **COLMAP pose accuracy as the reward**. Conditioning is video-to-video, not
    I2V: "the degraded render's VAE latent is channel-concatenated with the noisy latent,
    together with a per-frame binary mask marking which frames to *trust* and which to *fix*."
    832x480, 61 frames (internally 65), longer trajectories chunked with a shared clean anchor.
    Trained on DL3DV-10K rendered through all four reps - 3DGS, NeRF, mesh, **sparse point
    clouds**.

    **Why not to switch (reason 1 was later withdrawn - see it below):**
    1. **~~Wrong pipeline position~~ - WITHDRAWN, this reason was overstated.** It was written
       as "it repairs renders OF an existing 3D representation, our Wan step runs before one
       exists". Fabio pushed back with the DL3DV-Drone panel: a ~95%-empty sparse-point input
       comes back a coherent aerial village. A COLMAP sparse cloud is PRE-reconstruction, so
       our hole-y geometry reprojection is closer to that training case than the reason
       claimed, and capacity is not the issue either - our holes are 4-6% against their ~95%.
       **What the demo actually does, though, is anchor interpolation, not invention.** The
       page's own caption: "Clean training views the trajectory passes through. The model
       treats these as anchors and propagates appearance, lighting and scene structure into the
       degraded frames in between", and the mask ablation states it from the other side -
       "Without the mask, the model cannot tell clean frames from mildly degraded ones and
       hallucinates over the training views." The README asks that a trajectory "ideally
       starts/ends at views used to build the 3D representation". **We have exactly ONE real
       view in the scene - the panorama.** Frame 0 is an anchor and nothing downstream of it
       is, which is the regime none of the demos show. So the demos are not evidence for our
       case, but they are not evidence against it either. **The verdict rests on reason 2
       alone, and 3-5 as cost.**
    2. **No equirectangular anywhere.** Zero mention of 360 / equirect / panorama on the page,
       README or model card; training is perspective DL3DV capture. We run 1440x720 equirect
       and carry `pano_video_gen_720p_comfy` at 0.98 precisely because wrap-around is not
       native to Wan. FixAnything's LoRA competes for that same slot, and two LoRAs from
       unrelated training regimes on one DiT is the MPI-282 trap, untested.
    3. **Resolution regression.** 832x480 against our 1440x720 - roughly half the angular
       density per degree feeding SfM. Amendment 28 puts the resolution recovery in the HiRes
       composite, but the composite cannot restore feature density Wan never emitted.
    4. **Different base weight.** The 480P variant, ~60 GB, i.e. a fresh download and a fresh
       quantization question one day after the 720P Q4 one was settled (amendment 32).
    5. **No ComfyUI path.** Channel-concat conditioning plus a per-frame trust mask is not
       expressible with stock nodes - it is a custom node in `ComfyUi-MpiNodes` or a separate
       torch-2.6 process with its own 60 GB base.

    Against that we would be discarding a **measured pass**: 0.86-0.93 known-pixel correlation
    across all 81 frames, 99.91% of holes filled, 29 min per rail (amendment 32).

    **Where it IS worth something - park it, do not discard it.** Its literal stated task is
    repairing 3DGS renders, and that is exactly Phase 3's problem: the stills a user captures
    from a Draft-quality splat at a new angle. Revisit **after** a Brush splat exists, on
    perspective eval renders, where it is in-domain instead of out of it. Its Flow-DPO reward
    also independently corroborates amendments 26/30 - pose consistency across views is the
    axis that decides whether the reconstruction merges.

    **Verdict given to Fabio: do not switch. Run the four-rail bake.**

34. **THE FOUR-RAIL GRAPH IS BUILT AND ASSERTED, WAITING ONLY ON THE GPU.**
    `G:\MPI-623-spike\hires_api_q4_4rail.json`, 51 nodes, built from `hires_api_q4.json`
    with all four rails re-piloted from the shipped file. Patch script asserted, not eyeballed:
    rail 27's inputs come out **identical to `hires_api_q4_pilot.json`**, the graph that
    passed; all four `SplatKit_WanI2VMaskedConditioning` still take positive from node 10 (the
    panorama prompt) and negative from node 11 (amendment 29 holds); the unet is still
    `wan2.1-i2v-14b-720p-Q4_K_M.gguf`; `length=81` and `moge_level=9` were asserted equal to
    shipped rather than overwritten. **Nothing has been queued** - Fabio is using the GPU for
    his own tests and the bake waits on his word.

    **`ds.json` now has a durable home.** `G:\MPI-623-spike\ds_shipped.json`, sha256
    `d40e6807e9f4d5c5968d4b086948bbaddcdaaa3b964b8d974246efaea951034b`, verified equal to the
    Temp-scratchpad copy it came from. That closes the preservation risk the last handoff
    flagged - the only clean copy was living in a session Temp directory.

    **Two divergences amendment 30's table did not record:**
    - **`ds.json` carries a FIFTH rail, node 157** (`per_point_look`, 6-float rows). The
      working graph has only 27 / 122 / 133 / 144. Not added - that is a scope call for Fabio
      and costs ~29 min of GPU. Flagged, not acted on.
    - **Rail 133 lost a waypoint.** The working graph carried 3 anchor rows where the shipped
      file has 4. Amendment 30 recorded 133 as a `look_forward` / 3-float-row difference and
      did not note that a whole row was missing.

    **Save-node attribution needs no graph change.** Amendment-era notes called the `SaveVideo`
    prefixes "collapsed to `control_rgb`"; in this graph all 8 take `filename_prefix` from the
    LINK `["41", 1]` (`SplatKit_DatasetProject`), not a literal. Rails are still attributable
    because ComfyUI's `/history` keys `outputs` by node id, so the eight videos map back to
    their rails without touching the prefixes the passing run used. The composite and SfM nodes
    consume links in-graph, never the saved files, so the prefixes are inspection-only.

35. **THE BAKE SPLITS INTO SIX GPU LEASES - the SplatKit nodes were built for it.**
    Fabio asked whether the ~2.5-3 h run can be broken up so he keeps the card between pieces.
    It can, and not by a trick: `SplatKit_DatasetProject.reset` is documented "Clear the
    project folder first. **Default off = resumable (the depth cache is reused)**". Set
    `reset=true` on the first chunk only and every later chunk resumes the same dataset.

    | chunk | graph | contains | GPU |
    |---|---|---|---|
    | 1 | `chunk1_rail27.json` | rail 27 -> Wan -> composite, `reset=true` | 29 min + composite |
    | 2 | `chunk2_rail122.json` | rail 122, `reset=false` | same |
    | 3 | `chunk3_rail133.json` | rail 133, `reset=false` | same |
    | 4 | `chunk4_rail144.json` | rail 144, `reset=false` | same |
    | 5 | not yet built | SfM merge over the four rails | no Wan sampling |
    | 6 | not yet built | Brush Draft + held-out eval renders | ~30 s train (amendment 27) |

    All four chunk graphs are in `G:\MPI-623-spike\`, 23 nodes each, cut from
    `hires_api_q4_4rail.json` by backward reachability and asserted: exactly one `KSampler`,
    one `CameraPlot`, one `HiResComposite` and two `SaveVideo` per chunk, every link resolving
    inside the subset, no SfM node, and each rail's piloting **unchanged from the four-rail
    graph** (so rail 27 is still identical to the pilot that passed).

    **Why a chunk can end at the composite:** `SplatKit_HiResComposite` has `output_node=True`,
    so it executes with nothing downstream of it. Checked in `object_info.json`, not assumed.

    **Why chunk 5 is not built yet, and this is deliberate.** `SphereSfMDatasetDualRes` needs
    `pano_frames_1..4` as IMAGE links; only `pano_frames_1` is REQUIRED, 2-4 are optional. The
    composite persists what chunk 5 needs - `save_proxies` defaults true and writes
    `<set_name>/proxies/` - and `VHS_LoadImagesPath` (directory -> IMAGE) is present on the
    bench to read them back. The SfM node also takes `hires_dir` + `hires_glob` as an
    alternative to wiring `hires_1..4` manifests. **But the actual proxy/hi-res folder layout
    and filenames only exist once a composite has run**, so chunk 5 gets built against the real
    `proxy_dir` / `hires_dir` / `hires_manifest` strings read out of chunk 1's `/history`,
    not against a guess.

    **A cost correction.** The 1743 s (29 min) pilot figure did **not** include a composite -
    `hires_api_q4_pilot.json` has no `SplatKit_HiResComposite` node. So per-rail cost is 29 min
    of Wan **plus** an unmeasured 8192-wide composite, and chunk 1 is what measures it. Any
    "~2 h for four rails" estimate was Wan sampling only.

36. **THE FULL FOUR-RAIL BAKE RAN END TO END, AND THE SHIPPED PILOTING MERGES WHAT
    AMENDMENT 11 COULD NOT.** Six GPU leases, every one `success`: rails 27 / 122 / 133 / 144
    at **37.0 / 35.0 / 34.8 / 35.3 min**, SfM at **20.5 min**, Brush Draft ~1 min (inferred
    from the `.ply` mtime against the lease line - Brush writes nothing to stdout, amendment
    9). Dataset `mpi623_wanq4`, splat `G:\MPI-623-spike\wanq4_brush_out\
    mpi623_wanq4_5000.ply`, 53.3 MB at 5 000 steps.

    **Amendment 11 is superseded on its central claim.** It recorded that "four independent
    rails radiating from the origin split SfM into two reconstructions" and called it
    geometry, not matcher tuning. With the SHIPPED converging piloting restored (amendments
    30/32) the same four rails merge into **ONE model**: `num_frames 164`,
    `trajectory_lengths [41, 41, 41, 41]`, `on_split` still at its strict `stop`. The rails
    that split were the ALTERED ones. Amendment 11's *rule* survives - canned presets must
    overlap - but its measurement was of damaged rails, exactly like amendment 25's.

    **Per-rail known-pixel correlation (amendment 31's gate), all four rails:**

    | rail | corr from frame 2 | worst hole |
    |---|---|---|
    | 27 | 0.856 - 0.953 | 6.1% |
    | 122 | 0.853 - 0.950 | 5.6% |
    | 133 | 0.810 - 0.947 | 37.8% |
    | 144 | 0.648 - 0.948 | **94.3%** |

    Rail 144 frame 40 is 94.3% hole - only 5.7% of that frame is reprojected panorama. The
    0.648 is not Wan ignoring the control, it is barely any control left to honour. **This is
    the shipped piloting's own behaviour**, not our drift.

37. **HELD-OUT EVAL, AND WHERE THE DRAFT SPLAT ACTUALLY FAILS.** Brush's own
    `--eval-split-every 8` held 123 of 984 cube faces out of training; scored against their
    ground truth. **Read DOWN a column - never across, per amendment 14's blank-ceiling
    trap** (face 4 reads high on good and bad frames alike).

    | rail | face 0 | face 2 | face 4 |
    |---|---|---|---|
    | 27 | **29.48** | 26.93 | 35.81 |
    | 122 | 26.07 | **21.13** | 31.46 |
    | 133 | 28.39 | 25.00 | 31.50 |
    | 144 | **20.86** | 25.93 | 31.74 |

    **Rail 27's region is excellent** - `frame_00008_perspective_00000000` renders at 29.94 dB
    and is visually near-identical to ground truth. **Rail 144 is soft** - the room's
    structure is right, the detail is gone. **Rail 122 carries a real hole**, and it was
    verified rather than assumed: `frame_00061_perspective_00000002` scores 16.19 dB with
    *completely different content* from its ground truth. A pairing check over all 984
    ground-truth images settles which it is - a control render ranks its own namesake **#1 of
    984** (29.94 dB against 23.80 for the runner-up), so the filename pairing is sound, while
    the suspect ranks its own ground truth **#87**, and its best match anywhere is 19.89 dB on
    the OPPOSITE cube face of neighbouring frames. **The reconstruction is missing that wall
    surface and renders the far side of the room through it.**
    Lead for Phase 2, not a settled cause: the weak cells track the rails that leaned hardest
    on invented content, but rail 133 holds up (28.39 / 25.00) despite a 37.8% hole, so hole
    size alone does not predict splat quality - consistency of the invention across views does.

38. **A SILENT FALLBACK COST ONE WHOLE SfM RUN - `hires_N` IS JSON, NOT A PATH.**
    The first merge returned `success` and was WRONG: `p2s_dataset.json` read
    `dualres: False`, `reproject_resolution [2048, 1024]`, i.e. the cube faces came from the
    2048 proxies and the 8192x4096 composites - the entire point of the HiRes step - went
    unused. `core/hires_composite.py:465` emits `hires_manifest` as JSON CONTENT
    (`{"dir", "glob", "count", "paths"}`), and `nodes/upscale.py:_parse_hires_manifest`
    returns `([], "")` for anything that does not parse, so callers "treat 'nothing wired' and
    'wired but empty' the same" - **a wrong string falls back to single-res with no error**.
    Feeding it the manifest FILE PATH looked right and did nothing.
    Re-run with reconstructed JSON: `dualres=True`, SfM 2048x1024, reprojection **8192x4096**,
    984 faces at 2048x2048. The cost difference is itself the tell - 7.5 min wrong versus 20.5
    min right. **Any future graph that wires `hires_N` MUST assert `dualres` afterwards;
    the exit code cannot see this.**

### Amendments from the rail-157 session (2026-08-31)

39. **SfM TAKES FOUR RAILS, FULL STOP - A FIVE-RAIL MERGE IS NOT POSSIBLE WITHOUT
    PATCHING SPLATKIT.** `SplatKit_SphereSfMDatasetDualRes` declares `pano_frames_1`
    required and `pano_frames_2/3/4` + `hires_1..4` optional - there is no fifth slot.
    This is not merely a schema limit that a hand-written API graph could slip past:
    `nodes/spheresfm.py:170` collects the trajectories as
    `batches = [b for b in (pano_frames_1, pano_frames_2, pano_frames_3, pano_frames_4)
    if b is not None]`, an explicit 4-tuple with no loop and no `**kwargs`, and line 37
    documents the ceiling on purpose ("wire extra WAN videos into pano_frames_2/3/4").
    Checked against `/object_info` AND the source, because the schema alone would not
    have settled it.
    **Consequence for Phase 2:** rail 157 can never be a *fifth* rail in one
    reconstruction. The only coverage experiment available is a **4-of-5 swap** - e.g.
    157 in place of 144, the soft rail of amendment 37 - which costs SfM 20.5 min +
    Brush ~1 min on top of the bake. Which four rails the canned presets use is a
    Phase 2 decision and is Fabio's, not an agent's.
    **Rail 157's bake is still worth having**: it lands as `traj04` in the same dataset
    and yields its own known-pixel correlation, the measurement that needs no SfM at all.
    It cannot disturb the existing four - `chunk5_sfm.json` names `traj00..03` explicitly,
    and the rail chunks carry `reset: false`.

40. **The rail-157 chunk is `chunk6_rail157.json`, built by copy-and-swap from chunk4.**
    Exactly three edits, each asserted: the rail node re-keyed `144 -> 157` with rail 157's
    own `anchors` read out of `ds_shipped.json`, its **four** consumer links repointed
    (`148.control_video`, `148.control_mask`, `145.images`, `154.rail` - the guess of two
    was wrong and the assert caught it), and `HiResComposite.traj_index 3 -> 4`.
    `reset` stays `false`. `debug_save` deliberately left at `all` so the run stays
    byte-identical to the four it must be compared against; the ~3.7 GB lands on **D:**
    (220 GB free), not G:.
    **Two durability notes.** `G:` is at 98% (5.1 GB free) and is where the spike's `.ply`
    output goes - not a blocker today, worth watching. And `score_rail.py` / `eval_brush.py`
    only ever existed in a session Temp folder, the same near-loss `ds_shipped.json` had;
    both are now copied to `G:\MPI-623-spike\`.

41. **RAIL 157 BAKED, AND IT IS THE BEST-BEHAVED RAIL OF THE FIVE - on the control
    measurement, which is NOT the same as splat quality.** `success` in **34.3 min**,
    in line with the other four (34.8-37.0). Asserted on the output, not the exit code:
    `traj04` carries **41** frames like traj00-03, and its composites are
    **8192x4096**, byte-for-byte the same shape as traj03's - so the HiRes step really
    ran and this was not amendment 38's single-res fallback a second time.
    Known-pixel correlation from frame 2 (`score_rail.py`, control `control_rgb_00009_.mp4`
    vs Wan `control_rgb_00010_.mp4`):

    | rail | corr, frame 2+ | worst hole |
    |---|---|---|
    | 27 | 0.856 - 0.953 | 6.1% |
    | 122 | 0.853 - 0.950 | 5.6% |
    | 133 | 0.810 - 0.947 | 37.8% (f80) |
    | 144 | 0.648 - 0.948 | **94.3%** (f40) |
    | **157** | **0.903 - 0.941** | 11.8% (f20) |

    Rail 157 has the **highest floor of all five**; its ceiling is marginally lower. Its
    holes are **mid-pack, not the smallest** - 11.8% is larger than 27's 6.1% and 122's
    5.6%, and far smaller than 133 and 144. **Do not read this as "157 will make a better
    splat."**
    Amendment 37 measured the opposite relationship - hole size does NOT predict splat
    quality (rail 133 held up at 28.39/25.00 through a 37.8% hole while rail 144 was the
    soft one), and the axis that did matter was consistency of the invention across
    views. What this table supports is only that 157 is a **sound candidate for the
    4-of-5 swap**, most obviously against 144. Only running that SfM + Brush would settle
    it.

42. **THE 4-OF-5 SWAP RAN: 157 REPLACES 144, THE WEAK SLOT LIFTS +6.5 dB, AND THE OTHER
    THREE RAILS DO NOT MOVE.** Fabio's call, run end to end. `chunk7_sfm_swap157.json`
    (rails traj00/01/02/**04**), **SfM 11.3 min**, then Brush Draft 5000 at the same flags
    as amendment 37 so the two are comparable: **6.3 min**, `swap157_5000.ply` **52.2 MB**
    against the 4-rail run's 53.3 MB, 123 held-out renders in both.
    Asserted on the output per amendment 38: `dualres=True`, `reproject_resolution
    [8192, 4096]`, `sfm_resolution [2048, 1024]`, `num_frames 164`,
    `trajectory_lengths [41, 41, 41, 41]` with `on_split` still at strict `stop` -
    **so 157 substitutes for 144 without splitting the reconstruction**, which is the
    amendment 11 overlap rule holding for a rail nothing had ever tested.

    | rail | face 0 | face 2 | face 4 |
    |---|---|---|---|
    | 27 | 29.48 -> 29.27 | 26.93 -> 26.62 | 35.81 -> 36.27 |
    | 122 | 26.07 -> 25.82 | 21.13 -> 21.91 | 31.46 -> 31.54 |
    | 133 | 28.39 -> 28.24 | 25.00 -> 25.20 | 31.50 -> 30.97 |
    | **144 -> 157** | **20.86 -> 27.39** | 25.93 -> 26.69 | 31.74 -> 37.08 |

    Rail 144's face 0 was the worst cell in amendment 37's table; 157 puts **+6.5 dB**
    there, and face 4 gains +5.3. The three untouched rails move by <=0.53 dB - that is
    the control working, and it is the reason to believe the swap and not the noise.

    **What this does NOT prove.** The two bottom rows are *different camera paths over
    different geometry*, so part of the gap is simply that 157's views are easier - its
    worst hole is 11.8% against 144's 94.3%. This says **157 is a better-behaved member
    of the set**, not that the room is reconstructed better overall; coverage of the walls
    is a separate question that PSNR on held-out views cannot answer. **Rail 122's hole is
    untouched and still the worst thing in the scene** - all six worst renders are rail
    122, exactly as before, because 122 was not what changed.

    **Nothing was overwritten.** `spheresfm_colmap.py:818-820` rmtree's `images/` and
    `sparse/` under `out_dir`, so the swap was pointed at a NEW dataset name
    (`mpi623_wanq4_swap157`); `mpi623_wanq4`'s `sparse/0` and 984 images were verified
    intact afterwards. **Any future SfM re-run MUST take a new `output_name` or back
    `sparse/` up first.** Staging for Brush is a real 3.4 GB copy, not hardlinks.

### Verified NOT drifted from the source workflow (checked 2026-08-29)

**This list is not exhaustive and two things it omitted were wrong - see amendments 29 and
30.** It
checked weights, LoRA strengths, resolutions and `base_mode`; it never checked which
`CLIPTextEncode` reached which conditioning slot, and that wiring was broken in every
flattened API graph.


Both LoRAs at his strengths (`pano_video_gen_720p_comfy` 0.98, `lightx2v_T2V_14B_cfg_step_distill_v2`
1.00) on `wan2.1_i2v_720p_14B_fp8_e4m3fn`; `base_mode=geometry` on all four
`SplatKit_HiResComposite` nodes (that IS the shipped default, not a mistake);
`output_width=8192`; Wan at 1440x720 - the 720p ceiling the video calls out at 06:32 as the
source of softness, which the HiRes reproject exists to fix; Brush at stock settings, as he
runs it at 16:15. **The video's pipeline also emits no still image** - amendment 13 stands.

### Known trap

Style LoRAs do **not** compose with the Krea2 edit LoRA (MPI-282). Phase 4's
IMG2SPHERE path is exactly that combination - Ostris edit patch + outpaint LoRA.
Test it before building on it.

## Completed

- [ ] Nothing yet.

## Remaining Work

## Phase 0: Prove the pipeline (spike - NO product code)

Gate for everything downstream. Brush has no viable licence-compatible
substitute, so if it cannot consume SplatKit's output the design changes.
Nothing in this phase edits the Vision repo.

**Verify mode:** `auto`.

- [ ] Install SplatKit + ComfyUI-Mickmumpitz-Nodes on the standalone bench
      (`G:\ComfyUi`, port 8188 - NOT the app engine on 48188) and run
      `3DGS-Dataset-Creator` end to end from a Poly Haven JPG equirect. Record
      the exact commit SHA of both packs. **Verify:** a COLMAP dataset directory
      exists on disk with `images/` and `sparse/0/`, and `sparse/0` contains
      cameras, images and points3D.
- [ ] Confirm SplatKit's runtime downloads land and verify: MoGe checkpoint and
      the `colmap_sphere` binary. Capture `bin/BUILD_INFO.txt` for the BSD-3-Clause
      notice. **Verify:** both files present; the SphereSfM licence text is saved
      to `research/`.
- [ ] Download Brush v0.3.0 Windows x64, verify its `.sha256`, and train against a
      KNOWN-GOOD public COLMAP dataset first (independent of SplatKit).
      **Verify:** a `.ply` is written to `--export-path` and opens in a splat viewer.
- [ ] **THE GATE:** run Brush against the Phase 0 SplatKit output.
      **Verify:** a `.ply` is produced and the scene is recognisably the panorama's
      room. If this fails, STOP and re-open decision 3 - do not work around it.
- [ ] Measure and record: wall-clock for the ComfyUI dataset pass, wall-clock for
      Brush at 30000 iters, peak VRAM for each, and the on-disk size of the dataset
      vs the final `.ply`. **No number for any of these exists anywhere yet - do
      not guess, measure.** **Verify:** figures written to `research/measurements.md`.
- [ ] Capture Brush's raw stdout to a file and confirm the ANSI-stripped `N/M Steps`
      pattern parses. **Verify:** a throwaway parser prints monotonically increasing
      step counts from the captured log.
- [ ] Confirm whether ComfyUI core's `RenderSplat` (already in the pinned engine,
      `comfy_extras/nodes_gaussian_splat.py`) loads the Brush `.ply` and renders it.
      **Verify:** a rendered frame from the trained splat.
- [ ] Decide iteration-count tiers from the measurements (a fast/standard pair at
      minimum). **Verify:** tiers recorded in `research/measurements.md` with the
      timing each is based on.

## Phase 1: Scene card as an image card carrying a `.ply` - COMPLETE (2026-08-29)

Standalone and testable before any Flow exists: a `.ply` placed in a project by
hand must produce a working gallery card. Delivered as amendments 18-20 describe -
no media type, no sweep, four files.

**Verify mode:** `user-ux` - the card must be seen in the running app.

- [x] **The sweep was classified and came back empty.** ~50 media-type branches, all
      already correct for `type: 'image'`. `'splat'` was NOT added to
      `js/data/projectModel.js`; `createImageItem` gained `splatPath: null` instead
      (amendment 18). No change needed in `MpiGalleryGrid.js`,
      `MpiGroupHistoryBlock.js`, `MpiProjectCard.js` or `projectReconciler.js`.
- [x] `DERIVATIVE_RE` (`routes/projects.js:95`) extended `thumb|proxy` ->
      `thumb|proxy|splat`, which buys the delete sweep and the pass-2 orphan GC for
      the `.ply` in one word (amendment 20). Exported alongside `removeItemThumbs`
      so it is testable rather than asserted from source text.
- [x] `add-from-cards` copies the `.ply` companion and rewrites `splatPath` to the
      destination. The sidecar is cloned wholesale, so the failure this prevents is
      not a missing field - it is a copied card silently pointing back into the
      SOURCE project.
- [x] Thumbnail/preview: **nothing to build.** A Scene card is an image card; its
      still is the thumbnail, and the derivatives backfill already renditions it.
      Where the still comes FROM is amendment 13's problem, and it belongs to Phase 2.
- [x] `open-group` on a card with `splatPath` is intercepted in
      `MpiGalleryBlock.js`, one line below the audio guard it mirrors, and shows
      "Scene viewer is not built yet." until `PAGE_SCENE` lands in Phase 3.
- [x] `tests/splat-companion.test.cjs` - tests over the regex both ways (claims the
      `.ply`, does not swallow the sidecar or the media file), a real temp-dir delete
      sweep, the `add-from-cards` rewrite, and the field being image-only.
      **793/793 `npm test` green; `npm run lint` clean.**
- [x] **The `add-from-cards` test now EXECUTES the route** (2026-08-29, the gap the
      previous handoff left open). It mounts the router on `app.listen(0)`, POSTs a
      Scene card between two temp project dirs, and reads the DESTINATION sidecar:
      `splatPath` names `.meta/<newId>.splat.ply` under the destination, the bytes
      actually copied, the path does not start with the source root, and the source
      keeps its own `.ply`. Second case: an unreachable `.ply` leaves no URL behind.
      Both proven red by mutating the route, then restored byte-identical - amendment 21.
- [ ] **Left for the user:** see the card in the running app - hand-place a `.ply` +
      still, confirm it reads as a normal image card, copies to a second project
      *with* the `.ply`, deletes without leaking 387 MB, and does not open Group
      History.

## Parallel Batch: Bake path

Disjoint ownership; the node lives in a different repo entirely. Run with
`mpi-execute-parallel` once Phase 0's gate has passed and Phase 1 has landed.

- [x] **AUTHORED AND BENCH-VERIFIED 2026-08-29** - the `**Verify:**` below passed on the
      bench: 2000 steps in 23 s, a real `.ply`, a progress bar that moves, and a cancel that
      kills the process (amendment 24). (`c:\AI\Mpi\ComfyUi-MpiNodes\splat.py`,
      `MpiBrushTrain`, registered in `__init__.py` + README + changelog under V1.2.8;
      `sha256_file` added to `help_funcs.py`; `bin/` gitignored). Committed there as
      `5e07043`. Three corrections to the bullet as
      written, and two bugs the self-check caught - amendment 22. Proof with no GPU:
      `check_splat.py` in the pack, 12 assertions, run with the ComfyUI portable python.
- [x] Add a Brush trainer node to the first-party pack. It downloads the
      per-platform Brush binary on first use with SHA-256 verification (mirror
      SplatKit's `colmap_sphere` approach), takes a COLMAP dir + iteration count,
      shells out headless, strips ANSI and reports `N/M Steps` through ComfyUI's
      progress API, and emits the `.ply` path. Ship Brush's LICENSE/NOTICE
      alongside. Follow the SIBLING repo's own procedures - read
      `c:\AI\Mpi\ComfyUi-MpiNodes\.claude\commands\new-node.md` and follow it
      inline (it does NOT auto-load in a Vision session; `/comfy-*` cannot be
      invoked here). Ownership: `c:\AI\Mpi\ComfyUi-MpiNodes\` (whole repo).
      Briefings: read the sibling repo's command files. **Verify:** on the bench,
      a graph containing only the new node turns the Phase 0 dataset into a `.ply`,
      with a moving progress bar in the ComfyUI UI.
- [ ] **PARKED 2026-08-29 until a Wan bake with the amendment 26 piloting has been looked
      at** - Fabio's call, and the right one: this uploads ~18.6 GB. The four files are
      already on disk, nothing needs re-fetching:
      `C:\AI\diffusion_models\wan2.1_i2v_720p_14B_fp8_e4m3fn.safetensors` (16.40 GB),
      `C:\AI\loras\pano_video_gen_720p_comfy.safetensors` (307 MB, CONVERTED by us, so it is
      the one dep with no upstream mirror), `C:\AI\loras\Wan\lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16.safetensors`
      (631 MB), `G:\ComfyUi\ComfyUI\models\MoGe\model.pt` (1.26 GB). Node pins:
      SplatKit `f59de252`, Mickmumpitz-Nodes `4d5ff7c4`. The fp8-vs-GGUF tier choice is
      answered by the Wan re-run, not guessed.
      Declare the dependencies: SplatKit + ComfyUI-Mickmumpitz-Nodes pinned in
      `dev_configs/node_lock.json` at the Phase 0 commits, node-pack entries in
      `nodesDeps.js`, and the Wan 2.1 I2V 14B 720p checkpoint + Matrix-3D LoRA in
      `modelDeps.js`/`loraDeps.js` (upload to R2, record SHA256, set `url` +
      `mirrorUrl`). Pre-stage MoGe as a real dep rather than letting the node
      fetch it uncontrolled. Prefer the GGUF `Q4_K_M` variant as the default tier
      if Phase 0 shows acceptable quality. Ownership:
      `dev_configs/node_lock.json`, `js/data/modelConstants/nodesDeps.js`,
      `js/data/modelConstants/modelDeps.js`, `js/data/modelConstants/loraDeps.js`.
      Briefings: `downloads`, `comfy_engine`. **Verify:** a clean profile installs
      every new dep and the drift check passes; SHA256 verified on each.
- [ ] **THE EDIT IS ALREADY DONE - only the `**Verify:**` remains, and task 2 does not gate
      it.** `dev_configs/node_lock.json` carries `ComfyUI-MpiNodes` at
      `5e070436fc90ab84fdd66c2fe702572d3d04f7e2`, landed by the MPI-575 agent in `6c35be5b`
      (2026-08-29 17:47), not by this line of work.
      Pin the MpiNodes commit carrying the Brush node into
      `dev_configs/node_lock.json`. Ownership: none exclusively - this is a
      one-line follow-up to the two tasks above and must run AFTER both.
      **Verify:** app engine installs the pinned commit; drift check clean.

## Phase 2: The 3D Scene Flow

Sequential - depends on the media type AND the bake path. One graph, one dispatch.

**Verify mode:** `user-ux`.

- [ ] Build the runtime workflow: SplatKit dataset creation + the Brush trainer
      node in ONE graph, from a 360 image input to a `.ply`. Base it on
      `3DGS-Dataset-Creator` but drive the camera rails from injected path text.
      **Verify:** dispatched from the bench, it produces a `.ply` unattended.
- [ ] Extend the output-capture layer to accept a splat output from a graph
      (`Output_Splat*` title convention, mirroring `Output_Image*`), so the Flow's
      single dispatch produces a splat gallery card. **Verify:** a dispatch creates
      a real splat card in a real project.
- [ ] Wire the Flow across the required files: `js/data/commandRegistry.js`,
      `js/data/modelConstants/universal_workflows.js`, `js/core/operationRegistry.js`,
      `operation_registry.json` (hand-edit, NEVER regenerate),
      `js/data/flowsRegistry.js`. Media input = one image card. Fields = coverage
      preset dropdown + quality tier + scene name. **Verify:**
      `tests/inject-params-titles.test.cjs` covers every `Input_*`/`Output_*` title
      and passes.
- [ ] Author the coverage presets as **scene-relative** waypoints, NOT absolute
      units (amendment 15). The shipped defaults are village-scale and punch through
      the walls of a room. A preset is authored in normalised space and multiplied by
      the scene's own extent, taken from the MoGe geometry the graph already computes
      (`SplatKit_CameraPlotRenderControlGeo` produces it before any rail is rendered).
      Waypoint format stays `x, y, z, lookx, looky, lookz` per line plus mode and
      frame count. Suggested set: forward-corridor, orbit-centre, high-then-dive,
      perimeter - all of them overlapping (amendment 11).
      **Verify:** on BOTH a room panorama and an outdoor panorama, every waypoint
      lands inside the geometry, and SfM returns ONE model - not a model plus an
      island. Eyeballing the rail layout does not count; the split is not
      rail-aligned.
- [ ] **Bounds check before the bake, not after.** ~3 h and 387 MB is too expensive
      to discover a wall-punch at the end. The graph knows the MoGe extent and the
      waypoints before Wan runs; reject or clamp a path that leaves the scene, and
      surface it as a Flow-level error. **Verify:** a deliberately oversized path is
      refused in seconds rather than baking for three hours.
- [ ] Dev-gate the Flow and add its tile still. **Do not declare the preview
      filename until the file exists** - a declared name with no file 404s and
      reds CI. **Verify:** `npm run release:check` passes; the Flow is hidden in a
      released build.

## Phase 3: The Scene workspace

Depends on Phase 1 only (needs a splat card to open), NOT on Phase 2 - it can be
built against a hand-placed `.ply`. Runs no generation.

**Verify mode:** `user-ux` - flying and framing must be felt, not asserted.

- [ ] Add the 4th workspace: `PAGE_SPLAT_VIEWER` in `js/router.js`, a branch in
      `js/shell/navigation.js` `handleNavigation()` and `_importView()`, the Block
      + CSS, CSS registered in `js/shell/preloadStyles.js`, props documented in
      `js/components/types.js`. **Verify:** navigating in and out leaves no
      listener, RAF or GL context alive (destroy contract).
- [ ] Build `MpiSplatCanvas` as a Primitive owning the GL context and render loop.
      Teardown MUST follow the `MpiCanvas` pattern: cancel RAF first, disconnect
      observers, `gl.getExtension('WEBGL_lose_context')?.loseContext()`, zero the
      canvas dims to release GPU backing, remove from DOM, null refs.
      **Verify:** repeated enter/leave cycles show no GPU memory growth and no
      context-lost warnings.
- [ ] Two render paths in one renderer: fast interactive, and an exact capture
      render (global depth sort, full SH degree 3, fp32, arbitrary resolution).
      **Verify:** a capture of a reflective surface shows view-dependent
      specular that the fast path may approximate; capture resolution exceeds the
      viewport.
- [ ] Fly controls + capture. Captured still saves as a normal image card in the
      current project. **Verify:** capture from three angles, then confirm each
      lands as an image card usable as an i2v input.

## Phase 4: 360 Panorama Flow

**Fully independent of Phases 1-3** and of the splat pipeline - it only produces
an image. Can run at any time, including in parallel with Phase 2 or 3, by a
different session. Blocked only on the LoRA question.

**Verify mode:** `user-ux`.

- [ ] Resolve the LoRA question before building: ask Mickmumpitz for permission to
      redistribute `krea2_t2i_360_erp_lora_v1` and
      `krea2_oedit_360_erp_outpaint_lora_v1`, OR substitute Matrix-3D's own MIT
      `Text2PanoImage`. **Verify:** a written answer recorded on this card - do not
      start wiring until one path is confirmed.
- [ ] **Test the known trap first:** does the outpaint LoRA compose with the Krea2
      Ostris edit patch? Style LoRAs do not (MPI-282), and IMG2SPHERE is exactly
      that shape. **Verify:** a bench run showing the edit path with the outpaint
      LoRA either works or fails - evidence either way, before any app wiring.
- [ ] Wire the Flow (TEXT2SPHERE and IMG2SPHERE modes), pinning
      ComfyUI-Mickmumpitz-Nodes and declaring the LoRA deps. Vision already ships
      the rest: `krea2-raw-transformer`, `qwen3vl-abliterated-clip`, `wan_2.1_vae`,
      `krea2-lora-identity-edit`, `ComfyUI-UltimateSDUpscale`. Substitute the
      already-shipped `4x-NMKD-Siax` for `RealESRGAN_x2` if quality allows.
      **Verify:** a text prompt produces a seamless equirect that the Phase 2 Flow
      accepts as input.

## Phase 5 (deferred): Camera-path video plates

Not scheduled. The same renderer in a loop produces a dolly move with locked
geometry - far stronger than a still for v2v. Revisit once Phase 3 is in use.

## Plan Drift

- **2026-08-29 - Phase 0's gate was provable WITHOUT Wan, so it ran first and cheap.**
  `SphereSfMDataset` accepts any equirect batch and `CameraPlotRenderControlGeo` produces
  one from MoGe alone, so the gate needed no Wan 2.1 (16 GB), no LoRA and no umt5. Plan
  assumed the full pipeline was a prerequisite. It is not.
- **2026-08-29 - the progress-parsing task changed shape.** Brush writes zero bytes to
  stdout off a TTY, so "strip ANSI, match `N/M Steps`" cannot work. Poll `--export-path`
  instead. See amendment 9.
- **2026-08-29 - a new prerequisite appeared for Phase 2**: `scripts/workflow-to-api.mjs`
  cannot convert the shipped SplatKit workflow (portless annotation nodes; rgthree
  Bundle/UnbundleByName virtual links). Worked around outside product code for Phase 0;
  Phase 2 needs the real fix. Details in `research/phase0-log.md`.
- **2026-08-29 - measuring one rail and multiplying is WRONG for this graph.** The shipped
  workflow's SfM uses the `exhaustive` matcher over ~324 frames, so SfM scales roughly
  quadratically while Wan and the composites scale linearly. Measure the 4-rail run whole.
- **2026-08-29 - `coverage` is a number the pipeline already prints per frame** (0.61-0.91
  on rail 1, decaying as the rail travels from the origin). Phase 3's camera constraint
  (amendment 10) could key off it rather than a hand-tuned radius. Worth trying before
  inventing a heuristic.
- **2026-08-29 (Phase 1) - the whole Phase 1 sweep was a phantom.** Decision 2 assumed a
  fourth media type; amendment 6 shrank it; the code erased it. The lesson generalises:
  the sweep was sized by grepping for branch SITES, never by asking whether the default
  branch was already right. ~50 sites, 0 changes.
- **2026-08-29 (Phase 1) - a line reference repeated four times was never once checked.**
  `routes/projects.js:1491/1552` rode from decision 2 into amendment 12 into two handoffs
  as "the zip-export loops", and Vision has no zip export. A cited line number is a claim
  like any other; it decays every commit. See amendment 19.
- **2026-08-29 - filed [MPI-659](../MPI-659/brief.md)**: `guard-gpu` never fired for any
  of this session's GPU work. Patterns match the raw command line, so a graph dispatched
  from a script is invisible, and `brush_app.exe` matches nothing at all - which this card
  is about to ship as a node.

## Verification

**Verify mode:** `user-ux`

Phases 0 and 1's sweep are self-verifying (`auto`); Phases 1 (card), 2, 3 and 4
have UI surfaces the user must judge in the running app. `mpi-continue` should
stop for the user on those.

End-to-end criteria:

1. A free Poly Haven equirect JPG, dropped into a project, runs the 3D Scene Flow
   unattended and produces a splat gallery card.
2. Clicking that card opens the Scene workspace; the user can fly through the room
   and it is recognisably the panorama's space.
3. A capture from a new angle lands as an image card and can be used as an i2v
   input without any manual file handling.
4. That splat card copies into a second project via the existing Add-to-project
   flow, arrives with its OWN `.ply` (not a path back into the source project),
   and still opens there.
5. Deleting a Scene card removes its `.ply`. **Re-scoped from "exports to zip with
   the `.ply` included" - Vision has no zip export (amendment 19).** Leaking 387 MB
   per delete is the real risk that criterion was reaching for.
6. `npm test` and `npm run test:desktop` green; `npm run release:check` passes.
7. The Flow is hidden in a released build.

## Preservation Notes

- **`docs/` needs a new subsystem doc** for the splat scene pipeline. Per the
  no-dump-file rule it gets its own file, routed from `docs/README.md`. Candidate:
  `docs/splat-scenes.md`. Durable facts (the Brush CLI contract, the COLMAP layout,
  the camera-path text format, the coverage presets, the measured timings) belong
  there, NOT in memory. **Add the Phase 1 contract to it:** a Scene card is an image
  card carrying `splatPath`, the `.ply` is `.meta/<id>.splat.ply` on the
  `DERIVATIVE_RE` convention, and it is deliberately NOT a media type (amendment 18).
  A future agent's first instinct will be to add one.
- `.claude/rules/workspaces.md` says "Three workspaces" - must be updated to four.
- `.claude/rules/component-*.md` maps need refreshing after the new Block and
  Primitive land (`mpic-update-component-map`).
- **Licence obligations to honour on redistribution:** Brush Apache-2.0
  (LICENSE + NOTICE), SphereSfM `colmap_sphere` **BSD-3-Clause**, SplatKit MIT,
  ComfyUI-Mickmumpitz-Nodes MIT, Matrix-3D MIT, MoGe MIT/Apache-2.0. The
  BSD-3-Clause one is easy to miss because the pack around it is MIT.
- Memory candidate (environment/tooling, not codebase): a ComfyUI node's
  **registered type is not necessarily its Python class name** - trust the
  workflow JSON, not the source. This cost a false blocking finding during this
  very investigation.
- `dev_configs/smoke-evidence.json` is untouched by this work - no engine bump is
  involved. The pinned engine (`v0.31.0`, `43cb4ff`) already ships
  `comfy_extras/nodes_gaussian_splat.py`.
- If Phase 0's gate fails, decision 3 in Current State re-opens; the
  `ffmpegBinary.js`-clone alternative is written up in brief.md.
