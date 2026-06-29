# NOTE (address later) — bottom-left "MODELS X / 7" undercounts partial installs

**Observed (2026-06-29, remote CPU download Pod, MPI-140 session):**
Network volume has 3 models present — SDXL Realistic, LTX 2.3, Wan 2.2 — but the
bottom-left hero-stats UI shows **"MODELS 2 / 7"**.

**Cause:** Wan 2.2 has ONLY text-to-video installed (i2v not yet installed). The
count treats a model as "installed" only when it is FULLY installed; a
partially-installed model (some ops/deps present, others missing) is NOT counted.
So Wan-t2v-only drops out of the numerator → 2/7 instead of 3/7.

**Question to decide:** what should the count mean?
- (a) Fully-installed models only (current behaviour) — Wan-partial excluded.
- (b) Any model with ≥1 op/dep installed — Wan-partial counted (→ 3/7). Matches
  the model-manager card which shows Wan under "Installed Models" with a
  "Partially Installed" / op state.

The model-manager list and the hero-stats count disagree (list shows Wan as
present/installed-ish, count does not). Pick one definition and make both agree.

**Where:** hero-stats count = `js/shell/heroStats.js` (the "MODELS X / Y" render).
Compare against how `MpiModelManager` sections "Installed" (`_installedOpsOf` /
`m.installed === true || installedOps.length > 0`). Likely the fix is to align
heroStats' installed-count predicate with the manager's (count a model installed
when `installed === true OR ≥1 op installed`).

**Not carded** (user is reducing card count) — addressed inline when convenient.
Related: the partial-install state work in this session (MPI-140 commit 0c54469).
