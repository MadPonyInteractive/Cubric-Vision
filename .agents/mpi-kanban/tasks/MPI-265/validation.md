# MPI-265 Validation

**User-verified in running Electron app (2026-07-12).**

- Generating card: mascot idle big/center (replaces spinner) → shrinks + slides bottom-right on first preview. idle↔greet flip at random 4-8s confirmed.
- User reaction: "he's so cute. I love it."
- **Happy-at-end DROPPED (14dddbb2):** the temp generating card is destroyed + rebuilt on `generation:complete`, so a done/happy pop had no stable card to play on. Not worth fighting the rebuild — the success toast already carries the happy mascot (MpiToast success → happy.png). Card keeps idle + cooking only.
- Continuing/finish card ("GENERATING FINAL…"): attempted mascot swap but it showed neither mascot nor spinner (Finish rebuilds cards; timing-fragile). Reverted to the original spinner per user decision — different process, not worth the code. Only the primary generating card carries the mascot.
- No timer leak observed across repeat gens / nav-away (flip timer stopped on every `_generating=false` path).
