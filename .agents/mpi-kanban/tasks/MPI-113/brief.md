# MPI-113 — History-mode prompt-box UX

Surfaced during MPI-112 (extend reuse). Two independent prompt-box/state gaps.

## 1. Stop button blocked in history mode

**Symptom:** Running an extend (or any prompt-box-dispatched op) in the history
workspace leaves the prompt-box Stop button disabled. User must navigate to the
gallery, open the queue panel, and press Stop there to cancel.

**Expectation:** The history-mode prompt box exposes a working inline Stop for
in-flight ops.

**Where to look:** `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`
(`_setGenerating`, the prompt-box wiring, queue/cue dispatch), the prompt-box
Stop control, and how the gallery queue Stop reaches the active generation
(`activeGenerations` / `generationService`).

## 2. Prompt draft not persisted across workspaces

**Symptom:** Typed prompt text is lost when navigating history <-> gallery.
Reportedly also cleared by other actions. No persistence.

**Expectation:** A draft typed in either workspace survives navigation back to it
(positive + negative). Should not require generating to keep the text.

**Approach (proposed, not decided):** Add a state key (e.g. `state.promptDraft`)
that PromptBox reads on mount and writes on input (debounced). Keep it per-media-
type or per-workspace if that matches how the boxes diverge. Verify it does NOT
fight Reuse Prompt injection or the per-op control defaults.

## Out of scope

The MPI-112 extend reuse-data fix (Duration param + start-frame snapshot +
double-toast) is already shipped on this branch. This card is UX/state only.
