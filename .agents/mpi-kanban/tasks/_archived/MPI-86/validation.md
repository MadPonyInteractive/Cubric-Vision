# MPI-86 Validation

Status: **ACCEPTED — USER live-verified 2026-06-15.**

USER ran a live RunPod connect: the Cancel button appeared mid-connect, pressing
it cancelled the in-flight connection (toast "Connection cancelled."; status →
"Remote engine: stopped"; hint "Pick a GPU and Connect again, or try another
card."), and a fresh Connect afterward worked. Checks 1 + 3 confirmed on hardware.

## Done in-session (Claude)

- `node --check` + ESLint pass on `MpiSettings.js`.
- Settings panel mounts in the running dev app (http://127.0.0.1:3000) with no JS
  error (only a benign password-field VERBOSE notice on the API-key input).

## What Claude could NOT verify (USER must)

A live RunPod account + a real Pod create are required, and per the brief all live
Pod ops are USER-driven. The three behavioral checks below need a real connect:

1. **Cancel a stuck boot.** Enable RunPod, pick a GPU + volume, Connect. While the
   button reads "Cancel", press it → the half-started Pod is deleted (verify in the
   RunPod console: no `cubric-vision` Pod left billing), status returns to
   "stopped", Connect re-enables.
2. **GPU-switch auto-cancel.** Start a Connect, then pick a different GPU mid-connect
   → the in-flight Pod is deleted, the new GPU is adopted, Connect works on the new
   card with no second Pod.
3. **Healthy boot unaffected.** A normal Connect that boots inside ~5 min completes
   to "ready" with no premature cancel and no spurious "taking too long" prompt
   (the watchdog threshold sits past the normal first-boot sageattention compile,
   MPI-64 L3).

## Notes

- No backend route added — `/remote/pod/delete-active` already stops billing +
  clears `_starting`. Cancel is purely frontend orchestration.
- The watchdog only PROMPTS; it never auto-cancels, so a slow-but-healthy host is
  never killed out from under a working boot.
