# MPI-603 Checklist

- [x] Card to `doing`, ownership written to `files.json`
- [x] Head-removal branch re-authored onto LanPaint in `raw/flow_character_sheet.json`
- [x] API twin regenerated against 48188 (never hand-edited)
- [x] Graph proven without spending a generation (structural + type + live `graphToPrompt` diff)
- [x] `loraDeps.js` `klein-lora-outpaint` comment healed (the R2/HF delete blocker)
- [x] Klein docs healed where they still say the LoRA is in a shipped graph
- [x] Node tests green (726/726)

- [x] **Live run by Fabio** - the head comes off cleanly, Character Sheet working (2026-08-28)
- [x] Drop the dep from Klein in models.js - the MPI-607 claim was stale and is gone. Dropped 2026-08-28: Klein 4B is 21 deps, `klein-lora-outpaint` protected by no model, `loraDeps.js` entry kept. Proven sweepable-orphan by a direct classification probe; 775/775 node tests green.
- [x] Release note bullet in `docs/releases/UNRELEASED.md` (§ Important changes) - a user's disk loses 72MB on update, that is user-visible

- [ ] Ship a release without the dep - until a build is out, released 1.4.0 installs still fetch it
- [ ] ONLY THEN delete from R2 and HF (`rclone deletefile --s3-no-check-bucket`, verify HTTP 404). Re-uploadable from `G:\CubricModels`.

- [x] Character Sheet head-removal rework synced 2026-08-28 - API twin regenerated against 48188, `flow-model-choice` test re-pinned to properties, `existing-flows/character-sheet.md` written, stale LanPaint claims corrected (9400cc9b)
