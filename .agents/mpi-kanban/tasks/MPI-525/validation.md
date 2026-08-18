# MPI-525 — validation

## Unit / route

1. `node tests/curated-deps-pending.test.cjs` — `curatedDepsPending()` agrees with the
   install branches in all three states (no marker / matching hash / stale hash).
   **Result: 3/3 OK.**
2. `routes/comfy.js` on a spare port → `GET /comfy/deps-pending` answers
   `HTTP 200 {"pending":false}` (marker matches the shipped lock — correct).
   **Result: pass.**
3. `npm test` — 629/629. `npx eslint` on every touched file — clean.

## Live install run (2026-08-18)

Own isolated instance (`npm run app:isolated`, own profile + port), engine down, nothing
on 48188, no other app running. The real curated pass was forced by staling the marker
(`deadbeefdeadbeef`) in `engine/ComfyUI_windows_portable/python_embeded/.cubric_python_deps`,
then calling the production path `ComfyUIController.ensureServerRunning({})` from the
renderer and sampling the modal every 100 ms.

**Run 1 (label only) — found a second defect.** Modal read "Installing Python packages…"
for the FULL 46.8 s, but the log shows pip ran `08:02:24.4 → 08:02:26.9` (2.5 s). The
remaining ~44 s was ComfyUI booting under an install label — the same class of mislabel
the card exists to fix. Fixed: the controller re-emits a plain `comfy:starting` once
`/comfy/start` answers, and `MpiStartingComfy.show()` now assigns the copy BEFORE its
idempotent guard so a second call relabels a modal that is already up.

**Run 2 (after the fix) — correct.** Sampled transitions:

| t (ms) | title |
|---|---|
| +0.1 s  | Installing Python packages… / First engine start only — this can take several minutes. |
| +1.6 s  | Starting ComfyUI Engine… / This may take a few moments… |
| +24.8 s | (modal gone — `ready: true`) |

Matches the log exactly: `installing curated python deps` 08:04:47.6 → `marker stamped`
08:04:49.1. Marker restamped to the real hash `48d7ca7ee6226c88`; `/comfy/deps-pending`
flipped to `{"pending":false}`; `ensureServerRunning` resolved `{ ready: true }`.

Cleanup: engine stopped, instance killed, marker left at the correct hash, backup removed.

**Not covered:** a true from-scratch engine install where pip downloads rather than finds
everything satisfied. The pass ran for real here, just fast (2.5 s) — the label logic is
identical and both phases were observed live.

**Note:** a concurrent session (MPI-548) shares the repo's `playwright-cli` browser; its
`goto` swapped the page and wiped the globals of a third, negative-control run. That run
was discarded, not counted. Runs 1–2 were on this session's own instance (port 58394).
