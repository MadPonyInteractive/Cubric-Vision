# MPI-515 - 1.5 BLOCKER: remove the nvidia-pid ModelDef

**Gate: 1.5 does not ship while `nvidia-pid` is still a ModelDef in the Model
Library.** The deprecation notice users see in 1.4 is the badge from
[MPI-514](../MPI-514/brief.md); this card is the removal it promises.

Blocked by [MPI-506](../MPI-506/brief.md) (the plugin-contributes-a-dropdown-entry
mechanism, which does not exist yet - `PluginDef` still has a singular `operation`
and one instance) then [MPI-507](../MPI-507/brief.md) (the PiD migration itself).
A removal cannot land before its replacement. **The research is already written -
read [MPI-507](../MPI-507/brief.md) SS 7 before starting here, it is not repeated.**

## Why it is a blocker and not a nice-to-have

Ship 1.5 with both the ModelDef and the plugins live and a user has two ways to
install the same ~16.5GB of weights, with two different install-state machines
pointing at one set of files. Avoiding exactly that is the point of the split.

## The removal checklist

1. **Do NOT delete the dep entries** - `pid-flux1`, `pid-sdxl`, `pid-sd3`,
   `pid-qwenimage`, `vae-flux-ae`, `vae-sdxl`, `vae-sd3`, `vae-qwen-image`,
   `pid-gemma`. `_orphanedDepIds` (`routes/downloadManager.js`) walks `DEPS` and
   trashes what no model protects; the surviving entry is what lets a user who
   already downloaded the weight reclaim the disk. Delete it and the sweep goes
   blind and the file strands forever. MPI-470 and MPI-466 both kept theirs.
   Procedure: `docs/playbooks/add-model/README.md` SS "Removing or re-tiering a model".
2. **`flowsRegistry.js` (~line 107)** - `flowSdxl4k` declares
   `requiredModels: ['sdxl-nsfw', 'nvidia-pid']` and its comment says it
   DELIBERATELY exercises the multi-model install path. Deleting the ModelDef
   breaks that Flow and removes the only test of that path. MPI-507 SS 3c is where
   this gets decided (hide the ModelDef vs teach Flows about plugins) - whatever it
   decides, this card executes.
3. **`dev_configs/smoke-evidence.json`** names `nvidia-pid` twice and gates
   `npm run release:check`. Sweep it or the release gate fails on a model that no
   longer exists.
4. **The `pid` OP stays.** `operationRegistry.js`'s `pid` key is not deprecated -
   the plugins still run it. Do not confuse the model flag with the op-level
   `deprecated` flag, which means history compatibility and is invisible to users.
5. **Drop `deprecated: true` with the ModelDef**, not before - the badge is only
   honest while the model is still there.
6. **Release notes:** `docs/releases/UNRELEASED.md` (~line 250) currently promises
   *"The NVIDIA PiD upscaler now actually upscales"*. That is 1.4 copy for a model
   being sunset in 1.5; reconcile the two so one release does not make both claims.

## Verify

- Model Library shows no PiD tile; the four plugins appear in the image upscale
  dropdown and only there (PiD is image-only).
- A user who installed PiD BEFORE 1.5 can still reclaim the weights from disk.
- `npm run release:check` passes.
