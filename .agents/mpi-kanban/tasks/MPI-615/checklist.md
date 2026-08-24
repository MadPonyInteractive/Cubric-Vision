# MPI-615 Checklist

- [x] raw sources committed (`618cc127`)
- [x] raw → API templates converted against the bench (:8188)
- [x] injection-rules gate clean on all 3
- [x] `orchestrate.py` — 9 runtime files rebuilt
- [x] `inpaint` wired into `sdxl-realistic`, `sdxl-nsfw`, `ill-anime-beauty`, `ill-anime`, `pony-mix` (`Input_wf_type: 5`)
- [x] `inpaint` wired into `krea2`, `krea2-nsfw` (+ `styleOps`)
- [x] `LanPaint` + `comfyui-inpaint-cropandstitch` declared on all 7
- [x] `krea2Turbo` added to the `inpaint` op's components
- [x] docs: `models/lanpaint-inpaint.md` written + routed from `models/README.md`
- [x] docs: stale "slot 5 is dead" claims corrected (krea2 README + injection, sdxl depth-control)
- [x] docs: LTX `audio-input.md` stage-2 note corrected — the re-export repointed #258
- [x] `npm test` 729/729 · `release:check` green · `verify-workflow` clean on :48188 · smoke `--plan` preflight ✓
- [ ] **Fabio runs one live inpaint in the app** (gate 2 — needs a painted mask; nothing here proves the RESULT)
