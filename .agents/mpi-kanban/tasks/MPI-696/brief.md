# MPI-696 - Landing hero quotes

The hero blurb explains what the app is to someone who already opened it. Dead copy.
Replace it with a short artist/creativity quote that changes every launch.

- 50 curated quotes with attribution, spread over image / film / music / writing / general.
- Draw order is a shuffled deck persisted in localStorage (`mpi_hero_quote_queue` =
  `{ order, pos }`). One draw per app boot, not per navigation back to the landing page.
- Deck exhausted -> reshuffle, and the first card of the new deck is never the last one shown.
- Quote list edited -> length mismatch reshuffles, so a stored deck can never index off the end.
