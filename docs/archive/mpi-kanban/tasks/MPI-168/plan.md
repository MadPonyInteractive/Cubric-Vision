# MPI-168 Plan — Model tiers (L/B/H) + computed VRAM↔RAM trade table

> Large plan. Investigation COMPLETE (4 agents: footprint formula, registry,
> models-page UI, prompt-box selector). Findings folded in below.
> Branch: RunPod. Engine-aware. Local-engine-only fit UI.

## Goal

Replace one-size-fits-all model weights with explicit **tiers** shipped as
separate model cards (Low / Balanced / High). Help low-VRAM users pick the right
card without lying about requirements — the requirement is a VRAM↔RAM **curve**
(less VRAM → more RAM to offload), not a single number.

## Locked decisions (brainstorm)

- Tiers = **separate model cards**, not a per-card radio, not a cross-cutting
  tier system. Content/grouping over the existing registry.
- 3 fixed levels: Low / Balanced / High. **A model has ONE tier.** Families are
  sparse — not every family fills all three:
  - **All SDXL → `low`** (permanent; never balanced/high).
  - **Wan (current) → `balanced`** (low + high are future separate cards).
  - **LTX (current) → `balanced`** (low + high are future separate cards).
- Models page **filter** = 3 multi-select toggle buttons (L/B/H), no ALL
  (all-off = show all). User's matching tier toggle highlighted (local only).
- Card **badge** = full word; hover → **computed** VRAM↔RAM trade table; row
  nearest user hardware highlighted (local only).
- Prompt-box selector = **L/B/H** letter suffix — **only when the same family
  has 2+ tiers installed** (no clutter on lone cards like SDXL/current-Wan/LTX).
- Trade table is **COMPUTED**, approach (b): footprint = W + overhead.
- Fit highlight/table = **local-engine only** (remote = Pod GPU pick).
- Shared deps dedup by id across tier cards (confirmed `dedupeStable`).
- `enhanceRecipe`/`type` shared across tiers of a family (confirmed fallback).

## Field naming — RESOLVED (3 agents proposed 3 names; collisions found)

- `tier` (numeric) is TAKEN = node-title-gen tier (commandExecutor.js:564). DO NOT reuse.
- `qualityTier` is TAKEN = per-project resolution/speed setting in project.json. DO NOT reuse.
- **USE `sizeTier`** (`'low'|'balanced'|'high'`) — describes weight size, unambiguous.
- **USE `modelFamily`** (string, e.g. `'LTX-2.3'`) — `family` is a ratio-tool local var.
- Footprint inputs: **NONE per-model except file size** (already free from `dep.size`).
  The formula uses TWO GLOBAL constants only (see below). No per-family lab runs.

## THE FORMULA — file size + 2 GLOBAL constants (user-locked design)

> REJECTED the per-family-measured version (`ramBase`/`activationVRAM` back-solved
> per model = "test crap out per family" = the trap we threw away). The formula runs
> on FILE SIZE alone + 2 constants derived ONCE.

```js
totalWeights = Σ(model's weight file sizes, GB)   // free, from dep.size; per-card (so fp8/GGUF auto-adapt)
footprint    = totalWeights + OVERHEAD            // OVERHEAD = ONE global GB constant (framework/CUDA/activation slack)
vramFloor    = Math.max(MIN_FLOOR, totalWeights * k)  // k = ONE global fraction; MIN_FLOOR guards small models (SDXL)
ramNeeded(V) = Math.ceil(Math.max(0, footprint - V) / 8) * 8   // round UP to 8GB DIMM; display with "~"
// table rows only for V >= vramFloor
```

**The table states MODEL need, not system total.** OS reserve (user's box = ~20GB
of 64) is the user's own headroom — NOT baked in (varies system-to-system; baking
it = a lie). Footnote owns that unknown.

**CONSTANTS — FITTED + LOCKED** (from published rec tables + the 4060 anchor):
```js
const OVERHEAD  = 1.3;   // GB — global framework/CUDA/activation slack
const K         = 0.25;  // vramFloor fraction of total weight size
const MIN_FLOOR = 8;     // GB — guards small models (SDXL) where k*weights < 8
```
Fit hits the 4060 exactly: LTX bf16 (58.7GB weights) at V=16 → ramNeeded = 44GB
(user runs on ~44GB free). Validated LTX table: 16→~48, 24→~40, 32→~32, 48→~16, 64→0.

KNOWN WART (accepted, design (a)): mid-weight Wan (~20GB) floors at MIN_FLOOR=8,
not its published 12GB "comfortable" — `0.25×20=5` clamps to 8. Wan shows 8GB rows
(slow-but-possible); the RAM column (~16GB at that floor) carries the warning. NO
third constant / no "slow" annotation (the RAM number already implies it). Bumping
MIN_FLOOR→12 was REJECTED (would wrongly hide SDXL on 8–10GB cards).

Honesty law: **never under-state** (under = OOM). Round-up-to-8 IS the margin;
no extra padding stacked (over-stating scares off configs that'd actually run).
vramFloor is a real cutoff (BF16 not suggested below ~12-16GB — product judgment,
encoded as `totalWeights*k`).

## Accuracy caveats

- fp8/GGUF: `totalWeights` is per-card (each tier = own weight file) → formula auto-adapts. ✓
- Small models (SDXL ~6.5GB): linear `k` floor would be too low → `MIN_FLOOR` guard.
- CPU-only/MPS: formula inapplicable → flat "CPU only — needs all weights in RAM".
- UI label: "~ Estimated model need; excludes OS usage (~10–20GB)." Not a guarantee.

---

## Investigation-confirmed implementation surface

**Registry** (agent 2): all new fields OPTIONAL, **zero breaking changes**. Only
mandatory edit = typedef + entries. `dep.size` already exists (`'41GB'` strings);
`_parseSizeToBytes` in downloadService.js parses it (inline a copy). `resolveDeps`
+ `dedupeStable` handle shared-dep dedup. `enhanceRecipe ?? type` shared across tiers.

**Models page** (agent 3): all within `MpiModelManager` + existing primitives.
NO new component files.
- Existing "VRAM badge" = plain `<span>` in MpiInstalledDisplay info row — DON'T
  extend it; add a sibling tier badge in `_buildCard()` card wrapper.
- Hover table = reuse **`MpiPopup`** primitive (portals to body, won't clip);
  wire `mouseenter`/`mouseleave` via `on()`; store + `destroy()` per card.
- Filter = 3 **`MpiButton`** `toggleable:true` (same pattern as op-toggles).
- Hardware read = one-shot `fetch('/system/stats')` in `onOpen()` → `vram.total`/
  `ram.total`; cache in closure. No state lift.
- Remote detect = existing `_isRemote` + `remote:connection` sub already in file.

**Prompt-box** (agent 4): one function `_modelDropdownOptions()` MpiPromptBox.js:461.
Append letter to `label` (visible in closed trigger; `meta` only shows when open).
Single source, no dup. Gate on "2+ tiers of family installed".

---

## Phases

### Phase A — Footprint formula module + the 2 constants  [GATING, done first]
- **PRE: research agent (running) fits `OVERHEAD`, `k`, `MIN_FLOOR`** from published
  rec tables + the 4060 anchor. Lock those values into the module.
- New `js/data/modelConstants/footprint.js`:
  - `_sizeToGb(str)` — parse `'41GB'`/`'254MB'` → GB (copy from downloadService).
  - `totalWeights(model, engine)` — sum `dep.size` for the engine-correct resolved
    weight deps (filter to weight TYPES — checkpoints/unet/clip/vae/text-encoder —
    NOT custom nodes). Uses existing `resolveDeps` + `dedupeStable`.
  - `tradeTable(model, engine, userVramGb)` — the formula; returns rows
    `{vram, ram, isFloor, isUserRow}`. Pure, no measured per-family input.
  - The 3 constants live as `const` at top of this file. ONE place.
- Self-check: `demo()`/assert reproducing the LTX bf16 anchor (V=16 → ~44GB, the
  user's known-good box). Runnable via node, no framework.
- verify: `node footprint.js` self-check prints the LTX table + asserts 16→~44.

### Phase B — Registry fields on ModelDef  [depends A only for naming]
- Add to models.js typedef + entries: `sizeTier`, `modelFamily`. **That's it** —
  NO per-family footprint constants (formula derives everything from file size).
- Set current cards: all SDXL `sizeTier:'low'`; Wan + LTX `sizeTier:'balanced'`
  with `modelFamily` ('Wan-2.2', 'LTX-2.3') so future siblings cluster.
- verify: app boots, model manager lists, no console errors (read fields only).

### Phase C — Models page: filter toggles + tier badge + computed hover table
- Filter bar: 3 MpiButton toggles in `setup()`, `_filterActive` closure,
  filter MODELS in `renderList()`; all-off → show all.
- Tier badge per card in `_buildCard()` (full word, `--low/--balanced/--high`
  color via CSS vars in MpiModelManager.css).
- Hover table: MpiPopup with COMPUTED rows from footprint.js (NOT hardcoded);
  highlight row nearest user VRAM; default `high` tier for video.
- Hardware fetch in `onOpen()`; highlight suppressed when `_isRemote`.
- Teardown: popups + buttons destroyed in existing card/destroy paths.
- verify (local): badges show, filter hides/shows, hover table computes LTX rows,
  user's row highlighted. verify (remote): highlight gone, table still shows.

### Phase D — Prompt-box selector: L/B/H marker (ambiguous-only)
- `_modelDropdownOptions()` MpiPromptBox.js:461: append ` L/B/H` to label ONLY
  when 2+ installed models share `modelFamily`. Map low→L, balanced→B, high→H.
- verify: with only balanced LTX installed → no letter; simulate 2 tiers → letters appear.

### Phase E — Verify end-to-end on the real box + remote
- Local 16GB/62GB: open model manager, confirm LTX table reads 16→64GB (the
  true spec), filter + badge + highlight correct.
- Connect a Pod: confirm fit UI suppressed, generation unaffected.
- Confirm SDXL flat table sane, no L/B/H clutter anywhere (single-tier families).

---

## Parallel Batch

> Phase A is GATING (the formula module + role tags) — do it first, solo.
> After A lands, B/C/D are independently ownable (separate files, no shared
> edits) and can run as a parallel batch. E is final solo verify.

| Task | Owner scope | Files (exclusive) | Depends |
|---|---|---|---|
| A | formula + role tags | `js/data/modelConstants/footprint.js` (new), `dependencies.js` (role tags) | — |
| B | registry fields | `js/data/modelConstants/models.js` | A (field list) |
| C | models-page UI | `MpiModelManager.js` + `.css` | A (footprint fn), B (fields) |
| D | prompt-box marker | `MpiPromptBox.js` | B (sizeTier/modelFamily) |
| E | verify | — (runtime) | B, C, D |

Parallel-safe window = **C + D** (disjoint files) once A + B are in. B touches
only models.js; C touches only MpiModelManager; D touches only MpiPromptBox.
A and B are sequential (B needs A's final field names). E is solo at the end.

## Out of scope (YAGNI)

- Authoring the actual LTX/Wan low+high tier WEIGHTS + workflows (user does this
  later; this plan ships the SYSTEM + current cards tagged).
- Disabling/dimming a filter toggle when zero models of that tier exist.
- Lifting system-stats to global state (one-shot fetch suffices).
- Continuous (non-tier) resolution input to the activation formula.
