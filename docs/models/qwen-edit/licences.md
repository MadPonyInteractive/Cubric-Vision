# Qwen-Image-Edit — community style-LoRA licences

Checked **2026-08-03** (MPI-429 phase 1.5 sweep). Method — resolve by SHA256, then read the
page **badge**, not just the flags — is in [../klein/licences.md](../klein/licences.md)
§ Method. The v1 API is blind to the badge; do not use flags alone.

All seven resolve to CivitAI despite `origin` recording a `CivArchive/<id>` — CivArchive
ids are NOT CivitAI model ids, so a lookup by that number 404s. Resolve by SHA256.

| dep | CivitAI | creator | badge | `allowCommercialUse` | credit | verdict |
|---|---|---|---|---|---|---|
| `qwen-edit-style-illustration` | 1974579 | kevinX_CA | **Apache-2.0** | Image, RentCivit, Rent, Sell | waived | clear |
| `qwen-edit-style-caricature` | 2145786 | DrBaph | **Apache-2.0** | Image, RentCivit, Rent, Sell | waived | clear |
| `qwen-edit-style-anime2d` | 2206073 | AIGC_Singularity | **Apache-2.0** | Image, RentCivit, Rent, Sell | waived | clear |
| `qwen-edit-style-3d` | 2206167 | AIGC_Singularity | **Apache-2.0** | Image, RentCivit, Rent, Sell | waived | clear |
| `qwen-edit-style-anime3d` | 1994924 | SeeSeeLP | none | Image, RentCivit, Rent | waived | clear on flags |
| `qwen-edit-style-zankuro` | 1884119 | bionagato | none | Image, RentCivit, Rent, Sell | waived | clear on flags |
| `qwen-edit-style-snapshot` | 2384460 | AI_Characters | none | Image, RentCivit, Rent, Sell | waived | clear on flags |

Every row grants `Image` — users may sell what they generate, which is the flag that
matters for a local app. No row requires attribution, so none needs a `credit` block.

`qwen-edit-style-anime3d` and `chroma-style-anime` resolve to the **same** model (1994924,
SeeSeeLP) — one upload with versions for two bases. Not an error.

`qwen-lora-headswap` (1.2 GB) is **unresolved**: no `origin` recorded and its SHA256 404s
on CivitAI's by-hash endpoint. Source it before any re-host.

## The redistribution question

The three badge-less rows sit under CivitAI's ToS default grant, which is scoped
*"through the Service"* and does not plainly authorise our own R2/HF mirror — **MPI-430**
item 3. The four Apache-2.0 rows are squarely covered: the badge replaces the
Service-scoped default with a real off-site grant.
