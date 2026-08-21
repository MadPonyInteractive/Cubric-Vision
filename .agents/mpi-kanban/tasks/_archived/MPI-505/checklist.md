# MPI-505 Checklist

- [x] Bench: turbo LoRA wired in both H3 graphs, measured 204s -> 96s at 864x480
- [x] Weight staged to R2 and verified (sha256 + HTTP 200 + byte match)
- [x] Raw templates exported from the ComfyUI editor
- [x] Sync the two H3 templates against port 48188 (the bare script is a no-op on a clean tree; ran its convert -> validate -> orchestrate steps per-file)
- [x] Verify 0 missing-required + 0 dangling after sync
- [x] Add the `minimax-h3-turbo-lora` entry to `js/data/modelConstants/loraDeps.js`
- [x] Add the dep + `h3TurboToggle` capability to both H3 cards in `models.js`
- [x] Add `h3Turbo` control + capability gate in `PromptBoxControls.js`
- [x] `h3Turbo: false` in `promptControlDefaults.js`; `'h3Turbo'` in the three op component lists
- [x] Bake `Input_is_Turbo` and `Input_Single_Pass` in `generate_h3.py` BAKED_WIDGETS (both False)
- [x] Single-pass SHIPPED, derived from the run mode (no control, no second workflow file).
      The 204.02s baseline no longer gates it — see validation.md for why the justification changed.
- [ ] Check the Console for `NOT LOADED` on the EMA weight
- [x] `docs/releases/UNRELEASED.md` entry (live release is 1.3.1, so UNRELEASED is the target)
- [x] Append the SolAttn / SageAttention verdicts to `docs/models/h3/performance.md` (approved + done 2026-08-09)
- [x] Sweep the perModel reuse key list in `js/utils/promptReuse.js` (found during the change: a
      perModel control missing from that list is silently dropped by Reuse)
- [x] Gate EasyCache off turbo (both graphs, MpiIfElse on Input_is_Turbo — lazy, so the
      node does not execute under turbo). Synced + verified.
- [x] Re-measure on the shipped shape: turbo 171.1s vs non-turbo 220.1s at 864x480/5s warm,
      both n=2. Replaces the stale 204s -> 96s headline everywhere it appeared.
- [x] EasyCache on image models: DISPROVEN on Krea2, verdict + numbers in performance.md.
- [x] Pod/Linux path formatting for the baked turbo LoRA — covered by the MPI-141/198/229
      heal, verified on both graphs (see validation.md).
- [ ] Pod SMOKE RUN — prove the weight stages and the graph executes there. Last open item
      alongside the `NOT LOADED` console check.
