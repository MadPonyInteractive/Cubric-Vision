# MPI-588 — clear the bare-form-control lint debt

MPI-582 introduced `mpi/no-bare-form-control` (every UI element is a component) and cleared
the files that card touched. It did not clear the rest of the tree.

**Why this is not cosmetic.** `.husky/pre-commit` runs `lint-staged`, which runs
`eslint --no-error-on-unmatched-pattern --max-warnings=0` over staged `js/**/*.js`. A single
pre-existing warning in a file therefore blocks **any** commit that touches it, on warnings the
committer did not write. Every file below is a commit landmine.

That is not hypothetical: MPI-504 finished its work, could not commit it, wrote a handoff about
being blocked, and the next session spent its opening on someone else's lint debt. Two sessions
were also observed bypassing the hook rather than clearing it (`e1f4f056`), which is how the
rule quietly stops meaning anything.

## The debt, measured 2026-08-20

`npx eslint js/ -f json` → 29 warnings, 13 files: 26 `<button>`, 2 `<input>`, 1 `<textarea>`.

| File | n | Kinds | Lines |
|---|---|---|---|
| `js/components/Compounds/MpiMediaPicker/MpiMediaPicker.js` | 6 | 5 button, 1 input | 127, 164, 189, 210, 258, 299 |
| `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js` | 4 | button | 43 (×4, one template literal) |
| `js/components/Organisms/MpiPromptBox/MpiPromptBox.js` | 4 | 3 button, 1 textarea | 881, 888, 1153, 1212 |
| `js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js` | 3 | 2 button, 1 input | 56, 184, 923 |
| ~~`js/components/Compounds/MpiProjectName/MpiProjectName.js`~~ | ~~2~~ | button | **DONE - cleared by MPI-589**, which had to touch this file for the gallery Flows button and root-fixed both sites (back link + gallery breadcrumb) as ghost MpiButtons rather than bypassing the hook. 27 warnings left, not 29. |
| `js/components/Compounds/MpiQueuePanel/MpiQueuePanel.js` | 2 | button | 19, 242 |
| `js/components/Organisms/MpiToolOptionsPrompt/MpiToolOptionsPrompt.js` | 2 | button | 36, 119 |
| `js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js` | 1 | button | 43 |
| `js/components/Compounds/MpiAutoMaskThumbs/MpiAutoMaskThumbs.js` | 1 | button | 51 |
| `js/components/Compounds/MpiContextMenu/MpiContextMenu.js` | 1 | button | 40 |
| `js/components/Compounds/MpiLicenceGate/MpiLicenceGate.js` | 1 | button | 204 |
| `js/components/Compounds/MpiModelSettings/MpiModelSettings.js` | 1 | button | 139 |
| `js/components/Compounds/MpiSlideOver/MpiSlideOver.js` | 1 | button | 32 |

Counts are per REPORT, not per element: the rule reports once per template-literal quasi, so one
quasi holding two `<button>`s is one warning, and a file can hold more bare elements than its
number here. Re-measure before scoping.

## The worked example — MPI-504, commit `f28825ee`

`MpiBaseFlow.js` carried the same debt and was cleared there. Reuse the approach:

- **Mount, do not markup.** A local `_mountButton(props, children)` helper mounts `MpiButton`
  into a throwaway div and returns `inst.el`, so the caller places the real `<button>` itself.
  `ComponentFactory.mount()` REPLACES its container's innerHTML, so a button that lands in a
  tree with siblings cannot be mounted in place.
- **Ids and test hooks move onto the mounted element.** `#flow-prev` / `#flow-next` are driven by
  three desktop specs through `document.querySelector(...).click()`; a click on a mount HOST div
  does nothing and fails silently. Grep the specs for any id or selector before moving it.
- **`variant: 'ghost'`** is the Primitive's answer for a chromeless button — it is what most of
  these are.
- **Shrink the consumer CSS to geometry and typography.** The Primitive owns background, border,
  cursor, hover. Where the consumer genuinely must override (a scrim, a disabled state that hides
  rather than greys), scope the selector past the Primitive's own specificity rather than relying
  on stylesheet load order, and say in a comment why the override exists.
- **Watch what `.mpi-btn` brings**: `text-transform: uppercase`, `font-weight: 600`, a 1px
  transparent border, size-class padding. Uppercase and weight are the two that visibly change a
  label. `box-sizing` is border-box globally, so the border is inert.
- **Prove it with pixels, not just specs.** A spec proves the control still FIRES. Read computed
  styles off a real renderer for colour, type, icon size and disabled behaviour — and go through
  a 1×1 canvas, because the palette serialises as `oklch()` and a regex "rgb" parse returns a
  plausible wrong number.

## Scope notes

- `js/components/Primitives/` is exempt by path — that is where a real control belongs.
- Not all 29 are mechanical. `MpiPromptBox`'s `<textarea>` (1153) is the main prompt input and
  its behaviour is load-bearing; `MpiMediaPicker` at 6 is the largest single file. Consider
  splitting those two out rather than forcing one pass.
- No user-visible behaviour should change. If one does, it is a bug in the conversion, not an
  improvement — this card buys back committability, not a redesign.
