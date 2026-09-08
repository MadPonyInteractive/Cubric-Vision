# MPI-679 - validation

Measured 2026-09-01, all four legs machine-verified.

## 1. The diagnosis, confirmed before touching anything

- Mirror `https://huggingface.co/Mad-Pony-Interactive/cubric-studio/resolve/main/vision/models/loras/ltx-2.3/ltx-2.3-22b-lora-foley-v2a-1.0.safetensors` -> **404**, while the repo API answers 200 and reports `private: false, gated: false`. Never uploaded, not withdrawn.
- The HF tree for `vision/models/loras/ltx-2.3/` held exactly **two** files - `LTX23_softenhance_abliterated_detailer_merged.safetensors` and `ltx2.3-transition.safetensors`, both `lfs.oid` equal to their dep `sha256`. The two siblings of this dep are mirrored; only foley was missing. That is what made this an upload gap rather than a policy one.
- R2 primary: 200, 226,709,270 B. Downloaded in full and hashed: `sha256` **equals** the dep's recorded value, so the entry was correct and the bytes on R2 are the bytes we ship.

## 2. Why re-host rather than `noMirror`

The weight is meant to be public. It is Lightricks' own published Foley V2A LoRA (public repo `Lightricks/LTX-2.3-22b-LoRA-Foley-V2A`), and the **LTX-2 Community License permits reproducing and distributing copies** - already recorded at `docs/models/ltx/model-set.md:153` and already relied on for the base LTX-2.3 weights we ship. Its two sibling baked LoRAs are already on our public HF repo. So `noMirror` would have recorded a restriction that does not exist.

**Not used as the mirror: the upstream Lightricks repo.** Its file is the same *size* (226,709,270 B) but a **different sha256** from ours, so pointing `mirrorUrl` at it would have HEAD-ed 200 and then failed the post-download hash check on a user's machine - a worse failure than the one being fixed, because it only shows up after the transfer. Recorded here because "same name, same size" reads as "same file" and it is not.

## 3. What shipped

`upload_file` to `Mad-Pony-Interactive/cubric-studio`, path `vision/models/loras/ltx-2.3/ltx-2.3-22b-lora-foley-v2a-1.0.safetensors`, using the write token from `C:/Users/Fabio/.secrets/hf.txt` (`whoami` = `Mad-Pony-Interactive`). Commit `28f55babbfbe9e821ce22b620709b84841671e6b`. **No code change** - the generic HF prefix rewrite already emitted this exact URL, it just had nothing behind it.

Verified after the push:
- repo metadata `lfs.sha256` for the new file **equals** the dep's `sha256`; size 226,709,270.
- `curl -sIL` the resolve URL -> `302` with `X-Linked-Size: 226709270`, then `200`, `content-length: 226709270`.

## 4. `npm run release:deps`

`ltx23-lora-foley` no longer appears in the failure list. The run still exits 1 on **nine other deps, all pre-existing and none touched by this card** - `klein-9b-lora-nsfw` plus all eight 4B Klein style LoRAs, every one a dead `[mirror]`, every primary healthy. Raised as MPI-680 rather than absorbed here: they are CivitAI-sourced, one of them explicitly documented in `loraDeps.js` as having no mirror on purpose (the comment above `klein-9b-lora-nsfw` says CivitAI region-blocks the UK), so the fix is a per-dep licence call - upload or `noMirror` with a reason - and not the same decision this card made.
