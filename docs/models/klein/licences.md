# FLUX.2 Klein 4B — community weight licences

Split out of `README.md` 2026-07-27 (200-line ceiling). Klein 4B itself is
**Apache-2.0**; that does **not** extend to the community LoRAs we ship alongside it,
which is why this file exists.

## Method — resolve by SHA256, never by filename

```
GET https://civitai.com/api/v1/model-versions/by-hash/<sha256>   ->  modelId
GET https://civitai.com/api/v1/models/<modelId>                  ->  permission flags
```

Two traps, both hit for real:

1. **The by-hash endpoint returns a STUB `model` object** whose `allowCommercialUse`,
   `allowNoCredit` and `allowDerivatives` are all `null`. Those are not permissive
   defaults — they are absent. You MUST follow `modelId` to `/models/<id>`.
2. **The API region-blocks some countries** — `{"error": "Access to this service is not
   available in your region due to legal restrictions.", "code": "REGION_BLOCKED"}`.
   It needed a VPN on 2026-07-27, having worked bare the day before. If this file's
   method appears broken, check for the region block before assuming the API changed.
   **Ask Fabio to enable the VPN — and don't trust the clock while it's on:
   `CLAUDE.md` → "VPN + the skewed clock".**

Flag meanings: `Image` = the user may sell what they generate; `Rent` = the weight may
be run by a paid generation service; `Sell` = the weight itself may be sold;
`RentCivit` = may be run on CivitAI. The decisive one for us is **`Image`** — Vision is
a local app whose users own their output.

## The table (checked 2026-07-26, fully re-verified 2026-07-27)

| dep | CivitAI | creator | `allowCommercialUse` | verdict |
|---|---|---|---|---|
| `klein-style-aesthetic` | 2381858 | bunny123 | Image, RentCivit, Rent, Sell | clear |
| `klein-lora-nsfw` | 2458332 | whoforscuba | Image, RentCivit, Rent, Sell | clear |
| `klein-lora-refcontrol-depth` | 2657241 | thedeoxen | Image, RentCivit, Rent, Sell | clear |
| `klein-style-muppets` | 2615392 | norod78 | Image, RentCivit, Rent | clear |
| `klein-style-cartoon` | 2633419 | norod78 | Image, RentCivit, Rent | clear |
| `klein-style-jojo` | 2622565 | norod78 | Image, RentCivit, Rent | clear |
| `klein-style-vintage` | 2520520 | KimHose | Image, RentCivit, Rent | clear (no derivatives — we don't merge) |
| `klein-style-chibi` | 400063 | monkpostor | RentCivit, Rent | no `Image` — see caveat |
| `klein-style-doodle` | 2593550 | reverentelusarca | RentCivit, Rent | no `Image` — see caveat |
| `klein-style-anime` | 2227157 | n_Arno | RentCivit | no `Image`, **credit required**, no derivatives |

`klein-lora-outpaint` is **not a CivitAI weight** — the by-hash lookup 404s. It is
fal's, **Apache-2.0**, like every fal Klein LoRA (see `removal.md`). A 404 here means
"look up its source repo", never "unlicensed".

`klein-lora-turbo` (2324315, `Image` only, no `Rent`) was checked and then **dropped**
— we ship the distilled checkpoint, so there is no base leg to accelerate.

## Why the three without `Image` still ship (user call 2026-07-26)

CivitAI's permission flags and its License badge are **MODEL-level, never
version-level**. chibi (400063) is a Klein4b/9b + Illustrious + PonyXL *bundle* whose
*FLUX.1 [dev] Non-Commercial* label belongs to a Flux-dev leg we do not host; the same
reasoning covers doodle and anime. **Never read a bundle's model-level flag as a verdict
on the single version you actually ship** — but do record the reasoning, as here, rather
than waving the flag away.

## Credit obligations are discharged in DATA, not prose

`klein-style-anime` is the one weight whose creator requires attribution
(`allowNoCredit: false`). Rather than hand-writing a name into a template, its dep
carries:

```js
credit: { author: 'n_Arno', work: 'New Mecha style', url: 'https://civitai.com/models/2227157' },
```

`MpiAbout` builds its Credits list from **every dep that carries a `credit` block**, so
adding one to a future dep is the whole task — nothing to remember, nothing to keep in
sync. A hand-maintained list rots the moment a weight is added or dropped, and a missed
credit is a licence breach rather than a cosmetic bug. The cross-model sweep for
existing weights is **MPI-358**.
