# MPI-450 Gate C — UNRELEASED.md claim audit

Second pass, **2026-08-08**. The first pass (2026-08-05) read the `## fixes` section only
and corrected the two bullets that were false (the mirror bullet and the Mac pinch bullet).

**Scope correction found on pickup.** That first pass never touched `## whatIsNew` (15
bullets) or `## importantChanges` (11) — the checklist line said "all 23 fix bullets",
which was the whole of what was read. `## fixes` has since grown 23 → 35. So this pass
covers **all 61 bullets**: 26 never audited by section, 13 fix bullets added after the
first pass, and a re-read of the four known soft spots.

Grades — what the sentence rests on, not whether it is believed:

| grade | meaning |
|---|---|
| **LIVE** | someone ran it and saw the outcome |
| **TEST** | code + an automated test with a negative control; never observed running |
| **DECL** | a registry/graph declaration, read back and confirmed against the code; no run |
| **FIX** | was wrong; corrected in this pass (diff below) |
| **FLAG** | ships on weaker evidence than the sentence implies — named so the fold is a decision |

---

## Corrections applied to UNRELEASED.md in this pass

| line | was | now | why |
|---|---|---|---|
| 163 | LTX Balanced "at 20GB instead of **24–25GB**" | "at 20GB instead of **22–23.5GB**" | The bullet compared two different units: `20GB` was GiB-derived, `24–25GB` was HuggingFace's decimal display. **MPI-482 landed while this audit was being written** (`af829e0f`) and settled which unit the app speaks — every `size` string is now regenerated from measured bytes as GiB, so a user reads `20.03GB` for the new file and `22.4` / `23.49GB` for the two it replaces. The note now matches the tiles. Only the OLD half moved; the saving is ~2.5–3.5GB, not ~5. |
| 169 | Wan t2v "a 27GB download" | **unchanged** | First read as understated (HEAD says 14,548,461,368 + 14,548,461,376 B = 29.1 decimal GB) and briefly corrected to 29GB. `af829e0f` reversed that: the declared `13.55GB` is GiB and always was, so the pair reads 27GB on the tile and 27GB is what the note should say. Restored. |
| 131 | H3 "**53GB** of weights" | "**50GB** of weights" | Correct as bytes (53.1 decimal GB, HEAD-verified in MPI-452) but no longer what the tile says: post-`af829e0f` the five deps sum to **49.5 GiB**, and the tile is what the reader compares the sentence against. |
| 245 | "Genuine failures — a bad file, **a full disk** — still report exactly as before." | "a bad file, for instance" | The full-disk report is measurably wrong (**MPI-483**): the gate subtracts `du -sb` *apparent* bytes, so a preallocated `.part` inflates usage and a user with ~91 GB free is refused at "39.4 GB free". The bullet leaned on it as the trustworthy counterexample. Dropping the example makes the sentence true either way; if MPI-483 lands, the phrase can come back. |
| 265 / 273 | "If you have been avoiding LTX because it looked broken…" sat at the end of the **negative-prompt** bullet | moved back under **LTX video generation works again** | Displaced by `56902d53`, which inserted the negative-prompt bullet above the trailing line instead of below it. It reads as a claim about the negative prompt; it is the sign-off for the dead-LTX fix. |

Nothing else was reworded. Every remaining FLAG is a decision for the fold, not a defect in
the prose.

---

## FLAGs — read these before folding into `RELEASE_NOTES['1.4.0']`

1. **L377 preview decoders — the visual claim has never been seen, on any model.** The
   earlier Gate C note said "Klein verified, Wan not". That is optimistic: MPI-420's own
   validation.md leaves **all three** live checks unticked (Klein preview, Wan preview,
   macOS/Linux), and the card was bulk-closed by `5f27d3cb` on the user's call without
   them. What IS proven: the four decoders exist, HEAD-verify on R2, load strictly under
   the engine's python, and are wired as `vae_approx/` engineAssets with two
   negative-controlled tests. So the *installation* half is solid and the *"looks like
   your picture"* half is inferred from ComfyUI's own previewer behaviour. One Klein and
   one Wan generation settles it — re-added to Gate B, since MPI-420 no longer has a home
   for it.
2. **L449 install-screen flicker — fixed at two roots, unit-tested, never SEEN fire.**
   Needs a real engine install. Unchanged from the first pass; low risk (deterministic UI
   ownership fix), but it is a "no longer flickers" sentence with no observation behind it.
3. **L238 wake-up install — acceptance #3 is not done.** MPI-480 is still `validating`:
   the server half is unit-proven and the renderer branch is a 1:1 mirror of the proven
   `networkBlocked` branch, but no install has ever been POSTed into a real cold Pod's 404
   window. The MPI-467 fill of 2026-08-08 produced **zero** evidence either way (its first
   two CPU Pods were recycled; the third was warm before the first POST). Gate B's
   throwaway-Pod session covers it.
4. **L246 interrupted cloud install — zero Pod contact.** MPI-481 is `validating`; the
   wrapper contract (`/wrapper/models/install/active`) was **read out of `wrapper.py`, not
   observed**. Four negative-controlled tests, 503/503 suite. Same Gate B session.
5. **L123 H3 "resolutions run up to 4K" — the top rung has never been run.** `0f1ed1ca`
   says so in its own commit message: 4K is the one tier with no run behind it, added on
   the user's call, its numbers taken from LTX (3840/2176, both /32-clean). The cost
   sentence beside it ("twice the pixels costs a little over three times the time") IS
   measured — but on the rungs below. The bullet already frames 4K as final-render
   territory, so this is a known-and-hedged claim rather than a false one.
6. **L430 / L437 first-run bullets closed without the look they asked for.** MPI-404's
   validation asks for a cloud-only first-run look; the card was bulk-closed without it.
   The stage-all-lock half does have a desktop spec with a proven negative control
   (`runpod-settings-extract`); the models-dash half rests on `hasNoEngine()` plus node
   tests. Low risk, recorded because the checklist ticks said "needs the user".
7. **L34 end-frame — Wan's half is a blanket statement, and local only.** LTX is properly
   LIVE (three routes read off the *dispatched* graph, 2026-08-07, MPI-466 validation).
   Wan's end-only route exists structurally (`wan22_i2v.json` nodes 940 end-only / 741 FLF
   / 825 start-only) and is covered by the user's 2026-08-08 line — *"Same thing for WAN,
   at least locally"* — which is an attestation, not an observed route table. Remote is
   MPI-467's to prove.
8. **Every GB figure in the notes is now measured, and they are GiB (MPI-482,
   `af829e0f`, landed mid-audit).** All 107 `size` strings are regenerated from a HEAD's
   byte count and formatted 1024-based, so a figure in the notes is only right if it is
   read off the tile rather than off a publisher's page. The typed strings had been 4.1%
   **over** true, not under — HuggingFace's decimal display copied into a field every
   consumer parses as 1024-based — which is the opposite of what MPI-482 was written to
   prove and is why both size corrections in this audit had to be restated. **Re-check
   every remaining GB figure against `DEPS[...].size` at fold time**, not against a card's
   prose. H3's 53GB was one of them and is restated above; no other model total is quoted
   in the notes. Safe as written:
   the **25GB** stalled dep (a byte count, 25,226,571,988 B, MPI-460) and the **~16GB** of
   stranded weights (measured on this machine, MPI-462).

---

## Cleared — a soft spot that was not one

**L332 "Resize Video works on a cloud GPU whatever you have installed" is LIVE-verified**,
contrary to the checklist note that said no remote run was recorded. MPI-438's
validation.md (archived) has it: Pod `vhks7b6fl1x57h`, volume `9t3awufudk`,
`ensureUniversalNodesOnVolume` firing unprompted on a real wrapper, `/object_info` going
1822 → 1863 node types with 40 `VHS_*`, and an end-to-end Resize Video dispatch —
prompt `81b0399f-6d48-47e4-9403-e84ff1a4fe2e`, `status: success`, `outputs: 18:videos`.
Checklist corrected.

---

## Per-bullet verdicts

### whatIsNew

| line | bullet | grade | evidence |
|---|---|---|---|
| 34 | Animate towards an image (last-frame button) | **LIVE** / FLAG 7 | MPI-466 val: 3 routes off the dispatched graph; Wan by user attestation, local |
| 43 | Mask tools rebuilt as a toolkit | **LIVE** | MPI-440 val — every member user-validated in the app (426/441/436/421/445/439/435) |
| 57 | Detection: one button, one pass, Stop | **LIVE** | MPI-421 + MPI-425 + MPI-426, user-validated 2026-08-04 |
| 65 | Localised edit on four models | **DECL** | `Input_Mask` present in all four graphs (`krea2_t2i_*`, `klein_t2i`, `qwen_edit`, `boogu_edit_*`); Boogu half is MPI-428. Per-model runs ride MPI-467 |
| 72 | Control — one op, four structures | **DECL** | `controlTypes` read back: SDXL Realistic/NSFW, ILL Anime Beauty/Anime, PONY Mix = depth,pose,scribble,canny; Qwen = depth,pose; Krea2 + Klein = depth only (picker hidden). Exactly as written |
| 79 | Control on Chroma | **DECL** | both Chroma models `controlTypes: ['depth']` |
| 81 | Four styles on Chroma | **DECL** | LoRAs on R2 2026-08-02 (file header); fifth style cut on a licence call |
| 84 | Control Strength | **DECL** | `capabilities.controlStrength` on exactly the 10 claimed models. "Klein bites softer" is the author's measured judgement |
| 89 | Composite — blend two images live | **LIVE** | MPI-373, user-tested in the app 2026-08-04 |
| 98 | Paint group | **LIVE** | MPI-375/435/436/439/445/447 all user-validated |
| 114 | Resize — Original Size button | **TEST** | `MpiToolOptionsResize.js:385` |
| 117 | Hover sound volume slider | **TEST** | `ac3fa563`; old toggle retired (`storage.js:179`) |
| 123 | MiniMax H3 | **LIVE** + FLAG 5 | MPI-452: t2v video+AAC stereo one pass, multi-stage user-confirmed; 53GB byte-verified; 12GB floor is a declaration; 4K rung unrun |
| 135 | MiniMax H3 Reference | **LIVE** | MPI-475 + user 2026-08-08; 9 img/3 vid/3 audio = the 15 declared slots; match-vs-max A/B measured (7 min vs 12 min, 4060 Ti); shares clip + both VAEs (only the transformer differs) |
| 150 | Engine updates apply in place | **LIVE** | MPI-457 acceptance #5, real machine 2026-08-07: 0.29.2 → 0.30.0 **in place, ~3 s, no download**, stamp + HEAD + MpiNodes junction all verified |

### importantChanges

| line | bullet | grade | evidence |
|---|---|---|---|
| 161 | LTX Balanced moved to a smaller file | **FIX** | size corrected to 21.5GB; "one file on every card" = the fp8/mxfp8 variant axis is gone (MPI-466); A/B on sound/hands/eyes is the user's own |
| 167 | Wan 2.2 is image-to-video only | **FIX** | size corrected to 29GB; t2v lives on LTX 2.3 / H3 / Wan 2.2 5B — confirmed in `supportedOps` |
| 175 | Some models ask you to accept a licence | **LIVE** | MPI-451; H3 is the only gated model shipped |
| 182 | Your mask reaches the model as drawn | **LIVE** | MPI-431, user-reported and user-validated |
| 187 | Mask composite follows the mask | **LIVE** | MPI-437 |
| 192 | Add/Subtract dialog gone, cover-fit crop | **LIVE** | MPI-373 |
| 198 | A detection you don't add is a preview | **LIVE** | MPI-426, user-validated 2026-08-04 |
| 204 | Krea 2 + Chroma styles reach Detail/Upscale | **DECL** | one-master-template migration MPI-365 (closed 2026-08-03) |
| 207 | Krea 2 Control takes a second image | **DECL** | krea2 master graph |
| 209 | macOS: install Command Line Tools first | **DECL** | MPI-416 `deferred` — shipped deliberately as a known issue, which is what the sentence says |
| 216 | Krea 2 + Chroma keep source dimensions | **DECL** | MPI-365 |

### fixes

| line | bullet | grade | evidence |
|---|---|---|---|
| 223 | Reuse Prompt brings back untouched settings | **LIVE** | MPI-479 closed on the user's own test: Krea2-NSFW upscale factor left at 1.5, moved to 2.0, Reuse → dropped back to 1.5 |
| 231 | A generation that fails before it starts says why | **TEST** | MPI-463 (`_failBail`, `9d83ea6e`) + MPI-461 (`f006dc4f`); two negative-controlled tests; the 404 that motivated it was hit live 2026-08-06 |
| 238 | Wake-up install is not a crash | **TEST** + FLAG 3 | MPI-480 acceptance #3 not done |
| 246 | Interrupted cloud install can restart | **TEST** + FLAG 4 | MPI-481, no Pod contact |
| 253 | Engine update no longer drops packages | **TEST** | MPI-471 + MPI-472 (drift gate proven both directions, engine down) |
| 261 | LTX video generation works again | **LIVE** | MPI-465/466 — LTX runs end to end on the new export; user ran i2v ops 2026-08-08 |
| 266 | Negative prompt does something on LTX | **TEST** | `baf14ec5` NAG gate; MPI-474 val is explicit — *"code-complete, NOT proved by output"*, and that card's own audio-negative line was deliberately held out of the notes for the same reason. The **video** negative rides MPI-466's regenerated runtimes |
| 275 | No half-finished bars on models you never installed | **LIVE** | MPI-462 — six real percentages, confirmed against the rendered tiles |
| 281 | Uninstall clears up after itself | **LIVE** | MPI-462 local (~16GB reclaimed) + MPI-464 on a real Pod volume 2026-08-07 |
| 291 | Uninstall tells the truth about what it removed | **TEST** | MPI-469 — the local twin's bucket mirrored to remote |
| 299 | A hiccup mid-download no longer throws it away | **LIVE** | MPI-460 — the real 25GB dep resumed from 8,446,279,680 B and finished at 24.9 MB/s |
| 306 | A failed model install tells you why | **TEST** | first-pass carry-over |
| 311 | Clear message when the port is taken | **TEST** | MPI-448 / MPI-434 |
| 317 | Progress bar stops after Stop | **TEST** | first-pass carry-over |
| 321 | Notifications at top centre | **LIVE** | `71601b22`, user-settled placement |
| 326 | Typing a size in Resize no longer errors | **LIVE** | user-reported, user-validated |
| 332 | Resize Video works on a cloud GPU | **LIVE** | **cleared this pass** — MPI-438, prompt `81b0399f`, see above |
| 339 | Brush no longer skips on a fast stroke | **LIVE** | MPI-401 / MPI-435 |
| 345 | Masked edits no longer fail on large images | **LIVE** | Klein masked edit, user-reported |
| 349 | Text detect finds things again | **LIVE** | MPI-384 — the `name:N` trap |
| 355 | Qwen tier stays put | **TEST** | per-model key, not per-op |
| 358 | Batch count hidden where it did nothing | **DECL** | SDXL i2i/control component lists |
| 362 | Updating from inside the app reopens it | **LIVE** | MPI-334/387/422, fully validated 2026-08-03 |
| 369 | Ctrl+scroll no longer resizes the interface | **DECL** | MPI-432 **waived by the user 2026-08-08** — no Mac was rented; the bullet claims no verified macOS outcome, which is why it survived the first pass. UI-size persistence has `tests/ui-zoom-persist.test.cjs` |
| 377 | Live preview looks like your picture | **TEST** + FLAG 1 | install half proven; visual half unobserved on every model |
| 386 | Most downloads have a second route | **LIVE** | MPI-429; wording already corrected in the first pass, and it names the four single-route files (Krea2 NSFW + three decoders). Stays true only while the cut is before 2026-08-10 — see MPI-433 |
| 399 | Engine setup downloads less | **LIVE** | MPI-413 curated pass; MPI-457's in-place run exercised the pip set |
| 411 | Running your own ComfyUI no longer breaks the app's | **LIVE** | MPI-434 (port 48188) + MPI-484 |
| 420 | LoRA / upscale pickers open again | **LIVE** | MPI-443, with the desktop smoke spec that exists because of it |
| 425 | Same extra folder cannot be added twice | **TEST** | MPI-392, 8.3 short-name normalisation |
| 430 | Home screen stops claiming zero models | **TEST** + FLAG 6 | MPI-404 |
| 437 | Stage-all-models locked until a key is saved | **TEST** + FLAG 6 | MPI-405, desktop spec with a negative control |
| 442 | Splash covers the whole wait | **LIVE** | MPI-410 — reproduced (`ready-to-show` on Chromium's error page) then fixed; desktop tests |
| 449 | Install screen no longer flickers | **TEST** + FLAG 2 | MPI-412 half of MPI-410 |
| 454 | Install no longer fails after an update moves a Python package | **TEST** | MPI-459 — WinError 5 mechanism; engine-down gate |

---

## What this leaves for the fold

- Gate B gains **one Klein + one Wan generation** (FLAG 1) — MPI-420 is closed and no
  longer carries it.
- FLAGs 2/3/4 are settled by the post-smoke throwaway-Pod session already on Gate B.
- FLAG 5 (4K) and FLAG 6 (first-run) are accepted as-is unless the user says otherwise.
- The MPI-433 date re-check still governs L386, and is the ON-PICKUP item.
- Board hygiene, found while auditing: **MPI-455 is stale.** It asks for LTX end-frame-only
  conditioning, which MPI-466 shipped and proved live on 2026-08-07. It should close as
  superseded rather than sit in `todo` describing a gate that no longer exists.
