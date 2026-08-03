# MPI-430 — CivitAI licences: the API is blind to the badge, and the ToS grant is Service-scoped

Surfaced 2026-08-02 while doing MPI-365's Chroma style-LoRA licence check. Chroma itself
is **settled** — see `docs/models/chroma/licences.md`, do not redo it. This card is the
sweep across every OTHER CivitAI-sourced weight, plus one decision.

## Defect 1 — the documented method cannot see the licence

`docs/models/klein/licences.md` resolves a weight by SHA256 and reads the permission
flags off `GET /api/v1/models/<id>`. Measured on all five Chroma LoRAs: **that payload
has no licence field at all.** No `licenses` key, and the string "Apache" appears nowhere
in it, while the model *page* renders `License: Apache 2.0` plainly.

The badge lives in the server-rendered page, not the API. Extraction that works:

```
curl -sL -A "<a browser UA>" https://civitai.com/models/<id>     # -L matters: bare /models/<id> 308s to the slug URL
grep -o 'choosealicense/licenses/blob/main/markdown/[a-z0-9.-]*' page.html
```

Verified both directions: the two Apache-2.0 models each match exactly once, the three
without a licence row match zero times.

**Consequence:** every verdict ever reached by the flags-only method was reached without
the one field that legally governs. Two of Chroma's three "no `Image`" weights flipped to
clear once the badge was read.

## Defect 2 — what actually authorises our R2 mirror?

CivitAI's ToS grants users, by default, a licence to use and distribute another user's
content **"through the Service"**, *"unless another license is specified by you on your
page"*. So:

- A weight **with** a permissive badge (Apache-2.0, MIT, CC-BY): the badge replaces the
  Service-scoped default with a real off-site grant. Mirroring to R2 and shipping it in a
  desktop app is squarely covered.
- A weight with **no** badge: the default grant is scoped through the Service, and the
  permission checkboxes are the creator's stated terms on top of it. Nothing there clearly
  authorises us re-hosting the file on our own R2 and distributing it.

That question is **bigger than the `Image` flag** and it applies to weights already
shipping, not just new ones. It was NOT invented by this card — it was invisible while the
method only ever looked at flags.

**Remediation the user offered (2026-08-02): Fabio can DM the creators directly on
CivitAI** and get explicit permission in writing. For a handful of weights that is likely
faster and more certain than any amount of licence reasoning, and it converts an argument
into evidence. Record any reply in the relevant `docs/models/<model>/licences.md`.

## Scope

1. Re-check every CivitAI-sourced weight for a page licence badge — the Klein style rack
   (10 weights, `docs/models/klein/licences.md`) first, since it ships today, then any
   Krea 2 / SDXL / other community weight whose `origin` names CivitAI.
2. Revisit Klein's three documented "no `Image`" weights (`klein-style-chibi`,
   `klein-style-doodle`, `klein-style-anime`). They were shipped on a *bundle* argument —
   the restrictive flag belonged to a leg we do not host. A badge may settle them outright
   and retire that reasoning.
3. Decide the redistribution question above, once, for all racks. DM route is on the table.
4. Fix the method in `docs/models/klein/licences.md` so the badge step is mandatory (a
   short trap note was added there on 2026-08-02; the full re-verified table is this card).
5. Add a `credit` block for any creator with `allowNoCredit: false` found along the way —
   `MpiAbout` builds its Credits list from the data, so the dep IS the task. Overlaps the
   older cross-model credit sweep, MPI-358.

## Do not redo

The five Chroma weights are fully resolved. Four ship (`bwsketch`, `lenovo`, `brushwork`,
`anime`), `chroma-style-cinema` was dropped for withholding `Image`, and the rack was
renumbered in the master template to match. Table, evidence and reasoning:
`docs/models/chroma/licences.md`.

---

# Status after the MPI-429 sweep (2026-08-03) — read this before re-planning

MPI-429's phase 1.5 swept the badge method across its 32-dep re-host set, which turned out
to contain **every dep whose `origin` names CivitAI or CivArchive (22 of 22)**. So most of
this card is already discharged. Evidence lives in the licence docs, not here.

| Scope item | State |
| --- | --- |
| 1. badge re-check of CivitAI weights | **DONE for the 22 that declare CivitAI** — but see the gap below |
| 2. Klein's three "no `Image`" weights | **PARTLY** — `klein-style-anime` came back **Apache-2.0** and is SETTLED CLEAR; `klein-style-chibi` and `klein-style-doodle` are still badge-less and still rest on the bundle argument |
| 3. the redistribution decision | **DECIDED** by the user 2026-08-03 |
| 4. make the badge step mandatory in the method | **DONE** — `docs/models/klein/licences.md` § Method, step 1b |
| 5. `credit` blocks for `allowNoCredit: false` | **DONE** for the two found (coyotte, S1LV3RC01N); verified rendering via `MpiAbout._credits()`. Older weights remain MPI-358 |

10 weights came back **Apache-2.0** that the flags-only method had looking restrictive.
New docs: `docs/models/krea2/licences.md`, `docs/models/qwen-edit/licences.md`;
`docs/models/klein/licences.md` table corrected.

## Item 3 — DECIDED 2026-08-03

Badge-less CivitAI weights (`krea2-raw-transformer-nsfw`, `krea2-lora-filterbypass`,
`krea2-style-midjourney`, `klein-style-chibi`, `klein-style-doodle`) are governed only by
CivitAI's Service-scoped default grant, which does not plainly authorise our own R2/HF
mirror. **The user judged this low practical risk and elected to ship as-is. It is a
decision, not an oversight.** Recorded in `docs/models/krea2/licences.md`. The DM-the-
creator route stays available if a specific weight ever needs to become evidence.

## The Krea 2 NSFW weight — SETTLED, do not re-litigate

`krea2-raw-transformer-nsfw` is **coyotte's LUSTIFY! V10 (Krea 2), CivitAI 573152** — the
dep had recorded `origin: 'Comfy-Org/Krea-2'` since 2026-07-16 (`b972df5b`, MPI-282), which
was wrong and hid whose work it is. Corrected, and a `credit` block added so coyotte
appears on the About page (attribution is **not** required here — `allowNoCredit: true` —
the credit is deliberate).

The date overlap that looks bad and is not: V10 released 2026-07-10 into paid early access
with an open date of 2026-08-10, and we added it 2026-07-16, inside that window. **It was
acquired legitimately** — Fabio subscribed to coyotte's paid channel and deliberately
bought **three months** rather than the one it cost, to over-remunerate the creator, and
the two have discussed it directly. **Decision 2026-08-03: no outreach, ship as-is, credit
on the About page.** A later reader who spots the dates should stop here.

## DONE 2026-08-03 — the NSFW weight is R2-only until 2026-08-10

Consequence of the settlement above, decided by the user: LUSTIFY V10 is inside coyotte's
paid early-access window until **2026-08-10**, so the HF copy MPI-429's sweep made was
**deleted**. R2 is app-gated, a public HF repo is not — different act, and only one of them
needs the window to be over. HF upload is deferred, not cancelled.

Shipped: `noMirror: true` on `krea2-raw-transformer-nsfw` (without it the generic prefix
rewrite hands a blocked user a 404 second route — measured, it was the only 404 of the 31
re-hosted deps). Recorded in `docs/models/krea2/licences.md`, `docs/download-manager.md`
§ The second origin, and `.claude/rules/downloads.md`.

**On/after 2026-08-10: re-upload to `Mad-Pony-Interactive/cubric-studio` under
`vision/models/diffusion_models/` and delete the flag.**

## NEW SCOPE — 9 weights the sweep could not see (found 2026-08-03)

The sweep selected on `origin` matching CivitAI/CivArchive. **Nine deps carry a bare
community-merge FILENAME as their `origin`**, so they matched nothing and were never
checked — and they are the highest-exposure set, because we host them AND five of them
ship inside released v1.0.1:

`sdxl-realistic` (`Juggernaut_XL`), `sdxl-nsfw` (`lustify_7`), `ill-anime`
(`animemix_v80`), `ill-anime-beauty` (`ramthrustsNSFWPINK_alchemyMix176`), `pony-mix`
(`animergemeij_v30VAE`), and the four `wan-22-*` (`smoothMixWan2214BI2V_*`).

Juggernaut XL, LUSTIFY and SmoothMix are CivitAI names, so these are near-certainly
CivitAI-sourced and simply undeclared. Resolve each by **SHA256**, not by that filename —
the same root cause as MPI-429's `qwen-lora-headswap` gap: a weak `origin` field makes a
weight invisible to any sweep. Fix the `origin` values while you are there.
