# Head Swap

> Swap a selected head in a base image with the head from a reference character image.
> Card: **MPI-299** (child of MPI-259 Apps v2). **NOT YET BUILT** — design record only.
>
> Portable UI decisions made here live in [../ui/](../ui/), not in this file.

## Status — blocked

| Blocker | Owner | Notes |
|---|---|---|
| **MPI-304** — apps can't require deps | agent | `requiredDeps` doesn't exist yet; the head-swap LoRA has nowhere to live that doesn't tax every Qwen user. **Blocks wiring** |
| LoRA precision undecided | user | fp32 (1.2GB) vs fp16 A/B in progress — decides what gets uploaded |
| R2 upload | user go-ahead | LoRA is local-only; needs a `models.cubric.studio` URL + SHA256 before it can be a dep. **Do NOT upload until precision is settled** |
| Workflow not synced | user | Graph is DONE in ComfyUI (`app_head_swap`); needs saving + `raw/` drop + sync |

Qwen itself is **wired, tested and live** (`qwen-edit`, MPI-300) — only RunPod verification
is outstanding, which does not block this app.

## Shape (from the authored graph, 2026-07-18)

- **Model:** `qwen-edit` — already shipped, with `tierSelect` driving `qwenTier → Input_Tier`.
  This app's tier switch mirrors it exactly (no new tier work).
- **Extra dependency:** a head-swap LoRA, app-only. See § Dependency below.
- **Output:** `mediaType: 'image'`, single output.
- **uiComponent:** yes — the box gizmo, see [../ui/box-gizmo.md](../ui/box-gizmo.md).

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
head-swap instruction and the quality negative). A fixed-prompt outcome app, which is the
point: the user picks regions, not words.

Tier drives `Mpi Any Switch` (accelerator LoRA: none / 8-step / 4-step), `Mpi Math` (CFG
2.5→1.0) and a steps switch (20 / 8 / 4) — the same three-tier pattern as shipped Qwen, whose
deps already include `qwen-edit-lightning-4step` / `-8step`.

Also depends on the `comfyui-inpaint-cropandstitch` node pack (Inpaint Crop / Inpaint Stitch).

## Dependency — the app-only LoRA

`bfs_head_v5_2511_merged_version_rank_32_fp32.safetensors` — **1.2GB** (1,206,402,600 bytes),
currently local-only at `G:\CubricModels\loras\qwen\`. Origin: HuggingFace; needs an R2 upload
before it can be a dep entry.

**An fp16 variant exists** and is being A/B'd against fp32 — roughly half the size at
negligible quality cost for a rank-32 merge. Decide precision BEFORE uploading; only the
winner goes to R2.

**It must NOT become a `qwen-edit` dependency.** That would push 1.2GB onto every Qwen user
for one dev-gated app. The scaling case that settles it: an app wanting 30 style LoRAs would
tax all users ~15GB.

The entry itself belongs in `loraDeps.js` (deps are filed by KIND, and this is a LoRA); what's
missing is the app's ability to *require* it — **MPI-304**.

## Region selection — settled

The user picks the head region with a box. The app injects one `Mpi Box` node per image
(`x`, `y`, `width`, `height` — **top-left** anchored), and the graph's consumers do the rest.

**BOTH images get a box**, but they feed DIFFERENT consumers:

| Image | Box node | Consumer | Purpose |
|---|---|---|---|
| `Input_Image` (base) | `Input_Box` | `Mpi Box Mask` | mark which head gets replaced |
| `Input_Image_2` (reference) | `Input_Box_2` | `Mpi Box Crop` | cut out the head to take |

The base image needs a **mask** (full-frame, white rect at the box) for the edit; the
reference needs a **crop** (the region itself). Same box type, same injection, different
consumer — nothing app-side distinguishes them.

Boxing the reference means the user supplies a **close-up portrait** and marks the head in
the app, rather than pre-cropping outside it — no guessing whether the crop caught too much
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

- Coord convention the gizmo hands the app (top-left+side vs centre+side) — conversion is in
  [../ui/box-gizmo.md](../ui/box-gizmo.md), just pick one and stay consistent.
- Whether face detection seeds the initial box, or selection is fully manual in v1.
- Final `requiredModels` list once Qwen lands.
- Multi-output: does one run ever produce more than one image?

## Notes

- Head Swap is the **4th app** → the dev-gate lifts at ≥4 (MPI-259 item F). Decide whether the
  three plumbing apps (Image Regen, SDXL 4K, Video Stitch) stay before that becomes public.
- This app is the first to drive a real UI/UX pass, so its portable decisions seed
  [../ui/](../ui/) for every app after it.
