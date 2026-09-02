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

> **Session note 2026-08-31 (eleventh). PHASE 2 OPENED, THE RUNTIME GRAPH EXISTS AND
> RUNS, AND TWO OF MY OWN CLAIMS HAD TO BE RETRACTED.** The measured work first:
> **amendment 43** killed the rule Phase 2's bounds check was about to be built on -
> a rail's REACH does not predict its damage (Spearman -0.50 on hole%, and rail 144,
> the worst reconstruction in the set, has the second-SMALLEST reach). The bounds
> check must stay a per-waypoint test against the MoGe extent, and passing it is
> necessary but nowhere near sufficient.
>
> Then Phase 2 task 1. **Amendment 44 claimed no Brush trainer node existed and put a
> three-route architecture fork to Fabio; amendment 45 retracts it.** `MpiBrushTrain`
> had existed for two days - `splat.py:201`, registered, committed `5e07043`, an
> ancestor of the pinned commit. 44 searched the spike's SAVED `object_info.json`,
> captured six hours BEFORE the node was committed. Route A was never a decision.
>
> **Amendment 46: the graph is built and the injection surface works.**
> `flow_3d_scene.api.json`, 51 -> 61 nodes, copy-and-extended from the proven 4-rail
> graph under asserts. `Input_Image`, `Input_Name`, `Input_Rail_1..4`, `Input_Steps`;
> `Output_Image`, `Output_Splat`. The finding worth the session: **`MpiBrushTrain` is
> not an `output_node`**, so a graph ending at it is refused (`prompt_no_outputs`) and
> in a graph with other outputs it is silently PRUNED - the first build would have
> baked three hours, returned `success`, and produced no splat. Feeding its path into
> a **`PreviewAny` titled `Output_Splat`** fixes both halves with no node-pack change,
> because the app already reads exactly that shape for `Output_prompt`
> (`commandExecutor.js:1712-1728`). **Task 2 is therefore much smaller than the plan
> assumed** - point the existing text capture at a second title, not mirror the image
> capture path.
>
> **The full run: rails GOOD, tail LOST to my own bad call. Amendment 47.** All four
> rails completed - 164 frames, 164 proxies, 15 GB of composites, **on disk and
> intact, nothing needs re-baking**. Then the machine hit 74 GB committed against
> 63.8 physical. Cause verified by diffing the graphs: the merged graph feeds
> `pano_frames_1..4` from **live IMAGE tensors** where the proven split graph read
> them **off disk**, and the SfM node needs all four rails at once. **So the Flow does
> not need two workflows or a purge between stages** - it needs the SfM reading
> proxies from disk. I then reported the run as hung and got an interrupt approved on
> that basis; it was not hung, `sphere_cubic_reprojecer` was at frame 73 of 164 at
> ~5.8 s each, and the log's `exit 4294967295` is my kill. I had sampled CPU on the
> PARENT process, grepped for child processes with a pattern that could not match the
> one doing the work, and watched a file that stage does not write.
>
> **Nothing is blocked and no decision is pending.** The next job is mechanical:
> rebuild the SfM + Brush stage reading `_spheresfm_work/proxies/` off disk (split per
> rail into `by_traj/traj00..03` the way `make_chunk7.py` does it), dispatch it
> standalone against `mpi623_flowtest`, ~20-30 min, and the splat lands. The bake does
> NOT need repeating.

> **Session note 2026-09-01 (twelfth). THE SPLAT LANDED - AND THE FOLD-BACK IT WAS
> SUPPOSED TO UNLOCK IS RETRACTED INSTEAD.** The mechanical half went exactly as the
> handoff said: proxies read off disk, four manifests over `frames/`, SfM ->
> `MpiBrushTrain` -> `PreviewAny`, dispatched standalone against the intact
> `mpi623_flowtest` bake. **`success` in 30.5 min, `export_5000.ply` 51.2 MB /
> 216,810 splats, 984 images, ONE sparse model** with `on_split: stop` armed. Amendment
> 46's `PreviewAny` capture returned the path through `/history` exactly as designed.
> **Nothing was re-baked** and the by_traj copy the handoff prescribed was not needed.
>
> **Then the two findings that stop the next step - amendments 48 and 49.** ComfyUI
> caches a node's WHOLE output tuple and never evicts anything the CURRENT prompt
> produced (`caching.py:556-561`; no caller anywhere passes `free_active=True`), so any
> link from a composite to the late SfM pins that composite's tensors - the STRING
> manifest and the IMAGE outputs are one entry. And the four composites execute in
> **reverse** slot order (proved off the bake's own mtimes), which kills the cheap
> shared-folder `skip_first_images` wiring. Then the measurement: **this run peaked at
> 8.59 GB with 30.6 GB still free**, doing the same SfM over the same 164 frames that
> the merged graph did while holding 47.3 GB and hitting 0 MB. **[That 8.59 GB was
> WRONG - see amendment 51. The run peaked at 42.79 GB with 3.76 GB free; I read a
> RUNNING peak 7 minutes before the spike and quoted it as the run's.]** The spike sits
> INSIDE the SfM node and does not care where the frames were read from - this run was
> disk-fed and spiked anyway. So amendment 47's "ONE graph, ONE dispatch" is still
> retracted and its diagnosis was closer to right than 49 credited: the 47 GB IS the SfM
> stage. Two dispatches is the answer because that spike needs the machine otherwise
> empty, and only a NEW PROMPT bumps the cache generation and frees the previous stage.
> **Carry the risk: stage B alone left 3.76 GB free on a 68.5 GB box.**
>
> **The fold-back was deliberately NOT done** - it would have baked a non-fix into the
> reference graph. **Fabio chose TWO DISPATCHES the same session, and amendment 50 builds
> it:** `flow_3d_scene_a.api.json` (57 nodes, rails -> composites -> `Output_Image`) and
> `flow_3d_scene_b.api.json` (14 nodes, proxies off disk -> SfM -> Brush ->
> `Output_Splat`), both validated against the live `/object_info`, with B's path plumbing
> proven on the bench in seconds. B needs no hires manifests at all - `hires_dir` +
> `*.png` globs the shared folder in exactly the concat order and asserts the count.
> **The app side is small:** `submitFlowGeneration` is one job with `onComplete`, so job 2
> chains off job 1 - two ordinary jobs, no surgery in `commandExecutor`'s lane machinery.
>
> **Next, and it is repo wiring rather than bench work:** a second workflow name on
> `FlowDef`, and which job owns the Scene card. **One gap found in passing and it is
> real - `ComfyUI-SplatKit` is not in `dev_configs/node_lock.json`**, so every node this
> card depends on is undeclared. Nothing is blocked.

> **Session note 2026-09-01 (thirteenth). THE CHAIN IS BUILT AND BOTH OF 50's OPEN
> QUESTIONS ARE ANSWERED - and the rest of the wiring is held by a LIVE PEER, not by a
> decision.** `js/services/flowService.js` now runs a `chain: { operation }` flow as two
> ordinary jobs: leg 1, then leg 2 from leg 1's `onComplete`, one completion reported to
> the caller (on leg 2), leg 2 carrying no media and REUSING leg 1's `tempId` so Cancel
> and live previews keep working without touching `MpiBaseFlow`. `tests/flow-chain.test.cjs`
> - 7 tests, four of them EXECUTING the real `chainCallbacks`, and the important one was
> watched go red first. **860/860 on `npm test`, lint clean.** Amendment 52.
>
> **Q1: a second OP, not a second `workflow` field** - the op picks the graph, and MPI-591's
> `flowLtxExtend.byModel` is the precedent. **Q2: job 1 owns the card and job 2 attaches
> `splatPath` to it** - leg 1's still is worth keeping if stage B dies at 3.76 GB free.
>
> **What is NOT done, and why.** MPI-664's session `d6f5361e` holds a FRESH write claim on
> all five Phase 2 registry files plus `MpiBaseFlow.js`; MPI-591's live session holds
> `generationService.js` / `commandExecutor.js`, where the `Output_Splat` capture and the
> `splatPath` write belong. `flowService.js` + its test were the only unowned paths.
> **And `comfy_workflows/flow_3d_scene_a.json` / `_b.json` still do not exist** - the canvas
> authoring is Fabio's half, so the `chain` field has no consumer and nothing end-to-end is
> verifiable yet. **Next:** re-check those claims, then descriptor + two ops + capture +
> attach in one pass. Phase 2's `user-ux` gate is untouched and still owed.

> **Session note 2026-09-01 (fourteenth). THE CAPTURE IS BUILT, AND AMENDMENT 52's
> BLOCKER WAS NEVER ONE.** Re-reading `state/index.json` against
> `coordination-ops/statuses.md` settled it in one line: **only `claimed` means an active
> writer.** MPI-664's claim is `needs_verification` and MPI-591's is `complete`, so all
> seven files 52 listed were free — the previous session read "a record exists" as "a peer
> holds it". The sole live `claimed` record in the tree is MPI-591's
> `ComfyUi-MpiNodes/h3.py`, which this card does not want.
>
> **What landed: the `Output_Splat` capture.** `splatViewFileInfo` in
> `js/utils/comfyOutputUrls.js`, plus the title set, the `executed` branch and the
> `splatUrl` side-output in `commandExecutor.js`. `tests/flow-splat-capture.test.cjs`,
> 4 tests, all five mutations watched go red first. **864/864 on `npm test`, lint clean.**
> Amendment 53.
>
> **The finding: `Output_Splat` reports a PATH, not a file dict** — `MpiBrushTrain` shells
> out to Brush, which writes the `.ply` itself, so there is no save node. Amendment 46 read
> this as a string read; it is a string read **plus a fetch**. No decision needed: the node
> writes under `<comfy_output>/splats/…`, so `/view` serves it over the same authed proxy
> on the bench AND on a Pod, and the derivation splits at the `splats/` segment the node
> owns rather than at an output dir the app never learns.
>
> **NEXT, and it is the ingest, unblocked and un-started.** Phase 1 wants
> `.meta/<id>.splat.ply` and **nothing ingests one** — `routes/projects.js:2299-2308` is
> only the add-from-cards copy. Thread `splatViewUrl` through
> `generationService.onComplete` -> `projectService.saveGeneration` ->
> `/project/save-generation`, where a `streamDownload` beside the `audioViewUrl` mux
> (`routes/projects.js:1956`) writes the file and sets `meta.splatPath`. Both server files
> carry MPI-678 `needs_verification` provenance — free to edit, provenance to respect. That
> widened past what this session had told Fabio it would touch, so it was stopped and
> handed back rather than taken quietly. **Fabio's half is unchanged and still gates the
> descriptor:** `flow_3d_scene_a.json` / `_b.json` do not exist, and
> `tests/inject-params-titles.test.cjs:918` reds on a FlowDef naming an absent file.

> **Session note 2026-09-01 (fifteenth). THE INGEST IS DONE, AND THE `.ply` NOW LANDS
> INSIDE THE PROJECT.** `splatViewUrl` runs `generationService.onComplete` ->
> `projectService.saveGeneration` -> `/project/save-generation`, where a `streamDownload`
> beside the `audioViewUrl` mux writes `.meta/<id>.splat.ply` and stamps `meta.splatPath`.
> Phase 1's contract is finally satisfied end to end on the app's side: a Scene card is an
> image card whose companion `.ply` is in the project, owned by `DERIVATIVE_RE`, copied by
> `add-from-cards` and swept on delete. **869/869 on `npm test`, lint clean.** Amendment 54.
>
> **The two things the shape had to get right.** A bake produces ONE scene, so the URL is
> handed to the FIRST item only — threaded to every item, N cards would each re-fetch
> hundreds of MB of the same file. And the route RETURNS `splatPath`, which the live image
> item picks up: the reconciler only hydrates a sidecar on RELOAD, so without that a
> freshly-baked Scene card would not open its own scene until a restart. That is the exact
> miss `flowId` had in MPI-256, found by reading its comment rather than by hitting it.
>
> **Failure is absence, never a half-set path.** A failed fetch removes the stub, logs, and
> leaves `splatPath` OFF the sidecar — the still is still worth keeping, and a card
> pointing at a `.ply` that is not there looks right until it is opened, three hours after
> the bake that produced it.
>
> **NEXT: the descriptor, and it is still Fabio's gate.** `comfy_workflows/flow_3d_scene_a.json`
> / `_b.json` do not exist; `tests/inject-params-titles.test.cjs:918` reds on a FlowDef
> naming an absent graph, and the two `UNIVERSAL_WORKFLOWS` entries are covered by NO
> existence assertion, so landing them ahead of the graphs would pass CI and sit there as a
> landmine. Everything the app needs to receive a bake is now built and unconsumed:
> the chain, the capture, the ingest. Phase 2's `user-ux` gate is still owed and CANNOT be
> exercised until the graphs exist — there is no Flow to run.

> **Session note 2026-09-02 (sixteenth). THE SPIKE IS NOT IN ANY STAGE — MEASURED, FOUR
> WAYS, AND STAGE B IS ~18 GB NOT 43.** Amendment 55. `sphere_cubic_reprojecer` peaks at
> **0.147 GB flat over 339 s** (it streams, and it is a subprocess that never entered
> ComfyUI's working set). Nothing in SplatKit's python or `MpiBrushTrain` holds more than
> one face — per-face `imread`, hardlinked staging, read from source. **Brush caches one
> decoded u8 RGB copy per training view, lazily: 7.93 GB measured at 2000 steps / 87%
> coverage, ~10 GB at full** — with VRAM flat at 4.7 GB, so it is host-side, not a device
> spill. Add the node's own ~7.7 GB of proxy tensors and stage B is **~18 GB**, which a
> 32 GB machine survives.
>
> **51's 42.79 GB is therefore UNRECONCILED, not retracted** — no stage reproduces it,
> `rammon.log` is gone, and 51's reading came from the composed prompt which was never
> re-run. Settling it needs stage B whole (`chunk8_sfm_brush_disk.json`, ~30 min GPU) with
> a **tree-wide 1 s** sampler; the sampler is what 51 got wrong twice. **Fabio's call.**
>
> **The bound is a flag nobody passes:** Brush v0.3.0 has `--max-resolution` (default
> **1920**), `--max-frames` and `--subsample-frames`; `MpiBrushTrain` passes none and
> exposes none. 1280 puts the cache at 4.50 GB. `/mpi-nodes-sync` plus a pin bump. Also:
> the faces are 2048² against that 1920 ceiling, so **the dual-res chain's last 6% is
> discarded by a default nobody chose** — the one stage the whole design exists to sharpen.
>
> **A PROBE TRAP WORTH CARRYING:** `--total-steps 1` writes an `export_1.ply` and looks
> like proof the dataset loaded. It is not — that ply is the SfM point cloud from
> `sparse/0`, byte-identical (7,667,774) at 960 and at 1920. Brush loads views lazily, so
> a probe cheap enough to be quick measures nothing.

> **Session note 2026-09-02 (seventeenth). THE TWO PACKS ARE DECLARED — `eb8efab0`.**
> `ComfyUI-SplatKit` (`f59de252`) and `ComfyUI-Mickmumpitz-Nodes` (`4d5ff7c4`) are in
> `dev_configs/node_lock.json` and `nodesDeps.js`, both MIT, both `installRequirements:
> true`, 0.55 MB and 0.18 MB. Both SHAs verified reachable upstream through the API, and
> `lockUrl()` resolves each to its commit archive. **No R2 upload was involved**, which is
> what made this half separable from the parked weights.
>
> **The curated python set needed ONE line and it costs a user nothing:** `click`, which
> `--check` reported as the only uncovered requirement across both packs. It was already
> in `python_deps.txt` transitively via `huggingface-hub`, so the regenerated lock moves
> four lines and adds no package. It is needed because `core/matrix3d_pipeline.py:243`
> `importlib`-execs the vendored `scripts/infer_panorama.py`, whose `@click` decorators
> run at module level. 875/875 on `npm test`, lint clean, pushed on a green master.
>
> **STILL OWED on the dependency task:** MoGe as a real pre-staged dep (the node fetches
> it uncontrolled today) and the Wan 2.1 / Matrix-3D weights — that half is the R2 upload
> and stays parked. And `max_resolution` on `MpiBrushTrain` is still unwritten: the value
> is a decision, not a default to inherit.
>
> **AMENDED SAME SESSION - `max_resolution` IS WRITTEN AND THE VALUE IS 2048.** Fabio
> called it. `MpiBrushTrain` now takes an optional `max_resolution` INT (default 2048,
> 256-8192) and passes `--max-resolution`; MpiNodes `30b8ed1f`, pinned in
> `dev_configs/node_lock.json` (`78f5630c`). Appended below `brush_path` so no saved
> workflow moves a socket. The flag name and arity were read off `brush_app.exe --help`
> on the pinned v0.3.0 binary, not from memory - `--max-resolution <MAX_RESOLUTION>`,
> `[default: 1920]`. 876/876 on `npm test`.
>
> **What 2048 buys and costs:** the chain renders 2048 faces, so nothing is discarded any
> more; the view cache goes from ~10 GB to ~11.5 GB, which stage B at ~18 GB absorbs.
> 1280 remains the escape hatch at 4.5 GB. **NOT YET VERIFIED BY A BAKE** - that needs the
> GPU, and the sharpening claim is arithmetic until a run shows it.

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

### Amendments from the Phase 2 opening (2026-08-31)

43. **A RAIL'S REACH DOES NOT PREDICT ITS DAMAGE - SO THE PHASE 2 BOUNDS CHECK CANNOT
    BE A RADIUS CAP.** The five shipped rails are `SplatKit_CameraPlotRenderControlGeo`
    nodes in `ds_shipped.json`; 27/122/133/144/157 are **node ids**, not an ordering,
    and a "rail" is just that node's `anchors` text. Measured with `rail_extent.py`
    (no GPU, pure geometry against the damage already recorded in amendments 37/41/42):

    | rail | mode | maxR | path len | maxY | span XZ | hole | psnr face0 |
    |---|---|---|---|---|---|---|---|
    | 27 | look_at_target | 1.406 | 1.743 | 0.219 | 1.455 | 6.1% | 29.27 |
    | 122 | per_point_look | **1.628** | 3.268 | 0.043 | 2.400 | 5.6% | 25.82 |
    | 133 | per_point_look | 1.544 | 2.660 | 0.423 | 1.852 | 37.8% | 28.24 |
    | 144 | per_point_look | 1.044 | 1.954 | 0.387 | 1.307 | **94.3%** | **20.86** |
    | 157 | per_point_look | **0.859** | 1.870 | **0.811** | 0.911 | 11.8% | 27.39 |

    Spearman rho against reach, n=5 and therefore indicative only: hole% **-0.50**,
    psnr **+0.10**, corr floor **-0.30**. The sign is **backwards** from the
    hypothesis - the farthest-reaching rail (122, 1.628) has the *smallest* hole
    (5.6%), and the worst rail on every splat measure (144) has the second-*smallest*
    reach (1.044). Rail 157, the best-behaved of the five, reaches least of all.

    **This does not contradict amendment 15, it bounds it.** Amendment 15 measured the
    ALTERED anchors in `hires_api_largest.json`, which reached 2.44 and -2.27; amendment
    30 then found those files were never the shipped piloting at all. Every *shipped*
    rail sits at or under 1.63, i.e. all five are already inside the room, so this table
    says nothing about what happens beyond the wall - it only says that **within the
    scene, distance travelled is not the axis that hurts.** Consistent with amendment
    37, which found hole size does not predict splat quality either.

    **Consequences for Phase 2.**
    - The "bounds check before the bake" task must stay what it already says - *does
      every waypoint land inside the MoGe geometry* - and must NOT be cheapened into a
      scalar `reach > K` reject. That rule is now measured to be wrong on the only five
      rails we have evidence for.
    - Passing the bounds check is **necessary, nowhere near sufficient.** Rail 144 is
      the proof: comfortably inside the scene and still the worst reconstruction in the
      set. A preset can be legal and still be bad, so preset authoring needs its own
      held-out evidence, not just a geometry gate.
    - `maxY` is the one column where 157 is an outlier (0.811 against 0.423 next), and
      it is the best-behaved rail. **One point is not a finding** - noted as a candidate
      axis for the `high-then-dive` preset, to be tested, not assumed.
    - The shipped anchors are in **absolute units** and are the source material for the
      normalised presets, not the presets themselves. Normalise against the scene extent
      the graph already computes; these five give a sanity range for what a sensible
      normalised reach looks like in a room this size.

44. **[RETRACTED BY AMENDMENT 45 - the node exists and is pinned. The SplatKit
    inventory below is still correct; the conclusion drawn from it is not.]**
    **THERE IS NO BRUSH TRAINER NODE - PHASE 2's FIRST TASK IS BUILT ON A NODE THAT DOES
    NOT EXIST, AND THE WHOLE PHASE FORKS ON WHAT REPLACES IT.** Phase 2 opens with "build
    the runtime workflow: SplatKit dataset creation + the Brush trainer node in ONE graph".
    Checked against `/object_info` before writing any code: **SplatKit ships 27 nodes and
    not one of them trains a splat.** They cover the dataset, the rails, the composite and
    the SfM - `DatasetProject`, `CameraPlotRenderControlGeo`, `HiResComposite`,
    `SphereSfMDatasetDualRes` - and stop at a COLMAP model. The only nodes in the entire
    install that *return* a `splat` are `File3DToSplat` (loads one off disk), `MergeSplat`,
    `GetSplatCount`, `TransformSplat` and `VAEDecodeTripoSplat` (TripoSG - a single-object
    generative model, not scene-from-dataset). `SaveGaussianSplat` / `PreviewGaussianSplat`
    are real `output_node`s but both need a splat handed TO them.

    **The spike never used ComfyUI for this step and the plan lost track of that.** Brush is
    `brush_app.exe`, a **158.8 MB standalone binary** (303 MB extracted) driven by
    `subprocess` from `brush_swap157.py` - hence amendment 8's clean-root requirement and
    amendment 9's "writes nothing to stdout, poll `--export-path`". Both amendments are
    descriptions of an EXTERNAL process, and neither reads that way once you are looking
    for a node. Licence is **Apache 2.0** (`brush/extracted/LICENSE`), so redistribution is
    not the blocker.

    **This blocks more than task 1.** Task 2 - "extend the output-capture layer to accept a
    splat output (`Output_Splat*`, mirroring `Output_Image*`)" - is only coherent if the
    splat is a ComfyUI output at all. `commandExecutor.js:1681-1692` builds its capture set
    from `Output_*` node titles and `_collectComfyOutputUrls` reads images/gifs/videos from
    `/history`; a `.ply` that Brush wrote to a path ComfyUI never heard of cannot be
    captured by that layer no matter what it is titled. So the fork decides the shape of
    the capture work too, and neither task should start before it is answered.

    **The three routes, none of them started - Fabio's call:**
    - **A. Wrap Brush as a first-party node** in `ComfyUi-MpiNodes` (`/mpi-nodes-sync`
      governs). Restores "one graph, one dispatch" exactly as Phase 2 assumes, and lets
      `Output_Splat*` be a genuine `output_node` so task 2 mirrors `Output_Image*` honestly.
      Cost: a new node in the sibling repo, and the 158.8 MB binary becomes a declared
      dependency on every user's disk.
    - **B. Two stages, app-orchestrated.** The graph stops at the SfM dataset, the app then
      runs `brush_app.exe` itself and adopts the `.ply`. Closest to what the spike proved
      and needs no new node - but it breaks the Flow's "one dispatch" premise, puts a
      long-running native process under the app's own supervision rather than the queue's,
      and task 2 becomes "adopt a file from disk", not a capture-layer extension.
    - **C. Something else trains it.** No candidate found in this install; would need a
      third-party trainer node that takes a COLMAP dataset. Listed for completeness, not
      recommended on present evidence.

    **Do not pick one by inference.** A is the only route that leaves Phase 2's existing
    task list true as written, which is a reason to prefer it and NOT evidence that it is
    right - it also puts a 158.8 MB binary into the dependency system and a whole trainer
    into a node pack we maintain.

45. **AMENDMENT 44 IS WRONG ON ITS CENTRAL CLAIM AND IS RETRACTED: `MpiBrushTrain`
    ALREADY EXISTS, IS REGISTERED, AND IS INSIDE THE PINNED COMMIT.** Route A was not a
    decision to take - it was taken during Phase 0 and then lost. `splat.py:201` in
    `ComfyUi-MpiNodes` defines `MpiBrushTrain` (`dataset_path` + `total_steps` in,
    `ply_path` STRING out, `CATEGORY = "MpiNodes/Splat"`), it is imported and registered in
    `__init__.py:108/226/342`, it landed as **`5e07043` on 2026-08-29 17:40**, and
    `git merge-base --is-ancestor 5e07043 53c0198` confirms it is an ancestor of the pinned
    commit - three commits back from HEAD. Node repo tree is clean, HEAD == `origin/main`,
    and `node_lock.json` == HEAD. **It ships to users today.**

    **How amendment 44 went wrong, because the failure mode is reusable.** It searched
    `D:\WORK\MPI-623-spike\object_info.json`, a SNAPSHOT captured **2026-08-29 11:16** -
    six hours and twenty-four minutes BEFORE the node was committed. Every statement it
    makes about that file is true; the file just predates the answer. The 27-node SplatKit
    inventory in 44 is still correct and still worth having (SplatKit really does stop at a
    COLMAP model), but "there is no Brush trainer node" was a claim about the whole install
    drawn from a stale local artefact. **`/object_info` is a LIVE endpoint - a saved copy of
    it is evidence about the past, and the node pack's own source is the authority on our
    own nodes.** The node's docstring even says "Cubric Vision MPI-623, Phase 0"; a grep of
    `c:\AI\Mpi\ComfyUi-MpiNodes` would have cost one call and settled it.

    **What the node already handles - it is not a stub.** Brush is fetched per platform on
    first use from the GitHub release and **checksum-verified against pinned sha256s**
    (`BRUSH_VERSION v0.3.0`, win/macos/linux assets), so amendment 44's "the 158.8 MB
    binary becomes a declared dependency on every user's disk" is wrong too - it is an
    on-demand fetch, not a shipped payload. It stages a single-model root (**amendment 8**),
    polls the export dir for `export_{iter}.ply` because Brush is silent off a TTY
    (**amendment 9**), drives a real `comfy.utils.ProgressBar` off that step count, and
    kills the child on `BaseException` so a cancelled prompt cannot leave Brush holding the
    GPU. `export_every` / `sh_degree` / `max_splats` / `brush_path` are already exposed.

    **What this leaves for Phase 2 task 1** - unchanged in substance, only in premise. The
    graph is authorable today: SplatKit's dataset + rail + composite + `SphereSfMDatasetDualRes`
    nodes, then `MpiBrushTrain`, in one graph. Two things still stand from 44 and are NOT
    retracted: the hard rule that the graph is authored in the LOCAL ComfyUI and never
    hand-edited (so the spike's script-assembled chunk graphs cannot be shipped as-is, and
    they are split across seven chunks for GPU leasing besides), and the task-2 question of
    how a `.ply` reaches the capture layer - `MpiBrushTrain` returns a PATH STRING, not a
    ComfyUI output, so `Output_Splat*` still needs deciding against
    `commandExecutor.js:1681-1692`.

46. **THE PHASE 2 RUNTIME GRAPH EXISTS AND RUNS - AND `PreviewAny` IS THE ANSWER TO
    TASK 2, WITH A PRECEDENT ALREADY IN THE APP.** Built as
    `D:\WORK\MPI-623-spike\flow_3d_scene.api.json` by `make_runtime_graph.py`, which
    copy-and-extends `hires_api_q4_4rail.json` - the graph whose four rails carry the
    SHIPPED piloting and whose SfM node already merges them - under asserts that fail the
    build rather than write a wrong graph. 51 -> 61 nodes. Injection surface:
    **`Input_Image`, `Input_Name`, `Input_Rail_1..4`, `Input_Steps`**; outputs
    **`Output_Image`** and **`Output_Splat`**.

    **The finding that matters, and it was two minutes of GPU rather than three hours.**
    `MpiBrushTrain` has `output_node = False`. A graph that merely ENDS at it is rejected
    outright - ComfyUI returned `{"error": {"type": "prompt_no_outputs"}}` - and, worse,
    in a graph that has other outputs it is simply **pruned and never executed**, because
    ComfyUI only runs the subgraph feeding an output node. The first build of the runtime
    graph had exactly that shape: `Output_Image` came off the composite and the trainer
    dangled. It would have validated, run for three hours, produced a still, and produced
    **no splat at all**, with `success` in `/history`.
    **Fix, no node-pack change:** `MpiBrushTrain.ply_path` -> a **`PreviewAny`** titled
    `Output_Splat`. That forces execution AND puts the path in `/history` where the app can
    read it. It is the SAME capture shape the app already implements for `Output_prompt`
    (`commandExecutor.js:1712-1728` - title-scoped, a PreviewAny used for debugging is
    ignored). So task 2 does not need `Output_Splat*` to mirror `Output_Image*`'s
    image-capture path at all; it needs the existing text-capture path pointed at a second
    title.

    **Proved before the long run, on the real bench** (`test_brush_link.py`, 2-node graph,
    500 steps): **success in 85 s**, `/history` returning
    `{"3": {"text": ["D:\\WORK\\Images\\Outputs\\splats\\mpi623_wanq4_swap157_7ar3kamo\\export_500.ply"]}}`
    with `export_250.ply` and `export_500.ply` on disk. That also exercised
    `stage_clean_dataset`'s hardlink path against a real `_spheresfm_work` dataset.

    **Other edits, each asserted:** `LoadImage` -> `MpiLoadImageFromPath` (path-reading,
    `block_if_empty`), verified first that all **nine** consumers read index 0;
    `DatasetProject.dataset_name` and the four rails' `anchors` converted from widgets to
    links off titled `PrimitiveString`s; the card's still taken as frame 0 of the
    `traj_index 0` composite via `MpiGetImageAtIndex` -> `SaveImage` (a real view from
    inside the baked room, which the source panorama is not).

    **Known gaps, deliberate.** Rail **orientation** stays a widget - rail 27 is
    `look_at_target` and the other three are `per_point_look`, so a coverage preset that
    changes orientation needs a second injected field per rail. And this file is
    **API-format and script-assembled**, which the add-flow playbook forbids shipping: it
    is a proof and a reference for authoring the graph on the ComfyUI canvas, not the
    `comfy_workflows/raw/` file. Do not commit it as one.

    **Full run dispatched** 15:30, `prompt_id 836bbbfa`, 61 nodes ACCEPTED with
    `node_errors: none`, into the fresh dataset name `mpi623_flowtest` (fresh because
    `DatasetProject` carries `reset=true`). Draft 5000 steps so the splat is comparable to
    amendments 37 and 42 rather than unscoreable. Values set **by title**, not by node id,
    so the run also proves the injection surface is reachable the way the app reaches it.

47. **THE MERGED GRAPH'S 47 GB IS LIVE IMAGE TENSORS, NOT OVERLAPPING STAGES - AND THE
    RUN THAT EXPOSED IT WAS KILLED BY A MISDIAGNOSIS, NOT BY A HANG.** The full runtime
    graph ran the four rails correctly (164 frames, 164 proxies, 15 GB of composites, all
    on disk and INTACT - **nothing needs re-baking**) and then drove the machine to
    **74 GB committed against 63.8 GB physical, 0 MB available**, with ComfyUI's python
    holding **47.3 GB private**.

    **The cause, verified by diffing the two graphs rather than reasoned:**

    | | `pano_frames_1..4` fed from |
    |---|---|
    | split chunks (`chunk7`, ran twice, succeeded) | `VHS_LoadImagesPath` - read off DISK |
    | merged runtime graph | `SplatKit_HiResComposite` - live IMAGE tensors |

    `SphereSfMDatasetDualRes` consumes all four rails at once, so ComfyUI must hold four
    decoded frame batches resident simultaneously. That is the 47 GB. It is **not** WAN's
    offloaded weights and **not** two stages overlapping - `/system_stats` showed
    `torch_vram_total` already down to 2.5 GB. `hires_1..4` are unaffected because they
    are JSON manifests, not pixels (amendment 38).
    **Consequence: the Flow does NOT need two workflows or an explicit purge between
    stages.** One graph and one dispatch survive; the SfM's `pano_frames_*` must read the
    proxies off disk the way the proven split graph did. `MpiClearVram` exists in the pack
    if an explicit purge is ever wanted, but nothing here calls for one.

    **The misdiagnosis, recorded because the method was wrong, not just the answer.** I
    reported the run as hung with "nine minutes of zero progress" and Fabio approved an
    interrupt on that basis. It was not hung. `sphere_cubic_reprojecer` was working
    through the frames at ~5.8 s each and had reached **frame 73 of 164**; the log's
    `failed (exit 4294967295) after 425.2s` is exit -1, i.e. MY kill. Three method errors
    stacked:
    - CPU was sampled on the ComfyUI **parent** (0.1 s per 20 s wall) while the work ran
      in a **child** process.
    - The child-process grep was `colmap|glomap|brush`, which **does not match**
      `sphere_cubic_reprojecer`. It "found" only a 0.2 GB `colmap_sphere` and that read as
      "nothing is running".
    - `database.db`'s mtime was used as the progress signal; the reprojection stage does
      not write it. The real signal was `_spheresfm_work/equirect_hires/` and the node's
      own stdout, both available at the time.

    The memory pressure was real and was genuinely degrading the run - available RAM hit
    0 and `POST /free` returned **200 having released nothing**, exactly the shape
    `~/.claude/memory/tools/` records. But "stalled" was a stronger claim than the
    evidence carried, and it is the claim that cost the tail of a 140-minute run.

### Amendments from the disk-fed SfM session (2026-09-01)

48. **THE FOLD-BACK IS NOT A ONE-LINE REWIRE, AND TWO OF AMENDMENT 47'S WORKING
    ASSUMPTIONS DO NOT SURVIVE THE SOURCE.** Both facts below are read out of code and
    off disk, not reasoned.

    **(a) ComfyUI caches a node's WHOLE output tuple, and nothing produced by the
    CURRENT prompt is ever evicted.** `RAMPressureCache.ram_release`
    (`comfy_execution/caching.py:556-561`) skips every entry whose
    `used_generation[key] == self.generation` unless `free_active=True` - and a grep of
    the whole tree shows **no caller ever passes `free_active=True`**
    (`comfy/memory_management.py:184-187` is the only wrapper, and it defaults to
    `False`). RAM-pressure caching is the DEFAULT mode in this ComfyUI 0.34.2
    (`comfy/cli_args.py:140`), so it was already on during the merged run and could not
    help. Consequence: **any** link from a `SplatKit_HiResComposite` to the late SfM
    node pins that composite's entire output tuple - including
    `proxy_frames` and `gate_masks` - for the whole prompt. Feeding `pano_frames_*` off
    disk while `hires_N` still comes off the composite's `hires_manifest` frees
    **nothing**: the string and the tensors are one cache entry.

    **(b) The four composites execute in REVERSE slot order.** Measured off the bake's
    own mtimes in `mpi623_flowtest`: `traj03_frame_manifest.json` 16:08,
    `traj02` 16:41, `traj01` 17:13, `traj00` 17:45. So the cheap disk-fed wiring - one
    `VHS_LoadImagesPath` per rail on the SHARED `proxies/` folder with
    `skip_first_images = 41*N` - is **unsafe**: the traj03 loader would run first, when
    only 41 files exist, and slot 4 would load an empty batch. (The arithmetic itself is
    sound - VHS does `sorted(os.listdir)` -> skip -> cap, `utils.py:137-141` /
    `load_images_nodes.py:41-46`, and the folder does sort `traj00..traj03`, 41 each.
    It is the ORDER that kills it.)

    **What the fold-back therefore needs:** the SfM node must take **no direct link from
    any composite** - not the frames, not the manifest - while something still forces the
    composites to run first. The shape that does both is one small node per wire:
    `composite_N.proxy_dir` -> a glob-to-IMAGE loader -> `pano_frames_N`, and
    `composite_N.hires_dir` -> a glob-to-manifest node -> `hires_N`. **Neither node
    exists**: SplatKit's `LoadDatasetImagesOrdered` (`upscale.py:531`) reads a FINISHED
    COLMAP dataset, and `VHS_LoadImagesPath` has no glob. They are ~40 lines each in
    `ComfyUi-MpiNodes`, which we own - but that is a node-pack change plus a
    `node_lock.json` pin bump, i.e. `/mpi-nodes-sync` and **Fabio's call**, not a
    silent edit to the reference graph.

    **STILL OPEN, and it must be MEASURED not argued:** whether cutting those links
    actually drops peak RAM enough to keep one graph and one dispatch. The composites'
    cached tuples stay resident either way by (a), and `proxies`/`gates` are built at
    proxy resolution (`core/hires_composite.py:1092-1126`), not at 8K - so the "four
    decoded frame batches = 47 GB" in amendment 47 is not yet a measured claim. The
    standalone run in this session does the SAME 164-frame concat with NO composites in
    the prompt, so its peak is the SfM stage's cost on its own; that number is the one
    that settles it. **Do not retract amendment 47 on arithmetic - retract it, or
    confirm it, on that measurement.** *(Measured in 49 - it retracts.)*

49. **THE SPLAT LANDED, AND THE MEASUREMENT RETRACTS AMENDMENT 47's CONCLUSION.**
    `chunk8_sfm_brush_disk.json` (built by `make_sfm_disk.py`) - the four rails' proxies
    read off disk, four `{dir,paths}` manifests over `_spheresfm_work/frames`, into
    `SphereSfMDatasetDualRes` -> `MpiBrushTrain` (5000 / sh_degree 3 / max_splats 10M)
    -> `PreviewAny` titled `Output_Splat`. Dispatched standalone against the INTACT
    `mpi623_flowtest` bake; nothing was re-baked.

    **Result: `success` in 30.5 min.** `/history` returned
    `{"162": {"text": ["D:\\WORK\\Images\\Outputs\\splats\\mpi623_flowtest_sfm_90qi73e7\\export_5000.ply"]}}`,
    which is amendment 46's `PreviewAny` capture working end to end. On disk:
    **51.2 MB, 216,810 splats, SH degree 3**, against the 4-rail Draft bake's 53.3 MB -
    comparable, as intended. Dataset `mpi623_flowtest_sfm`: **984 images** (164 frames x
    6 cube faces) and **ONE** sparse model, with `on_split: stop` still armed, so the
    four shipped rails merge.

    **[THE PEAK FIGURE FIRST WRITTEN HERE - 8.59 GB - WAS WRONG AND IS CORRECTED BY
    AMENDMENT 51. The real peak is 42.79 GB.]** It was read off the sampler at the 23
    minute mark, which was BEFORE the spike; 8.59 GB was a running peak, not the run's.
    The conclusion below survives, but not for the reason it gives - read 51.

    **So the SfM's frame batches were never the 47 GB, and amendment 47's remedy does
    not work.** ~~All 164 proxy frames, the concat, COLMAP and Brush together fit in
    8.6 GB.~~ *(Wrong - 51.)* The claim that stands: feeding `pano_frames_*` off disk
    does not save a merged graph, because by 48(a) nothing the current prompt produced is
    evictable, and inside a merged graph it would ADD a second cached copy of the proxies
    beside the composites' own.

    **Consequence, and it reopens a question Fabio already had right.** "The Flow keeps
    ONE graph and ONE dispatch" is retracted. The only shape ever measured to survive is
    the split one, and the mechanism is now understood: **a new prompt bumps the cache
    generation, which is the only thing that makes the previous stage's outputs
    evictable.** Two dispatches - rails+composites, then SfM+Brush off disk - is
    therefore the working design, and `MpiClearVram` is not the lever (that is VRAM;
    this is host RAM). **This is Fabio's call**, together with whether the Flow layer
    can issue two prompts for one Flow, and it should be settled before
    `flow_3d_scene.api.json` is fed back into a canvas graph.

    **Not done deliberately:** the disk-fed wiring was NOT folded back into
    `flow_3d_scene.api.json`. The handoff called that mechanical; it is not - 48(b)
    kills the cheap wiring and 49 removes the reason for it. Folding it in now would
    bake a fix that does not fix anything into the reference graph.

50. **FABIO CHOSE A: TWO DISPATCHES. The reference graph is split, both halves validate,
    and the app shape turns out to be small.** Built by `make_flow_graphs_ab.py` under
    asserts, checked by `validate_graph.py` against the **live** `/object_info` (amendment
    45's rule - a saved `object_info.json` is evidence about the past):

    | | nodes | injection surface |
    |---|---|---|
    | `flow_3d_scene_a.api.json` | 57 | `Input_Image`, `Input_Name`, `Input_Rail_1..4` -> `Output_Image` |
    | `flow_3d_scene_b.api.json` | 14 | `Input_Name`, `Input_Steps` -> `Output_Splat` |

    Both: every class installed, every required input set, every link typed and in range.

    **A keeps all four composites even with the SfM gone**, because
    `SplatKit_HiResComposite` has `OUTPUT_NODE = True` (`hires_composite.py:373`). That is
    the opposite of `MpiBrushTrain` in amendment 46, and it is the reason A does not need
    a keep-alive output per rail.

    **B needs NO hires manifests at all.** With `hires_dir` set and `hires_glob = *.png`
    the node takes `sorted(glob.glob(...))` over the shared `frames/` folder and asserts
    the count equals the wired frame total (`upscale.py:1788-1798`). That sorted order IS
    the concat order of `pano_frames_1..4`, so four `PrimitiveString` manifests collapse
    into one directory string - and a mismatch fails loudly instead of silently pairing
    the wrong 8K file to a pose.

    **B's `skip_first_images` is safe, and 48(b) does not apply to it.** The reverse
    execution order only matters when the composites are in the SAME prompt. In B there
    are none: all 164 proxies are on disk before the prompt starts.

    **Proved on the bench in seconds, no GPU work** (`test_pathwire.py`):
    `Input_Name` -> `SplatKit_DatasetProject(reset=False)` -> `JoinStrings` returns
    `...\mpi623_flowtest\_spheresfm_work\proxies` and `...\frames`, **164 files each**,
    with the bake untouched. That was B's only untested edge - chunk8 hardcoded absolute
    paths.

    **The app shape, and it needs no surgery.** `submitFlowGeneration` ->
    `enqueueGeneration` is ONE job carrying `onComplete` (`js/services/flowService.js:43`),
    and the queue runs jobs in order. So A is **job 1, then job 2 chained from job 1's
    `onComplete`** - two ordinary jobs, each one prompt, each honouring the lane-settle
    invariants MPI-463/461 exist to protect. Nothing has to flow between them at runtime
    because the dataset name is `Input_Name`, known before either starts. **Do not build a
    two-prompt job inside `commandExecutor`'s lane machinery** - that is the expensive
    version of the same thing.

    **Two open wiring questions, both Fabio's at the time of wiring, neither blocking:**
    a `FlowDef` carries ONE `workflow` field, so the registry needs a second workflow name
    (or the second submit happens programmatically); and job 1 produces the still while
    job 2 produces the splat, whereas Phase 1's contract is ONE image card carrying
    `splatPath` - so either job 1's card is suppressed and job 2 re-emits the still, or
    job 2 attaches `splatPath` to job 1's card.

    **Found in passing, and it is a real gap: `ComfyUI-SplatKit` is NOT in
    `dev_configs/node_lock.json`.** Every node this whole card depends on comes from an
    UNDECLARED pack - it exists only on the bench. That belongs with the batch's task 2
    (dependency declarations), and it is bigger than the weights.

    **Deliberately not run: B end to end.** It is `chunk8_sfm_brush_disk.json` with the
    two path edges now proven separately, and a full run is another 30 min of GPU on a
    dataset that already has its splat. Run it when B is being wired, against a fresh
    `Input_Name`, not now.

51. **CORRECTION TO 49: THE DISK-FED SfM PEAKED AT 42.79 GB, NOT 8.59 GB - AND THE SPIKE
    IS INSIDE THE SfM NODE, WHERE THE FRAMES COME FROM MAKES NO DIFFERENCE TO IT.**
    The full 179-sample profile (`rammon.log`, 30 s interval), restricted to the run's own
    0-30.6 min window:

    | t | ComfyUI working set | system RAM available |
    |---|---|---|
    | 0-16 min | 8.6 -> 4.4 GB | ~36 GB |
    | 24.2 min | 21.1 GB | 22.8 GB |
    | **24.7 min** | **42.79 GB** | **3.76 GB** |
    | 25.2 min | 2.6 GB | 44.7 GB |

    One spike of about a minute near the END of `SphereSfMDatasetDualRes` - after the
    cubic reprojection, as the COLMAP dataset is assembled - then fully released. The
    proxy batches themselves are the flat 4-8 GB across the first 16 minutes, which is
    what 49 mistook for the whole run. **How the error was made, because it is the same
    shape as amendment 47's:** the sampler prints a RUNNING peak; it was read at 23.2 min,
    quoted as the run's peak, and the run had 7 minutes and its entire spike still to go.
    A number read from a live counter is a number about the past.

    **What this changes, and what it does not.**
    - **Amendment 47 was closer to right than 49 credited.** The 47.3 GB in the merged run
      IS the SfM stage; it is not "everything else in the prompt". 49's *conclusion*
      stands - reading proxies off disk does not fix a merged graph - but its reason was
      wrong. The real reason is now measured: **this run was disk-fed and spiked to
      42.79 GB anyway.** The spike does not care where the frames were read from.
    - **Two dispatches (amendment 50) is more strongly justified, not less.** The SfM
      stage needs ~43 GB of headroom at one moment. In the merged graph that spike lands
      ON TOP of four composites, WAN and the models, none of it evictable by 48(a) - which
      is exactly how the box reached 0 MB. Stage B needs the machine otherwise empty, and
      a separate prompt is the only thing that gives it that.
    - **A REAL RISK, now on the record: even standalone, stage B left only 3.76 GB free on
      a 68.5 GB box.** A larger scene, more rails, or a bigger `face_size` could OOM stage
      B on its own, and a user machine with 32 GB would likely not survive this scene at
      all. Before this Flow ships, the spike needs a name - the prime suspect is the
      float32 chain over the 984 cube faces on the way to disk - and either a bound or a
      documented RAM floor. **Do not treat stage B as cheap because it is short.**

### Amendments from the chain-wiring session (2026-09-01)

52. **THE A -> B CHAIN IS BUILT, AND BOTH OPEN QUESTIONS FROM 50 ARE ANSWERED - but the
    registry half of the wiring is BLOCKED BY A LIVE PEER, not by a decision.**

    **What landed** (`js/services/flowService.js`, +59/-5, and `tests/flow-chain.test.cjs`,
    7 tests): a flow declaring `chain: { operation }` runs as two ordinary jobs. Leg 1
    enqueues normally; `chainCallbacks` wraps its `onComplete` to dispatch leg 2, and the
    CALLER sees ONE completion, on leg 2 - the flow is not done until the second half is.
    Leg 1's own card still lands when leg 1 finishes, because the run path commits it, not
    this callback. Three details worth keeping:
    - **Leg 2 carries no media** (`mediaItems = _leg.operation ? []`). Its graph reads what
      leg 1 wrote to disk, addressed by `Input_Name`, so re-sending the source would stage
      a file nothing loads.
    - **Leg 2 REUSES leg 1's `tempId`.** `MpiBaseFlow` holds exactly one `_myTempId` per run
      and matches live latents AND Cancel through it, so a fresh id would leave the pane
      unable to cancel or preview the second half. The legs are sequential, so nothing
      shares the id at one moment. This is what let the chain avoid touching `MpiBaseFlow`.
    - **Leg 2 failing to enqueue forwards leg 1's completion** rather than leaving the pane
      spinning on a job that never entered the queue.

    **Q1 answered - a second op, NOT a second `workflow` field on `FlowDef`.** The op is
    what picks the graph (`universal_workflows.js`); `FlowDef.workflow` is read only by the
    title tests. MPI-591 already set the precedent for one flow spanning two graphs
    (`flowLtxExtend.byModel`). So the Scene flow declares `flow3dSceneBake` and chains
    `flow3dSceneSplat`, and no new workflow field exists.

    **Q2 answered - JOB 1 OWNS THE CARD, job 2 attaches `splatPath` to it.** Lazier than
    suppress-and-re-emit, and leg 1's still is worth keeping on its own if stage B dies at
    3.76 GB free. **The attach itself is NOT built** - nothing yet writes `splatPath` on a
    fresh generation (Phase 1 landed only the field and the add-from-cards copy).

    **`chainCallbacks` takes the leg-2 dispatch as an ARGUMENT on purpose.** Importing
    `flowService.js` in node works; reaching `enqueueGeneration` does not, and
    `mock.module` needs `--experimental-test-module-mocks`, which `npm test` does not pass.
    Injecting the one function is what turned an untestable branch into four executed
    tests. The wrap was watched go red (forwarding leg 1 immediately) before being believed.

    **BLOCKED, and it is a live claim rather than a decision.** MPI-664's session
    `d6f5361e` holds a FRESH `write` claim on `js/data/flowsRegistry.js`,
    `js/data/commandRegistry.js`, `js/data/modelConstants/universal_workflows.js`,
    `js/core/operationRegistry.js`, `operation_registry.json` and `MpiBaseFlow.js` - the
    whole Phase 2 registry surface. MPI-591's live session `e27d2b3f` additionally holds
    `complete` claims on `generationService.js` and `commandExecutor.js`, which is where
    the `Output_Splat` capture and the `splatPath` write belong. So the descriptor, the two
    ops, the capture and the attach all wait; `flowService.js` and the test were the only
    unowned paths and they are done.

    **Also still true and unrelated to any claim: `comfy_workflows/flow_3d_scene_a.json`
    and `_b.json` DO NOT EXIST.** The canvas authoring is Fabio's half, and a `FlowDef`
    naming files that are not there reds `tests/inject-params-titles.test.cjs`. Nothing
    end-to-end is verifiable until those land - the `chain` field has no consumer yet, by
    design rather than by omission.

### Amendments from the capture session (2026-09-01)

53. **THE `Output_Splat` CAPTURE IS BUILT. Both blocking claims had cleared, and the
    ATTACH half turned out bigger than amendment 46 read it.**

    **The claims, first, because amendment 52 called this the blocker.** MPI-664's
    `db2037f3` is now `needs_verification`; MPI-591's `da9845c4` is `complete`.
    `coordination-ops/statuses.md` is explicit: *only* `claimed` means an active writer,
    and `complete` / `needs_review` / `needs_verification` / `needs_integration` are all
    available to a new writer who carries the existing provenance. So the seven files
    52 listed were never going to need a handoff — they needed a re-read. The one live
    `claimed` record in the tree is MPI-591's `ComfyUi-MpiNodes/h3.py`, which this card
    does not want.

    **What landed** (`js/utils/comfyOutputUrls.js`, `js/services/commandExecutor.js`,
    `tests/flow-splat-capture.test.cjs`, 4 tests): a `PreviewAny` titled `Output_Splat`
    is read by the SAME text path as `Output_prompt` — exact title match, lowercased, no
    numbered siblings — and its string is turned into a `/view` URL that rides out on
    `onComplete` as `splatUrl`. 864/864, lint clean. All five mutations (`lastIndexOf`
    -> `indexOf`, the directory guard, `type=output` -> `input`, dropping the forward,
    a title typo) were watched go red before the tests were believed.

    **The finding that matters: `Output_Splat` reports a PATH, not a file dict.**
    `MpiBrushTrain` shells out to the Brush binary, which writes the `.ply` itself
    (`splat.py:295`, `return (ply_path,)`), so there is no save node and nothing emits
    `{filename, subfolder, type}`. Amendment 46 read the capture as a string read; it is
    a string read **plus a fetch**. Resolvable without a decision, and this is why:
    the node writes under `folder_paths.get_output_directory()/splats/…`
    (`splat.py:242`), so the file is reachable over the same authed `/view` proxy as
    every other output — including on a Pod, whose disk is not ours and whose absolute
    path the app could never open. The app never learns the engine's output dir, so
    `splatViewFileInfo` splits at the `splats/` segment the NODE owns instead, taking
    the LAST one (a user folder called `splats` further up would otherwise capture the
    split) and returning null for any other shape, because a half-built URL 404s at save
    time and turns a three-hour bake into a card with a dead `splatPath`.

    **WHAT IS NOT DONE, and it is scope rather than a blocker: the ingest.** Phase 1's
    contract wants `.meta/<id>.splat.ply` inside the project, and **nothing ingests one**
    — `routes/projects.js:2299-2308` is only the add-from-cards COPY. The remaining
    thread is `generationService.onComplete` -> `projectService.saveGeneration` ->
    `/project/save-generation`, where a `streamDownload` beside the existing
    `audioViewUrl` mux (`routes/projects.js:1956`) writes the file and sets
    `meta.splatPath`. That reaches two files this session had said it would not widen
    into (`routes/projects.js`, `js/services/projectService.js`, both carrying MPI-678
    `needs_verification` provenance), so it was stopped and handed back rather than
    taken quietly.

    **Still Fabio's half, unchanged:** `comfy_workflows/flow_3d_scene_a.json` / `_b.json`
    do not exist, so the descriptor still cannot land —
    `tests/inject-params-titles.test.cjs:918` reads `graphOf(flow.workflow)` and records a
    problem when the file is missing. The capture, like the chain before it, is landed
    ahead of its consumer by design.

### Amendments from the ingest session (2026-09-01)

54. **THE INGEST IS BUILT — the `.ply` is fetched into the project, and the failure mode
    is absence rather than a dead path.**

    **What landed** (`js/services/generationService.js`, `js/services/projectService.js`,
    `routes/projects.js`, `tests/splat-companion.test.cjs` +5 tests): `splatViewUrl` is
    threaded through the same three hops `audioViewUrl` already uses, and a
    `streamDownload` beside the audio mux writes `.meta/<id>.splat.ply` and stamps
    `metaContent.splatPath` in the `/project-file?path=` shape the `add-from-cards` copy
    re-points. 869/869 on `npm test`, lint clean.

    **Two decisions inside the wiring, both of which fail silently the other way.**
    The URL goes to the FIRST item only (`i === 0`): a bake produces one scene, and handed
    to every item N cards would each re-fetch the same hundreds of MB. And the route
    RETURNS `splatPath` so the LIVE item carries it — `projectReconciler.js` pushes the
    whole sidecar as the item, but only on RELOAD, so without the response field a
    just-baked Scene card would not open until a restart. That is `flowId`'s MPI-256 miss,
    avoided by reading the comment it left rather than by repeating it.

    **`splatPath` is set only when the bytes landed.** On a failed fetch the partial file
    is removed, a warning is logged, and the key is left OFF the sidecar. The still is
    kept — the bake ran and the card is its evidence — but a `splatPath` written
    optimistically is a card that reads as fine until someone opens it three hours later.
    The same reasoning as `splatViewFileInfo` returning null (amendment 53), one hop down.

    **It is image-only, deliberately.** `baseProps.splatPath` is set under
    `!isVideo && !isAudio`, because `createVideoItem`/`createAudioItem` do not declare the
    key and `tests/splat-companion.test.cjs` asserts they never carry it. A spread would
    have added it to every video item in silence.

    **Seven mutations watched go red** before the tests were believed: dropping the fetch;
    setting `splatPath` in the catch; renaming the companion `<id>.ply` (which takes it
    out of `DERIVATIVE_RE` and leaks 387 MB per delete); dropping the sidecar stamp;
    dropping `splatViewUrl` from the client's POST body; threading it to every item; and
    dropping it from the live item. The last three are the silent ones — the file still
    lands and every other assertion still passes.

    **The descriptor is STILL gated on Fabio.** `flow_3d_scene_a.json` / `_b.json` do not
    exist. Every app-side piece a bake needs — chain, capture, ingest — is now built and
    waiting for its consumer.

### Amendments from the RAM-spike session (2026-09-01)

55. **THE SPIKE IS NOT WHERE 51 PUT IT, AND 51's PRIME SUSPECT IS ELIMINATED BY
    MEASUREMENT.** Amendment 51 placed the 42.79 GB "inside the SfM node — after the
    cubic reprojection, as the COLMAP dataset is assembled", with "the float32 chain over
    the 984 cube faces on the way to disk" as prime suspect. **Both halves are wrong.**

    **(a) The reprojector is not it — measured, 333 samples at 1 s.**
    `sphere_cubic_reprojecer` re-run standalone against the intact `mpi623_flowtest_sfm`
    dataset held a **flat 0.147 GB peak across 339 s** while writing 164 faces. It
    streams: one equirect in, its faces out, nothing accumulates. It is also a
    *subprocess*, so it never entered ComfyUI's working set at all. Repro, no GPU, nothing
    re-baked, output to a scratch dir:

    ```
    colmap_sphere.exe sphere_cubic_reprojecer \
      --image_path <dataset>/_spheresfm_work/equirect_hires \
      --input_path <dataset>/_spheresfm_work/sparse/0 \
      --output_path <scratch> --image_ids 0
    ```

    **(b) Nothing in the python holds more than one face**, read from source rather than
    inferred: `repair_seam_columns` (`core/spheresfm_colmap.py:71`) does `cv2.imread` per
    face *inside* the loop; `_build_camera_sequences` (:116) parses basenames only; the
    hi-res staging is `os.link` with a copy fallback (:1672); and `stage_clean_dataset`
    (`ComfyUi-MpiNodes/splat.py:150`) hardlinks the 984 images rather than copying them.
    There is no float32 chain over the faces anywhere in the node.

    **(c) BRUSH CACHES ONE DECODED COPY OF EVERY TRAINING VIEW IN HOST RAM, LAZILY — and
    it is ~10 GB here, not 43.** Measured at 1 s against the real `_mpi_clean` root (984
    faces), default resolution, 2000 steps, 148.6 s: RSS climbs **monotonically** 0 → 1.75
    → 3.04 → 4.75 → 6.09 → 7.02 GB and then flattens at **7.93 GB**, releasing to 0.89 GB
    the instant the process exits. VRAM stayed at **4.7 GB peak** throughout, so this is a
    host-side cache, not a device allocation spilling back.

    A monotonic climb that plateaus is a per-view cache filling up. 2000 random draws over
    984 views touches ~855 of them (87%), and one **u8 RGB** copy per view at 1920 would be
    10.13 GB full / 8.81 GB at that coverage — against 7.93 GB measured. So the model is
    one decoded u8 RGB copy per view, cached on first use:

    RAM ≈ `N_views × min(face_size, max_resolution)² × 3 bytes` → **~10 GB full for this
    scene**, 4.50 GB at `--max-resolution 1280`, 2.88 GB at 1024.

    **TWO PROBES BEFORE THIS ONE WERE INCONCLUSIVE AND LOOKED CONCLUSIVE — the trap is
    worth naming.** `--total-steps 1` peaks at 1.90 GB and writes an `export_1.ply`, which
    reads as proof the dataset loaded. It is not: the step-1 ply is byte-identical
    (7,667,774) at `--max-resolution 960` and at the 1920 default, because it is the SfM
    point cloud from `sparse/0` and no image has been touched yet. **Brush loads views
    lazily, so any probe short enough to be cheap is short enough to measure nothing.** The
    tell was wall-clock: the 1920 run finished in 2.8 s against the 960 run's 25.6 s, and
    bigger images finishing 9x faster is not a thing.

    **THE BOUND IS A FLAG THE NODE ALREADY COULD PASS.** `brush_app.exe --help` on the
    pinned v0.3.0 binary carries **`--max-resolution` [default: 1920]**, `--max-frames` and
    `--subsample-frames`. **`MpiBrushTrain` passes none of them** — `splat.py:245-252` sends
    only `--total-steps`, `--export-path`, `--export-every`, `--sh-degree`, `--max-splats`,
    and `INPUT_TYPES` (:203) does not expose them. So the ceiling is Brush's own default,
    chosen by nobody. That is `/mpi-nodes-sync` plus a pin bump, and Fabio's call.

    **(d) SO THE 42.79 GB IS STILL UNEXPLAINED, AND STAGE B IS MUCH CHEAPER THAN 51 SAYS.**
    Every stage measured in isolation on the real dataset: reprojector 0.147 GB, Brush
    7.93 GB (~10 GB at full coverage), and the node's own proxy tensors ~7.7 GB by
    arithmetic (164 frames at 2048x1024 float32 = 3.84 GB, doubled by the `torch.cat`).
    **That totals ~18 GB, not 43 — and a 32 GB machine would survive it.** Nothing
    measured this session reproduces amendment 51's figure, and `rammon.log` is gone
    (session scratchpad, evicted), so it cannot be re-audited. Untested remainder: COLMAP's
    `feature_extractor`, `exhaustive_matcher` and `mapper`, all subprocesses, none of them
    plausible at this size (the match database is 143 MB and `points3D.bin` is 4.3 MB).

    **DO NOT retract 51 on this.** What is established is that no single stage needs 43 GB;
    what is not established is what the composed prompt does, and 51's own reading came
    from the composed prompt. Settling it means re-running stage B whole
    (`chunk8_sfm_brush_disk.json`, ~30 min of GPU) with a **tree-wide 1 s** sampler rather
    than a 30 s one on a single process — and the sampler is the part 51 got wrong twice
    already. **That run is Fabio's call**, and until it happens the honest number for the
    ship risk is "~18 GB measured stage-wise, 43 GB observed once, unreconciled".

    **A SECOND FINDING, NOT ABOUT RAM.** The faces are 2048² and Brush's default ceiling is
    1920, so **the bake trains at 1920² and the last 6% of the dual-res chain is discarded
    by a default nobody chose.** The entire point of dual-res (`upscale.py:1577` docstring)
    is to spend the 8K precisely where the trainer looks. Whatever `max_resolution` ends up
    being, it should be a decision.

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

Sequential - depends on the media type AND the bake path. ~~One graph, one dispatch.~~
**TWO graphs, TWO dispatches** - retracted by amendments 48-51, decided by Fabio
2026-09-01, and the chain is built (amendment 52).

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
