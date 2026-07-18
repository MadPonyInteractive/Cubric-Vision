# Qwen Image Edit 2511 — style / detail / decensor LoRA candidates

> Research 2026-07-18 via CivArchive (civitaiarchive.com) API + civitai.red mirror.
> Source APIs: `civitaiarchive.com/api/search?q=<q>`, `civitaiarchive.com/api/sha256/<hash>`,
> `civitaiarchive.com/api/models/<id>`, `civitai.red/api/v1/models?query=` (civitai shape).

## Style — anime (user's existing pick CONFIRMED LATEST)

- **Qwen-Anime-V2** = user's file (`Qwen-Anime-V2.safetensors`, 424,960,008 B,
  sha256 `4c4cf33fc51d2f94c7e7d878a2989be3d69a321efd770d54ac42d9b49e23a799`).
  - Model **1994924** "Illustrious Anime Collection", versionId **2373282**, base **Qwen-Image** (NOT Edit).
  - Page: civitai.com/models/1994924?modelVersionId=2373282 · archive: civitaiarchive.com/models/1994924
  - **NO V3/V4 for Qwen** — creator moved to other bases (Z-Image, Ernie-Anime-V1 Apr-2026). V2 = newest Qwen. V3 "in planning" only.
  - Caveat: base is Qwen-Image gen, not Edit — worked in the edit Detailers graph but confirm adherence when baked.
- Edit-native anime alt (if V2 underperforms on edit path): **Qwen-Edit Anything to Anime** v2483865 (model 2206073, 869 DL) — civitaiarchive.com/models/2206073

## USER-CURATED picks (Fabio finding manually, running list — 2026-07-18)

On disk `C:\AI\loras\QWEN`: `Qwen-Anime-V2` (style, KEEP) + Boreal (**tried — NOT style, it's detail/realism**).

Style-transfer LoRAs Fabio selected (download URL = `civitai.com/api/download/models/<versionId>?fileId=<fid>`):

| Style | versionId | fileId | Trigger | Download URL |
|---|---|---|---|---|
| Caricature | 2427075 | 2317686 | `caricature` | civitai.com/api/download/models/2427075?fileId=2317686 |
| Real→any (drawing/anime) | 2643508 | 2531384 | `real to any` | civitai.com/api/download/models/2643508?fileId=2531384 |
| Animal style (old anime) | 2483865 | 2372364 | `transform into animal style` | civitai.com/api/download/models/2483865?fileId=2372364 |
| 3D style | 2483967 | 2372466 | `Convert to 3D style` | civitai.com/api/download/models/2483967?fileId=2372466 |
| Illustration | 2235007 | 2127908 | `Convert the picture to an illustration style` | civitai.com/api/download/models/2235007?fileId=2127908 |
| Hand-drawn line | 2562484 | 2450719 | `Hand-drawn Line Style` | civitai.red/api/download/models/2562484?fileId=2450719 (civitai.red) |
| Anime→realistic | 2157828 | 2051179 | `transform into realistic photography` | civitai.red/api/download/models/2157828?fileId=2051179 (civitai.red) |
| Amateur snapshot | 2681332 | 2567968 | `amtr snapshot photo` | civitai.red/api/download/models/2681332?fileId=2567968 (civitai.red) |
| Zankuro style | 2132600 | 2026479 | `Zankuro Style` | civitai.red/api/download/models/2132600?fileId=2026479 (civitai.red) |

> NOTE: versionId 2483865 here = the "Qwen-Edit Anything to Anime" family found earlier (model 2206073) — Fabio's trigger label "animal style (old anime)". Confirm trigger vs sample on the page.
> MORE COMING — Fabio adding as he browses. NOT yet downloaded/hashed/wired. Each needs: download → SHA256 → R2 upload → style-LoRA registry entry.

## Detail / realism (no pure "detailer"; realism/skin boosters)

- **Qwen-Image-Boreal (Boring Reality)** v3.0 — model 1927710, v2181911, **9,424 DL** (top). civitai.com/models/1927710
- **qwen-edit-skin** (skin detail) — model 2097058, v2376235. civitai.com/models/2097058
- [Qwen] Film Photography — model 1901782, v2152636, 1,975 DL
- Qwen Emotional Photography — model 1869530, v2401848

## Decensor / filter-removal (violence/dark themes — NOT NSFW-forcing)

- **NONE surfaced** on CivArchive or civitai.red API for Qwen-Edit-2511 (abliterated/uncensored/decensor).
- User note: proper site = **civitai.red** (mirror); "NSFW" is the wrong term — goal = remove safety filters
  (violence etc.), not force NSFW. User browsing manually with VPN. Likely don't exist yet for Qwen-Edit-2511 or named obscurely.

## API notes (for LoRA-browser feature / MPI-259)

- CivArchive `?q=` works; `?query=`/`?type=` params appear IGNORED (returns a default/trending 50-set) — use `?q=` + client-side filter.
- **SHA256 reverse-lookup is the reliable exact-match:** `api/sha256/<hash>` → `{match,model_name,model_id,version_id,base_model,file_name,file_size_kb,civitai_page_url}`.
- `api/models/<id>` → full version list (newest-first) with base_model per version.
- civitai.red = civitai `/api/v1/` shape (mirror), UK-accessible.
