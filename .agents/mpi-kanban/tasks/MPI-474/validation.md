# MPI-474 — validation

**Status: code-complete, NOT proved by output.** Nothing has run through the app.
The card stays in `doing` for exactly that reason.

## Proved — 2026-08-07

| Claim | How |
|---|---|
| Graph half is live in the shipped runtime | `ltx_i2v_t2v_int8.json`, **133 nodes** (was 126): `nag_cond_video ← #626 Mpi If Else`, `nag_cond_audio ← #427 Negative Audio (NAG only)`, `Input_Negative_Audio` `#628 MpiText string:""`, bypass `#627` keyed on `MpiBooleanCompare #630 one_is_true(video has_value, audio has_value)`. Both tiers carry it |
| Injection reaches the graph | The 133-node graph dispatched live as prompt `0fb2f6b9` with the new node set present |
| Suite | `npm test` 482/482, lint clean, `docs/component-contracts.md` 153 lines (under the 200 limit) |
| Conversion gate | `validate-injection-rules.mjs` passed on the regenerated template |

## NOT proved — the whole point of the feature

1. **The audio negative has never been typed into.** Needed: type into the third
   stop, generate, and read `Input_Negative_Audio` off `/history` on `:48188` —
   not off the run finishing. `music, soundtrack, score` is the obvious first
   test, since LTX volunteering background music is what motivated the card.
2. **The video negative has never bitten either.** Every run so far had an empty
   negative box, which now bypasses NAG entirely. So the rewired
   `nag_cond_video` is proved structurally and not by output.
3. **Reuse round-trip unverified by hand.** Wired end to end and unit-green, but
   nobody has reused a card and watched all three fields come back.
4. **The button cycle has not been seen.** Icon `check → negative → audio`, with
   the placeholder changing at each stop.

## Blocked on, at the session boundary

The last `i2v_ms / ltx-23-balanced` run died on `MpiSaveVideo: no ffmpeg found`.
That is **[[MPI-472]]**, not this card — `imageio-ffmpeg` went missing when the
engine full-reinstalled. It was pip-installed into the local engine to unblock,
and `find_ffmpeg()` resolves per call so no engine restart is needed. But no LTX
run has completed since, which is why nothing here is proved by output.

## Behaviour change worth watching on the first run

With both negatives empty, NAG is now **bypassed entirely**. Before this session
it always ran, fed the POSITIVE prompt as its negative. So default LTX output
will shift, and get slightly faster. Compare against `MpiVideo_00005/6/7` — those
are the last three runs made under the old wiring.
