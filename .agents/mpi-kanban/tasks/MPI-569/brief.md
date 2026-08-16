# MPI-569 Brief — the empty-prompt short-circuit on an exempt operation

Raised from **Cubric-Prompt MPI-27 phase 1** (landed 2026-08-16), which taught
Prompt to refuse enhancement on operations that take an *instruction* rather
than a *scene description*.

## What already works — do not rebuild it

Prompt's exempt response is `ok: true` with the user's prompt returned unchanged
plus a note, and **Vision already surfaces it correctly**. Verified end to end
2026-08-16 by reading the path, not by assuming it:

```
Prompt connector.ts (exempt)  ->  output.note
  -> /connector/enhance          ->  data.output.note
  -> connectorOps.js:42             note: data.output.note
  -> MpiPromptBox.js:1766           _enhanceToast(result.note, 'info')
```

```js
// MpiPromptBox.js:1766
_enhanceToast(result.note || 'Prompt enhanced.', result.note ? 'info' : 'success');
```

A present `note` fires an **info toast carrying Prompt's exact string**:
`No prompt enhancement is available for this operation.` That is the intended
behaviour and it needs no change.

## The defect

`MpiPromptBox.js:1744` returns **before the request is sent**:

```js
if (!source.trim()) { _enhanceToast('Type a prompt to enhance first.', 'warning'); return; }
```

For a normal op that guard is right. But several exempt ops have a
**legitimately empty prompt**:

| op | why the prompt is empty |
|---|---|
| `inpaint` | Klein's removal path wants the prompt EMPTY — that is how you erase |
| `resize`, `resizeVideo` | mechanical, no prompt exists |
| `removeBackground`, `autoMaskImg` | mechanical |
| `interpolate`, `videoUpscale`, `imageUpscale` | mechanical |
| `extend` | may be left empty to let the motion carry on (Vision's own help text) |

On those the user is told **"Type a prompt to enhance first"** — instructed to
type something that would then be refused. Prompt is never called, so no note
from Prompt can fix it. The fix is Vision-side.

## Fix

On an **exempt** operation, toast the not-available message instead of the
type-a-prompt warning. Roughly:

```js
if (_isExemptOperation(activeOperation)) {
  _enhanceToast('No prompt enhancement is available for this operation.', 'info');
  return;
}
if (!source.trim()) { _enhanceToast('Type a prompt to enhance first.', 'warning'); return; }
```

Order matters: the exemption check goes **first**, because the empty-prompt
guard is what currently swallows it.

### Where the exempt list comes from

Vision needs to know which ops are exempt. Prompt owns that list
(`src/main/recipes/operations.ts`, `OPERATION_MAP`). Two options:

1. **Prompt serves it** — add the exempt set to the capabilities surface
   (`/connector/capabilities` already returns `promptEnhance`), cache it at
   connect. One source of truth, and the same shape as `enhanceRecipe`, where
   Vision already defers to Prompt on enhancement questions. **Preferred.**
2. **Vision-local list** — hardcode it. Ships faster, drifts the next time an
   operation is added on either side.

Either way the list is data, not a branch per op.

## Trap — `promptRequired` is NOT the gate

It looks like a ready-made flag in `commandRegistry.js` and it is not:

| op | `promptRequired` | enhances? |
|---|---|---|
| `i2v`, `i2v_ms` | `false` | **yes** |
| `edit`, `qwenEdit` | `true` | **no** |
| `detail`, `inpaint` | `false` | no |

It means *"the prompt may be empty"*, never *"the prompt is unwanted"*. Wiring
it as the gate would disable Enhance on `i2v` and leave it live on `edit` —
exactly backwards. Two independent axes; do not collapse them.

## Out of scope — considered and rejected 2026-08-16

**Disabling the Enhance button on exempt ops.** The toast already covers it and
explains *why*; a disabled button explains nothing. Recorded so it is not
re-derived: the button **mounts once** (`MpiPromptBox.js:1780`,
`if (!enhanceSlot || _enhanceBtn) return;`), so any gate would additionally have
to re-evaluate on `operation-change` (already emitted, line 611).

## One-line fix in the same card

`connectorOps.js:42` — the comment reads *"set when Prompt fell back to a
default recipe"*. The note is now **also** set on an exempt operation.

## The exempt set (Cubric-Prompt, 2026-08-16)

`edit`, `kleinEdit`, `qwenEdit`, `krea2Edit`, `inpaint`, `detail`, `upscale`,
`pid`, `imageUpscale`, `imageDescribe`, `extend`, `interpolate`, `videoUpscale`,
`removeBackground`, `autoMaskImg`, `resize`, `resizeVideo`, `flowVideoStitch`,
`flowHeadSwap`, `flowLtxExtend`, `flowLtxFoley`.

Everything else enhances — **including `control`**: a ControlNet reference
constrains *structure*, so the prompt still carries the creative load. That is
why Qwen Image Edit is not wholly exempt (Cubric-Prompt MPI-21).

### Noticed while writing this card — the flow ops are moving

The working tree at the time of writing (uncommitted, another session's work)
**deletes `flowImageRegen`, `flowSdxl4k` and `flowVideoStitch`** from
`commandRegistry.js`, and no reference to the first two survives anywhere under
`js/`. Prompt's `OPERATION_MAP` still lists all three.

**This is harmless, not a bug**: Prompt's `resolveOperation()` returns
`undefined` for any operation it does not know, and an unknown operation falls
back to the previous behaviour rather than failing. The three entries simply
become dead. Worth tidying on Prompt's side once the flow refactor lands — and
worth knowing that the op list is a moving target, which is the argument for
option 1 above.
