# MPI-120 Checklist

Implementation done. Items below are USER VALIDATION — eye-test each by running
the app with the network OFF (Wi-Fi off / ethernet pulled / airplane mode).
Full recipe in validation.md.

- [x] Implementation: netCheck.js + 2 preflights + 3 hang fixes (parsed, unit-tested, lint-clean)
- [ ] **Download offline** → install any model with network OFF → a "You're offline" **warning toast** appears within ~4s. NOT the GitHub-report error dialog. NOT a job stuck at 0%.
- [ ] **RunPod Connect offline (Settings)** → Settings → RunPod → Connect with network OFF → "You're offline" warning toast + the engine hint updates + button returns to "Connect", within ~4s. NOT a ~32s freeze.
- [ ] **RunPod auto-connect offline (boot)** → with a saved warm Pod + network OFF, launch the app → StatusBar shows "You're offline — staying local", app is usable locally. NOT a long hang / confusing error popup.
- [ ] **Back online** → turn network ON → Connect from Settings works normally (no added lag beyond ~100ms).
- [ ] (Optional, harder) **TCP black-hole** → a dep URL firewall-dropped → download FAILS within ~30s instead of hanging at 0% forever.
