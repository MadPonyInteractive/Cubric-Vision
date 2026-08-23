# MPI-609 validation — 2026-08-23

Klein's 15 style weights renamed to their display names and split into `styles/4b/` and
`styles/9b/`. Every claim below was run, not reasoned about.

## Decisions taken

| decision | outcome |
|---|---|
| Folder words | `4b` / `9b`, not `low_4b` / `balanced_9b`. Every filename, dep id and workflow string in the repo already says `4b`/`9b`; `sizeTier` (`'low'\|'balanced'\|'high'`) is a UI badge concept that would appear nowhere else on disk and would rot if a tier were re-rated. Fabio did not object when offered both. |
| Filenames | Bare display name (`Muppets.safetensors`). The size folder disambiguates, which is what `generate_klein.py`'s objection to a bare `Vintage.safetensors` actually needed. |
| HF layout | Broke the repo's flat-root convention: mirrors now sit at `loras/flux2-klein/styles/9b/<Label>`. Bare `Anime`/`Chibi`/`Doodle`/`Vintage` at a shared root would collide the moment the 4B set is ever mirrored. |
| Existing users | Fabio's call: accept the re-download, GC later. **Only the 4B half exists on any user's disk — 0.72 GB, not 2.13** — because 9B has never been released. |
| Old copies | Left standing in R2, on HF and on user disks. The *released* app still resolves the old URLs; deleting now would 404 a style-LoRA install for anyone who has not updated. → **MPI-612**. |

## The rename

The split is load-bearing, not cosmetic: **Anime, Chibi, Doodle and Vintage each exist in
both sizes**, so display names are impossible in one flat folder.

| 4B | | 9B | |
|---|---|---|---|
| `flux2-klein-4b-lora-muppetshow-style` | `4b/Muppets` | `DisneyMidCenturyKlein9b` | `9b/Storybook` |
| `flux2-klein-4b-lora-Fluxtoon-Style` | `4b/Cartoon` | `PULPKHOR` | `9b/Comic` |
| `flux2-klein-4b-lora-Jojoso-Style_000002000` | `4b/Jojo` | `New_Mecha_Klein9B` | `9b/Anime` |
| `Anime_new_mecha_klein4b` | `4b/Anime` | `robloxchibidoll_lora_klein9b` | `9b/Chibi` |
| `robloxchibidoll_lora_klein4b_000002200` | `4b/Chibi` | `klein9b-doodle_v1` | `9b/Doodle` |
| `klein4b-doodle_v1` | `4b/Doodle` | `Real_Vintage_Photo_klein9b` | `9b/Vintage` |
| `vintage_photo` | `4b/Vintage` | `amano_flux_02` | `9b/Watercolour` |
| `Flux-Klein-4B-Art_10` | `4b/Aesthetic` | | |

## Consumers swept — SIX, not the five the brief listed

The brief missed both template copies. They are different formats of the same graph and
**both** carry the 4B rack:

1. `js/data/modelConstants/loraDeps.js` — 15 `filename`, 15 `url`, 7 `mirrorUrl`
2. `comfy_workflows/scripts/workflow_generation/generate_klein.py` — the 15 style tuples (SOURCE)
3. `comfy_workflows/scripts/workflow_generation/klein_t2i_template.json` — API format; **this is the one the generator reads** (`SCRIPTS_DIR` is tried before `WORKFLOWS_DIR`)
4. `comfy_workflows/raw/klein_t2i_template.json` — litegraph UI export; the re-export source
5. `comfy_workflows/klein_t2i.json` — regenerated, never hand-edited
6. `comfy_workflows/klein_9b_t2i.json` — regenerated, never hand-edited

Plus `docs/models/klein/9b.md` and `docs/models/klein/README.md`.

> **Pre-existing, NOT fixed (out of scope):** the two templates are different formats, and
> the generator prefers the `scripts/` copy. Nothing keeps them in sync, so `raw/` can
> silently diverge from what actually builds. Worth a card if it ever bites.

## Evidence

| check | result |
|---|---|
| Disk bytes match DEPS `sha256` **before** renaming | 15/15 match, 2.13 GB hashed |
| Disk rename + split | 15/15 moved, 0 loose files left |
| Orphans deleted (Fabio confirmed) | `cifk9001` (158 MB) + `klein9b-doodle_v2` (39.5 MB) = 197.5 MB. `cifk9001`'s hash differs from the 9B depth LoRA despite the identical 158 MB size, so it was not a stray copy of a managed weight. Neither existed in R2. |
| Graphs regenerated | `8 styles baked into 2 bank(s)` / `7 styles`, `_assert_style_rack` green |
| Old names left in code | none — remaining `PULPKHOR` hits are trigger text and `origin:` prose, correct to keep |
| R2 server-side copy | 15/15 |
| R2 public URLs | 15/15 HTTP 200, content-length byte-exact vs each dep's `bytes` |
| HF server-side copy | 7/7, commit `c8038fa` |
| HF mirror URLs | 7/7 HTTP 200 |
| **Live engine loader enum** (`:48188/object_info/LoraLoaderModelOnly`) | lists exactly the 15 new backslashed names, no stale entries |
| **Every baked rack value ∈ that enum** | yes — this is the exact set `value_not_in_list` fires against |
| Full suite | `722 pass, 0 fail` |

## New test

`tests/style-rack-deps-resolve.test.cjs` — nothing asserted that a baked `MpiStyleLoras`
name resolves to a real DEPS entry, which is precisely what a rename breaks silently (the
picker sends an INDEX, the graph carries the FILENAME, and they only meet inside ComfyUI).
Generic over `comfy_workflows/*.json`, so it also covers Chroma, Krea2 and Qwen for free —
15 assertions.

**Mutation-proven** (restore in `finally`, file confirmed byte-identical afterwards):

- rack name → a dep that does not exist → **fails**
- backslash convention → `/` → **fails**

## Traps hit

- **`rclone` 403 naming `CreateBucket`** on all 15 copies while write access was fine.
  `--s3-no-check-bucket` fixed it. Cost one full failed pass; nothing was written.
- The Bash heredoc guard blocked a Python edit mid-session — correct, that is the
  backslash-halving trap. Used the Write tool and ran by path.
- Clock verified against `gh api rate_limit` `Date:` before any timestamp was written
  (2s drift — no VPN skew).

## Not done, deliberately

- **No boot-time rename migration.** Offered; Fabio chose to accept the re-download and GC
  later. A renamed dep is invisible to `_orphanedDepIds` (it iterates `Object.keys(DEPS)`,
  and the old filenames left DEPS), so the stale 4B files can never be swept by the
  existing machinery — hence MPI-612 rather than nothing.
- **Krea2 untouched**, per the card. Its filenames already match its labels.
