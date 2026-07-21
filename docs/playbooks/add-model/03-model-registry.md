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

## Multi-tier models — N sibling cards, one per tier (LTX-2.3 / Boogu-Edit pattern)

A model that ships the **same graph** at several quality/size points (a fast small
weight, a heavy production weight) is **NOT** one card with a picker. It is **N separate
`ModelDef` cards**, one per tier, that the UI clusters by a shared `modelFamily`:

- Each card has its own `id` (`ltx-23` + `ltx-23-balanced`; `boogu-edit-high` +
  `-balanced` + `-low`), its own `sizeTier` (`'high'`/`'balanced'`/`'low'` — the L/B/H
  badge), and its **own `dependencies`** (each installs only its tier's weight).
- **Same `name` + same `modelFamily`** across the siblings. `modelFamily` drives the
  "show the L/B/H badge only when 2+ tiers of the family are installed" clustering. The
  `name` shown to the user is identical (`'Boogu Image Edit'`) — the badge disambiguates.
- The user installs the tier(s) they want as independent models; a low-VRAM machine
  installs only `low`, a workstation installs `high`. Nothing forces all three.

**Do NOT confuse this with the `variants.arch` axis** ([../../workflow-authoring/variant-injection.md](../../workflow-authoring/variant-injection.md)).
That is ONE card whose weight is auto-picked **by the user's GPU** (Blackwell vs Ada) —
the user never chooses. Sibling tier-cards are a **user-facing quality choice** across
separate cards. A model can even use both (LTX `balanced` is a tier-card that ALSO carries
an `arch` axis). Rule of thumb: **different silicon → `variants.arch`; different
quality/size the user picks → sibling cards.**

### When the tiers share ONE template with a baked tier-selector (Boogu-Edit, MPI-257)

Boogu-Edit's three tiers differ by **weight AND sampler settings** (cfg/steps/scheduler),
but the author built them into ONE graph: a single `UNETLoader` plus three sampler chains
feeding an `MpiAnySwitch` that reads an `Input_Tier` `MpiInt`. The generator emits one
runtime file per tier by baking **two** values (look up both by `_meta.title`, never id):

1. `UNETLoader.unet_name` → the tier's diffusion weight, and
2. `Input_Tier.int` → `1`/`2`/`3` → the switch selects that tier's sampler chain.

The app never injects `Input_Tier` (it is not a control) — it is **frozen per file** by
the generator. Each runtime file then maps to its sibling card's `workflows`. See
`generate_boogu.py` (a ~90-line clone of `generate_sdxl.py` + the tier-int bake) and
[01-workflow-split.md](01-workflow-split.md). The tier→(weight, sampler) map lives in the
model doc, not here — the bench graph is the source of truth for cfg/steps per tier, so
**re-read the switch wiring, don't trust a prior note**.

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
