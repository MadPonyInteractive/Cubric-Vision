# MPI-281 Validation

**Verify mode:** user-ux

## Automated (done)
- ESLint on both edited files: 0 errors (1 pre-existing warning at MpiPromptBox.js:1357, unrelated).
- `filterNoInputOps` confirmed set ONLY by MpiGroupHistoryBlock video-history mounts (3 sites, incl. entry-loaded L1917) → guards can't regress T2I image models.

## Changes
- `MpiPromptBox.js`: two guards keyed on `_context.filterNoInputOps` — (a) `_emitMediaChange` no longer switches an empty box to a text op when text ops are hidden; (b) `_pickOpForModel` fallback lands on the first media op instead of `supported[0]` when text ops are hidden. Kills the "Select..." op collapse in History video-continuation mode.
- `MpiToolOptionsPrompt.js` + `.css`: added "Continue video" section header above the action buttons; renamed "Create new" → "New shot".

## USER-VERIFIED 2026-07-14
User confirmed in running Electron app (LOCAL): Wan 2.2 Smooth AND LTX 2.3 both
show "Image to Video" with empty frames (no "Select..." collapse); Extend + New
shot both run generations (extended_001 + i2v_ms_021 produced); Start/End frame
manual override works; CONTINUE VIDEO header + Extend / New shot labels render.
Debug probes removed post-verification; ESLint 0 errors.

## User checks (in running Electron app, port 3000)
1. Open History on a video item with an I2V-capable model (e.g. Wan 2.2 Smooth), leave Start/End frames EMPTY.
2. Operation stays "Image to Video" — NOT "Select...".
3. Press Extend → runs a continuation gen.
4. Press New shot → runs a standalone gen.
5. "CONTINUE VIDEO" header renders above Extend / New shot; buttons read "Extend" / "New shot".
6. Frame slots still accept a manual first/last override for a from-scratch I2V (regression check).
