# Chroma — community style-LoRA licences

Chroma1-HD itself is **Apache-2.0** (see [README.md](README.md)); that does not extend to
the community style LoRAs shipped alongside it, which is why this file exists. Checked
**2026-08-02** (MPI-365). The parallel file for Klein is
[../klein/licences.md](../klein/licences.md).

## Method — SHA256 for identity, then the PAGE for the licence

```
GET https://civitai.com/api/v1/model-versions/by-hash/<sha256>   ->  modelId
GET https://civitai.com/api/v1/models/<modelId>                  ->  permission flags
curl -sL -A "<browser UA>" https://civitai.com/models/<modelId>  ->  the LICENCE badge
```

Three traps, all hit for real:

1. **The by-hash endpoint returns a STUB `model` object** whose `allowCommercialUse`,
   `allowNoCredit` and `allowDerivatives` are all `null`. Those are not permissive
   defaults — they are absent. You MUST follow `modelId` to `/models/<id>`.
2. **The API is BLIND to the licence.** `/models/<id>` has no licence field at all — no
   `licenses` key, and "Apache" appears nowhere in the payload — while the page renders
   `License: Apache 2.0` plainly. The flags-only method reads the creator's *preferences*
   and misses the instrument that *governs*. Two of the three weights this check first
   flagged as "no `Image`" flipped to clear once the badge was read. Extract it with:
   `grep -o 'choosealicense/licenses/blob/main/markdown/[a-z0-9.-]*' page.html` — and note
   `-L` is required, because bare `/models/<id>` 308s to the slug URL.
3. **The API region-blocks the UK** — `{"error": "...not available in your region...",
   "code": "REGION_BLOCKED"}`. Needs Fabio's VPN; agent `WebFetch`/`WebSearch` can never
   reach it, only shell tools. Don't trust the clock while it's on (`CLAUDE.md` → "VPN +
   the skewed clock"); measured 1s skew on 2026-08-02, but 14h has happened.

Flag meanings: `Image` = the user may sell what they generate; `Rent` = the weight may be
run by a paid generation service; `Sell` = the weight itself may be sold; `RentCivit` = may
be run on CivitAI. **A permissive licence badge outranks all four.**

## The table (checked 2026-08-02)

| dep | CivitAI | creator | licence badge | `allowCommercialUse` | verdict |
|---|---|---|---|---|---|
| `chroma-style-bwsketch` | 1978782 | TijuanaSlumlord | **Apache-2.0** | RentCivit | clear — licence governs |
| `chroma-style-lenovo` | 1662740 | Danrisi | none | Image, RentCivit, Rent, Sell | clear |
| `chroma-style-brushwork` | 1916402 | TijuanaSlumlord | **Apache-2.0** | RentCivit | clear — licence governs |
| `chroma-style-anime` | 1994924 | SeeSeeLP | none | Image, RentCivit, Rent | clear |
| ~~`chroma-style-cinema`~~ | 1960106 | Kaalciv | none | Rent, RentCivit | **DROPPED — no `Image`** |

`lenovo` sets `allowDerivatives: false`. We ship it as-is and never merge it, so that
costs us nothing — same reasoning as `klein-style-vintage`.

## Why Apache-2.0 beats a `RentCivit`-only flag

The two TijuanaSlumlord weights look restrictive by their checkboxes and are in fact the
most permissive things in the rack. CivitAI's ToS grants users a default licence to use
each other's content **"through the Service"**, *"unless another license is specified by
you on your page"* — and the badge is exactly that specification. Apache-2.0 is an
irrevocable, royalty-free grant of commercial use, redistribution and derivative works; a
hosting-site toggle cannot claw back rights granted under it in the same upload. Where the
two conflict, the licence governs.

The corollary is uncomfortable and is carded as **MPI-430**: for the weights with *no*
badge, the ToS default is scoped through the Service, so what authorises us mirroring the
file to our own R2 and shipping it in a desktop app is an open question — one that applies
to the Klein rack we already ship, not just here. Fabio can DM creators on CivitAI for
explicit permission; that is the intended remediation.

## Why Cinema was dropped (user call, 2026-08-02)

`Absolute CINEMA` had no licence badge, so its flags *were* its terms — and Kaalciv
granted `Rent` (paid services may run it) while withholding `Image` (users may not sell
what they generate). Vision is a local app whose users own their output, so that is the
one flag we cannot ship without. Klein's precedent for shipping three flag-restricted
weights does **not** cover it: that argument rested on those being *bundles* whose
model-level flag belonged to a leg we do not host, and Cinema is a Chroma-native LoRA.

It was removed from the graph as well, not just from the deps — the rack renumbered from
five styles to four (`lora_3` is now Brushwork, `lora_4` Anime, `lora_5` `None`) via a
ComfyUI re-export and `sync-raw-workflows.mjs`. Leaving a dead slot behind would have been
worse than useless: ComfyUI validates every combo widget at submit time, so a `lora_N`
pointing at a file no user ever downloads fails **every** Chroma prompt, not just that
style.

## Credit obligations are discharged in DATA, not prose

Three of the four shipped weights set `allowNoCredit: false`, and the two Apache-2.0 ones
would require attribution under §4 regardless. Each carries a `credit` block in
`loraDeps.js`:

```js
credit: { author: 'TijuanaSlumlord', work: 'Chroma - Complex Chaotic B&W Stuff', url: 'https://civitai.com/models/1978782' },
```

`MpiAbout` builds its Credits list from **every dep that carries a `credit` block**, so
adding one to a future dep is the whole task — nothing to remember, nothing to keep in
sync. `chroma-style-anime` is the one weight whose creator waived attribution
(`allowNoCredit: true`); its lack of a block is verified, not an oversight, and a comment
in `loraDeps.js` says so. The cross-model sweep for existing weights is **MPI-358**.
