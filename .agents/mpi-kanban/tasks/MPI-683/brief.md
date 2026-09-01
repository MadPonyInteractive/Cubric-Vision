# MPI-683 - MpiOkCancel collapses newlines

## The bug

`MpiOkCancel.js:82` sets the body with `textSlot.textContent = props.text`, and
`MpiOkCancel.css` `.mpi-ok-cancel__text` declares no `white-space`. HTML's default
`white-space: normal` collapses a `\n` to a single space, so every caller that formats
its body as bullet lines renders as one run-on paragraph with stray mid-sentence bullets.

Confirmed visually 2026-09-01 while shipping MPI-682.

## Callers that pass a `\n` today

| Site | Body |
|---|---|
| `MpiModelManager.js:274` | default `_confirmDialog` text - `'Delete these files?\n- Files shared...'` |
| `MpiModelManager.js:526` | op removal, `_showConfirm(lines.join('\n'), ...)` |
| `MpiModelManager.js:1327` | `_uninstallPlugin` - three lines |
| `updateChecker.js:184` | update prompt, `\n\n` paragraph breaks |
| `MpiRunpodSettings.js:1470` | create network volume - `\n\n` before the live cost line |

The last one already carries a **per-dialog** workaround (`textSlot.style.whiteSpace = 'pre-line'`,
`MpiRunpodSettings.js:1492`) written when the shared Compound could not be touched. The fix
here makes it redundant.

## The sweep

Every other caller passes a single-line string. Checked with a multiline regex over `js/`
for a `text:` prop whose value carries a real source newline - zero matches, so no dialog
depends on a soft-wrapped template literal being collapsed. `pre-line` is therefore safe:
it preserves `\n` and still collapses runs of spaces and leading indentation.

## The fix

`white-space: pre-line` on `.mpi-ok-cancel__text`, plus removing the RunPod workaround and
correcting the `MpiFlowLibrary` comment that documents the bug as unfixed (MPI-682 reworded
its dialog to prose to sidestep it rather than add a fourth copy).
