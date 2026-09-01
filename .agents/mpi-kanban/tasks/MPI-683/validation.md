# MPI-683 validation

## What was measured

A Chromium probe (playwright-cli, own session `okc683`, own static server on 127.0.0.1:47831 -
never the user's `:3000`) loaded the REAL `MpiOkCancel.css` off disk against the exact
Model-Library body the bug report names:

```
'Delete these files?\n• Files shared with other installed models will be kept.'
```

at a 320px body width, set through `textContent` the way the component sets it.

| measurement | result |
|---|---|
| `getComputedStyle(text).whiteSpace` | `pre-line` |
| line boxes (`Range.getClientRects`) | **3** - tops at 27 / 51 / 75 |
| bullet character's rect top | 51 - it **starts line 2**, so the break lands on the `\n` |
| same node forced back to `white-space: normal` | **2** line boxes - the run-on paragraph the report describes |

The before/after contrast is the check: 2 line boxes with the old style, 3 with the new,
and the bullet at the head of its own line rather than mid-sentence.

## Caller sweep (the risk this change carried)

A body that relied on the old collapsing would start breaking lines. A multiline regex over
`js/` for a `text:` prop whose value carries a real source newline returned **zero matches**,
so no dialog passes a soft-wrapped template literal. The only `\n` bodies in the tree are the
five that WANT breaks (Model Library x3, `updateChecker`, RunPod create-volume). `pre-line`
also collapses runs of spaces and leading indentation, so an indented literal would still
render correctly even if one appeared later.

## Also landed

- `MpiRunpodSettings.js` create-volume dialog: removed the per-dialog
  `textSlot.style.whiteSpace = 'pre-line'` workaround, dead once the shared rule exists.
- `MpiFlowLibrary.js`: corrected the comment that documented the bug as unfixed (MPI-682
  reworded its dialog to prose to sidestep it).

`npm run lint:components` - clean.
