# Community-merge checkpoint licences (SDXL / Illustrious / Pony / Wan 2.2)

Nine base-model deps whose weights are **community merges**, not lab releases. They have
no per-model folder because they are not researched models — they are picked checkpoints.
Resolved 2026-08-03 under **MPI-430**.

## Why they existed unchecked for so long

MPI-429's CivitAI sweep selected deps whose `origin` **named** CivitAI. These nine carried
a bare upstream FILENAME (`Juggernaut_XL`, `lustify_7`, `animemix_v80`,
`ramthrustsNSFWPINK_alchemyMix176`, `animergemeij_v30VAE`, four `smoothMixWan2214BI2V_*`),
so they matched nothing and were never looked at — while being the **highest-exposure** set
in the catalogue: we re-host all nine publicly on `Mad-Pony-Interactive/cubric-studio`
under renamed root-path filenames, and five ship inside released v1.0.1.

Same root cause as MPI-429's `qwen-lora-headswap` gap: **a weak `origin` makes a weight
invisible to any sweep.** All nine now carry `<creator>/<model> (CivitAI <id>)`.

## Method note — only two of nine resolved by hash

The documented method ([klein/licences.md](klein/licences.md) § Method) is resolve-by-
SHA256. It returned `Model not found` for seven of these. Only `wan-22-t2v-high` and
`wan-22-t2v-low` matched an upstream file byte-for-byte.

The other seven share the upstream **filename and size** but not the sha256, so our copies
are not byte-identical to what CivitAI serves today. Two explanations fit and this card did
not separate them: the version was re-uploaded in place after we took it, or our copy was
re-saved somewhere in our own pipeline. Either way **the provenance below is by filename +
creator, not by hash**, which is weaker evidence than the klein/chroma tables — say so
rather than implying a hash match.

`ill-anime-beauty` is the clearest case: `ramthrustsNSFWPINK_alchemyMix176` is no longer
listed on its model page at all (the surviving versions are 3.90GB; ours is 6.46GB).

## The table

Badges read from the model page, flags from `/api/v1/models/<id>`, both 2026-08-03.

| dep | CivitAI | model | creator | badge | `allowCommercialUse` | `allowNoCredit` | `allowDerivatives` |
|---|---|---|---|---|---|---|---|
| `sdxl-realistic` | 133005 | Juggernaut XL | KandooAI | none | Image, RentCivit | **false** | true |
| `sdxl-nsfw` | 573152 | LUSTIFY! [NSFW checkpoint] | coyotte | none | Image, RentCivit | true | false |
| `ill-anime` | 933065 | animemix | koronen | none | **RentCivit only** | **false** | true |
| `ill-anime-beauty` | 2578175 | RAMTHRUST'S-NSFW-PINK-ALCHEMY-ANIMA | RAMTHRUST | none | Image, RentCivit | **false** | false |
| `pony-mix` | 734527 | ANImergeMEij | reijlita | none | **RentCivit only** | **false** | true |
| `wan-22-t2v-high` | 1995784 | Smooth Mix Wan 2.2 14B | DigitalPastel | none | Image, RentCivit | **false** | true |
| `wan-22-t2v-low` | 1995784 | ″ | DigitalPastel | none | Image, RentCivit | **false** | true |
| `wan-22-i2v-high` | — | **our own merge** | Mad Pony Interactive | n/a | n/a | n/a | n/a |
| `wan-22-i2v-low` | — | **our own merge** | Mad Pony Interactive | n/a | n/a | n/a | n/a |

**The t2v pair is DEPRECATED (MPI-470, 2026-08-07).** `wan-22` dropped `t2v_ms`, so nothing
installs `wan-22-t2v-high/low` any more — LTX 2.3 owns text-to-video and the pair cost 27.1GB
of third-party merge. The `modelDeps.js` entries (and their `credit` blocks) deliberately
REMAIN so the uninstall orphan sweep can still reclaim the files from users who already have
them; the R2 + HF copies also stay up. So the exposure below shrinks to seven live deps, but
the credit obligation on these two is not retired while the weights are still hosted.

**The two i2v weights are OURS** (user, 2026-08-03), which is the actual reason their
sha256 matches nothing on CivitAI — the `smoothMixWan2214BI2V_i2vV20*` filename they
shipped under is a merge INPUT's name, not their provenance. So `origin` now reads
`Mad Pony Interactive (custom i2v merge)` and they carry no `credit` block.

The t2v pair is **not** ours: `8032b490…` and `e7bd6fc4…` equal DigitalPastel's v3.0 files
byte-for-byte, so those two keep the credit — which `allowNoCredit: false` makes required
regardless. If SmoothMix turns out to be an ingredient of the i2v merge, that same flag
would reach the derivative; not investigated, and the user owns the call.

**No badge on any of the six source models.** So every one rests on CivitAI's
Service-scoped default grant, which does not plainly authorise our own R2/HF mirror — the
question MPI-430 item 3 already **decided**: ship as-is, judged low practical risk by the
user 2026-08-03. Not re-opened here; see [krea2/licences.md](krea2/licences.md).

## Credit — discharged in data

Five of the six models set `allowNoCredit: false`, so attribution is **required** for eight
of the nine deps. `credit` blocks are in `js/data/modelConstants/modelDeps.js`; `MpiAbout`
builds its Credits list from the data, so adding the block IS the task. Verified
2026-08-03: the credited-author count went 5 → 10 (added KandooAI, RAMTHRUST,
DigitalPastel, koronen, reijlita).

`sdxl-nsfw` is coyotte's and sets `allowNoCredit: true` — its block is **deliberate**, the
same choice already made for the Krea 2 weight from the same creator.

## The `Image` flag — DECIDED 2026-08-03, do not re-open

`ill-anime` (koronen) and `pony-mix` (reijlita) grant **`RentCivit` only**: no `Image`,
which is the flag that lets a user sell what they generate. Vision is a local app whose
users own their output, so `Image` is normally the decisive flag for us — that reasoning is
in [klein/licences.md](klein/licences.md), and `chroma-style-cinema` was **dropped from the
product** for exactly this ([chroma/licences.md](chroma/licences.md)).

**The user elected to KEEP them and ship as-is**, together with klein's `chibi` and
`doodle`, which withhold the same flag. That is the same judgement already made for the
redistribution question: these weights are badge-less, so what governs is CivitAI's
Service-scoped default grant, and the practical risk was judged low. **It is a decision,
not an oversight** — a later reader who spots the missing `Image` flag should stop here.

Why the Chroma precedent did not decide it: `chroma-style-cinema` was one style LoRA in a
rack that could be renumbered at no cost to anyone. These are **base checkpoints already in
users' hands in released v1.0.1**. Different cost, different call.
