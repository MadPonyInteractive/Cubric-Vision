# Krea 2 — community weight licences

Checked **2026-08-03** (MPI-429 phase 1.5 sweep). Krea 2 itself is Comfy-Org's; this file
covers the community weights we ship alongside it. Method — resolve by SHA256, then read
the page **badge**, not just the flags — is in [../klein/licences.md](../klein/licences.md)
§ Method, including why the v1 API is blind to the badge. Do not re-derive it.

## The table

| dep | CivitAI | creator | badge | `allowCommercialUse` | credit | verdict |
|---|---|---|---|---|---|---|
| `krea2-raw-transformer-nsfw` | 573152 | coyotte | none | Image, RentCivit | waived | ships — see below |
| `krea2-lora-filterbypass` | 2728234 | S1LV3RC01N | none | Image | **REQUIRED** | ships, credit block added 2026-08-03 |
| `krea2-style-midjourney` | 2751419 | SPOON_IA | none | Image, RentCivit, Rent, Sell | waived | clear on flags |

The nine `krea2-style-*` LoRAs (darkbrush, dotmatrix, kidsdrawing, neondrip, rainywindow,
retroanime, softwatercolor, sunsetblur, vintagetarot) and `krea2-raw-transformer` are
**Comfy-Org's own uploads**, verified byte-identical to `Comfy-Org/Krea-2` by SHA256 —
not CivitAI weights, and not ours to license. Same for `krea2-lora-identity-edit`
(`conradlocke`), `krea2-lora-accelerator` (`TheDivergentAI`) and `krea2-lora-depth-control`
(`Patil`), each verified against its own HF repo.

## `krea2-raw-transformer-nsfw` is coyotte's LUSTIFY, not a Comfy-Org weight

The dep recorded `origin: 'Comfy-Org/Krea-2'` from 2026-07-16 (`b972df5b`, MPI-282) until
2026-08-03. That was wrong and it hid whose work this is: SHA256
`f165d4db…75bc865` resolves to **CivitAI 573152, LUSTIFY! V10 (Krea 2), by coyotte**.
`origin` is now corrected and a `credit` block added, so coyotte appears on the About page.

**Attribution is not required here** (`allowNoCredit: true`) — the credit is deliberate,
not an obligation.

### Acquisition — settled, do not re-litigate

Lustify V10 released 2026-07-10 into paid early access (Boosty / BTC), with an open
download date of 2026-08-10. We added it 2026-07-16, inside that window, which reads on
the surface like we gave away a paid release.

**It was acquired legitimately.** Fabio subscribed to coyotte's paid channel to get it and
deliberately bought **three months** rather than the one it cost, specifically to
over-remunerate the creator, and the two have discussed it directly. Decision 2026-08-03:
no further outreach, ship as-is, credit on the About page. A later reader finding the date
overlap should stop here rather than re-opening it.

## R2-ONLY until 2026-08-10 — the HF mirror is deleted on purpose

MPI-429 re-hosted this weight to `Mad-Pony-Interactive/cubric-studio` as its failover
origin. **The user deleted it from Hugging Face on 2026-08-03 and it must not go back until
2026-08-10**, the date coyotte opens LUSTIFY V10 to the public. Our R2 copy is reached only
through the app's download manager; a public HF repo is a public redistribution of a weight
still inside its paid early-access window, and those are not the same act.

Mechanically that means `noMirror: true` on the dep — the generic prefix rewrite would
otherwise hand a blocked user an HF URL that 404s (measured 2026-08-03: 30 of the 31
re-hosted deps return 302, this one 404). **On/after 2026-08-10: re-upload and delete the
flag**, so it regains a second route. Contract: `docs/download-manager.md` § The second
origin.

## The redistribution question still applies

`krea2-raw-transformer-nsfw`, `krea2-lora-filterbypass` and `krea2-style-midjourney` carry
**no licence badge**, so CivitAI's ToS default grant — scoped *"through the Service"* — is
all that governs, and it does not plainly authorise our own R2/HF mirror. That is
**MPI-430** item 3, unchanged by anything here, and it applies to weights already shipping.
Judged low practical risk by the user 2026-08-03. It is a decision, not an oversight.

## Credit obligations are discharged in DATA, not prose

`MpiAbout` builds its Credits list from **every dep carrying a `credit` block**
(`_credits()` iterates `Object.values(DEPS)`, so `modelDeps` and `loraDeps` both count).
Adding the block is the whole task. Verified 2026-08-03 that coyotte and S1LV3RC01N now
render. The cross-model sweep for older weights is **MPI-358**.
