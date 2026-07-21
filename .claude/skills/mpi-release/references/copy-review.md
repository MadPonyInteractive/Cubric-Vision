# Copy-review gates — user rewrites the user-facing text

Two surfaces in the release flow are read by **end users**, not developers. Left
to an agent, they get written in dev-speak ("refactored the X subsystem", "fixed
the path-separator bug in the model resolver") — accurate but wrong register for a
user opening the app or a release page. The user reviews and rewrites both before
they ship. These gates are mandatory; do not publish the copy until the user has
signed off.

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

## Gate 2 — GitHub release body

The notes users read on the GitHub Release page (and the source for any
announcement copy). It bundles the accumulated changelog blocks since the last
release — a release that skips versions lists all of them.

- After drafting the body from the archival `docs/releases/*.md` blocks, **stop
  and present the rendered text** to the user.
- The user rewrites it into user-friendly language. Keep within the claim
  boundary in `docs/releases/github-release-checklist.md` (image + video gen
  allowed; no unshipped-roadmap claims; Vision is local image/video, not an
  assistant) and include that checklist's platform-disclosure block.
- Apply edits, then publish with `gh release create`.

## Why this matters (don't skip it)

The user has been burned before by dev-register copy shipping to users (e.g. a
download page that told users to "update in place with the built-in updater" when
that wasn't the right path). The review gate is the safeguard. When in doubt,
draft it, show it, wait. Never treat your first draft of user copy as final.
