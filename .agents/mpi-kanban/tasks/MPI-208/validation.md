# MPI-208 Validation

## Phase 3 — generationService on store (Option A) — LIVE-VERIFIED 2026-07-06

**Verify mode:** user-ux (status bar / Cue-Loop-Stop feel need the user's hands).

**Auto (green):**
- `node tests/generation-store.test.cjs` → 18/18 (14 prior + T15–T18 Phase-3 integration contracts: Stop-promotes-next / loop-refire-chain / two-lane-drain-isolation / stop-before-ack-drain).
- `node tests/resolve-model-deps.test.cjs` → 14/14.
- Adjacent suites (comfy-needs-restart, download-completion) green.
- `node --check` on both edited files → parse OK.
- `eslint` on both edited files → clean (app-lifetime store subscription carries the established `mpi/require-destroy-on-events` disable + rationale).

**Live (user, in Electron app) — all 5 acceptance scenarios PASSED:**
1. **R05 multi-cue:** Cue ×3 → Stop running → next promotes, pending intact; repeated Stop drains one at a time.
2. **R07 trash:** clears pending only; running untouched.
3. **R18 Gallery Stop:** single Cue → Stop → status bar returns to IDLE (the strand-fix — bar used to hang forever).
4. **R04 loop:** hold-arm → 2 drains → tap-disarm mid-run → stops; no re-fire storm.
5. **R08 two-lane:** remote + local concurrent → Stop each independently → other lane unaffected.

**Uncommitted.** Phases 4 (UI derived from store) + 5 (reconcile + regression sweep + docs) remain.
