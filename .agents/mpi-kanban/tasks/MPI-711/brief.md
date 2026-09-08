# MPI-711 — Localised video editing: the LanPaint/H3 route hit a wall, evaluate models built for the job

Written 2026-09-08. This card exists because the masked-edit work had **no card** for six
days and lived only in a chain of handoffs. Everything below is gathered from those, from
`docs/models/h3/`, and from measurements taken on 2026-09-08.

## The goal, unchanged

Localised edits inside a short window of an existing clip. Started as replacing a whole
character from an image reference; narrowed to the smallest possible case — **recolour a
woman's hair pink on a desert clip** — on the theory that if the small case will not work
the big one never will. It does not work.

## Prior record — five handoffs, no card

`.agents/mpi-kanban/state/archive/handoffs/`:

| date | id | what |
|---|---|---|
| 09-02 12:01 | `3b115282` | H3 video inpainting as first-party nodes; **`MpiH3DecodeAV` created**, `MpiH3EncodeAV` gained a mask |
| 09-02 16:20 | `95148d83` | proved end to end; five MpiNodes fixes, incl. `mask_mode` |
| 09-02 19:48 | `2e25fba7` | audio masking done and confirmed; **ref2v vs fl2v settled** |
| 09-03 10:58 | `cde47622` | rebuilt as a region detailer; encode/decode masks split |
| 09-08 17:20 | `6200d155` | ghost face traced to denoise=1; upscale made optional |

Bench workflow: `G:/ComfyUi/ComfyUI/user/default/workflows/flow_inpaint_h3_fl2va.json`
(NOT the app engine). First-party nodes: `c:/AI/Mpi/ComfyUi-MpiNodes/h3.py`.

## What was built and works

- `MpiH3EncodeAV` (optional mask) + `MpiH3DecodeAV` — **created for this workflow**, commits
  `aa62d6f`, `931b634` (`mask_mode`), `58e9879`/`e64c516`/`ec82d9a` (audio).
- SAM3-driven mask replacing LanPaint's interactive video mask editor.
- A region crop + optional upscale path on one switch (`#522`, `#512`, `#523`, `#513`).
- **Audio masking is FINISHED and user-confirmed** — `mix` mode, context-aware foley.

## Settled — do NOT re-open

- **ref2v vs fl2v**: quality a wash on matched seeds. ref2v wins on input flexibility
  (≤9 images, ≤3 videos, ≤3 audio). fl2v is not being fought. *(`2e25fba7`)*
- **turbo vs non-turbo**: also a wash, possibly turbo better. *(`2e25fba7`)*
- **The mask and the composite are correct** — 98% of changed pixels fall inside the drawn
  mask; the 2.2% outside is the feather ramp. *(`6200d155`)*
- **`shift_video: 12.0` is `MiniMaxH3SigmaShift`'s own default**, not a divergence.
- **~1 second / 22 frames is the DESIGN POINT, not a mistake.** LanPaint's video mask editor
  has the user mask a short stretch of the timeline; capturing only that stretch is the
  feature. H3's 124–362 trained range is where it was trained, not a floor it fails below —
  1s generations are proven fine here and in other workflows. Do not raise this again.
- **Text encoder**: the `ultra_uncensored_heretic_int8_convrot` build is the deliberately
  shipped weight. `nvfp4_awq` was adopted and reverted the same day (2026-09-05, MPI-698)
  for structural corruption. Prompt adherence A/B'd identical between them.
- **Audio is done.** No lip sync, nobody talking. Not a topic on this card.

## The wall

No denoise value works, because the two failure modes do not overlap:

| denoise | result |
|---|---|
| ≤0.4 | the plate wins — hair comes back rebuilt but the SAME colour |
| 0.6 | cartoon hair |
| 0.8–1.0 | a new face; saturation collapses |
| non-turbo 25 steps | oversaturated garbage (cfg 1.0 without a distilled LoRA) |

Measured 2026-09-08, hue inside the mask (OpenCV hue: 0 red, 15 orange, 150 magenta):

| run | hue | sat |
|---|---|---|
| SOURCE | 13.7 | 172 |
| dn 1.0 | 10.6 | 140 |
| dn 0.6 | 13.7 | 144 |
| dn 0.4 | 11.2 | 206 |
| dn 0.4 @1024 | 10.1 | 223 |
| dn 1.0 @1024, 8-step lora | 19.2 | **83** |

**The hue never moved toward pink at any denoise, including 1.0** where the masked region
starts from pure noise. The model saturates or desaturates the existing red; it never
recolours. `BasicGuider` is fixed at cfg 1.0, so there is no mechanism to amplify the text
against the known region — which is the difference between this and t2v, where nothing
competes with the prompt.

### The seam

- Rim is under-painted: edge/core ratio **0.69–0.77** (1.00 = flat recolour to the edge).
- Growing the decode mask past the drawn one **captures her face, and the face changes** —
  so `#508 GrowMask` cannot be raised. `cde47622`'s "expand 32, ten times better" does not
  survive at the current operating point.
- `mask_mode: as sampled` is the documented fix for the kept/painted shape mismatch, but
  `2e25fba7` records that it "crawls in motion, changing every ~4 frames".

### Mask quantisation — measured 2026-09-08

The mask the model receives is **2.11x the drawn area**:

| | 544 canvas | 1024 canvas |
|---|---|---|
| spatial 32px blocks alone | +78% | +45% |
| + 4-frame temporal union (today) | **+115%** | +75% |
| + union, head-TRACKED crop | +102% | +68% |

- Hair arch is median **67px** thick; the sampled block is 32px → **2.1 blocks across the
  arch** at 544, 3.9 at 1024. Below ~4 blocks the model never receives a token that is
  purely hair, so every block it edits straddles hair and skin.
- Head travels up to **24px vertically / 32px horizontally inside one 4-frame token**.
- **A tracked crop recovers only 13pp — not worth building.** Pure translation cannot cancel
  it; the head also rotates and the hair shape changes.
- Spatial blocking is the larger term, not the temporal union. This **corrects**
  `memory/project_h3_as_sampled_mask_floor.md`, which records the temporal term as larger.

## Why the approach is being retired

Masked inpainting on H3 is a **workaround**: the model has no native localised-edit task, so
the edit is imposed by masking a model that only knows how to generate. H3 is also slow.
Six days, no shippable result, and the failure is structural rather than a tuning gap.

## The new direction — models built for this

| | **Capybara** (Glanty) | **Bernini-R** (ByteDance) | **VOID** (Netflix) |
|---|---|---|---|
| base | HunyuanVideo-1.5 | Wan 2.2, renderer-only | own two-pass, CogVideoX VAE |
| native task | unified: T2V, T2I, **instruction-based video-to-video editing**, image editing, in-context / reference-driven editing | in-context image+video conditioning: t2v, v2v restyle, **rv2v reference-guided video EDITING**, r2v, image edit, content insertion | **object removal only** |
| localised edit | **"local and global edits" demonstrated** | not documented as masked | mask-driven |
| mask | not explicitly documented | not mentioned | **yes — SAM3, text-prompted** |
| licence | **MIT** | not stated in the docs | **Apache 2.0** |
| ComfyUI | custom nodes for all task types, FP8, auto attention backend | native nodes, needs an updated ComfyUI; subgraph workflows | documented workflow |
| known limits | CUDA 12.6, compute ≥8.9 for FP8; 480p / 50 steps recommended for video | no LoRA training needed; "lightweight, no diffusion t2v backbone" | struggles on unclear masks, chaotic motion, targets dominating the frame |

Sources: <https://huggingface.co/Glanty/Capybara>,
<https://docs.comfy.org/tutorials/video/bytedance/bernini-r>,
<https://docs.comfy.org/tutorials/utility/void-video-inpainting>

### Assessment

- **Capybara is the closest fit to the hair case.** "Make her hair pink" is literally an
  instruction-based local video edit, which is one of its four native tasks. MIT. ComfyUI
  nodes exist. 480p/50 steps recommended is a real cost to check.
- **Bernini-R is the closest fit to the ORIGINAL goal** — `rv2v`, reference-guided video
  editing, is exactly "change this character using this image". Renderer-only Wan 2.2, so
  it should be much faster than H3. Licence needs establishing before any scoping.
- **VOID cannot do this job.** It removes objects and fills the hole; it does not recolour
  or edit. It IS the right tool for a future *remove an object* Flow, and it already uses
  the SAM3 masking wired here. Worth its own card, not this one.

The user's read was "the first and the last, maybe a combination". Correction: **VOID is
removal-only**, so the pairing to test is Capybara (instruction edits) and Bernini-R
(reference edits). Neither needs a mask, which is the point — masking is what we were doing
because the model could not be told what to change.

## Next steps

1. Establish weights, sizes, VRAM and **licence** for Capybara and Bernini-R. Licence first —
   H3's territory restriction is a live product constraint and a second one would be worse.
2. Bench Capybara on the exact hair case: same clip, same 1s window, prompt "make her hair
   pink". Judge against the measurements in this brief, not by eye alone.
3. Bench Bernini-R `rv2v` on the original character-replacement case.
4. Only if one wins: decide whether masking is still wanted on top, and whether the
   `MpiH3EncodeAV`/`MpiH3DecodeAV` pair carries over or is H3-specific.
5. Separate card for VOID as an object-removal Flow.

## What is NOT being thrown away

`MpiH3EncodeAV` / `MpiH3DecodeAV`, the audio masking, the region crop path and the SAM3
mask route all still work and are shipped in `ComfyUi-MpiNodes`. Retiring the LanPaint
route for *this* job does not retire the nodes.

## Open repo state at the time of writing

- **The masked-edit work has never been committed to Cubric-Vision** and has no other card.
- MpiNodes commits through `287edb8` (v1.2.11) are local; the user wants one release and one
  `dev_configs/node_lock.json` pin bump at the end, not per-change.
- The bench workflow lives outside every git root and is not backed up by this card.
