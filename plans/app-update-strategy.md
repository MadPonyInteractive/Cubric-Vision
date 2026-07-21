# App Update Strategy

> **SUPERSEDED (2026-07-21) — historical record only.** The Patreon tier model
> below is retired. Distribution is now GitHub-only: one master branch, bump the
> version digit, publish a public GitHub Release (full builds + update bundles).
> See `.claude/skills/mpi-release/SKILL.md` and `docs/releases/README.md`.

## Release Tiers & Timeline

- **Tier 3 (Patreon)**: Access 1 month before official release
- **Tier 2 (Patreon)**: Access 2 weeks before official release  
- **Public Release**: Official GitHub release for all users

Example timeline for v0.1.0:
- April 19: Tier 3 early access (30 days early)
- May 3: Tier 2 early access (14 days early)
- May 17: Public release on GitHub

## Key Constraints

1. **No Patreon integration in the app** — safety & complexity reasons
2. **No internet connectivity required** — app must work offline
3. **Prioritize user simplicity** — no complex update flows
4. **Desktop distribution** — packaged `.exe` / `.dmg` / `.deb` for each platform

## Architecture Implications

Since there's no in-app Patreon checking:
- Users must manually download from either:
  - Patreon (for early access tiers)
  - GitHub (for public release)
- App itself has **no way to know** which tier the user is on
- Update notifications must be **generic** (no tier-specific messaging)

## Questions to Answer

1. How do Patreon users know when their tier gets early access?
2. Should the app notify users of new releases, or do we rely on Patreon/GitHub emails?
3. What's the simplest UX for telling users a new version is available?

---

*Plan created during brainstorm session on 2026-04-19*
