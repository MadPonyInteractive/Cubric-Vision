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

## Follow-up: aligned to the Flow topbar chip (Fabio, same session)

The chip sat 26px below and 26px right of the `← Flows` chip it is the counterpart to,
so the cursor still had to travel. Measured in one instance, both states:

| chip | x | y | centre |
|---|---|---|---|
| Flow topbar `← Flows` | 22 | 42 | (54, 50) |
| Library `← Gallery`, before | 48 | 68 | (88, 76) |
| Library `← Gallery`, after | 48 | **42** | (88, **50**) |

Vertically exact. Horizontally left at 48 deliberately: the chip keeps the title's left
margin, which is what makes the stack read as one block.

Done with `position: relative; top: -26px`. The two obvious alternatives do NOT work:

- **A negative `margin-top` does nothing.** The Primitive is `inline-flex` — an atomic
  inline-level box, whose vertical margins grow the line box instead of moving it.
  Measured: `margin: -26px 0 calc(var(--s-3) + 26px)` left the chip at y 68 and pushed
  the title from 98 down to 124, the opposite of the intent.
- **A smaller `__head` padding-top** would move the title up 26px on the Landing path,
  where the chip is hidden and nothing occupies the space.

Re-measured after the change: gallery path title 98 / sub 138 (unmoved); Landing title
64 / sub 104 with the chip hidden (unmoved). Screenshot: `…/scratchpad/mpi729-v2.png`.
