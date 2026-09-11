# MPI-724 — validation

All checks below ran on 2026-09-11 against an **isolated** instance
(`npm run app:isolated`, port 64070, own profile), driven with `playwright-cli`. The user's
`:3000` was never touched — the launcher reported *"an app already owns :3000 — leaving it
alone."*

## Static

| check | result |
|---|---|
| `npm run lint` | clean |
| `npm run lint:components` | clean |
| `npm test` | **921 pass, 0 fail** |

## Live — component, against the real registry and the real event bus

| # | check | result |
|---|---|---|
| 1 | flat model (`sdxl-realistic`), 3 slots with the 3rd empty | `LORAS` label, **2 rows**, the empty slot skipped |
| 2 | names | extension stripped (`alpha`, `beta`), full path on the row `title` |
| 3 | knobs | Model + Clip inputs at the saved values; bypass `aria-pressed` matches the saved flag |
| 4 | value arrives from the overlay | applied **in place** — row node identity unchanged, inputs updated |
| 5 | echo guard | the rack does **not** re-emit an incoming change (1 emit observed for 1 emit made) |
| 6 | rack writes out | full array re-emitted, edit at its **original index**, the empty 3rd slot preserved |
| 7 | the SET changes | 2 rows → 3 rows on a rebuild, label kept |
| 8 | nothing filled | `hidden: true`, `innerHTML.length: 0`, **0 labels**, measured height **0** |
| 9 | Wan (`wan-22`, staged) | `HIGH NOISE LORAS` (2 rows, gap slot skipped) then `LOW NOISE LORAS` (1 row) — declared order, Model-only inputs, no Clip |
| 10 | stage independence | a write to `low` left `high` byte-identical, gap index intact |

## Live — in the real PromptBox popup, real project, real model

Project `mpi724` created through the app UI; model **SDXL Realistic**.

| # | check | result |
|---|---|---|
| 11 | slot position | `#settings-lora-slot` is the **first child** of `.mpi-prompt-box__settings` |
| 12 | persistence round-trip | LoRAs set, app project re-opened from disk → rack renders them; `project.json` `modelSettings['sdxl-realistic'].loras` matches |
| 13 | screenshot | `LORAS` label, `DETAIL-TWEAK…` (ellipsized) Model 0.85 / Clip 0.60, `FILM-GRAIN-V2` dimmed with its bypass warn-tinted and pressed |
| 14 | **the debounce regression** | emit + open the cog in the same tick → **3 rows** (was `hidden: true` before the fix) |
| 15 | **the op-change revert** | strength 1.90, then `refreshControls()` mid-debounce → still `1.90` on screen and `1.9` in the project |
| 16 | overlay → rack | overlay slot 0 set to `0.33` → rack input reads `0.33` |
| 17 | rack → overlay | rack input set to `1.11` → overlay reads `1.11`, and its `MpiTreePicker` node is the **same element** (no remount) |
| 18 | bypass across surfaces | overlay bypass click → rack `aria-pressed="true"` + `__row--bypassed` |
| 19 | empty in the popup | cleared → `hidden`, 0 bytes, 0 height |
| 20 | console | no error from the rack or the overlay (only a pre-existing SSE reconnect warning) |

## Not re-verified, and why

**Plan item 7 — "bypass → the dispatched graph carries strength 0".** Not run: it needs a
real GPU generation, and **this card changes no injection code**. Bypass-at-zero shipped
with MPI-223 and reads the same `bypass` flag off the same `modelSettings[modelId].loras`
key. What the card had to prove is that the rack writes that key in the overlay's exact
shape — checks 6, 12, 16-18 do, including the overlay reading the rack's own writes back.

## Open for Fabio — one human call

Checks 13 and 19 are the only things an agent cannot settle: **does it look right in the
popup?** Screenshot in the session. Everything else is measured above.
