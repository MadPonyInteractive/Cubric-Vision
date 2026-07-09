# Copy-review gates — user rewrites the user-facing text

Two surfaces in the release flow are read by **end users**, not developers. Left
to an agent, they get written in dev-speak ("refactored the X subsystem",
"fixed the path-separator bug in the model resolver") — accurate but wrong
register for a user opening the app or a download page. The user reviews and
rewrites both before they ship. These gates are mandatory; do not upload or
commit the copy until the user has signed off.

## Gate 1 — in-app changelog (`js/data/releaseNotes.js`)

Shown once per `APP_VERSION` by `MpiChangelogDialog` the first time the app opens
after an update. It's the user's "what changed" on launch.

- After `mpi-version-bump` writes the `RELEASE_NOTES['<ver>']` block, **stop and
  present it to the user** rendered the way the overlay shows it (kicker
  `<Stage> · v<ver>`; sections in fixed order Breaking → Important → What's new →
  Fixes → Engine; each item plain text — no markdown processing).
- The user edits for tone/clarity (feature-benefit framing, not implementation
  detail). Apply their edits to `releaseNotes.js` AND the archival
  `docs/releases/*.md` so the two stay aligned.
- Only then run `npm run release:approve` (writes the
  `docs/releases/.approved-<ver>.json` token the build gate checks) and
  `npm run release:check`.

## Gate 2 — Cloudflare download page (`index.html`)

The page Pro/Early-Access users land on to download. Tier-neutral (never says
"Pro" — the same page serves EA later).

- After drafting the index (copy prior version's, swap version/files/sizes +
  one-line what's-new), **stop and present the rendered page text** to the user.
- The user rewrites the "what's new" line and any instructions into
  user-friendly language. Apply edits, then upload.

## Why this matters (don't skip it)

The user has been burned before by dev-register copy shipping to users (e.g. a
v1.0.1 Cloudflare page that told Pro users to "update in place with the built-in
updater" — wrong, that's the GitHub path). The review gate is the safeguard. When
in doubt, draft it, show it, wait. Never treat your first draft of user copy as
final.
