# MPI-580 — The plugin entity grows up

**Umbrella:** MPI-553, phase 1 (the mechanism). **Consumers:** MPI-579 (LTX Video
upscaler, blocked on this), MPI-507 (PiD → image upscale dropdown), MPI-557 (Video
face detailer, a Flow that requires the plugin).

**Verify mode:** user-ux — the dropdown entry, its controls and the hidden mapping are
hand-feel surfaces; only a real app run proves them. The GC half is `auto` and gates on
`node --test tests/plugin-dep-gc.test.cjs`.

## Current State

**2026-08-19 — all four phases are written and verified; the card is `doing`/`validating`.**
630 tests pass and the whole chain was driven in a real app instance against a temporary
stub plugin (evidence + the one bug the pixels caught → `validation.md`). What is NOT done
is the thing only a consumer can show: no plugin declares `upscale` yet, so nothing is
user-visible until **MPI-579** lands. That card is now unblocked.

Three notes a fresh session would otherwise have to rediscover:
- The renderer lives at `js/utils/declaredFields.js` and MpiBaseFlow keeps a one-line local
  alias, so its two call sites and its CSS are untouched. `block` defaults to
  `mpi-base-flow` for exactly that reason.
- `mapTo` is applied at PAYLOAD time, never at widget time. The stored value is always the
  0–1 one, so a restored control seeds correctly and no inverse mapping exists anywhere.
- `[hidden]` does not hide a section that a class gives `display:flex`. That cost one wrong
  screenshot; the `__section[hidden]` rule is load-bearing, not tidiness.

Everything below was read out of the code on 2026-08-19, not inferred:

- `js/data/pluginsRegistry.js` — one plugin (`image-describer`); `PluginDef` is
  `{id, title, description, requiredDeps, operation}`. No contribution point of any kind.
- `js/components/Organisms/MpiToolOptionsUpscale/MpiToolOptionsUpscale.js:96` —
  `_mountModelDd()` builds `[None, ...state.upscaleModels]`. No plugin awareness.
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js:587` — the
  `apply` router turns `{factor, model}` into `Upscale_Factor` / `Upscale_Using_Model` /
  `Upscale_Model` and calls `_runImageTool` / `_runVideoTool`.
- `js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js:702` — `_buildField(f, cur,
  onChange, unsubs)` already renders the whole declared-field vocabulary
  (`select|radio|button|toggle|number|slider|text`) with clamping and note/info copy.
  **This is the controls primitive, already built and already law (MPI-572).**
- `routes/downloadManager.js:360` — `_pluginRequiredDepIds(excludeUninstallId)`, an
  unconditional union, consumed at `:242` (`_localSharedDepsMap`) and `:476`. Its client
  twin is `pluginRequiredDepIds()`.
- `js/data/modelConstants/assetDeps.js:298` — `ltx23-spatial-upscaler`, **949.62 MB**,
  already on R2, already in the `dependencies` of both LTX 2.3 tiers
  (`models.js:1195`, `:1248`). Nothing to author, nothing to upload.

## Design

### 1. The entry — one optional key on `PluginDef`

```js
upscale: {
    kinds:  ['video'],            // 'image' | 'video' — which MpiToolOptionsUpscale kind lists it
    label:  'LTX Video upscaler', // dropdown label; falls back to plugin.title
    fields: [ /* FlowStepField[] — see 2 */ ],
}
```

Named `upscale`, not `contributes`/`slots`. One dropdown exists; a second one earns its
own key when it exists. **`kinds` is the whole of the both-kinds generalisation** the
umbrella asks for — MPI-507 declares `kinds: ['image']` and writes no new mechanism.

- The dropdown option's **value is `pluginDepKey(id)` → `plugin:<id>`**, which cannot
  collide with an asset filename. That prefix is also how dispatch tells the two apart.
- Only plugins whose `pluginAvailability().installed` is true are listed. Not installed =
  absent, matching the existing gate in `js/utils/describeAction.js:47`.
- A persisted `toolSettings.videoUpscale.model` naming a now-absent plugin falls through
  the fallback `_mountModelDd()` already has (`initial = modelOpts[0] ?? ''`).

### 2. The controls — reuse the MPI-572 field vocabulary, add ONE key

A plugin's `fields` are `FlowStepField` **verbatim**, including its payload law: a bare
id reaches the op as a top-level input (`positive`), an `Input_`-prefixed id is routed
into `injectionParams`. One vocabulary, one payload law, nothing new to learn.

The hidden-mapping primitive is one new optional key on a `slider`/`number` field:

```js
{ id: 'Input_Denoise', type: 'slider', label: 'Denoise',
  min: 0, max: 1, step: 0.01, default: 0.5, mapTo: [0.50, 0.85] }
```

The widget shows `min..max` as declared (0–1); the value that leaves is
`lo + v * (hi - lo)`. **The mechanism owns the primitive, the plugin owns the numbers** —
MPI-579 supplies `[0.50, 0.85]` and `[1, 3]`, this card supplies neither.

**Renderer: extract, do not copy.** `_buildField` + `_fieldNumber` move out of
`MpiBaseFlow`'s closure into `js/utils/declaredFields.js`, taking `block` (BEM prefix,
default `mpi-base-flow`) and `namespace` (the radio-group `name`, today `flow.id`) as
arguments. MpiBaseFlow keeps its class names and its CSS **untouched**; the upscale panel
passes its own block and adds the handful of field rules to its own `.css`. No CSS moves,
no `preloadStyles.js` change.

Copying the renderer instead is the exact two-surface bug MPI-572 was written to kill
(step fields never reached the payload, defaults never seeded). Rejected on that record.

### 3. Dispatch — one branch in the existing router

`MpiToolOptionsUpscale` emits `apply { factor, model, pluginId?, values? }`.
`_handleApply` gains one branch before the built-in one: `model` starting `plugin:` →
resolve the plugin, split `values` by the `Input_` law, run `plugin.operation` through
the existing `_runImageTool` / `_runVideoTool`. `Upscale_Factor` / `Upscale_Using_Model`
are **not** sent — a plugin op owns its own graph. The built-in branch is untouched.

### 4. Flow requires plugin — `FlowDef.requiredPlugins: string[]`

Fold each named plugin's `requiredDeps` into the flow's dep universe, its availability
computation and the slide-over's required list (one row, labelled as a plugin). That is
the minimum that makes "installed and runnable with its plugin absent" impossible, and it
rides the `requiredDeps` machinery MPI-304 already built rather than inventing a second
gate. MPI-557 is the consumer.

### 5. GC — **nothing to design. The shared-dep case already ships.**

An earlier draft of this plan opened a product fork here — what a Library row says for a
user without LTX, and whether plugin dep-ownership should become derived or adopted.
**Withdrawn on 2026-08-19: the premise was false and Fabio corrected it.** A plugin does
not behave differently because its deps happen to be big or happen to belong to a model.

The shared-dep case is not new and is not theoretical — it is **live in the shipped
build**: `qwen3vl-abliterated-clip` is the image-describer's only dep AND sits in both
Krea2 tiers' `dependencies` (`models.js:686`, `:802`, commented *"shared with the
image-describer plugin"*). The existing rules already cover it end to end:

- Deps present because a model installed them → `pluginAvailability()` derives the plugin
  to **installed, for free**. No new code, no new row state.
- Deps absent → the Library row's Install downloads exactly the missing ones, under the
  `plugin:<id>` job key, with the total size already printed by `_pluginTile`.
- Uninstall the MODEL → `_pluginRequiredDepIds` keeps the shared weight (the plugin still
  wants it). Uninstall the PLUGIN → `excludeUninstallId` drops its own protection and the
  weight goes unless an installed model still holds it. Both directions already correct.

`tests/plugin-dep-gc.test.cjs` already exercises this, because the dep it asserts on *is*
the shared one. **So this card writes no GC code.** The LTX upscaler is the same shape
with bigger numbers.

One consequence worth stating once, since it is the numbers changing and not the rules:
with the plugin present, uninstalling LTX 2.3 will free only what the plugin does not
want, so a user wanting the disk back uninstalls both. Identical to Krea2 + the describer
today. **Flagged, not proposed** — which deps MPI-579's plugin declares is that card's
call, not this mechanism's.

## The same capability also becomes a Flow — later, and that is deliberate

Fabio, 2026-08-19: Flows are the surface for users who cannot drive the rest of the UI,
so **capabilities ship twice on purpose** — once as a workspace tool, once as a Flow — and
a lot more than this one will. The LTX Video upscaler is therefore headed for both the
History video Upscale dropdown *and* the Flow Library. **Order is his: History workspace
video first.** No Flow work in this card, and no card created for it here.

The design consequence lands now, not later: the control vocabulary must be **one**, not
one per surface. That is exactly why § 2 extracts `_buildField` instead of copying it, and
why `mapTo` goes into the shared field vocabulary rather than a plugin-only path — the
Flow twin then gets the hidden 0–1 mapping for free, with no second implementation to keep
honest. If the renderer had been copied into the upscale panel, the Flow twin would be the
third copy.

## Phases

**Phase 1 — registry shape.** `PluginDef` gains `upscale`; `FlowDef` gains
`requiredPlugins`; `types.js` typedefs. **No GC code** (§ 5).
**Verify:** `node --test tests/plugin-dep-gc.test.cjs` — must still pass untouched, which
is the proof that the new keys changed no protection behaviour.

**Phase 2 — the shared field renderer.** Extract `_buildField`/`_fieldNumber` to
`js/utils/declaredFields.js` with `block`/`namespace` params; add `mapTo`; MpiBaseFlow
imports it at both its call sites.
**Verify:** open a Flow with declared fields (Head Swap / LTX foley) in
`npm run app:isolated` — every field type still renders, seeds and reaches the payload.
Regression-first: MpiBaseFlow must be provably unchanged before anything consumes it.

**Phase 3 — the entry and its controls.** `MpiToolOptionsUpscale` lists installed
contributing plugins for its `kind`, renders the selected entry's fields, persists them
per tool key.
**Verify:** a stub plugin appears in the video dropdown and not the image one; selecting
it reveals its controls; a slider at UI 0.5 with `mapTo: [0.5, 0.85]` sends 0.675.

**Phase 4 — dispatch + Flow requirement.** The `_handleApply` branch and the
`requiredPlugins` gate. The Library row needs no work — a plugin sharing a model's deps
already renders correctly (§ 5).
**Verify:** the stub op receives the mapped values; a Flow declaring `requiredPlugins`
reports unavailable with the plugin absent.

MPI-579 is the real end-to-end proof and runs after this card closes.

## Files

`js/data/pluginsRegistry.js` · `js/data/flowsRegistry.js` ·
`js/utils/declaredFields.js` (new) · `js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js` ·
`js/components/Organisms/MpiToolOptionsUpscale/{MpiToolOptionsUpscale.js,.css}` ·
`js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` ·
`js/components/types.js` · `tests/plugin-dep-gc.test.cjs` (run, not edited)

Not touched, deliberately: `routes/downloadManager.js` and
`MpiModelManager.js` — the GC twins and the Library row already handle a plugin whose deps
a model also owns (§ 5).

A live peer session owns MPI-504 and `js/data/modelConstants/models.js` — not on this
list, and never to be staged from here.

## Plan Drift

- **2026-08-19 — the GC fork was withdrawn before any code was written.** The first draft
  treated "a dep owned by both a plugin and a `ModelDef`" as a new case needing a product
  decision and possibly persisted adoption state. Fabio: *"Plug-ins shouldn't differ just
  because of this or that."* Verified in code: `qwen3vl-abliterated-clip` is already
  shared between the image-describer plugin and both Krea2 tiers, so the case ships today
  and the rules already handle it. The card's own description carries the same wrong
  framing under "GC IS THE PART THAT BITES" — **heal the card**. `routes/downloadManager.js`
  and `MpiModelManager.js` leave the file list; the four phases stay, phase 1 shrinks to
  the registry shape alone.
