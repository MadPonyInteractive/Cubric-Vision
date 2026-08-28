# The run path — results save themselves

> Part of the flow carousel frame — [README.md](README.md) is the hub. What the run slide
> *shows* once a run finishes (the declared before/after, the video player, the session
> snapshot) is [../result-pane.md](../result-pane.md); this file is what happens to the
> RESULT ITSELF.

**A finished result is committed by the run path, and the pane simply says so** —
`_pendingNote` reads *"Saved to your gallery"*. There is no Apply step, no Discard, and closing
a flow with a finished result does not prompt. The run path commits on completion, at
`scope: 'gallery'`, exactly like a normal gallery run.

## Hold-until-Apply was built, then removed — do not reintroduce it

This section used to read *"Results are not real until Apply"* and described the opposite
behaviour as shipped. It was accurate for a while and is not any more; the correction is
recorded here rather than deleted, because the machinery is still in the codebase and the next
reader will find it.

- **Built** as MPI-306 Phase 3, 2026-07-18, commit `bcbe161f`: the last step held the result
  in-app, the user could re-generate or cancel freely, and only **Apply** persisted it.
- **Removed** after the UX pass. A commit step the user never wanted to skip is friction, not
  safety. Discard went with it — *Generate again* already overwrote a pending result and
  closing already dropped it, so its only unique job was "clear the pane and stay here", which
  is not a thing a user deliberately wants. With nothing unique to destroy, the close prompt was
  guarding a non-decision, so that went too.
- **Do not add an Apply button back without a concrete case for NOT saving a result.** The
  machinery is in git, and the primitive below is still live.

## `deferCommit` is still a real primitive — it is just not the flow's

`startGeneration` still takes a `deferCommit` opt, and it still skips exactly one thing in the
gallery completion branch: the `for (const g of groups) await addGroup(g)` persist
(`js/services/generationService.js`). The groups are still BUILT and handed to `onComplete` as
`groups`, so a caller can commit them later, and `generation:complete` carries
`deferred: true` so no listener mistakes the run for persisted.

**`MpiBaseFlow` does not use it.** Its live consumers are elsewhere:

| Consumer | Why it defers |
|---|---|
| `MpiGroupHistoryBlock` | the media and its sidecar land on disk, but the project record is withheld |
| `MpiStepCutout` | the cut-out is produced against a different entry than the current one, so the project RECORD is withheld |

If a new caller needs it, use it there — do not route it back through the flow frame.

## Live previews are unaffected

`submitFlowGeneration` returns `tempId`, and `MpiBaseFlow` matches `preview:frame` events
against it (MPI-271). That plumbing never depended on where the committed output went, and the
removal of Apply did not touch it.

Generated files land on disk regardless of any of this. Orphans are the existing
`.preview-assets` + Cleanup GC path's job (MPI-277/227), not a new mechanism.
