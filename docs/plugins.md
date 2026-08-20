# Plugins — the third entity

A **plugin** is a capability another surface calls. Not a thing the user generates
with, not a Flow Library tile. The archetype is the image describer: it is triggered
from a right-click menu and produces text. The second is the LTX Video upscaler: it
adds an entry to the History workspace's Upscale dropdown.

| entity | lives in | user meets it as |
|---|---|---|
| MODEL | `js/data/models.js` | a Model Library tile you generate with |
| FLOW | `js/data/flowsRegistry.js` | a Flow Library tile — the beginner surface |
| PLUGIN | `js/data/pluginsRegistry.js` | an entry inside a surface that already exists |

`PluginDef` and `PluginUpscaleEntry` are fully typed in the `pluginsRegistry.js`
header — read it for the field list. **This doc holds what the file cannot: the
cross-file wiring, the two laws, and the traps that cost a revert.**

Why not a `ModelDef` with an `isPlugin` flag, why not an app: answered in that same
header. Do not relitigate it here.

## LAW 1 — `requiredDeps` is what the plugin OWNS, not what the graph loads

The split is the one `FlowDef` has shipped since MPI-304:

| declares | means | example |
|---|---|---|
| `requiredDeps: ['x']` | a weight **no model provides** — the plugin's own | `image-describer` → its 5.24GB encoder |
| `requiredModels: ['m']` | it runs on a model's weights, and owns none | `ltx-video-upscaler` → `ltx-23-balanced`; same as the `ltx-foley` / `ltx-extend` Flows |
| both | a model plus its own extras | the `head-swap` Flow → `qwen-edit` + its LoRA and node pack |

**Listing a model's weights in `requiredDeps` is a bug, and it was tried and reverted
(MPI-579).** The LTX upscaler briefly declared the six LTX weights its graph loads.
That broke MPI-258 B1 immediately: `_pluginRequiredDepIds` protects a plugin's deps
**unconditionally**, so with both LTX transformers gone the plugin still pinned five
shared support weights and the user could never reclaim them — the same circularity
that stranded ~19GB once already.

**And do not propose the obvious cure.** "Protect only while every dep is present"
IS the `fullyInstalled` gate that MPI-310 proved destroys weights: a shared dep that
is an input to its own protection stops defending itself the instant it goes missing.
That one deleted 5.24GB of Krea2's encoder while the dialog promised *"shared files
will be kept"*. Both circularities: `docs/download-manager.md` § exclusive deps.

`requiredModels` sidesteps both — the tier's own exclusive-dep machinery already
answers *is this installed* and already protects those weights, so the plugin
contributes **no protection edge at all**.

The exclusive-dep resolution that fixed this for MODELS cannot be reused for plugins:
the describer's only dep is shared with Krea2, so it would have no exclusive evidence,
protect nothing, and reproduce MPI-310. That is why `_pluginRequiredDepIds` is
unconditional and must stay so.

## LAW 2 — a bare id is a run input, an `Input_` prefix is an injection param

A plugin's `upscale.fields` use the `FlowStepField` vocabulary from
`flowsRegistry.js` (MPI-572) — same shapes, same payload law, resolved by
`splitDeclaredValues` in `js/utils/declaredFields.js`:

- `id: 'positive'` → reaches the op as a top-level **input**.
- `id: 'Input_Denoise'` → routed into **`injectionParams`**, where the title
  injector picks it up.

A `slider` may carry `mapTo: [lo, hi]` to show 0–1 while sending the real range.
**The mechanism owns the primitive; the plugin owns the numbers.** Fabio's rule for
it: *"The mapping should be occulted from the user, as per usual."*

Every declared field mounts a real component (`MpiProgressBar`, `MpiInput`, …) — see
`.claude/rules/components.md`. Nothing here hand-rolls a bare `<input>`.

## Availability — deps AND models, and unknown means NO

`pluginAvailability()` returns `{ installed, missing, missingModels }`. It checks
required deps against the dep-status map and required models against
`state.s_installedModelIds` — the same renderer-side list `flowAvailability()` reads.
The backend never reads it (invariant 1, MPI-276).

**Unknown status reads as NOT installed.** Offering Install for something already
present is recoverable; silently running a workflow whose weight is missing is not.

## Contributing an entry to the Upscale dropdown (MPI-580)

The dropdown already exists — `MpiToolOptionsUpscale`, shared by the image and video
tools via `kind`. A plugin contributes an **entry**, never a new dropdown.

- `upscale.kinds: ['video'] | ['image']` is the whole of the both-kinds
  generalisation. The LTX upscaler declares `['video']`, the PiD plugins (MPI-507)
  will declare `['image']`, and neither writes any mechanism.
- `upscalePluginsFor(kind)` lists only **installed** contributors. Not installed =
  absent, matching the `describeAction` gate.
- The option's `value` is the plugin's **dep key** (`plugin:<id>`), which is also
  what tells dispatch it is not an upscale-model filename. `pluginFromDepKey()`
  reverses it.

## The Model Library row aggregates `requiredModels` (MPI-579)

`_pluginTile` used to size and install from `requiredDeps` alone. A plugin that owns
no deps therefore rendered **`Install ()`** and started a job with nothing in it — a
dead row, and the only path by which that user could ever get the dropdown entry.

The fix is the aggregation the Flow Library already ran (`_installKeys` /
`_installMissing` / `_installProgress`, MPI-304), ported into `MpiModelManager.js`. A
Flow and a plugin both require models they do not own, so they aggregate identically:

- `_pluginInstallKeys` — one key per required MODEL, plus `plugin:<id>` **only when
  the plugin owns deps**.
- `_pluginGb` — own deps ∪ every required model's `resolveFullUniverse`, **deduped by
  dep id** (two models can name one weight), summed through `sizeToGb`.
- `_pluginJobs` — live jobs across all those keys, so Queued/Installing… reads from
  every one, not just the plugin's own.
- `_installPlugin` — each missing model installs through the shared model flow
  (`getModelDependencies` → `downloadService.start`); the plugin's own deps go under
  `pluginDepKey` so the job can never collide with a model's.
- `_listSignature` sigs **every** install key, and `download:started` triggers the
  sig-guarded rebuild. Without both, installing the model from its own tile left the
  plugin row reading `Install (39.0GB)` — and clicking it would have queued a second
  copy of the download already running.

**Uninstall is gated on the plugin owning deps.** A plugin that runs entirely on a
model has nothing to free — those weights are the model's, and the Model Library is
where they come off. The button was dead anyway (`_uninstallPlugin` returns on an
empty list) and read as an offer to remove the model.

A plugin row's size renders in the Flow Library's `(X.XGB)` shape. A row that must
sum a model's universe cannot keep joining raw dep strings with ` + `.

## Adding a plugin — the checklist

1. `PluginDef` in `pluginsRegistry.js`. Apply LAW 1 to decide `requiredDeps` vs
   `requiredModels`.
2. The op in `js/data/commandRegistry.js`, mapped in `universal_workflows.js` if
   universal, and stamped in **both** `js/core/operationRegistry.js` and
   `operation_registry.json`. `npm run release:check` fails on a universal op whose
   JSON entry is missing `universal: true` — it caught exactly that in MPI-579.
3. The workflow under `comfy_workflows/`, plus a title injector if the graph needs
   values it cannot carry as plain widgets (`js/services/workflowInjectors/`).
4. `upscale.fields` only if it contributes a dropdown entry. Both laws apply.
5. Tests: `tests/plugin-dep-gc.test.cjs` resolves plugin deps against the **merged
   `DEPS`** map from `dependencies.js` — not `assetDeps.js`, which happened to be
   enough only while every plugin dep was a support weight.

## Sibling docs

- Dep protection, uninstall, the two circularities — `docs/download-manager.md`
- The Model Library UI around the row — `docs/model-library.md`
- Flows, and the `FlowStepField` vocabulary plugins borrow —
  `docs/playbooks/add-flow/README.md`
