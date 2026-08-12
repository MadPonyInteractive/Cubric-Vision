# MPI-545 validation

Run 2026-08-12 against an isolated instance (`npm run app:isolated`, port 56227,
driven with `playwright-cli`). The user's own app on :3000 was never touched.
Instance killed by process tree afterwards; port confirmed free.

## Markdown renders (notes editor)

Mounted `MpiNotesEditor` with a markdown document (heading, table, inline code,
list, bold, link):

    {"previewHidden":false,"tags":"H1,STRONG,TABLE,CODE,LI,LI,A","html":"<h1>cowboys</h1>..."}

Screenshotted: heading rules, a real table, blockquote, GFM task-list checkboxes.

## The pencil/eye toggle

    {"modeBtns":2,"afterPencil":{"previewHidden":true,"previewDisplay":"none",
     "inputHidden":false,"inputDisplay":"flex","taOverflow":"auto"}}

Both panes really hide - `hidden` resolves to `display: none`, not a no-op, which
is the trap `.claude/rules/dos_and_donts.md` warns about.

## The scroll bug is gone (root cause, not symptom)

120 lines of notes, edit mode:

    {"clientH":190,"scrollH":2434,"scrolls":true,"scrolledFrom":0,"scrolledTo":2244,
     "inlineHeight":"(none)"}

`scrollTop` moved 0 -> 2244, and there is no inline `height` any more: the
`autoHeight` mode that pinned `height = scrollHeight` under `overflow: hidden` is
no longer in play. Preview scrolls too (`clientH` 430 = the 60vh cap, content
taller).

## Preview is live, not the initial prop

Typed into the textarea, then switched to the eye: `liveEditShown: true` for a line
that only ever existed in the textarea.

## Sanitizing

`<script>window.__pwned=1</script>` and `<img src=x onerror=...>` through both
surfaces:

    notes:   {"pwned":null,"hasScriptTag":false,"hasOnerror":false}
    release: {"onerror":false,"pwned":null}

## Release notes

Every shipped version 0.0.1 -> 1.4.1 rendered without leaving raw `` ` `` or `**`
in the text (none of them actually use markdown syntax today). A synthetic note
proves the path:

    {"code":1,"strong":1,"em":1,"links":1,"onerror":false,"lead":"MARKDOWN"}

The "LEAD - body" em-dash split still works (`lead: "MARKDOWN"`).

## Lint

`npx eslint` clean on all four changed JS files.

## Not run

`npm test` - the change is frontend-only (no `routes/`, no backend module touched)
and the suite covers neither of these components.

## Polish pass (Fabio, on sight)

Dialog widened, type scaled up, heading levels given their own colours. Measured
on a second isolated run (port 53199):

    {"modalWidth":"880px","bodyFont":"15px",
     "h1":"oklch(0.98 0.008 80)",   // --ink-1
     "h2":"oklch(0.76 0.17 355)",   // --accent-heat
     "h3":"oklch(0.82 0.13 220)"}   // --accent-frost

h4-h6 stay the muted uppercase kicker (--ink-3). At 880px the table no longer
squeezes. Fabio confirmed both project notes and card notes against his own
cowboys project: "Yeah, this is much better."
