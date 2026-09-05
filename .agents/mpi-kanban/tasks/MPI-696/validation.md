# MPI-696 - validation

## Automated

`node --test tests/hero-quote-deck.test.cjs` - 3/3 pass:
- 50 quotes, each <= 95 chars, attributed, unique, list frozen.
- Two full decks drawn back to back: each deals all 50 exactly once, and the second
  deck never opens on the quote that closed the first.
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
  the kicker style, CTA row unmoved.

`#openFolderHeroBtn` renders empty in that shot - projectUI gates the button on
`window.require`, so it is absent in a plain-Chromium probe and present in Electron.
Not a regression from this card.

## Open for the user

Copy call only: are these the 50 quotes he wants, and does the italic + uppercase
attribution treatment read right in the hero.
