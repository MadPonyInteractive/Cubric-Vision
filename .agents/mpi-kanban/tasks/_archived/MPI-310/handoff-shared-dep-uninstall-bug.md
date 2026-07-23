# MPI-310 — shared-dep uninstall DELETED a weight four models depend on

Written 2026-07-19. **Read this whole file before touching `routes/downloadManager.js`.**

## READ FIRST — how downloads/installs actually work

**`docs/download-manager.md` is mandatory reading before any fix.** Do not reason about
this bug from the code alone; the doc explains the model, and one UI element is routinely
misread (this handoff's author misread it twice in one session):

> **A partial progress bar on a Model Library card does NOT mean the model is downloading.**
> It is a **completeness bar**: what fraction of that model's declared dependencies are
> present on disk. A card can sit at 24% forever because it shares a VAE/clip with an
> installed model and nothing else. Nothing is in flight.

Corollary, and the whole point of this bug: **a card dropping from 100% to a partial value
means files it needed were DELETED.** That is damage, not progress.

Also required: `.claude/rules/comfy_engine.md` § Engine Split — the local guard
(`_localSharedDepsMap`) and remote guard (`_remoteSharedDepIds`) are twins. A fix to one
without the other is a false done (CLAUDE.md THE ROOT-CAUSE RULE).

## What happened

1. This session moved all four Krea2 cards off `krea2-qwen3vl-clip` onto
   `qwen3vl-abliterated-clip` (the weight the image-describer PLUGIN introduced in this
   card), then deleted the stock encoder from R2 and disk. Commit `8e852aff`.
2. That made the abliterated weight a genuine shared dep: 4 model cards + 1 plugin.
3. User uninstalled the image-describer plugin to test the shared-dep guard.
4. **The 5.24GB weight was DELETED.** `G:/CubricModels/text_encoders/qwen3vl_4b_abliterated_fp8_scaled.safetensors`
   is gone, confirmed on disk.
5. **Krea 2 Turbo NSFW — which was FULLY INSTALLED — dropped to 78%.** It is now broken;
   its text encoder is missing. The other three Krea2 cards (never installed) show 24-25%.

The uninstall dialog's claim *"Files shared with other installed models will be kept"* did
not hold. This destroys user data: 5.24GB, and it would do the same to any shared dep.

## Root cause — PRIMARY HYPOTHESIS, NOT YET PROVEN

**Stale `require` cache in the server process.**

`routes/downloadManager.js:46` uses `createRequire(__filename)`, and `_localSharedDepsMap`
(line 137) does `_require('../js/data/modelConstants/models.js')` — a normal, FULLY CACHED
Node require. The running server loaded `models.js` at boot, which was BEFORE this session
edited it.

The user reloaded the renderer (Ctrl+R) after the edits, but **a renderer reload does not
restart the main/server process or clear its require cache** (memory
`tool_main_process_no_hot_reload`, `feedback_kill_spawned_app_instances`).

So at delete time the guard very likely evaluated the PRE-EDIT `models.js`, in which the
Krea2 cards still declared `krea2-qwen3vl-clip`. Under that old data no model required
`qwen3vl-abliterated-clip`, only the plugin did, the plugin correctly excluded itself
(`_pluginRequiredDepIds`, line 224), the protected set came back empty, and the delete
proceeded. Every function behaved as written — on stale input.

**PROVE OR DISPROVE THIS FIRST. Everything downstream depends on which it is.**

Test: fully restart the app (not Ctrl+R — kill the server process; check
`netstat :3000` + `tasklist node.exe` first per `feedback_kill_spawned_app_instances`),
reinstall the encoder, install a Krea2 card, uninstall the plugin again.
- **Weight survives** → confirmed stale-cache. The guard logic is CORRECT and the real
  issue is operational: dep-graph edits require a server restart before uninstall
  behaviour can be trusted. Fix becomes "make that impossible to get wrong", not
  "rewrite the guard".
- **Weight deleted again** → the guard is genuinely broken with fresh data. Go to the
  secondary hypothesis below and debug `_localSharedDepsMap` directly.

## Secondary hypothesis (only if the restart test still deletes)

`_localSharedDepsMap` line 171: `if (!fullyInstalled) continue;`

A model protects its deps only when `deriveInstalledOps` reports `fullyInstalled` (common
deps + at least one COMPLETE op). A model missing one op's weights protects NOTHING. The
code comment two lines up already flags this class of hole:

> *MPI-258 tier-cycle stays broken: a tier whose transformer is absent has no complete op
> → fullyInstalled false → protects nothing → still deletable.*

This was the author's first theory and it is probably WRONG for this incident — the user
confirmed Krea 2 Turbo NSFW was fully installed BEFORE the uninstall, so `fullyInstalled`
should have been true and the 78% is the after-state. Recorded because it is a real
latent hole worth closing regardless, and because the 78% reading is genuinely ambiguous
without the doc above.

## Why the unit test passed

`tests/plugin-dep-gc.test.cjs` covers **plugin deps protected during a MODEL uninstall**.
This incident is the OPPOSITE direction: **model deps protected during a PLUGIN uninstall**.
That direction had never run before this session, because the plugin is the first entity
with a user-facing Uninstall button. Whatever the fix, add coverage for this direction.

## Do not

- Do not patch at the delete site with an "is it the abliterated encoder" special case.
  That is the symptom patch THE ROOT-CAUSE RULE rejects.
- Do not fix the local guard without the remote twin (`_remoteSharedDepIds`, line 271).
- Do not trust a Ctrl+R reload when testing this. Restart the server process.

## Immediate recovery for the user

The weight must be re-downloaded (5.24GB, on R2) before Krea2 will generate at all.
Reinstall the image-describer plugin, or let the Krea2 card fetch it.

## State at handoff

- Encoder: DELETED from disk. Still on R2 at
  `cubric-models/vision/models/text_encoders/qwen3vl_4b_abliterated_fp8_scaled.safetensors`
  (5,242,481,504 bytes).
- Stock `qwen3vl_4b_fp8_scaled`: deleted from BOTH R2 and disk this session. It is NOT a
  fallback — do not suggest reverting to it.
- All session work is committed: `e2b0839e`, `8e852aff`, `9ad2df26`, `df056f54`, `e98c0c76`.
- MPI-310 stays in `doing` / `validating`.
