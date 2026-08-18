# MPI-525 — validation

1. `node tests/curated-deps-pending.test.cjs` — `curatedDepsPending()` agrees with the
   install branches in all three states (no marker / matching hash / stale hash).
   **Result: 3/3 OK.**
2. `routes/comfy.js` on a spare port → `GET /comfy/deps-pending` answers
   `HTTP 200 {"pending":false}` on this box (marker matches the shipped lock — correct).
   **Result: pass.**
3. Live modal copy on an isolated app instance: emit
   `comfy:starting {engine:'local', phase:'python-deps'}` and read the rendered title/text,
   then emit it again with no phase and confirm the default copy returns.
   **Result: pass.** Isolated instance on :53767 — phase-tagged emit rendered "Installing Python packages... / First engine start only - this can take several minutes." with the spinner up; a following plain emit rendered the default "Starting ComfyUI Engine... / This may take a few moments...".
4. `npx eslint` on every touched file — clean.

5. `npm test` — 629/629 pass.

Not covered: a REAL fresh install paying the pass end to end (needs a wiped marker plus a
multi-minute pip run). The predicate is unit-tested in all three states and the label is
verified live, so what remains is only the wall-clock.
