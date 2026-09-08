# MPI-708 Brief — Rename the product to Cubric Studio

Parent: **MPI-677** (UMBRELLA: consolidate the Cubric family into Cubric Vision).
Gates: **MPI-595** (2.0 release readiness) — 2.0 cannot ship under the old name.

## The decision (Fabio, 2026-09-08)

The Cubric family stopped being separate apps. MPI-677 merges Prompt / Studio /
Audio / @cubric/ui into one product, so the ecosystem name **Cubric Studio** is
no longer spoken for by an ecosystem — it is free for the product that ate it.

- **1.5.0 is the last release named Cubric Vision** (MPI-706, in flight).
- **2.0.0 is the first release named Cubric Studio**, and the rename is a large
  part of what makes it a major.
- The connector/broker die with the merge. If anything survives it is the CLI
  (MPI-593), which is future work.

## Rename the repo — do NOT fork a clean one

Considered and rejected: a fresh `Cubric-Studio` repo with a pointer README on
the old one. GitHub renames 301-redirect the old URL **including the API**, so a
rename keeps everything a fork would throw away:

- ~700 kanban cards and their workspaces, all CI + secrets, `.husky` gates,
  `release-baselines/`, `.approved-*.json`, smoke evidence, release history.
- **Every shipped 1.x client's update path.** `main.js:1250` polls
  `api.github.com/repos/MadPonyInteractive/Cubric-Vision/releases/latest`. A
  rename redirects that call; a fork orphans every install, and a README in a
  dead repo is a README no client ever reads.
- The issue reporter — `routes/system.js:323` `ISSUE_REPO`.

Same logic for the hub repo: **rename it, do not delete it.** Renaming
`Cubric-Studio` -> `Cubric-Connector` frees the name just as well, keeps the
history the CLI may still want, and is reversible. Deleting is not.

## Ordering — rename in the GAP, not at the cut

1. **1.5.0 ships** as Cubric Vision, untouched (MPI-706 closes).
1b. **1.5.1 bridge ships**, still as Cubric Vision — no user-visible change, it only puts a
   wider updater on the fleet's disks. See §C.
2. Rename hub `Cubric-Studio` -> `Cubric-Connector`. **This must be first** —
   it is what frees the name.
3. Rename `Cubric-Vision` -> `Cubric-Studio`.
4. Fix local git remotes, CI references, sibling-repo references
   (`mpi-ci`, `MadPony-Identity`, `Cubric-Prompt`), the macbox/linuxbox clones.
5. 2.0 development proceeds under the new name. The **in-app** rename lands here
   as normal work, not at step 3.
6. **2.0.0 ships** as Cubric Studio.

Why the gap and not the cut: renaming mid-release-cut adds a variable to a
release already running, and renaming after 2.0 ships means the announcement
links at a repo still called Vision. Doing it in the gap gives the whole 2.0 dev
cycle to surface stale references during ordinary work rather than on release
day.

Why the in-app rename is NOT step 3: shipping it in a 1.5.x patch would move
users' userData for a release that carries none of the 2.0 payoff.

## Workstreams

**A. Repo admin** — the two renames above, in order, plus the remote / CI /
sibling reference sweep.

**B. In-app rename** — `js/core/appName.js` and its `appName.cjs` CommonJS twin
already centralise the display name. Also `app.setName('Cubric Vision')`
(`main.js:269`), `package.json` `name` + `productName`, `ISSUE_REPO`
(`routes/system.js:323`), the hardcoded strings in `main.js` (`:51`, `:222`).
253 raw matches repo-wide, but most are workflow JSON, lockfiles and release
baselines — sweep, do not blind-replace.

**C. Heal the installed base** — REWRITTEN 2026-09-08 after Fabio pushed back on the first
draft's two freezes. `plan.md` D1/D3 carry the decided shape; in short:

- A **1.5.1 bridge release** widens the shipped updater so 2.0 can rename its artifacts.
  This works because the updater that runs is the one already on disk (`main.js:1287`
  spawns it from the *installed* root), so 1.5.1's wider pattern is what executes on the
  1.5.1 → 2.0 hop. 2.0 also dual-publishes the legacy filenames once, for anyone who
  skipped the bridge; 2.1 drops them.
- **`Documents/Cubric Vision` is renamed to `Cubric Studio`** on first 2.0 boot, behind a
  resolver that falls back to the old name so a failed rename is harmless.
- **The AppData folder is NOT renamed.** For portable installs — every released build —
  `main.js:283-292` overrides userData to `<portable root>/user-data`, so
  `app.setName('Cubric Vision')` only ever names the dev path.

**D. Mascots and per-op colours** — the dead apps' palettes become
operation/workspace identities, Studio takes the agent mascot. This is a CSS-var
system change against `styles/01_base.css`, not a rename; it deserves its own
sub-card.

**E. Brand surfaces (MadPony-Identity)** — website, docs site, socials, and the
"continued under a new name" messaging. Most of this work does not happen in
this repo.

**F. The 2.0 release note** — why the rename happened: separate apps were
planned, they became one, the ecosystem name is now the product name.

## Knock-on for other cards

- **MPI-595** gains a gate line for this card, and its Gate C answer
  "no migration or compat note owed" must be **re-answered**. That was decided
  on 2026-08-26 when 2.0 meant Flows only. A rename plus a userData move does
  owe users a note.
- **MPI-706** should record that 1.5.0 is the last Cubric Vision release.
- **MPI-259** (Apps v2) rests on the multi-app premise this decision retires.
  Flagged for Fabio, not touched.
