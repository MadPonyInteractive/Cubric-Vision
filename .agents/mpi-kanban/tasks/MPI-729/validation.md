# MPI-729 — validation

Probed with `playwright-cli` against an own `app:isolated` instance (port 49987, agent
profile) and a throwaway project created for the run — never the user's `:3000`, never
their project folder.

## What shipped

`js/components/Compounds/LandingPages/MpiFlowLibrary/MpiFlowLibrary.js`
- A ghost `MpiButton` (`icon: 'back'`, `label: 'Gallery'`, `size: 'sm'`) prepended into
  `.mpi-flow-library__head`, above the title. Same Primitive and props as the `← Flows`
  chip in the Flow topbar, so both ends of the breadcrumb are the same control.
- Click calls `el.close()` — not `navigate()`; hiding the overlay already restores the
  gallery underneath.
- Visibility re-derived in `el.open()` from `state.currentPage === PAGE_GALLERY`.
- `backBtn.el.destroy()` added to `el.destroy`.

`…/MpiFlowLibrary.css` — geometry/typography only, mirroring `MpiBaseFlow.css` ~86, plus
an author-level `[hidden]` rule.

## Measured

| check | result |
|---|---|
| Entered from Landing — chip present but not painted | `currentPage: "landing"`, `hidden: true`, `display: "none"` |
| Entered from a project's Gallery | `hidden: false`, `display: "inline-flex"`, label `"Gallery"` |
| Chip is the head's first child | `mpi-btn mpi-btn--ghost mpi-btn--sm mpi-ibtn mpi-ibtn--label-right mpi-flow-library__back` |
| Stacked above the title, not beside it | chip `y: 68 h: 16`, title `y: 98` → `above: true` |
| Title keeps the left margin it has with no chip | chip `x: 48`, title `x: 48` → `sameLeft: true` |
| Real click (not a synthetic `.click()`) | library hidden, `currentPage: "gallery"`, gallery block mounted |
| **The per-open gate is not frozen at first open** | one instance, `landing → hidden: true`, then `gallery → hidden: false` |

That last row is the regression the `el.open()` placement exists for: `shell.js` ~487
mounts this component once and reuses it, so a `setup`-time decision would have stuck at
whichever page the first open happened on. Measured on a single instance across two
opens, so it is the reuse path that was exercised, not two fresh mounts.

The author-level `[hidden]` rule is load-bearing, not belt-and-braces: the visible chip
computes to `display: inline-flex`, which outranks the UA `[hidden]` rule.

`npx eslint` on the changed JS: clean.

Screenshot of the header in the gallery entry path:
`…/scratchpad/mpi729-header.png` (scratchpad, not committed).

## Not covered

Fabio's own eye on the spacing — he specified the stacked layout and the screenshot
matches it, but the final look is his call.
