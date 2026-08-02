# MPI-382 — validation

Verify mode: **user-ux**.

## Step 1 — the preview contract: VERIFIED 2026-08-02

**Automated, before asking:**

- `node --test "tests/*.test.cjs"` → **310 pass / 0 fail** (was 305 — `preview-contract.test.cjs`
  adds 5).
- `npm run lint` → 0 errors, 18 warnings; `npm run lint:components` → 0 errors, 3 warnings. All
  warnings pre-existing (`heroStats.js`, `preloadStyles.js`, `MpiAppLibrary.js`, `MpiPromptBox.js`)
  and none in a file this card touched.
- **Negative-controlled** by sabotaging the real source and confirming the guard bites, then
  restoring: removing the `mountOptions` call failed test 1; removing the thumb-strip clear failed
  test 3; making the discard branch touch `manualCanvas` failed test 4. The first sabotage attempt
  silently MISSED (a literal `\n` replace against a CRLF file, and a second one hit an earlier
  `_autoMaskPicks.clear()` in `_resetAutoPickStateWithToast` instead of the discard branch) — a
  negative control that quietly does nothing reads exactly like a passing test, so both were
  re-run precisely.

**User, in the running app:** no flicker on a preview-less tool switch; the undo system still
behaves; brush strokes survive a switch while the green preview does not. User's words: "no
flickers, undo system works as well".

## Step 2 — the Adjust tool: NOT STARTED

Nothing to validate. The card stays in `doing`.
