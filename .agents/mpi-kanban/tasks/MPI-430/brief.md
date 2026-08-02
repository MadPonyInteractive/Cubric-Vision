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
