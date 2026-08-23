# MPI-603 Checklist

- [x] Card to `doing`, ownership written to `files.json`
- [x] Head-removal branch re-authored onto LanPaint in `raw/flow_character_sheet.json`
- [x] API twin regenerated against 48188 (never hand-edited)
- [x] Graph proven without spending a generation (structural + type + live `graphToPrompt` diff)
- [x] `loraDeps.js` `klein-lora-outpaint` comment healed (the R2/HF delete blocker)
- [x] Klein docs healed where they still say the LoRA is in a shipped graph
- [x] Node tests green (726/726)

- [ ] **Live run by Fabio** - Character Sheet with Remove Head ON. Not doable here: bench had 3.4GB of 16GB VRAM free and the app is live. See validation.md.
- [ ] Drop the dep from Klein in models.js - BLOCKED, live-claimed by MPI-607
- [ ] Ship a release without the dep, THEN delete from R2/HF
