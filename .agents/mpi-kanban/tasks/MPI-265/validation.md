# MPI-265 Validation

**User-verified in running Electron app (2026-07-12).**

- Generating card: mascot idle big/center (replaces spinner) → shrinks + slides bottom-right on first preview → happy pop center + fade on done. idle↔greet flip at random 4-8s confirmed.
- User reaction: "he's so cute. I love it."
- Continuing/finish card ("GENERATING FINAL…"): attempted mascot swap but it showed neither mascot nor spinner (Finish rebuilds cards; timing-fragile). Reverted to the original spinner per user decision — different process, not worth the code. Only the primary generating card carries the mascot.
- No timer leak observed across repeat gens / nav-away (flip timer stopped on every `_generating=false` path).
