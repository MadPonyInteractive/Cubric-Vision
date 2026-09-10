# MPI-718 — checklist

Derived from `tasks/MPI-717/plan.md` § Phase 2 and `tasks/MPI-718/brief.md`.

- [x] Repro: extend `startServer()` in `tests/download-retry.test.cjs` with cut knobs (cut N times, real progress between cuts) — the 4th blip was terminal before the fix
- [x] Reset the budget on progress: `_attemptBytes` recorded beside the `'error'` increment, cleared to `_attempts = 0` in `'progress'` once `stats.downloaded` passes it by `RETRY_PROGRESS_FLOOR_BYTES` (8 MB)
- [x] MPI-427 intact: zero bytes on disk still fails immediately, no retry bought
- [x] The floor is the ceiling: a dribble under it still counts `1/3, 2/3, 3/3` and goes terminal — so no separate attempt cap was added
- [x] Folded in (same file, same handlers, found by the repro): a replaced stream's late events reached the live one — an uncaught `TypeError` on MPI-716's `__response` read, and one blip spending two attempts
- [x] `docs/download-manager.md` § MPI-460 — the budget's unit changed, plus the stale-event guard and NDH's `resumeOnIncomplete` finding
- [x] Verify: `node tests/download-retry.test.cjs` 7 passed, `npm test` 917/917, eslint clean, and both captured deps re-read (`qwen3-8b-clip`, `klein-9b-transformer`) — each would read `retry 1/3`
