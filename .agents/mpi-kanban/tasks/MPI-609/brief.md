# Klein style LoRAs - rename, split by size, garbage collect

**Origin:** Fabio, 2026-08-23, scoping MPI-567. Split out because it is a weights/deps job
with an R2 + HF leg, disjoint from the UI work.

## Why

The Model Settings LoRA picker reads the ENGINE FOLDER off disk and lists raw filenames.
Klein's fifteen style weights sit flat in `loras/flux2-klein/styles/` and are named nothing
like the styles they produce:

| picker shows | actually |
|---|---|
| `cifk9001` | not in DEPS at all - an orphan on Fabio's disk |
| `PULPKHOR` | 9B "Comic" |
| `amano_flux_02` | 9B "Watercolour" |
| `Flux-Klein-4B-Art_10` | 4B "Aesthetic" |
| `DisneyMidCenturyKlein9b` | 9B "Storybook" |

4B and 9B weights are interleaved in the one folder, so a user picking by hand cannot tell
which size a file belongs to either. Fabio: *"our LoRAs have weird names that have nothing
to do with the display names for styles."*

**Krea2 is explicitly OUT of scope** - Fabio: *"KREA already has similar names to their
styles."* Same treatment for other models later, when their turn comes.

## The set

15 deps in `js/data/modelConstants/loraDeps.js`: **8 for 4B**, **7 for 9B**. The display
names already exist and are correct - `styleLoraLabels` on the two ModelDefs:

- **4B (8):** None, Muppets, Cartoon, Jojo, Anime, Chibi, Doodle, Vintage, Aesthetic
- **9B (7):** None, Storybook, Comic, Anime, Chibi, Doodle, Vintage, Watercolour

Index 0 is the no-style entry and has no weight, so 8 labels -> 8 files and 7 -> 7.

## Scope

1. **Rename** each weight to its display name; **split** into per-size subfolders under
   `styles/`. Folder vocabulary is Fabio's call - he floated `balanced_9b` / `low_4b`
   (sizeTier words); the rest of the repo says `4b` / `9b`. Confirm before moving bytes.
2. **Sweep all five consumers.** A missed one is a silent 404 at download time or a
   `value_not_in_list` at run time:
   - `js/data/modelConstants/loraDeps.js` - 15 `filename` + 15 `url`
   - `comfy_workflows/scripts/workflow_generation/generate_klein.py` - the `styles`
     tuples. **This is the SOURCE**; the two graphs below are generated from it.
   - `comfy_workflows/klein_t2i.json` - baked `lora_name` on nodes 101/102
   - `comfy_workflows/klein_9b_t2i.json` - same
   - R2 (`models.cubric.studio/vision/models/loras/flux2-klein/styles/...`) and HF
3. **Regenerate, do not hand-edit the two graphs.** `generate_klein.py` bakes the rack per
   size and asserts it (`_assert_style_rack`); the raw template deliberately carries the 4B
   rack ONLY, and its Note node 86 says so.
4. **Garbage collect.** Fabio spotted three Doodles in the picker; DEPS ships two
   (`klein4b-doodle_v1`, `klein9b-doodle_v1`). `cifk9001` is in the picker and not in DEPS
   either. Enumerate disk-vs-DEPS, report before deleting.
5. **Existing users.** A renamed weight is a fresh download unless the orphan sweep
   reclaims the old one. Decide and record which; `docs/download-manager.md` has the
   EXCLUSIVE-dep evidence from MPI-310.

## Traps already known

- Filenames are stored BACKSLASHED (`flux2-klein\styles\...`) - MPI-229's heal. Baked
  workflow values never pass through the dropdown heal, and a backslash breaks any engine
  whose loader enum uses `/` (remote Pod, Linux/macOS portable). See
  `comfyController.js` step 3b.
- CivitAI region-blocks the UK; anything hitting it needs Fabio's VPN. The VPN also
  throttles R2 ~15x (MPI-354), so do the CivitAI half first, then have it turned off
  before staging to R2.

## Coordination

Disjoint from the per-phase rack card and from the character-sheet card. Safe to dispatch
in parallel with either.

---

## The orphans, confirmed on disk (2026-08-23)

`G:/CubricModels/loras/flux2-klein/styles/` holds **17** files; `loraDeps.js` ships **15**.
The two extras are unmanaged - nothing in the app installs, references or cleans them:

- `klein9b-doodle_v2.safetensors` - Fabio's "third Doodle". DEPS carries
  `klein4b-doodle_v1` and `klein9b-doodle_v1` only.
- `cifk9001.safetensors` - in no DEPS entry and in no graph.

Confirm they are still absent from DEPS before deleting, and report rather than
delete silently. The folder is flat with 4B and 9B interleaved, exactly as the card
describes - no rename or split has happened yet.

## Status note

SHIPPED 2026-08-23. See `validation.md` for the evidence. Follow-up GC card: **MPI-612**.
