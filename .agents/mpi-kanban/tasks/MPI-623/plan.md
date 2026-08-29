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
> `c:\AI\Mpi\ComfyUi-MpiNodes\splat.py`, uncommitted in that repo, following its own
> `new-node.md` inline. It is NOT bench-verified: that needs the GPU. Amendment 22 has
> the CLI corrections and the two bugs the self-check caught; **amendment 23 is an open
> question for Fabio** about publishing a binary-downloading node to a registry whose
> `latest_version` is still stuck. **Next when the GPU frees: run a graph containing only
> `MpiBrushTrain` against the Phase 0 dataset** (`G:\MPI-623-spike\`, binary already
> extracted at `G:\MPI-623-spike\brush\extracted\brush_app.exe`, so pass it as
> `brush_path` and skip the download). Batch task 2 (dep declarations + R2 uploads) is
> untouched and needs Fabio - it uploads multi-GB weights.
>
> **Nothing is in flight, and the GPU is NOT available - Fabio is using it himself.** Do
> not take a lease, do not start the bench on 8188, do not dispatch anything. Phase 1
> needed no GPU. **Phase 1 is done, so the next unit - the `## Parallel Batch` bake path -
> is now unblocked; the queued rail-scaling check DOES need the GPU.** Ask Fabio whether
> the card is free before starting it.

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

### Verified NOT drifted from the source workflow (checked 2026-08-29)

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

- [~] **AUTHORED 2026-08-29, NOT YET BENCH-VERIFIED** (`c:\AI\Mpi\ComfyUi-MpiNodes\splat.py`,
      `MpiBrushTrain`, registered in `__init__.py` + README + changelog under V1.2.8;
      `sha256_file` added to `help_funcs.py`; `bin/` gitignored). Its `**Verify:**`
      below needs the bench, so the box stays open. Three corrections to the bullet as
      written, and two bugs the self-check caught - amendment 22. Proof with no GPU:
      `check_splat.py` in the pack, 12 assertions, run with the ComfyUI portable python.
- [ ] Add a Brush trainer node to the first-party pack. It downloads the
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
- [ ] Declare the dependencies: SplatKit + ComfyUI-Mickmumpitz-Nodes pinned in
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
- [ ] Pin the MpiNodes commit carrying the Brush node into
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
