# MPI-505 Checklist

- [x] Bench: turbo LoRA wired in both H3 graphs, measured 204s -> 96s at 864x480
- [x] Weight staged to R2 and verified (sha256 + HTTP 200 + byte match)
- [x] Raw templates exported from the ComfyUI editor
- [ ] Run `node scripts/sync-raw-workflows.mjs` (convert against port 48188, NOT the 8188 bench)
- [ ] Verify 0 missing-required + 0 dangling after sync
- [ ] Add the `minimax-h3-turbo-lora` entry to `js/data/modelConstants/loraDeps.js`
- [ ] Add the dep + `h3TurboToggle` capability to both H3 cards in `models.js`
- [ ] Add `h3Turbo` control + capability gate in `PromptBoxControls.js`
- [ ] `h3Turbo: false` in `promptControlDefaults.js`; `'h3Turbo'` in the three op component lists
- [ ] Bake `Input_is_Turbo` and `Input_Single_Pass` in `generate_h3.py` BAKED_WIDGETS
- [ ] Decide single-pass: re-run the 204.02s baseline first (see brief, open question 1)
- [ ] Check the Console for `NOT LOADED` on the EMA weight
- [ ] `docs/releases/UNRELEASED.md` entry (live release is 1.3.1, so UNRELEASED is the target)
- [ ] Append the SolAttn / SageAttention verdicts to `docs/models/h3/performance.md`
