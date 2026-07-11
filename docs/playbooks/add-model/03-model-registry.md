# 03 — Model registry entry + new-type consumer sweep

> Part of the [add-model playbook](README.md). The `ModelDef` in `models.js`, and
> what to sweep when the model introduces a new `model.type`.

## Model registry entry (`models.js`)

Copy the closest existing entry (LTX for combined-op, Wan-22 for separate-op).
Key fields, with the 5B choices:

```js
{
    id: 'wan22-5b',
    sizeTier: 'low',              // UI badge (L/B/H); does NOT drive footprint math
    modelFamily: 'Wan-2.2',       // soft grouping for tier-variant clustering
    name: 'Wan 2.2 5B',
    dropdownMeta: 'VIDEO',
    mediaType: 'video',
    tier: 1,
    capabilities: { multiStage: false, audio: false },  // omit branchingContinue → Finish-only; omit motion → no motionIntensity control
    type: 'wan5b',                // a new type needs a consumer sweep (below)
    loraStrengths: ['model'],     // Wan/LTX read strength_model only
    enhanceRecipe: 'wan',         // reuse an existing Cubric Prompt recipe (no 'wan5b' recipe exists)
    supportedOps: ['t2v', 'i2v'],   // single-stage → NOT t2v_ms/i2v_ms (see shape decision in README)
    gen_speed: 'fast',
    description: '...',
    workflows: { t2v: 'Wan5B_t2v.json', i2v: 'Wan5B_i2v.json' },
    dependencies: [ /* flat — combined-op */ ],
}
```

- **No `video:`** until a real preview clip for THIS model exists. Never reuse
  another model's clip (misrepresents the model).
- **`capabilities` gates UI, not `type`:** `audio` → audio slot; `motion` →
  motionIntensity control; `branchingContinue` → Continue button. Set/omit to match
  the workflow's actual nodes.
- **VRAM/RAM table is automatic:** `footprint.js` sums dep `size` fields →
  `vramFloor = max(8, totalWeights*0.25)`, `ram = ceil(max(0, weights+1.3-vram)/8)*8`.
  Get the dep `size` strings right and the hover trade-table is correct. `sizeTier`
  is only a badge.

## New `model.type` → sweep the consumers (trap)

Most UI is gated on `capabilities.*` or `loraStages` (type-agnostic, safe).

**Ratios + quality tiers are declared on the ModelDef (MPI-174).** A new `type`
sets two optional fields in `js/data/modelConstants/models.js`:

- `ratios` — the ratio table, keyed by quality tier (quality-mode) or
  `portrait`/`landscape` (orientation-mode).
- `qualityTiers` — ordered tier ids, e.g. `['low','medium','high']`. Presence ⇒
  quality UI mode (tier radio); `ratios` without it ⇒ orientation mode.

`js/utils/ratios.js` picks both up at load (`getModelRatios`, `RATIO_MODES`,
`qualityTiersFor`), and the v3 migration reads `qualityTiers` from the registry —
no edits in ratios.js, MpiOptionSelector, or projectMigrations for a new type.
The built-in families (flux/sdxl/wan/wan5b/ltx) keep their hardcoded tables in
ratios.js; do NOT redeclare those on their ModelDefs.

Still hardcoded — grep for the new type and fix:

- `js/components/Organisms/MpiPromptBox/MpiPromptBox.js` — `enhanceRecipe ?? type`
  is sent to Cubric Prompt; set `enhanceRecipe` on the model def to reuse a known
  recipe if Prompt has none for the new type.

For MPI-172 (`wan5b`, pre-MPI-174) all four then-hardcoded spots were handled:
ratios (MPI-171), the two `tiersFor` maps (`wan5b: ['low','medium','high']`), and
`enhanceRecipe: 'wan'`.
