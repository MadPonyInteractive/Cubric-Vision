# MPI-629 — Update button in Settings

**Fabio, 2026-08-27.** Raised in the Cubric-Prompt repo immediately after
verifying Prompt's own boot-time update popup. It is a **family-wide** pattern —
Vision, Prompt, Studio, Audio — not a Vision-only idea. Prompt's half is carded
there as **MPI-34**. Build the same shape in both; do not invent a second one.

## The ask

Every Cubric app should carry an **Update control in Settings**. The boot popup
then stops being the only route and becomes a pointer to it — "a new version is
available, you can update from Settings" — rather than the sole way in.

## Why it is more than a nicer UI

**The dismiss-mute currently has no exit.** `js/services/updateChecker.js` mutes
after `DISMISS_LIMIT = 3` dismissals of the same version
(`Storage.getUpdateDismissed()` / `setUpdateDismissed()`), and stays quiet until
a newer version lands. That is correct behaviour for a nag, but as shipped it
means:

- A user who pressed **Later** three times has **no way back to that update**
  short of clearing localStorage.
- A user who *wants* to update **cannot ask**. They can only wait to be offered.

Nobody hit this because the popup was the only route, so a muted user simply
read as a user who had opted out. A Settings control turns the mute from a dead
end into what it was meant to be: *"stop asking, I know where it is."*

Verified live on Prompt 2026-08-27: three dismissals across three reloads, and
the fourth boot was silent — correct, and unreachable thereafter.

## What already exists (this is mostly UI)

Vision already ships the whole update mechanism — this card adds a way to *ask*
for it, not a new updater:

- `js/services/updateChecker.js` — `checkForUpdate()`, the semver compare
  (`compareSemVer`), the dismiss-mute, and `reportFailedUpdate()`.
- IPC: `check-for-update`, `run-update`, `update-last-result`.
- `scripts/build-portable.mjs` + the updater scripts.

So the work is: a Settings control that calls the same three channels, plus a
rewording of the existing dialog. **Read `updateChecker.js` before touching
anything** — its ordering is load-bearing and the reasons are in its header.

## Shape (suggested, not locked)

1. **Settings → an Update row**: shows the current version, a *Check for
   updates* action, and the outcome inline (up to date / vX.Y.Z available →
   Update now / check failed, with the reason).
2. **A manual check must ignore the mute.** The mute exists to stop *unsolicited*
   prompts. A user who clicked the button has solicited it — never answer their
   click with silence. This is the one rule most likely to be got wrong.
3. **A successful manual update should clear the dismissal record** for that
   version, so state does not linger.
4. **Reword the boot popup** to point at Settings. Keep it a real offer (OK runs
   the update) — the pointer is the *fallback* wording for the muted case, not a
   replacement for the working path.
5. **Non-portable builds**: `check-for-update` returns `portable: false` in a dev
   run. The Settings row must say something honest there rather than appearing
   broken or silently doing nothing.

## Ordering note

Prompt (MPI-34) is **blocked on not having a Settings surface at all**; Vision
already has one, so Vision can go first and Prompt can copy the settled shape.

## Verify

- With the version muted (3 dismissals), the Settings button still finds and
  offers the update.
- A failed check surfaces its reason in the row, not a silent no-op.
- A dev/non-portable run says so honestly.
- The boot popup still behaves exactly as before for a user who has not muted it.
