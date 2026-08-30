# MPI-661 — checklist

- [x] `README.md` § What you'll need — states the OS floor above the VRAM/RAM table, with the
      reason a Mac user actually needs: every M-series Mac can already run 14+, so this asks
      for an update, not new hardware.
- [x] `docs/releases/UNRELEASED.md` § Important changes — user-facing line, so 2.0 carries it.
- [x] Say WHY it is 14 and not Electron's 13 — written into `dev_configs/python_deps.in`,
      beside the marker someone would otherwise "fix", with the command to re-measure and the
      note that bounding the bitsandbytes marker just moves the failure to `embreex`.
- [x] `npm test` 798/798, and `compile-node-deps.mjs --check` still green (the comment edit
      does not disturb the parser; `python_deps.txt` unchanged).
- [ ] **Docs site is NOT done and cannot be done from here.** `docs.cubric.studio/vision/
      installation/` lives in the Cubric Studio (Docs) repo — hard no-push. Needs a card there,
      alongside the existing docs-site card (MPI-12 in that repo).
