# Validation

Validated 2026-06-02 (commit 7df039d).

## Method

Dry-run of `/github/create-issue` with stubbed axios (no real GitHub Issue created), plus `deriveStage` unit table and lint/parse checks.

## Results

- `deriveStage()` rule table — 10 cases pass (0.0.1→alpha, 1.2.0→beta, 2.0.0→release, unparseable→alpha, etc.).
- Backend `routes/system.js` parses; touched frontend files lint clean (eslint exit 0).
- Dry-run for 4 versions: labels = `bug`, `auto-report`, `stage:<x>`; issue body includes App version + Stage lines. Verified for 0.0.1/1.2.0/2.0.0 and missing-build (→ version `unknown`, stage `alpha`).
- Client-lie override: client sent `stage:release` on a `0.0.1` build → server emitted `stage:alpha`. Untrusted client value ignored.
- Label 422 degrade: first POST 422 → retried with `['bug']` only, issue still created, `success:true`, warn logged.

## Deferred

- `build:<hash>` label → MPI-8 portable-build git-SHA injection (handoff note in MPI-8 brief).
