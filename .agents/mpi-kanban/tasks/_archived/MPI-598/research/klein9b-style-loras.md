# Klein 9B style LoRAs — candidate shortlist + download manifest

Research behind the Klein 9B style rack. **All seven SHIPPED** — wired, baked into
`klein_9b_t2i.json`, on R2 and mirrored to HF. What survives here is the provenance: how each
weight was found without a VPN, its licence, and its hash. Current state lives in
[`docs/models/klein/9b.md`](../../../../../docs/models/klein/9b.md) § Seven styles.

> **No dates in this file.** It was compiled with the VPN on, so the clock is untrustworthy
> (`CLAUDE.md` → "VPN + the skewed clock"). Stamp it from a trusted clock if it ever matters.

## How this was found — CivArchive replaces the VPN for SEARCH

`civarchive.com` mirrors CivitAI metadata and loads from the UK with **no VPN**. Undocumented
JSON API, confirmed working:

- `GET /api/models/<modelId>` → versions list (id + name only)
- `GET /api/models/<modelId>?modelVersionId=<vid>` → **files, sizes, sha256, and HF mirrors**
- `GET /api/search?query=&type=LORA&base_model=Flux.2%20Klein%209B&page=N` → 50/page

Three traps:

1. **`query` is ignored once `base_model` is set** — results come back ranked by download count
   regardless of the search text. Enumerate every page and filter names locally instead.
2. `Flux.2 Klein 9B` and `Flux.2 Klein 9B-base` are **separate `base_model` values**. Query both
   or you miss half the catalogue (640 vs 1179 records).
3. **CivArchive carries NO licence data** — no `allowCommercialUse`, no `allowNoCredit`, no
   badge. The "licence" text in its page HTML is generic FAQ boilerplate. Flags still need
   `civitai.com` behind the VPN, per `docs/models/klein/licences.md`.

It also rate-limits (429) under a full 1,179-record enumeration. Pace it.

## What exists — 3 of our 8 4B styles have an official 9B twin

Same creator, same CivitAI model page as the 4B weight we already ship. Proof they are the real
twins: each repo's 4B sibling is byte-identical to our shipped dep (`5ad2d907…` doodle,
`e809c825…` chibi, `2ca647f7…` anime).

| our 4B dep | 9B file | size | sha256 |
|---|---|---|---|
| `klein-style-anime` | `New_Mecha_Klein9B.safetensors` | 158.0MB | `da507ff8b28be59d74d65c5898b4d65d7fe3bb4a58ddf0ec847fa3a68f5375ba` |
| `klein-style-chibi` | `robloxchibidoll_lora_klein9b.safetensors` | 158.0MB | `478a610ba6061da7b554f5df5c33b8750a9178dfe9825e14c68c2b97f82baaa2` |
| `klein-style-doodle` | `klein9b-doodle_v1.safetensors` | 39.5MB | `45c82f5e593f77e1cb56a5de539834ab11ae46361ccc1be6869eaae940a9ee6f` |
| `klein-style-doodle` (alt) | `klein9b-doodle_v2.safetensors` | 39.5MB | `f0e3c35b15e40674f22b657b530fd25ccf265e2c8d55ad80e98113d8fae90327` |

Doodle ships **two** 9B versions at identical size — A/B before picking one.

**Licences need no new work.** Flags and badges are MODEL-level, and these are the same model
pages already cleared in `licences.md`: anime (2227157) is Apache-2.0 and keeps its `credit`
block; chibi (400063) and doodle (2593550) are badge-less `RentCivit, Rent` and ship on the
standing decision. Re-read under VPN and unchanged.

## What does NOT exist

**Muppets: nothing.** Zero puppet/felt/muppet matches across all 1,179 Klein 9B LoRA versions on
CivArchive, zero on Hugging Face, and zero from `civitai.com/api/v1/models?query=muppet&
baseModels=Flux.2 Klein 9B` read directly under the VPN. Same for **JoJo** — no 9B weight in that
style from anyone.

norod78 (muppets 2615392, cartoon 2633419, jojo 2622565) has exactly one 4B version on each page
and nothing on HF. KimHose vintage (2520520) is ZImage + 4B-base only. bunny123 aesthetic
(2381858) is v1.0 only.

## Substitutes for the 5 uncovered styles — flags read under VPN

| for | model | id | `allowCommercialUse` | credit | badge |
|---|---|---|---|---|---|
| cartoon | Disney Mid-Century Animation | 2001580 | Image, RentCivit | **required** | none |
| jojo | Retro comic (PULPKHOR) | 2413450 | Image, RentCivit, Rent, Sell | no | none |
| aesthetic | Flux Klein illustration style transfer | 2344427 | Image, RentCivit, Rent, Sell | no | none |
| aesthetic | Amano Watercolor Sketch | 2600302 | Image, RentCivit, Rent, Sell | no | none |
| vintage | Real Vintage Photo (Felldude) | 2608763 | Image, RentCivit | no | none |

All five grant **`Image`** — the flag that decides it for us (users own their output). Disney
`allowNoCredit: false` → it needs a `credit` block, same mechanism as `klein-style-anime`.

**Two flags on the Disney one, both worth weighing before it ships:** it is a Disney-IP style
(so is the runner-up, `Retro cartoon animation style (Mickey Mouse)` 2625831), and it is the only
candidate here with `allowDerivatives: false`. We never merge, so the second costs nothing.

Apache-2.0 alternatives published by their creators direct to HF — **no CivitAI, no VPN, no flag
reading**: `artificialguybr/CuteCartoon-Redmond-FLUXKLEIN9B` (cartoon),
`artificialguybr/ANALOG-REDMOND-FLUXKLEIN9B` + `FILMGRAIN-REDMOND-FLUXKLEIN9B` +
`Danrisi/oldNokia_flux2_klein9b` (vintage), `artificialguybr/PIXELART-REDMOND-FLUXKLEIN9B`.

## Download manifest — VPN OFF, Hugging Face only

Every URL below is a Hugging Face `resolve/main` link whose **LFS oid was verified equal to the
CivitAI sha256** in the tables above. HF is not region-blocked and not throttled by the VPN, so
these need no VPN and no CivitAI token.

```
# --- the three twins -----------------------------------------------------------
curl -L -o New_Mecha_Klein9B.safetensors            https://huggingface.co/minyan250/n_Arno/resolve/main/New_Mecha_Klein9B.safetensors
curl -L -o robloxchibidoll_lora_klein9b.safetensors https://huggingface.co/Mason02/klein9b-roblox-chibi-lora/resolve/main/klein9b-roblox-v1.safetensors
curl -L -o klein9b-doodle_v1.safetensors            https://huggingface.co/reverentelusarca/flux2-klein-9b-4b-scribbly-doodle-lora/resolve/main/klein9b-doodle_v1.safetensors
curl -L -o klein9b-doodle_v2.safetensors            https://huggingface.co/reverentelusarca/flux2-klein-9b-4b-scribbly-doodle-lora/resolve/main/klein9b-doodle_v2.safetensors

# --- substitutes ---------------------------------------------------------------
curl -L -o DisneyMidCenturyKlein9b.safetensors      https://huggingface.co/UnifiedHorusRA/TheFourHorsemenV2/resolve/main/Disney_Mid-Century_Animation/Flux_2_Klein_9B/DisneyMidCenturyKlein9b.safetensors
curl -L -o PULPKHOR.safetensors                     https://huggingface.co/UnifiedHorusRA/TheFourHorsemenV2/resolve/main/FLUX_2-klein-9B_Retro_comic_PULPKHOR_STYLE/Flux_2_Klein_9B/PULPKHOR.safetensors
curl -L -o cifk9001.safetensors                     https://huggingface.co/nappa114514/Flux_Klein_illustration_style_transfer/resolve/main/cifk9001.safetensors

# --- apache-2.0, creator's own HF repo ------------------------------------------
curl -L -O https://huggingface.co/artificialguybr/CuteCartoon-Redmond-FLUXKLEIN9B/resolve/main/%5BFLUX.2.Klein%5DCuteCartoon_Redmond.safetensors
curl -L -O https://huggingface.co/artificialguybr/ANALOG-REDMOND-FLUXKLEIN9B/resolve/main/%5BFLUX.2.Klein%5DAnalog_Redmond.safetensors
```

Verify after download: `sha256sum` against the tables above.
`ThirdTimesTheCiarc/base_calvin` also mirrors several of these but is **gated (401)** — use the
mirrors listed here instead.

### The two with no HF mirror — CivitAI direct

`allowNoCredit`/badge data above still applies. **CivitAI DOWNLOADS are not region-blocked** —
they redirect to an R2 delivery worker on another host, so these work with the VPN OFF (which is
also the point: the VPN throttles ~15x). A shell fetch may hit the token gate (401) where a
logged-in browser does not.

| file | size | sha256 | url |
|---|---|---|---|
| `amano_flux_02.safetensors` | 260.1MB | `ea12b579b3c46143…` (Amano, 2600302) | `https://civitai.com/api/download/models/2920932` |
| `Vintage.safetensors` | 667.9MB | `7ec32ba728ee4b42fb68074e8da5f8d965813c2ff3f17186141257a265d32d92` | `https://civitai.com/api/download/models/2929246?fileId=2808065` |

Amano also publishes an `amano_flux_01.safetensors` at the same size; only `_02` is on the
current version.

## If these ship

Per `9b.md`, the style rack NODES are already in the 9B graph — `Input_is_9b` routes around them.
Shipping styles is a value change plus dep entries, not a rebuild: flip `styleLoras`, populate
`styleOps` / `styleLoraLabels` / `styleLoraImages`, and keep the index alignment contract in
`loraDeps.js` (dep ↔ label ↔ image ↔ the `MpiMath` gate ↔ the `MpiPromptList` trigger line).
**Uploaded and verified 2026-08-22.** All seven are on R2 at
`vision/models/loras/flux2-klein/styles/` and mirrored to the HF backstop repo
`Mad-Pony-Interactive/cubric-studio` (flat, at root) — R2 Content-Length byte-exact and
every HF LFS oid equal to the dep sha256. The URLs above are the upstream SOURCES; the
deps ship the R2 url + the HF mirrorUrl.
