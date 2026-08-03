# FLUX.2 Klein 4B — community weight licences

Split out of `README.md` 2026-07-27 (200-line ceiling). Klein 4B itself is
**Apache-2.0**; that does **not** extend to the community LoRAs we ship alongside it,
which is why this file exists.

## Method — resolve by SHA256, never by filename

```
GET https://civitai.com/api/v1/model-versions/by-hash/<sha256>   ->  modelId
GET https://civitai.com/api/v1/models/<modelId>                  ->  permission flags
```

Three traps, all hit for real:

1. **The by-hash endpoint returns a STUB `model` object** whose `allowCommercialUse`,
   `allowNoCredit` and `allowDerivatives` are all `null`. Those are not permissive
   defaults — they are absent. You MUST follow `modelId` to `/models/<id>`.
1b. **The API is BLIND to the licence badge — the two steps above are NOT the whole
   method.** `/models/<id>` carries no licence field at all, while the model *page* can
   render `License: Apache 2.0`, which outranks every permission flag below it. Measured
   on five Chroma LoRAs, 2026-08-02: two read as `RentCivit`-only by flags and are
   Apache-2.0 in fact. Fetch the page and grep the badge —
   `curl -sL -A "<browser UA>" https://civitai.com/models/<id>` (the `-L` matters; bare
   `/models/<id>` 308s to the slug URL) then
   `grep -o 'choosealicense/licenses/blob/main/markdown/[a-z0-9.-]*'`. Full reasoning,
   including why CivitAI's ToS default grant is scoped *through the Service*:
   [../chroma/licences.md](../chroma/licences.md).
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

## The table (flags 2026-07-26/27 — **badges read 2026-08-03**, MPI-429 sweep)

The badge column is the one that governs; the flags are the creator's preferences beneath
it. Six of the ten carry **Apache-2.0**, which was invisible to the flags-only method.

| dep | CivitAI | creator | licence badge | `allowCommercialUse` | verdict |
|---|---|---|---|---|---|
| `klein-style-aesthetic` | 2381858 | bunny123 | **Apache-2.0** | Image, RentCivit, Rent, Sell | clear |
| `klein-lora-nsfw` | 2458332 | whoforscuba | none | Image, RentCivit, Rent, Sell | clear on flags |
| `klein-lora-refcontrol-depth` | 2657241 | thedeoxen | **Apache-2.0** | Image, RentCivit, Rent, Sell | clear |
| `klein-style-muppets` | 2615392 | norod78 | **Apache-2.0** | Image, RentCivit, Rent | clear |
| `klein-style-cartoon` | 2633419 | norod78 | **Apache-2.0** | Image, RentCivit, Rent | clear |
| `klein-style-jojo` | 2622565 | norod78 | **Apache-2.0** | Image, RentCivit, Rent | clear |
| `klein-style-vintage` | 2520520 | KimHose | none | Image, RentCivit, Rent | clear on flags (no derivatives — we don't merge) |
| `klein-style-chibi` | 400063 | monkpostor | none | RentCivit, Rent | **ships by DECISION** — no `Image`, see below |
| `klein-style-doodle` | 2593550 | reverentelusarca | none | RentCivit, Rent | **ships by DECISION** — no `Image`, see below |
| `klein-style-anime` | 2227157 | n_Arno | **Apache-2.0** | RentCivit | **SETTLED CLEAR** — see below |

### `klein-style-anime` — the badge overturned the flags

This row previously read "no `Image`, credit required, no derivatives" and shipped only on
the bundle argument. Its page carries **Apache-2.0**, which grants commercial use,
redistribution and derivatives outright; a hosting-site checkbox cannot claw back rights
granted under it in the same upload (full reasoning: [../chroma/licences.md](../chroma/licences.md)).
Attribution still applies under Apache §4, and its `credit` block already satisfies that.

### `klein-style-chibi` + `klein-style-doodle` — SETTLED 2026-08-03 by decision

Re-checked 2026-08-03 (MPI-430): both are **still badge-less** and still grant
`RentCivit, Rent` only — no `Image`. Neither requires credit (`allowNoCredit: true`) and
both allow derivatives.

**The user elected to keep and ship them as-is**, in the same call that kept `ill-anime`
and `pony-mix`, which withhold the same flag
([../community-merges-licences.md](../community-merges-licences.md)). Badge-less means
CivitAI's Service-scoped default grant is what governs, and the practical risk was judged
low. The bundle argument is no longer what holds them up — a decision is. **Do not
re-open** on the strength of the missing `Image` flag; that is the known fact behind the
decision, not new evidence.

`klein-lora-outpaint` is **not a CivitAI weight** — the by-hash lookup 404s. It is
fal's, **Apache-2.0**, like every fal Klein LoRA (see `removal.md`). A 404 here means
"look up its source repo", never "unlicensed".

`klein-lora-turbo` (2324315, `Image` only, no `Rent`) was checked and then **dropped**
— we ship the distilled checkpoint, so there is no base leg to accelerate.

## The bundle reasoning (user call 2026-07-26 — no longer load-bearing)

Superseded as a *verdict*: anime is Apache-2.0 and chibi/doodle ship by the 2026-08-03
decision above. Kept because the underlying rule is general and still catches people out.

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
