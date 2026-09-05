# MPI-696 - validation

## Automated

`node --test tests/hero-quote-deck.test.cjs` - 4/4 pass, run five times over for flake:
- 50 quotes, each <= 95 chars, attributed, unique, list frozen, category in
  {art, lens, sound, craft}, and no category over the ceil(n/2) ceiling that the
  alternating deal needs.
- Two full decks drawn back to back: each deals all 50 exactly once, and the second
  deck never opens on the quote that closed the first.
- 300 consecutive draws (six decks, so every seam is covered): no two consecutive
  quotes share a category. This is the "a week of music quotes" guard.
- A deck stored by a build with a different quote count is discarded rather than
  indexed (that is the failure that would print `undefined` in the hero), as is junk
  of every shape a corrupt localStorage value can take.

`npx eslint js/shell/heroQuote.js js/shell.js js/core/storage.js js/core/storageKeys.js
--max-warnings=0` - clean.

## Live

`npm run app:isolated` (own profile + port 58907, the user's :3000 untouched), driven
with playwright-cli:
- Boot 1: "Painting is poetry that is seen rather than felt." - Leonardo da Vinci, deck pos=1.
- Three reloads: Matisse (pos=2), Tolstoy (pos=3), da Vinci (pos=4). Different quote each
  boot, position persisted in `mpi_hero_quote_deck` across reloads.
- Screenshot at 1600x900: quote sits where the blurb was, italic, attribution beneath in
  the kicker style, CTA row unmoved. User confirmed that treatment reads right.

`#openFolderHeroBtn` renders empty in that shot - projectUI gates the button on
`window.require`, so it is absent in a plain-Chromium probe and present in Electron.
Not a regression from this card.

## The spread, and the version of it that was wrong

First cut of `_spread` dealt from the LARGEST remaining category each step. It satisfies
"no two the same in a row" and is still the wrong answer: with craft=23 and art=15 against
lens=6 and sound=6, it produces a rigid craft/art alternation and the user sees no film or
music quote for a fortnight. Caught by printing fourteen launches rather than by the test,
which was green throughout - "no adjacent repeat" was never the whole requirement.

Shipped version rolls proportionally to what each category has left, so lens and sound
surface at their true ~1-in-4 share from the first launches, with one exception: a category
holding more than half of what remains is forced out now, because its leftovers would
otherwise have to run together at the tail.
