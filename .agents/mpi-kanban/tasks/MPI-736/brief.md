# Per-media-type accent family: finish what `--accent-audio` started

## Why this card exists

MPI-730 needed one colour and took one: `styles/01_base.css` now carries
`--accent-audio: oklch(0.84 0.11 170)`, mirrored from the source of truth, and the audio
gallery card paints with it. That was a deliberate single-token landing — the rest of the
family was NOT added, because it is a product decision, not a component one.

The rest of the family still has to land, and the design docs still have to say so.

## The family (source of truth — mirror, never invent)

`c:\AI\Mpi\Cubric Studio (Website)\styles\landing.css` is the source of truth.
`c:\AI\Mpi\MadPony-Identity\DESIGN.md:360-372` mirrors it and states that rule in as many
words.

| token there | value | in Vision today |
|---|---|---|
| `--hub-accent`    | `oklch(0.78 0.028 80)`  | absent |
| `--vision-accent` | `oklch(0.76 0.17 355)`  | present, but named `--accent-heat` |
| `--audio-accent`  | `oklch(0.84 0.11 170)`  | present as `--accent-audio` (MPI-730) |
| `--prompt-accent` | `oklch(0.88 0.13 102)`  | absent |
| `--video-accent`  | `oklch(0.78 0.15 48)`   | absent |

Note the naming collision to resolve: Vision's app accent `--accent-heat` IS
`--vision-accent`, same value. Whether the family renames it, aliases it, or leaves it
alone is part of this card's decision.

## Scope

1. **Decide the shape** — one token per media type in `styles/01_base.css`, or a themed
   `--accent-media` that a workspace/card sets per type. Then land it.
2. **Update the design docs** with the decision: which names Vision uses, that the website
   repo stays the source of truth, and how a surface picks its accent.
3. **Apply it** to the surfaces that should carry a media-type colour rather than the app
   accent. The audio card is already done and is the worked example.

## The trap that cost a test run on MPI-730 — read before using any of these

`color-mix(in oklch, ...)` interpolates the **hue**. The surface family sits at hue 350
and `--accent-audio` at 170 — exactly antipodal — so an oklch mix walks the hue right past
the colour and lands on a yellow. It looked like the token had not loaded at all.
`--accent-video` (48) and `--accent-prompt` (102) are far from 350 too and will do the same
thing. **Mix in `oklab` (or another rectangular space).** Vision's rose never showed this
because 355 is 5° from the surface hue, so every existing `color-mix(in oklch, var(--accent-heat) …)`
call site in the app is fine and none of them proves the pattern safe.

Second trap: `--accent-ok` is `oklch(0.78 0.13 150)`, close enough to the audio accent to be
tempting and wrong — it is the success/ready semantic, and reusing it would tie a brand
colour to a status.

## Relationship to MPI-708

MPI-708 renames the product to Cubric Studio and gives each media type its own mascot and
accent. This card is the token/design half of that and can land ahead of it or inside it —
Fabio's call.
