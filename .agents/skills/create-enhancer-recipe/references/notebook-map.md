# NotebookLM → model map

Fabio's NotebookLM notebooks that back the seed recipes. Query with
`notebooklm ask -n <id-prefix> "..."` (partial IDs match). Re-run
`notebooklm list --json` if a notebook is missing or renamed — this table is a
convenience snapshot (2026-06-22), not the source of truth.

**Count:** 6 prompt notebooks → 7 recipes. The Seedance notebook backs both
`seedance-1.5` and `seedance-2.0`; everything else is 1 notebook → 1 recipe.

| Model id (recipe) | Notebook title | ID prefix |
|---|---|---|
| `ltx-2.3` | LTX 2.3 prompts | `92f4a19f` |
| `wan-2.2` | Wan video prompt guides | `ddc4ed03` |
| `flux-chroma-krea` | Flux based models prompting | `1a01cf17` |
| `sdxl` | SDXL prompting | `94339b6e` |
| `seedance-1.5` | Seedance Prompt Guies | `119a088d` |
| `seedance-2.0` | Seedance Prompt Guies | `119a088d` |
| `kling-3.0` | Kling 3.0 prompt guides | `a848d66a` |

Notes:
- Seedance 1.5 and 2.0 share one notebook ("Seedance Prompt Guies"). When
  querying, scope the question to the version (e.g. "for Seedance 2.0…").
- A new model = Fabio creates a new notebook; add a row here after
  `notebooklm list --json` shows it.
- Notebooks present but not seed models (Discord/Patreon, E-Commerce, ComfyUI
  collab, Monetization, LLM Quantization) are unrelated to recipe research.
