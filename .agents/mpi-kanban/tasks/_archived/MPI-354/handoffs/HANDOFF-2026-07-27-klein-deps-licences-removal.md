# HANDOFF — MPI-354 Klein: deps closed, licences cleared, removal measured (2026-07-27)

Third Klein session. Read `HANDOFF-2026-07-26b-klein-base-int8.md` first for the base-int8
decision and the injection facts it still owns. This file supersedes that one's **style-rack
contract** (item 5) and its **licence ship-gate** section — both are resolved below.

---

## STOP — read this before shipping anything

**`dev_configs/node_lock.json` pins `ComfyUI-MpiNodes` at `aaa1d2d9` (2026-07-19), and that
is also the NEWEST commit on `MadPonyInteractive/ComfyUi-MpiNodes`. Its GitHub tree contains
no style-selector source. `MpiStyleSelector` and `MpiStyleLoras` exist ONLY on the local
bench — they were never pushed.**

Meanwhile a parallel session already migrated the shipped graphs to those nodes
(`86460c82`), and the legacy `Input_Style` / `Input_Stylization` injection keys have been
**deleted** — the app now emits only the dotted keys. Verified on disk:
`krea2_t2i_sfw.json`, `krea2_t2i_nsfw.json`, `qwen_edit.json` each carry one
`MpiStyleSelector` titled `Input_Style_Selector`, zero legacy `Input_style_lora_N` slots.

So a release cut today gives **every user a red missing-node graph on Krea2 and Qwen-Edit** —
the two most-used models. Order of operations: push the node pack → bump the pin → verify a
from-scratch install. Tracked on **MPI-359** (moved to doing/validating this session).

---

## DONE this session

### Deps — closed, hashed, verified

14 Klein deps, **14.4 GB**, every one with a real sha256 hashed off the `G:\CubricModels`
masters. `DEPS` import resolves all 14, no id mismatch.

- **8 style LoRAs** (`klein-style-{muppets,cartoon,jojo,anime,chibi,doodle,vintage,aesthetic}`)
  — 734 MB. Filenames verified byte-for-byte against the bench graph; ComfyUI lists them
  backslashed (`flux2-klein\styles\…`), riding the MPI-229 heal.
- **`klein-lora-nsfw`** — 180 MB. **Prompt-gated, not user-facing**: graph node 38 takes its
  strength from an `MpiMath 1.0 if a else 0.0` fed by an `MpiTextContains` keyword scan of
  `Input_Positive`. A clean prompt leaves it at 0.0 and the file is never loaded. No control,
  no capability, no ModelDef entry.
- Index map (0 = No Style, gates zeroed): 1 Muppets, 2 Cartoon, 3 Jojo, 4 Anime, 5 Chibi,
  6 Doodle, 7 Vintage, 8 Aesthetic — aligned with the 9 `klein-style-*.webp` cards already in
  `comfy_workflows/display/`.

### Licences — gate CLOSED, all nine community LoRAs ship

Resolve any CivitAI file by hash: `GET /api/v1/model-versions/by-hash/<sha256>` → `modelId`
→ `GET /api/v1/models/<id>`. Full table in `docs/models/klein/README.md`.

Three lack the `Image` right (anime 2227157, chibi 400063, doodle 2593550) — **user call:
ship anyway**, because CivitAI's flags and License badge are **MODEL-level, not
version-level**, and all three are multi-base bundles whose restrictive label belongs to a
Flux-dev leg we do not ship. Never read a bundle's model-level flag as a verdict on the one
version we host. Credit-requiring LoRAs get attributed — swept in **MPI-358**.

Both fal LoRAs are **Apache-2.0** (outpaint + object-remove), which closed the last open
licence item.

### Injection — `Title.widget` addressing shipped

The old contract could not express one node with two injected knobs (`_inject` sprays a value
into every recognised widget name, so a style index would have landed in both strengths and
never in `selector`). `comfyController` §3 now splits a dotted key into title + widget and
writes only that widget. Guarded by `tests/inject-params-titles.test.cjs`, which **derives**
the expected node title from the key the control emits — negative-control proven (a
mis-titled node fails it). 6/6 pass.

### Removal — MEASURED, and it is the good half

**~4 seconds.** Green plate + outpaint LoRA @1.1 **on turbo** (turbo 1.0, cfg 1.0, euler,
**4 steps**), crop/stitch, crop at the image's **native** resolution rather than a forced 1024².

- **Turbo COMPOSES with the outpaint LoRA.** Predicted not to; measured otherwise. Do not
  re-derive that caution.
- **4 steps beats 6 and 8.** More steps = more denoising latitude inside the mask = more
  invention. At 6-8 a leg-tattoo removal grew a **knee**. The t2i intuition inverts for fills.
- Two traps recorded: **cap** the native crop resolution (a big mask on a 4K image makes the
  fastest op the slowest, OOM risk on 8 GB), and keep removal **on turbo even at tier 1**
  (the tier toggle is model-wide `perModel`, so bake turbo + 4 steps on that branch and ignore
  `Input_Tier`).

### Rejected / reversed

- **fal object-remove LoRA is OUT.** It wants a **red box drawn on the image** (object left
  visible), not a green plate — and it is object-specific: on a tattoo it **lost to the bare
  base model**. Characterised in `docs/models/klein/removal.md`, kept as a dead end so nobody
  re-tries it.
- **Inpaint-to-ADD is bad** — ignores the mask in some cases and scatters content; the existing
  **detail** workflow beats it. The remove/inpaint split may collapse to **remove only**.
  Retest before wiring an inpaint op.

---

## NEXT — where the user is right now

**Fixing SEAMS in the remove workflow.** Context for that work:

- Removal **repaints everything inside the mask**, so mask precision matters here in a way it
  never did for detail/upscale (which preserve underlying colour). Over-painted pixels come
  back rebuilt — against hair or a pattern that reads as a smear.
- Therefore `mask_expand_pixels` and `mask_blend_pixels: 32` now work **against** precision.
  They were tuned to hide seams on the old green-plate inpaint, where a generous blend
  concealed the transition. **A tight mask plus a fat blend is still a fat mask.** A/B a much
  smaller blend once the boundary is accurate.
- Other live knobs in that graph: `context_from_mask_extend_factor 1.20`, `output_padding 32`,
  `mask_hipass_filter 0.10`, `mask_fill_holes true`.
- `EmptyImage.color` is packed `0xRRGGBB` as an INT: white `16777215`, black `0`,
  green `65280`, red `16711680`.

### Then, to finish MPI-354

1. User saves the merged graph to `comfy_workflows/raw/` (all-lowercase, `_template.json`).
2. `registry.py` HANDLERS prefix + `generate_klein.py` — model on `generate_sdxl.py`, look
   nodes up by `_meta.title`, NEVER by id. **Assert the NEW rack shape**, do not copy
   `generate_krea2.py`'s old `_assert_style_rack` (it has since been rewritten for the new
   rack — read it first, `891d4415`).
3. `progressStages` — **count bars live, per mode, enhancer ON and OFF**. Removal branch and
   inpaint branch separately if both survive. Never guess.
4. ModelDef in `models.js` — low tier; capabilities `negativePrompt, styleLoras, promptEnhance,
   turboToggle` all true; `styleLoraLabels` / `styleLoraImages` index-aligned with the table above.
5. **Re-measure VRAM.** The ~13 GB figure that threatened the 8 GB tier was on bf16; the
   shipped weight is 3.5 GB smaller.
6. R2 upload (explicit user approval) → verify per `06-verify.md`.

---

## Cards opened this session

| id | state | what |
|---|---|---|
| **MPI-358** | todo/idea | Attribution sweep — credit every shipped LoRA whose creator asks. One script over `DEPS`; every LoRA dep already carries a sha256. Known hit: `klein-style-anime` (`allowNoCredit: false`). No credits surface exists in the app yet. |
| **MPI-359** | **doing/validating** | Style rack v2 migration — **shipped and verified**, blocked only on pushing MpiNodes + bumping the pin (see STOP above). |
| **MPI-360** | todo/idea | Per-op `?` prompting guide. **Load-bearing**, not decoration: Klein routes remove vs inpaint on prompt keywords, so the guide teaches the trigger vocabulary. Must ship beside an **empty-prompt → remove** fallback, which the guide cannot replace. |
| **MPI-361** | todo/planned | Auto Detect Mask v2 — SAM3. `SAM3_Detect` is already a **core** node taking text conditioning, point coords and a threshold. Today's auto-mask is capped by 4 installed YOLO detectors (face/hair/hand/person), which is why headphones cannot be masked. Missing piece: `Comfy-Org/sam3.1` → `checkpoints/sam3.1_multiplex_fp16.safetensors`, 1.75 GB, **ungated**. SAM License permits commercial redistribution if the licence text ships beside the weight. |

---

## Files touched (uncommitted unless noted)

- `js/data/modelConstants/loraDeps.js` — 9 new deps + licence notes
- `docs/models/klein/README.md` — licence table + method, 200 lines (at ceiling)
- `docs/models/klein/removal.md` — **new**; fal LoRA family, remove-vs-inpaint, the 4 s config
- `.agents/mpi-kanban/` — board + MPI-354 card/events, new cards 358/359/360/361
- **Committed by a parallel session:** `js/services/comfyController.js`,
  `js/components/Organisms/MpiPromptBox/PromptBoxControls.js`,
  `tests/inject-params-titles.test.cjs` (dotted keys), plus `86460c82`, `891d4415`, `d61e84f5`

`board.json` is **co-owned** — commit by explicit pathspec, never `git add -A`.
