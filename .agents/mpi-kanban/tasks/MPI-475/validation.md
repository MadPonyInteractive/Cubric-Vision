# MPI-475 — validation

Nothing below has been run. The registry side is proved offline (492/492 tests, plus a
live browser probe confirming the model, op and matcher load in the app), but no
generation has happened on the correct transformer.

## Do this first — it gates everything else

- [x] Push `ComfyUi-MpiNodes` `238f056` to main. — `a603fc4..238f056`, 2026-08-07.
- [x] Restart the engine.
- [x] Open ComfyUI `/object_info` → see `MpiH3References`.

**Verified 2026-08-07** on the engine (`:48188`). Node presence alone does not prove
the gate: `a603fc4` registers the same node name, so a stale module reads as a pass.
The `prompt` tooltip is what separates them, and the live one is `238f056`'s:

```
curl -s http://127.0.0.1:48188/object_info/MpiH3References
# .input.required.prompt[1].tooltip
238f056 → "Address references by their SLOT number here: <Picture 1> is whatever …"
a603fc4 → "Address references by the tags in the ref_tags output: …"
```

The authoring bench (`:8188`) still serves the `a603fc4` string. That is expected and
irrelevant — the app generates on `:48188`.

Prompt tags ARE rewritten now, so every `@` tag below reaches the model translated.

## Eye tests in the app

- [ ] Pick **MiniMax H3 Reference** in the model dropdown → see one op, **Reference to Video**.
- [ ] Open the settings popup → see a **Reference detail** row with **Match** and **Max**.
- [ ] Look for a negative-prompt button → see none.
- [ ] Stage one image → see the chip badged **Picture 1**.
- [ ] Stage a video after it → see that chip badged **Video 1**.
- [ ] Stage 15 items → see the strip scroll instead of growing up the screen.
- [ ] Type `@` in the prompt → see a list of the staged chips.
- [ ] Press Enter on the first row → see `<Picture 1> ` land at the caret.
- [ ] Type `@vid` → see only the video chips listed.
- [ ] Type `fabio@pic` → see no list.
- [ ] Run one generation → see a video with audio.
- [ ] Watch the status bar during that run → see `1/2` then `2/2`.

## The judgement run — the model's whole claim

- [ ] Generate with one clear character reference → see that character in the output.

This is the thing nothing has tested. Every r2va result before the 2026-08-07 re-export
came off the **fl2va** transformer, which does not error — it samples fine and returns a
good-looking video that ignored every reference. So a plausible result is not evidence;
the identity has to actually follow the reference.

## Detail, edge cases and what would mean a real bug

**Prompt tags.** Chips are numbered by SLOT. `MpiH3References.rewrite_prompt_tags`
converts them to the ordinals core presents. Two cases worth checking once each:

- A tag for a slot you did not fill is REMOVED from the prompt, not passed through.
- With a reference video that HAS sound, a standalone audio clip is `<Audio 2>` to core
  even though its chip says `Audio 1`. That is the rewrite working, not a bug. The only
  way to see it is `ref_tags` on the node output.

**`ref_image_size`.** `match` is the default and the baked value. Switching to `max`
should raise s/step noticeably (measured 11-12 → 14 s/step with ONE reference on the
bench, and reference tokens ride every sampling step, so more references is steeper).
If `max` costs nothing, the control is not reaching the node — check the injected
`Input_Refs.ref_image_size` key.

**Progress bars.** `{ single: 2, preview: 1, stage2: 1 }`, derived from the sampler tail
being shared with fl2va rather than counted live. If the status bar shows anything other
than 2 bars on a whole run, re-count and fix `progressStages.js`.

**A silent no-op to watch for.** Injection SKIPS a title matching no node, without an
error. `tests/inject-params-titles.test.cjs` now sweeps every media-slot title against
the workflow, so a mismatch fails the suite rather than reaching here — but if a staged
reference visibly does nothing, that is the first thing to suspect.

## Known-unfinished, not defects

- The ModelDef borrows fl2va's `minimax_h3_preview.mp4` as its card video. Swap it once a
  judged ref2va clip exists.
- `docs/models/h3/README.md` has no ref2va section yet, deliberately — a doc written
  against fl2va-transformer output would be wrong in a way nobody could see.
