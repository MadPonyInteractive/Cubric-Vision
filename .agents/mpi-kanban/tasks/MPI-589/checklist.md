# MPI-589 Checklist

Fabio, 2026-08-20: *"DevGate can now be removed from the flows. Flows will be available on the
next release. I believe a [flow] needs a button to be accessed quickly. Probably the best place
for that button is between the asset count in the gallery and the project name, right at the
centre top of the gallery. We also need to keep in mind that the tab key now cycles between last
history entry, gallery, and flows."*

## 1 — Un-gate

- [x] `js/shell/projectUI.js` — landing hero nav `Flows` entry no longer behind `APP_CONFIG.dev_mode`
- [x] The gallery radial's Flows path — **DELIBERATELY LEFT DEV-GATED.** The radial also
      carries Components and Restart Engine, which are dev tools; un-gating the ring to reach
      its Flows entry would ship both to users. The new button is the user's door, the radial
      keeps its own for dev convenience.
- [x] `js/shell.js` — the `flows:open` listener comment claims the dev gate is why a staged build
      never opens the library. FALSE once the gate goes; heal it in the same commit
- [x] Grep for any other `dev_mode` reachable from Flows before declaring this done — the only
      remaining `dev_mode` gates are the radial (above), DevTools, the context-menu pair and
      MpiRunpodSettings' dev block. None sits between a user and Flows.

## 2 — The button

- [x] A real `MpiButton` (MPI-582 — never a bare `<button>`), in `MpiProjectName`'s empty centre,
      between the project name and the stats slot
- [x] Shown on the gallery only, or on both gallery and group history — **BOTH.** The bar is
      one instance mounted by the shell for every project page, so gating it to the gallery
      alone would mean a conditional that exists only to hide a working control. Tab reaches
      Flows from the card anyway, so hiding the button there would contradict the ring.
- [x] **ROOT-FIX THE LINT WALL, do not bypass it:** the file carries two pre-existing
      `mpi/no-bare-form-control` warnings (back link line 48, gallery breadcrumb line 75). Any
      commit touching this file fails the pre-commit hook at `--max-warnings=0`. Convert both to
      ghost `MpiButton`s the way `MpiBaseFlow.js` was, keeping their ids/classes on the mounted
      `<button>` so existing selectors and specs still answer
- [x] Strike those two off **MPI-588**'s 29-warning debt list so the peer does not redo them
- [x] Props documented in `js/components/types.js`

## 3 — The Tab ring

- [x] `workspace.flip` becomes a three-state ring: last history entry → gallery → flows → …
- [x] `when`-gate excepts the Flow Library's OWN body overlay while still blocking for the Model
      Library and every other `.mpi-overlay--body` — today Tab is dead the moment Flows opens
- [x] A project with no cards degrades to gallery ↔ flows, never a dead Tab
      (`resolveFlipTarget` returns null there)
- [x] Hotkey description updated — it currently reads "Flip between the gallery and the
      last-used card", which the Hotkeys slide-over shows the user verbatim

## 4 — Ship

- [x] `npm test`, `npm run test:desktop`, eslint `--max-warnings=0` on every touched js file,
      `release:check`
- [x] Desktop spec: the button opens the library, and Tab walks all three states
- [ ] **Release note owed — NOT written here, deliberately.** `releaseNotes.js` is keyed by
      `APP_VERSION`, and the next version does not exist yet; `/mpi-version-bump` mints the
      entry. Copy + digit are recorded in validation.md so the bump cannot water it down.
      ORIGINAL ITEM: — this is the first release where a user can reach Flows at all, so
      it is a 2nd-digit feature bump. Everything on MPI-504/584 was invisible behind the gate;
      this is not
- [x] `docs/shell.md` — the gallery top bar gains a control, and the Tab ring is a shell contract
