# MPI-608 validation

## What shipped

The wiring half. The graph half (twelve `Input_Lora_Phase{1,2}_{1..6}` nodes in
`flow_scribble_object.json` and its `raw/` twin) shipped under MPI-567 earlier in the
same session and is unchanged here.

| # | change | file |
|---|---|---|
| 1 | matcher accepts a digit in the middle segment: `[A-Za-z]+` → `[A-Za-z0-9]+` | `js/services/comfyController.js` ~1429 |
| 2 | slots carry `loras`; `flowModelChoices` carries the original `index`; new `flowLoraPhases()`; `flowSettingsModel()` deleted | `js/data/flowsRegistry.js` |
| 3 | `loraModelId` → `loraPhases` | `js/services/flowService.js` |
| 4 | whitelist forwards `loraPhases` | `js/services/generationService.js` |
| 5 | emits `Lora_Phase<N>_<i>` per declared phase, plus flat `Lora_<i>` for phase 1 | `js/services/commandExecutor.js` |
| 6 | `settings` action + `_openSettings()` deleted, orphaned import dropped | `js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js` |
| 7 | a cogwheel per rack-bearing slot | `MpiFlowLibrary.js` + `.css` |
| 8 | character sheet: `loras: true` on the slot, `settingsModel` and the `loras` button gone | `js/data/flowsRegistry.js` |

## Two decisions worth not re-deriving

**The opt-in had to survive, and it is load-bearing.** `flow_ltx_extend` and
`flow_ltx_foley` both carry `Input_Lora_1..6` nodes and declare NO rack. A gate of
"does the graph have the nodes" — the obvious simplification — would silently start
injecting the user's LTX LoRAs into two shipped flows. Hence `loras: true` per slot
rather than deriving it. Pinned by a test that names both flows.

**Phase 1 also emits the flat `Lora_N`.** Every graph authored before per-phase racks is
titled `Input_Lora_1..6`, `flow_character_sheet` among them — and that graph is being
re-authored in another session (MPI-610), so retitling it here would collide. Injection
skips a title with no node, so a graph carrying one form takes that one and a graph
carrying both takes the same rack twice over. Drop the line once every flow graph is
phase-titled.

## Evidence

- **`npm test` → 725/725 pass**, 0 fail. Up from 722 (+3 new; four existing tests in
  `flow-model-choice.test.cjs` and `flow-lora-rack.test.cjs` were re-pointed off the
  retired `settingsModel` rather than deleted).
- **`npx eslint`** clean across all seven changed JS files.
- **`graph_parity.py` → PARITY OK** — the MPI-567 graph half is untouched by this.
- **Six mutations, every one RED**, file restored and sha256-verified each time:

| mutation | result |
|---|---|
| opt-in removed — every slot gets a rack | fails=1 |
| original slot index dropped from `flowModelChoices` | fails=2 |
| phase 1 stops emitting the flat `Lora_N` | fails=1 |
| staged-model skip becomes an abort (`continue` → `break`) | fails=1 |
| cogwheel rendered for slots with no rack | fails=1 |
| `settingsModel` re-declared on a FlowDef | fails=1 |

**One assertion was BLIND on the first pass and is now fixed.** The staged-model test
matched a bare `/continue;/`, which the loop already carries earlier for a missing id —
so flipping the guard to `break` still passed. It is now anchored to the warn string
itself. Worth recording: a mutation that comes back green is as often a weak assertion
as a correct one, and this run had exactly one of each.

## NOT verified — needs a live look

**Does the Model Settings overlay open ABOVE the Flow Library overlay?** The cogwheel
lives in the Library's slide-over, which is itself an `MpiOverlay`; the settings panel is
mounted by `MpiGalleryBlock` / `MpiGroupHistoryBlock` underneath. That is the same z-order
class MPI-606 just fixed for the colour picker (`949e9367`, "the picker sat under the
overlay"). Emission and listener are both proven by test; the STACKING is not, and a
panel opening behind the library reads as a dead button.

Reachability itself is unchanged from what already shipped — the old `loras` button
emitted the same event from an overlay too, and the test pinning BOTH Blocks as listeners
still passes.

**Also unproven end to end:** that a LoRA picked in each phase's panel reaches the graph
in a real run. The chain is proven per hop by test; nobody has watched a dispatch carry
two racks at once.

---

## Live check, 2026-08-23 (Fabio)

**PASSED on both of the things that were unproven.** The Model Settings panel opens ABOVE
the Flow Library overlay — the z-order worry was unfounded — and a cogwheel renders beside
BOTH Render model and Blend model, each opening its own rack.

**One real bug he found, now fixed.** Opening the LoRA panel closed the detail drawer
underneath it, so coming back from the rack dropped him on the bare grid with his flow
unselected.

Root cause, not the symptom: `Overlays.open` pulses `ui:close-all-popups` with
`{ reason: 'overlay-open' }` on EVERY open, specifically so long-lived panels can ignore
it (`overlayManager.js` ~44 says so outright). `MpiOverlay` (~234) and `MpiSlideOver`
(~116) both carry that guard. The Flow Library detail drawer listened BARE, so its own
cogwheel took it down. **The pulse fires on OPEN, not on close** — it only READS as a
close-time bug because that is when the missing drawer becomes visible.

Fixed by adding the same guard, pinned by a test asserting BOTH halves: the drawer ignores
an `overlay-open` pulse, and a BARE pulse (Escape, `Overlays.reset()`) still closes it — a
guard that swallowed every pulse would strand the drawer open instead. Mutation-checked by
restoring the exact bare listener that shipped before: RED, file restored and
sha256-verified. **726/726 tests**, eslint clean.

**Noticed, not actioned:** `MpiModelManager.js` ~1036 carries the byte-identical bare
listener for its own detail drawer. It has NO path that opens an overlay from inside that
drawer today (no `Overlays.open`, no `ui:open-model-settings` emit), so the bug is latent
rather than reproducing, and it is not this card's file. Worth the same guard the day
anything opens a panel from the Model Library detail.
