# MPI-613 — the LoRA cogwheel belongs on the flow RUN stage

Fabio, 2026-08-23, immediately after live-testing MPI-610:

> *"The placement for setting up the LoRA is incorrect. It should be on the final stage,
> actually. It's where the output is, so if the user decides to test some different LoRAs,
> he has to go all the way back to the slide over, and that doesn't make much sense. That
> means we need to do that also for the scribble workflow."*

## The problem is the ITERATION LOOP, not the control

The cogwheel works — MPI-608 built it, MPI-610 gave the Character Sheet a second one, and a
live run proved both racks reach the graph. It is in the wrong **place**: the Flow Library's
detail slide-over, which is the surface you pass through *before* the flow opens.

LoRA choice is not a set-up decision, it is a **compare** decision. You run, you look at the
sheet, you want the same prompt with a different LoRA. Today that is: close the flow → reopen
the Library → open the detail slide-over → cogwheel → Model Settings → back → reopen the flow
→ run. The result and the control that changes it are at opposite ends of the app.

## The target

The cogwheels move to the flow's **final (run) slide**, beside the output — one per
rack-bearing model slot, keeping the slide-over's per-slot labelling so two cogwheels are
never ambiguous ("Render model" / "Blend model").

**Generic, not per-flow.** Both current two-rack flows want it, and so will the next one:

| flow | phase 1 rack | phase 2 rack |
|---|---|---|
| `character-sheet` | Krea 2 (`krea2` / `krea2-nsfw`) | Klein (`klein-4b` / `klein-9b`) |
| `scribble-object` | SDXL family (5 candidates) | Klein (`klein-9b` / `klein-4b`) |

So this is a change to how **`MpiBaseFlow`** renders a flow's declared racks, driven off
`flowLoraPhases(flow)` — the same resolver the slide-over already uses. No FlowDef edits, no
graph edits, no new registry field.

**Open question for whoever takes it:** does the slide-over keep its cogwheels as well, or do
they move outright? Fabio said "should be on the final stage"; he did not say "remove it from
the library". Duplicating is cheap (one resolver, two mount points) and the library placement
is still the right one for *before you run*. Ask.

## 🔴 The trap this move must not inherit — VERIFIED 2026-08-23

`ui:open-model-settings` is listened for by **exactly two components**, and both are
workspace Blocks:

```
js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js:1549
js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js:1134
```

Each mounts its **own** `MpiModelSettings` overlay, which is why both need the listener. But
the **landing page mounts neither** — they are mounted by the workspace router
(`js/shell/navigation.js:389/393`), and the Flow Library is reachable straight from the
landing page (`js/shell/projectUI.js:81` "Flows", and the radial menu whose entry is defined
at `navigation.js:358` and emits at `:368`).

So a cogwheel pressed with no project open emits into nothing: no panel, no error, no log.
MPI-504's own desktop spec recorded this as a known limitation. **Moving the control to the
run slide does not fix it** — verify whether a flow can be opened and run with no project
before assuming the new placement is safe, and if it can, this card owns the fix (a
shell-level listener, or mounting the overlay where the flow frame lives).

## Where the pieces are

- Slot → rack resolution: `flowLoraPhases(flow)` in `js/data/flowsRegistry.js:1287`
- Current mount: `_mountModelChoice()` in
  `js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js:236` — the cogwheel
  block starts at the `if (!slot.loras) return;` guard (~line 294) and is a plain
  `MpiButton` with `icon: 'settings'`, `extraClasses: 'mpi-detail__loras-btn'`
- The flow frame that must grow the new mount point:
  `js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js` (the comment at ~1048 already
  describes the cogwheel it lost)
- Doc to update: `docs/playbooks/add-flow/ui/lora-rack.md` (rewritten in MPI-610, currently
  says the opener is "a cogwheel beside each model dropdown in the Flow Library's detail
  panel")
- Tests that pin the current placement: `tests/flow-lora-rack.test.cjs` ("the slide-over
  gives every rack-bearing slot its OWN cogwheel") and
  `tests/desktop/flow-lora-button.spec.js` (rewritten in MPI-610; it mounts the library,
  opens the Character Sheet and asserts two cogwheels emitting `krea2` then `klein-4b`).
  **That desktop spec is the one to re-point at the new surface** — it is also the spec that
  was left red for a whole card cycle when MPI-608 moved this control the first time.

## Related

- **MPI-608** built the per-slot cogwheel, replacing MPI-504's single flow-level
  `action: 'settings'` button that lived on the run slide. Note the irony and read its
  reasoning before moving it back: one button could not name two racks. Two *labelled*
  cogwheels on the run slide can.
- **MPI-610** gave the Character Sheet its second rack, which is what made the placement
  hurt enough to notice.
- **MPI-614** — the cross-tier LoRA hazard found in the same test session. Independent, but
  it lands on the same panel a user reaches through this control.
