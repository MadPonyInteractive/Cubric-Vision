# MPI-350 — Krea2 upscaler refiner pass (FIX)

## Problem

The Krea2 upscale op produced heavy noise. On raw (turbo OFF) the result was
**unusable**; on turbo it was acceptable but not good. Root cause was the
settings the single `UltimateSDUpscale` pass ran at — cfg 2 with the accelerator
(turbo distill) LoRA applied in *both* tiers, so the raw tier never got the
quality it was nominally selecting.

This is a **fix**, not a feature. It belongs under "Fixes" in release notes.

## What changed (raw template only)

`comfy_workflows/raw/krea2_upscaler_template.json`, 34 -> 38 nodes.

**1. Tier now actually gates the accelerator LoRA.**

`1697 MpiInt Input_Tier` -> `1700 MpiMath ("a == 1")` -> `1711 MpiIfElse ("is high tier")`
whose output feeds `1686 UltimateSDUpscale.model`:

- true  (tier 1, turbo OFF) -> `1685 FromBasicPipe` model, **no accelerator LoRA**
- false (tier 2, turbo ON)  -> `1706 MpiLoraModel "Accelerator Lora"`

`1706` replaces the old `1701` (plus a deleted Reroute `1702`); it still chains
off `1680 Input_Lora_6`, so the user LoRA slots stay upstream of it.

**2. Refiner pass appended after the upscale.**

```
1686 UltimateSDUpscale -> 1708 VAEEncode -> 1705 ClownsharKSampler_Beta
                       -> 1709 VAEDecode -> 1556 PreviewImage (Output_image)
```

`1707 FromBasicPipe` supplies vae / positive / negative to the refiner.
`1705` shares the seed with the main pass (`1603 Input_Seed`); its steps / cfg /
denoise are baked widgets, not injected.

**INTENTIONAL, user-confirmed:** `1705` takes its model from `1706` — the
accelerator-LoRA output — in *both* tiers. The refine pass is a deliberately
cheap 2-step distilled polish; high tier gets a full-quality upscale followed by
a fast refine, not a full-quality refine.

`1686`'s title lost the "with Chroma..." suffix (cosmetic only).

## Blast radius — verified zero app-code change

1. **Node ids.** `1701 / 1702 / 1686 / 1705 / 1706 / 1711` grepped across `js/`
   and `routes/` — no hits. Injection is title-keyed (`Input_*`), and the output
   node is still `Output_image`, so result capture is unaffected.
2. **Tier wiring already existed.** `commandRegistry.js` line ~153 already lists
   `krea2Turbo` on the upscale command, and `PromptBoxControls.js` maps
   OFF -> `Input_Tier` 1 / ON -> 2. The graph consumes what the app already sends.
3. **progressStages.** No entry added, and none is possible — see the progress
   section below.
4. **No new node types.** `MpiIfElse`, `MpiMath`, `ClownsharKSampler_Beta`,
   `VAEEncode`, `VAEDecode`, `FromBasicPipe` are all already used in other raw
   templates, so the converter's live `/object_info` schema gate is a non-issue
   for this change.

## Progress-bar defect the refiner exposed (the one app-code change)

Adding a second sampler pass made the status bar wrong, but **not** because a
number was missing from `progressStages.js` — that table never gets a say on an
upscale. When UltimateSDUpscale's outer tile bar reports (`comfy:tile-progress`
-> `commandExecutor.js` ~1759), `phaseProgress.tile()` OVERRIDES the total with
the live tile count (`_total = _tileOffset + tiles`), discarding any recorded
entry. A static `single: 2` would have been thrown away on the first tile.

The real bug: **tile mode was one-way.** Once `_tileMode` was true, `step()`
only moved `_percent` within the current tile and never advanced `_stage` again.
So the refiner's bar was swallowed — the fill ran 0-100% a second time while the
readout sat on the last tile ("1/1"), which reads as a stall at the end of every
upscale.

Rejected alternative (user's first instinct): `_total = _tileOffset + tiles + 1`.
It fixes the printed total but not the stall — the stage still never ticks, so
the bar refills under "1/2" and only snaps to 2/2 at `finish()`. Worse, `tile()`
is shared by all 9 USDU cards, and the other 7 have no refiner, so they would
advertise a stage 2 that never runs. Keeping it off them needs a per-workflow
flag — more code than the exit.

**Fix, part 1 — leave tile mode** (`js/services/phaseProgress.js`): count inner
bars since the last tile bar; on the second one, drop out of tile mode and fall
through to the normal per-bar logic, which stages it and self-corrects the total.

**THE TRAILING TICK (caught in-app, not by the first test).** `routes/comfy.js`
line ~124 forwards the RAW tqdm value out of `USDU: t/T`, so T tiles emit **T+1**
events (`0/T` .. `T/T`) — the last one fires AFTER the final tile's inner bar is
done. The first cut re-armed the counter on every tile bar, so that trailing tick
re-armed it after the last tile and the refiner never reached 2. The app still
showed "1/1" and the user reported it. Guard is now `if (tileIndex < tiles)` —
only arm for a tile that will actually run. The original test called `tile()`
once per tile and never modelled the trailing tick, so it passed against broken
code: **a wrong test, not merely a thin one.** It now models the tick explicitly.

Second consequence: `_total` includes post-tile bars, so the stage clamp in
`tile()` had to change from `Math.min(_total, ...)` to `Math.min(_tileOffset +
tiles, ...)`. Otherwise the trailing tick advances the stage into the refiner's
slot before the refiner has started.

**Fix, part 2 — honest total up front** (user's `+1`, done per-workflow). During
tiling the total was the tile count alone, so the bar read "1/1" for the whole
upscale and only revealed a second stage once that stage had started. A blanket
`+1` in `tile()` was rejected: it is shared by all 9 USDU cards and the 7 without
a refiner would advertise a stage that never runs. Instead `progressStages.js`
records `'krea2_upscaler.json': { postTile: 1 }` — deliberately NO `single`,
because the tile count is a runtime value (input size x upscale factor x Use
Grid) that tile mode overrides anyway. New `postTileBarsFor()` (sharing the
suffix-normalising `_baseKey` with `stagesFor`) is passed into
`createStageProgress` by `commandExecutor.js`; `tile()` uses
`_total = _tileOffset + tiles + _postTileBars`.

Result: grid off -> `1/2` then `2/2`. Grid on, 4 tiles -> `1/5`..`4/5` then
`5/5`. Every other USDU card records nothing, gets 0, and is unchanged.

**Ceiling (in the code comment):** assumes ONE inner bar per tile. True today —
swept all 9 USDU cards, every one has `seam_fix_mode: "None"`. Turning seam fix
on adds a second bar per tile and would false-trigger; count post-tile bars
explicitly if that ever happens.

**Test:** `tests/tile-post-pass-stage.test.cjs` (6 cases, `node --test`), all
passing. Two negative controls:

- vs unfixed HEAD -> 5 of 6 fail.
- vs the FIRST cut (re-arm on every tile bar) -> 4 of 6 fail, including both
  trailing-tick cases. This is the control that matters: it proves the suite now
  catches the exact bug that reached the app.

Cases that pass either way are the deliberate guards that tiling and the
no-refiner cards were NOT disturbed.

## Status

Raw authored and saved by the user. Sync run (raw commit -> API convert ->
injection validate -> orchestrate bake of `krea2_upscaler_sfw.json` /
`krea2_upscaler_nsfw.json`).

**NOT yet verified in the app** — no generation has been run through the
Cubric Vision UI against the baked runtime cards. Card stays in `doing` until
the user exercises upscale on both tiers.

## Possible follow-up (same session, not yet started)

Krea2 **detailer** without turbo — same class of problem, same likely fix shape.
If authored, it gets its own raw edit and rides the next sync.
