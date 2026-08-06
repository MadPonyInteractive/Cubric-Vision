# MPI-462 - Phantom partial bars, and weights that belong to nothing

## Symptom (user-reported 2026-08-06)

Model Library shows six models with a partial-install bar the user never started:
Chroma Flash 17%, Chroma Hyper 22%, Boogu Image Edit high 35% / balanced 49%,
LTX 2.3 high 33%, Wan 2.2 5B 36%. "Why do I have so many models partially
installed?" - none of them are.

All six percentages were reproduced exactly against the live disk state, so the
mechanism below is measured, not inferred.

## Defect 1 - the partial bar excludes on a STRICTER "installed" than anything else

`_computePartial` (MpiModelManager.js) discounts deps already owned by another
installed model, so a shared file does not read as progress (MPI-258 Bug A).
`_sharedOwnedDepIds` builds that exclusion set with:

```js
if (m.id === excludeModelId || m.installed !== true) continue;   // :610
```

`m.installed` is set at `modelRegistry.js:189` from the whole-universe check -
EVERY dep of EVERY op present. Nothing else in the app uses that meaning:

- the same component decides "is this installed" at :705, :1123 and :1307 as
  `model.installed === true || installedOps.length > 0` (>= 1 op),
- `modelRegistry.js:228-232` explicitly emits the installed set from
  `isModelUsable` (>= 1 op) and says why,
- and the BACKEND uninstall guard `_localSharedDepsMap` resolves ownership from
  `deriveInstalledOps` - the lenient one. Verified live: it currently protects 65
  dep ids.

So for any multi-op model the exclusion never fires, and its weights are billed to
its sibling tier. Measured 2026-08-06:

| Tile | Bar | The bytes it is counting |
|---|---|---|
| Wan 2.2 5B | 36% | `umt5_xxl_fp8_e4m3fn_scaled` 6.27GB - owned by Wan 2.2, which IS installed in the UI but is not universe-complete |
| LTX 2.3 high | 33% | 20.4GB of LTX shared assets (Gemma clip, both VAEs, upscaler, 3 LoRAs) downloaded by LTX 2.3 balanced |
| Boogu high / balanced | 35% / 49% | the same `boogu-qwen3vl-8b-clip` 10.59GB, counted twice |

Fix: build the exclusion from the same predicate every other install decision uses
(`isModelUsable` / `deriveInstalledOps`), not the raw `installed` flag. It is a
shared-primitive change - sweep every `m.installed === true` reader in the
component and in modelRegistry and classify each before touching one.

## Defect 2 - ~16GB on disk that no installed model needs, invisible in-app

- `text_encoders/qwen3vl_8b_fp8_scaled.safetensors` - 10.59GB, mtime **Jul 11**,
  wanted only by the two Boogu tiers, neither installed.
- Chroma family, 5.3GB - `controlnet/FLUX.1-dev-ControlNet-Union-Pro-2.0`
  (4.28GB, Aug 2), four `loras/chroma/styles/*`, `vae-flux-ae`; wanted only by
  Chroma Flash/Hyper, neither installed.

All COMPLETE files. `find G:\\CubricModels -name '*.cubricdl'` returns nothing, so
these are not abandoned partials - they are survivors of earlier installs.

**The guard is not the culprit.** Driving `_localSharedDepsMap` directly today:
uninstalling `boogu-edit-balanced`, `boogu-edit-high` or `chroma-flash` would
DELETE every one of those three suspects. So the files did not survive because
something protected them.

The user uninstalled **Boogu Image Edit balanced today** (high was already gone),
along with Krea2 and Qwen Edit. The Krea2 and Qwen uninstalls logged normally
(`uninstall krea2: removed 1, kept 9 universal, 16 shared`, 21:40Z) - **there is no
uninstall line for Boogu in any retained log** (Jul 30 -> now; note a coverage gap
15:35Z-20:45Z on 2026-08-06 where app.log rotated). The clip is still at its
original path with a Jul 11 mtime, so nothing even moved it to trash.

Candidate root causes, to be settled by repro, NOT by assumption:

1. The dep list POSTed to the uninstall route omitted the asset dep (the route
   deletes what the CLIENT sends; a resolution gap client-side is invisible to the
   guard).
2. The uninstall ran an op-level path that never covered common/asset deps.
3. It errored before the completion log line.

Repro: install Boogu Image Edit balanced, uninstall it with no other Boogu tier
installed, and watch whether `qwen3vl_8b_fp8_scaled.safetensors` is trashed and
whether the `uninstall <model>: removed N` line appears.

Even with Defect 1 fixed, Chroma would still draw a bar - nothing owns those bytes.
The 1GB floor (MPI-258 Bug C) was sized to stop SMALL support files drawing phantom
bars; a 4.28GB ControlNet and a 10.59GB clip sail straight past it.

## Product question attached to Defect 2

There is no in-app way to see or reclaim weights no installed model needs. Options:
a reclaim action in the Model Library, a line in Settings, or leave them so a
reinstall is instant. User decision, not a bug fix.

## Not this card

- MPI-320 (retire `_modelJobs`/`_depJobs`) and MPI-397 (card-move lag) are adjacent
  and neither covers this.
- MPI-258 Bug A/C built the exclusion and the 1GB floor being corrected here.
