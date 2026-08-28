# Head Swap

> Swap a selected head in a base image with the head from a reference character image.
> Card: **MPI-299** (child of MPI-259 Flows v2). Descriptor is REGISTERED in `flowsRegistry.js`
> and its carousel `steps` + controls **SHIPPED** (MPI-306 Phase 2, 2026-07-18). It **RUNS on
> the local engine** — the LoRA is already on this machine. It does **not** run on RunPod or on
> any other machine — see blockers.
>
> Portable UI decisions made here live in [../ui/](../ui/), not in this file.

## Status — SHIPS; weights are live, RunPod verification outstanding

**Runs locally AND distributable.** The graph's node 109 loads
`qwen\bfs_head_v5_2511_merged_version_rank_32_fp32.safetensors`, present in
`G:\CubricModels\loras\qwen\` (1,206,402,600 bytes) and now on R2. A local failure is a
REAL bug — do not write it off as the missing LoRA.

| Item | State | Notes |
|---|---|---|
| LoRA precision | **SETTLED** 2026-07-18 | rank-32 fp32 (1.2GB) kept. The rank-16 fp16 (307MB) LOST in two generations. NOTE: that file is a quarter the size and only HALF the saving is precision — the rest is RANK. A rank-32 fp16 (~600MB) would be the real precision-only test, but HF publishes none. The finding is "rank-16 fp16 lost", NOT "fp16 lost" |
| R2 upload | **DONE** 2026-07-19 | Live at `models.cubric.studio/vision/models/loras/qwen/`. Round-trip verified: served bytes hash to `0a137e61…07cd10`, matching local exactly; `sha256` set in `loraDeps.js`. rclone writes REQUIRE `--s3-no-check-bucket` (a scoped token 403s on CreateBucket — reads like no-write-access when write is fine) |
| Workflow synced | **DONE** | `raw/flow_head_swap.json` + regenerated runtime, injection rules pass |
| RunPod verification | **OPEN** | Now unblocked by the upload — never run against the remote engine |

> **Do not repeat this mistake:** MPI-306 Phase 2 was verified "by inspection, not by
> generating" on the inherited claim that the graph 404s. It does not — locally. The claim
> conflated *not uploaded to R2* with *not on disk*. One `ls` of the models folder settles it;
> check the disk before declaring a flow unrunnable. See memory
> `feedback_test_user_instinct_first`.

**MPI-304 is DONE** — `requiredDeps` exists (`flowsRegistry.js`), and Head Swap is its first
consumer (`requiredDeps: ['qwen-lora-headswap']`). No longer a blocker.

Qwen itself is **wired, tested and live** (`qwen-edit`, MPI-300) — only RunPod verification
is outstanding, which does not block this flow.

## Shape (from the authored graph, 2026-07-18)

- **Model:** `qwen-edit` — already shipped, with `tierSelect` driving `qwenTier → Input_Tier`.
  This flow's tier switch mirrors it exactly (no new tier work).
- **Extra dependency:** a head-swap LoRA, flow-only. See § Dependency below.
- **Output:** `mediaType: 'image'`, single output, shown on the shared before/after surface —
  `result: { compare: 'image1' }` (MPI-585). The BEFORE is the plate being KEPT, never `image2`:
  the head donor shares no framing with the output, so comparing against it would put two
  unrelated pictures either side of the bar. Outside the head the two plates are pixel-identical
  — the same property the hero's wipe is built on — so the reveal crosses one steady scene.
  Contract: [../ui/result-pane.md](../ui/result-pane.md).
- **No component (MPI-572).** The tier is a declared `radio` field (`Input_Tier`, 1/2/3) on the
  run slide; the boxes are carousel STEPS (`kind:'box'`) that declare `param: 'box1'` / `'box2'`.
  `MpiFlowHeadSwap` was deleted — those two declarations are all it ever was. See
  [../ui/box-gizmo.md](../ui/box-gizmo.md) and [../ui/carousel-frame.md](../ui/carousel-frame.md).

### The UI, as shipped (MPI-306 Phase 2)

Four steps, all DATA on the FlowDef — no per-flow layout code:

| Step | Ticker | What |
|---|---|---|
| 0 | Inputs | two slots, labelled `Original` / `Face Reference` (`labels` on the media group) |
| 1 | Target head | `box` step, role `image1`, `param:'box1'`, `ratio:1` — "Mark where the new head goes" |
| 2 | Reference head | `box` step, role `image2`, `param:'box2'`, `ratio:1` — "Mark which head to take" |
| 3 | Generate | `Input_Tier` radio + Generate → result |

**The box→node mapping is DECLARED on the step (`param`), not written in JS** (MPI-572). The
frame collects `{[role]: {box}}` and still never learns what a role means; which box masks and
which crops stays flow knowledge — the flow just says it in one word instead of a component.
Coords pass through **unconverted** — `MpiStepBox` already reports clamped top-left source
pixels — with only the `w`/`h` → `width`/`height` rename the injector's widget names need, and
that rename lives with the `box` KIND (`stepValueToParam`, `stepKinds.js`).

Tier cost labels are the MEASURED relative ratios (`baseline` / `~25% of time` /
`~13% of time`), never absolute seconds ([../ui/carousel-frame.md](../ui/carousel-frame.md)
§ Tier cost is RELATIVE).

### Injection surface (`Input_*` / `Output_*`)

| Node | Kind | Notes |
|---|---|---|
| `Input_Image` | image (path-reading) | base image, 1..N characters |
| `Input_Box` | `Mpi Box` | → `Mpi Box Mask` → Inpaint Crop |
| `Input_Image_2` | image (path-reading) | reference character |
| `Input_Box_2` | `Mpi Box` | → `Mpi Box Crop` |
| `Input_Tier` | int | 1=Quality, 2=Turbo, 3=Hyper |
| `Input_Seed` | int | |
| `Output_Image` | image | |

**No `Input_Positive` / `Input_Negative`** — both prompts are BAKED in the graph (the
head-swap instruction and the quality negative). A fixed-prompt outcome flow, which is the
point: the user picks regions, not words.

Tier drives `Mpi Any Switch` (accelerator LoRA: none / 8-step / 4-step), `Mpi Math` (CFG
2.5→1.0) and a steps switch (20 / 8 / 4) — the same three-tier pattern as shipped Qwen, whose
deps already include `qwen-edit-lightning-4step` / `-8step`.

Also depends on the `comfyui-inpaint-cropandstitch` node pack (Inpaint Crop / Inpaint Stitch).

## Dependency — the flow-only LoRA

`bfs_head_v5_2511_merged_version_rank_32_fp32.safetensors` — **1.2GB** (1,206,402,600 bytes).
Live on R2 and wired as `qwen-lora-headswap` in `loraDeps.js`.

**Source: `Alissonerdx/BFS-Best-Face-Swap`, licence MIT** (recorded 2026-08-03, MPI-429).
Confirmed BY HASH, not by memory — that repo's blob carries oid
`0a137e61…07cd10`, identical to the dep's recorded `sha256`, under the same filename.

**The lesson this dep taught, at real cost.** It shipped with **no `origin` at all**, and
`origin` is the input to the MPI-429 mirror sweep. So when every weight got a second
download origin (R2 is one host; one ISP filter on it kills the whole catalogue), a
968-repo sweep could not place this one — its author was never a candidate — and it became
the ONLY dep in the catalogue with a single route, flagged `noMirror: true`, until Fabio
named the repo by hand. The upstream copy had been byte-identical the entire time. **Record
`<owner>/<repo>` + the upstream filename on every dep you add**;
[add-model/02-dependencies-r2.md](../../add-model/02-dependencies-r2.md) § `origin` is
LOAD-BEARING is the rule.

**fp32 vs fp16 — SETTLED 2026-07-18, do not re-run.** The rank-16/fp16 build (307MB) LOST
in two generations. Note what was NOT tested: that file is a quarter the size and only half
of that is precision — the other half is RANK. A rank-32 fp16 (~600MB) would be the real
precision-only comparison, but no such file exists officially. So the finding is "rank-16
fp16 lost", NOT "fp16 lost".

**It must NOT become a `qwen-edit` dependency.** That would push 1.2GB onto every Qwen user
for one dev-gated flow. The scaling case that settles it: a flow wanting 30 style LoRAs would
tax all users ~15GB.

The entry itself belongs in `loraDeps.js` (deps are filed by KIND, and this is a LoRA); what's
missing is the flow's ability to *require* it — **MPI-304**.

## Region selection — settled

The user picks the head region with a box. The flow injects one `Mpi Box` node per image
(`x`, `y`, `width`, `height` — **top-left** anchored), and the graph's consumers do the rest.

**BOTH images get a box**, but they feed DIFFERENT consumers:

| Image | Box node | Consumer | Purpose |
|---|---|---|---|
| `Input_Image` (base) | `Input_Box` | `Mpi Box Mask` | mark which head gets replaced |
| `Input_Image_2` (reference) | `Input_Box_2` | `Mpi Box Crop` | cut out the head to take |

The base image needs a **mask** (full-frame, white rect at the box) for the edit; the
reference needs a **crop** (the region itself). Same box type, same injection, different
consumer — nothing flow-side distinguishes them.

Boxing the reference means the user supplies a **close-up portrait** and marks the head in
the flow, rather than pre-cropping outside it — no guessing whether the crop caught too much
or too little. Same gizmo twice, no extra UI.

Full contract, the verified centre-anchor finding, and the reasoning against a painted mask:
**[../ui/box-gizmo.md](../ui/box-gizmo.md)** — that is the portable record, do not duplicate
it here.

Why a box at all: the pipeline crops a square, so a non-square selection would clip the
result.

## Hair detector dead end — do not re-walk

Sequence that killed it (2026-07-17 → 18), recorded so nobody repeats the search:

1. Goal was to mask **face + hair** (= head). A face detector already ships; hair was missing.
2. **No hair-only detector exists** in the usual places — `Bingsu/adetailer` has face / hand /
   person but no head or hair; Ultralytics' own HF org ships base YOLO only, not ADetailer
   detectors.
3. Found `hair_yolov8n-seg_60.pt` (`jags/yolov8_model_segmentation-set`, 6.77 MB, apache-2.0,
   SHA256 `3112ced2bd21b48ca2a4357c2927b7e423d9ff851bc976de182a6c05f5851da0`; mirrored in
   `alexgenovese/ultralytics/segm`). It is a **segm** model → SEGM_DETECTOR slot.
4. **It fails on multi-person images** — the hair mask itself is bad, not merely ambiguous.
   Faces detect and select fine per-person; hair does not. This is what killed auto-detection.
5. Alternative `Anzhc HeadHair seg y8m.pt` (head+hair as one class, ~54.9 MB) exists but is
   **AGPL-3.0** — copyleft, flag before shipping.
6. Outcome: **manual box selection**, no detector dependency. A detector may later *seed* the
   box position (see [../ui/box-gizmo.md](../ui/box-gizmo.md) § Interaction) but must never be
   required.

**HF "Unsafe" flag is a non-issue** — it is the pickle-format scanner, and every YOLO `.pt`
trips it, including the face/hand/person detectors already shipped. Not a new risk.

## Open questions

- ~~Coord convention the gizmo hands the flow~~ — **SETTLED** (MPI-306 Phase 1): `MpiStepBox`
  reports **top-left anchored, absolute source pixels**, clamped to the image, which is what
  `Mpi Box` consumes unconverted. No conversion anywhere.
- Whether face detection seeds the initial box, or selection is fully manual in v1.
  (v1 default is the whole image; a step is never invalid.)
- ~~Final `requiredModels` list once Qwen lands~~ — **SETTLED**: `['qwen-edit']` +
  `requiredDeps: ['qwen-lora-headswap']`.
- Multi-output: does one run ever produce more than one image?

## Notes

- Head Swap is the **4th flow** → the dev-gate lifts at ≥4 (MPI-259 item F). Decide whether the
  three plumbing flows (Image Regen, SDXL 4K, Video Stitch) stay before that becomes public.
- This flow is the first to drive a real UI/UX pass, so its portable decisions seed
  [../ui/](../ui/) for every flow after it.
