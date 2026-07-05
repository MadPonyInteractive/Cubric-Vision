# MPI-198 — verify plan

Baked backslash loader paths break LoRA workflows on Linux/macOS LOCAL engine.

## Status
- Code SHIPPED + logic-verified (commit `60b3c95`). Gate branch self-checked 10/10, eslint clean.
- Card stays in **doing / validating** until the live check below passes.

## Fix (what to verify)
`js/services/comfyController.js` step 3b — `_needsPathHeal(alwaysLocal)`:
heal baked backslash loader values (`lora_name`, `upscale_model`, `vae_name`,
`clip_name`, `ckpt_name`, `unet_name`, `model_name`) to `/` when
**remote (Pod) OR local host platform != win32**. Platform read once from
`/system/platform-config`; unknown → treated as win32 (Windows-local untouched).

## Why RunPod does NOT verify this
RunPod = **remote** engine → `isRemote()` true → the OLD MPI-141 branch. My change
does not alter remote behaviour. A green RunPod run proves the old code, not the new
branch. The new branch fires ONLY on the **local** engine on a **non-Windows** host.

## Verification checklist
- [ ] Run the **Linux (or macOS) portable build** on a real Linux/mac machine.
- [ ] Do NOT connect to a Pod — stay on the **LOCAL** engine (this is the branch under test).
- [ ] Install a LoRA that lands in a **sub-subfolder** of loras (e.g. `models/loras/ltx-2.3/…`) — needed to produce a separator inside `lora_name`.
- [ ] Generate with an **LTX_t2v LoRA-baked** workflow (baked template value ships Windows `\`).
- [ ] EXPECT: generation succeeds — no `value_not_in_list` 400. Confirms the baked `\` was healed to `/` for the Linux local enum.
- [ ] Regression: on **Windows local**, same LoRA workflow still generates (backslashes left untouched — no heal on win32).

## Notes / dead ends
- Flatten-the-loras-folder idea REJECTED: users can point Settings at their own models folder with arbitrary subfolders — can't guarantee flat. The per-engine-separator heal is the correct, only fix.
- Blocker for verify = no Linux/mac box locally; closest is CI spinning the Linux build headless. Verify before next distribution release.
