# MPI-388 — Gallery re-entry keeps a media-hungry operation selected

User-reported 2026-07-29, hit live.

## What happens

1. User works in the **History** workspace on an entry, with an op that needs media selected
   (edit / i2i / upscale — History always has a selected entry, so these are all legal there).
2. User goes **back to the Gallery**.
3. The PromptBox is empty — no media chip — but the op strip is **still** on the media-hungry op.
4. User presses Run. Instead of generating, they get a toast telling them an image is missing.

The toast is correct behaviour in isolation (it is the MPI-337 `requiresMask` / missing-input
guard doing its job). The defect is that the user never chose this state — it survived a
workspace change — and the app offers no hint about how to get out of it. In the user's words, a
less literate user would not know what to do.

## Expected

On entering the Gallery workspace:

- PromptBox holds **no** media → drop the operation back to **t2i**.
- PromptBox **does** hold media → leave the operation exactly as it is. Do not touch it.

## Why this is small

**The fallback already exists and already ships.** Clearing the last image from the PromptBox in
the Gallery drops you to t2i on its own, and the op you chose comes back the moment you add an
image again — that is in the 1.3 changelog already
(`docs/releases/UNRELEASED.md`, "Pick what you're making from a strip"). This card is about
firing that *same* path on workspace re-entry, **not** inventing new behaviour.

So the work is: find where the Gallery workspace mounts / becomes active, and evaluate the same
media-presence predicate the clear-last-image path uses.

## Where to look

- `js/components/Organisms/MpiPromptBox/MpiPromptBox.js` — `_refreshOpOptions()` and
  `_emitMediaChange()` are the two functions MPI-337 rewrote. The clear-last-image → t2i drop
  lives on that path; re-use it, do not fork it.
- `docs/generation-lifecycle.md` — op/media gating contract.
- `.claude/rules/workspaces.md` — where a workspace becomes active, which is the hook point.

## Traps carried from the neighbouring cards

- **MPI-337 deliberately KILLED a force-DOWN.** `_refreshOpOptions` used to force the op down on
  media loss and it caused the detail→upscale bug. Do not reintroduce a blanket force. The rule
  agreed there is: op changes only on media-**add** force-UP and on Reuse; a lost requirement
  leaves the op selected and Run toasts. This card is a **narrow, explicit exception scoped to
  Gallery entry** — argue it as such, do not widen it.
- **MPI-351**: the History workspace generates from the SELECTED entry, and PromptBox chips are
  out of its dispatch path. Do not "fix" this by pushing the History entry into the PromptBox as
  a chip — that is the bug MPI-351 removed.
- Sibling card **MPI-377** is the other PromptBox media-state defect (media dropped on History
  produces no entry). Same area; check for overlap before editing.

## Acceptance

- [ ] Enter History with an edit-class op, return to the Gallery with an empty PromptBox → op strip reads t2i.
- [ ] Same trip with an image still in the PromptBox → op strip is unchanged.
- [ ] The MPI-337 detail→upscale regression does not return (op is not forced down on plain media loss inside the Gallery).
- [ ] Negative control: a test that fails against unfixed HEAD.
