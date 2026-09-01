# MPI-666 — validation

## Phase 1 (shipped, `876b4361` + `98afaeed`)

Verified live on an isolated instance (`:55693`) with an EMPTY models root, 2026-08-31:
grid read `0 ready · 13 need models`; Draw It In / Scribble / Object Stamp showed
`LICENCE REQUIRED` and every other flow `GET MODELS`; Scribble's drawer rendered the
FLUX v2.1 block with `Read the licence`; footer read `VERIFY LICENCE`. No Report or
Request-authorization link, correctly — `FLUX2_KLEIN_9B` declares neither.

`876b4361` turned master red (a test asserting `flow:minimax-music`, which exists only in
MPI-664's uncommitted tree). `98afaeed` rewrote it as a sweep over whatever `flow:` keys are
present. **CI on `98afaeed` has not concluded** — the `tests` job started 2026-09-01T07:18:32Z
and was still `in_progress` two hours later. Not a failure; re-check before close-out.

## Phase 2 — the post-install licence block (this step)

### Automated — PASSED

| Check | Result |
|---|---|
| `npm test` (the CI command, `node --test "tests/**/*.test.cjs"`) | **831 pass, 0 fail** |
| `node --test tests/flow-licence-surface.test.cjs` | 6 pass, 0 fail (was 4) |
| `node --check` on all three JS files | clean |
| `npx eslint` on all three JS files | no output, exit 0 |

**Ten anchors were proved to bite**, the same way phase 1's were: each regex run against
`git show HEAD:<path>` fails — five because `js/utils/flowLicences.js` does not exist there,
five because neither consumer imports it. A green anchoring test that also passes against the
unfixed tree proves nothing, which is why this is run every time.

**Corrected after the claim auditor, 2026-09-01.** The commit message for `2b0249e6` and the
first draft of this file both said *every* anchor was proved. Two were not: `/Licence required/`
and `/Verify licence/` came across from phase 1's test when the assertions were regrouped, and
both already match at the parent commit `03363cb7` (`MpiFlowLibrary.js:124` and `:471`). They
prove nothing on their own. The test still fails against the parent — an earlier assertion in
the same function goes first — so the suite is honest even though those two lines are not, and
the ten anchors that carry the weight were all checked. Recorded rather than quietly fixed
because "proved to bite" is exactly the claim a later reader would trust without re-running.

The same audit caught a second overstatement, corrected in `checklist.md`: `MpiFlowLibrary`
lost **21 lines net** (-84/+63), not the ~45 or 91 claimed. Those figures came from reading a
`git diff --stat` churn count, taken mid-session before the fold-in, as if it were a net delta.

Nothing asserted here depends on a peer card's working tree: the data half sweeps whatever
`flow:` keys exist rather than naming one, and every anchor is on a file this card owns.
That is the discipline `876b4361` failed.

### The H3 chip widening (folded in, same step)

Cannot be seen in the app yet — `minimax-h3` has no FlowDef consuming it until MPI-591 lands
Extend Video, so no tile renders it today. It is asserted as data instead, against the
descriptor **committed at HEAD**: H3 carries `territory.authorizationUrl` and no `verify`, so
the widened predicate catches it and the old one did not. When 591 lands, the check is that
Extend Video's tile reads `LICENCE REQUIRED` and its footer `REVIEW LICENCE`, not
`GET MODELS` / `VERIFY LICENCE`.

### What only Fabio can check

The visual. Phase 1's surface was reachable with an empty models root; **this one is not** —
step 0 of a flow frame is post-install by definition, so it needs a machine where `klein-9b`
is actually on disk. The renderer is served from the tree, so a reload of the running app
picks the change up without a rebuild.

1. Reload the app (Ctrl+R).
2. Inside a project, open **Scribble** from the Flow Library — it goes straight to the frame,
   which is the whole defect (MPI-638's `_pick` skips the drawer for an available flow when
   `currentPage === PAGE_GALLERY`).
3. Step 0's right column should read: title → hero → description, then — with **no
   `LICENCE` heading** (Fabio's call: step 0 is prose, not a spec sheet) —
   `FLUX Non-Commercial License v2.1`, `Licensed by Black Forest Labs Inc. under the FLUX
   Non-Commercial License`, and a `Read the licence` link. No Report or Request-authorization
   link — klein-9b declares neither.
4. The link should open in the system browser, not inside the app.
5. Sanity: a flow with no gated model (e.g. an ungated one) shows **no** Licence heading at
   all — `buildLicenceRows` returns `[]` and the label is skipped with it.

**PASSED — Fabio, 2026-09-01, screenshot in session.** Scribble opened inside a project, step 0
right column reads title → hero → description → `FLUX Non-Commercial License v2.1` /
`Licensed by Black Forest Labs Inc. under the FLUX Non-Commercial License` / `Read the licence`,
no heading, correct spacing, no Report or Request-authorization link (klein-9b declares
neither). Phase 2's own surface is **done**.

## Why this card stays in `doing` and not `done`

One assertion in this card cannot be exercised until MPI-591 lands: **no FlowDef consumes
`minimax-h3` today**, so the widened chip and the `Review licence` footer have never rendered
for a territory licence in a running app. They are proved as data against the descriptor
committed at HEAD, and by the anchoring tests, but not seen.

Held open deliberately, on Fabio's call (2026-09-01), rather than closed on the klein-9b
evidence alone. Filed to MPI-591 as message `71214c6e-3325-44bd-8161-e65e09092c9f`.

### The H3 check, for whoever finishes Extend Video

Once Extend Video declares `minimax-h3` in its `requiredModels`, on a machine where H3 is
**not yet installed** (a fresh receipt — clear it, or use an isolated profile):

1. Flow Library grid → the Extend Video tile must read **`LICENCE REQUIRED`**, not `GET MODELS`.
2. Its drawer footer must read **`REVIEW LICENCE`**, not `VERIFY LICENCE` — H3 has no `verify`,
   so promising a probe we never run would be its own small lie.
3. The drawer's licence block must carry three links: `Read the licence`,
   `Request authorization` (MiniMax's form) and the Discord report link.
4. Install it, accept the gate, then open Extend Video **inside a project**: step 0 must show
   `MiniMax H3 Community License Agreement` / `Powered by MiniMax H3` / the same three links.
   That is the §III.3.a attribution and the §V.5 reporting channel, and it is the half of this
   card that exists for H3 specifically.
5. Re-open it: the gate must NOT fire again (acceptance is filed under the licence id, shared
   by `minimax-h3` and `minimax-h3-ref2va`), but the step-0 block must still be there. The gate
   is one-time; the attribution is not.

If any of 1–3 reads the klein-9b wording instead, `_licenceErrands` in `MpiFlowLibrary.js`
narrowed back to `verify` — `tests/flow-licence-surface.test.cjs` guards it and should have
gone red first.

## Still open on this card

- The refused-gate outcome — **filed, not taken**. One line at `downloadService.js:105`, a
  file on MPI-500's `files.json`. Message `b7e04c19-3f52-4a86-9d13-2c8f610b4e37`.
