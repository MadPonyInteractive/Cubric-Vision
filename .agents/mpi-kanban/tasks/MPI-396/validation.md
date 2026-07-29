# MPI-396 Validation

## Status: SHIPPED + test-verified. Live proof still OWED. Do not close.

## What is proven

- `node --test tests/*.test.cjs` → **298/298, 0 fail** (293 baseline + 5 new).
- **Negative control:** with `installStore.js` + `downloadManager.js` reverted to HEAD,
  `tests/uninstall-store-settle.test.cjs` is **1 pass / 4 fail**; restored → 5/5. The one that
  passes both ways is deliberate — it pins that MPI-276's `DONE_TTL_MS` belt still prunes a job
  nobody uninstalled, so it MUST pass in both states.
- eslint clean on both source files and the test.
- The engine-split guard pins `store.dropModel(modelId)` at **exactly two** call sites and their
  position relative to each `download:uninstalled` broadcast, so a future one-leg fix fails loudly.

## What is NOT proven, and why the one attempt was vacuous

Attempted live 2026-07-30 on CPU Pod `omi9588i0gymlu` after a full app restart. Install of SDXL
Realistic completed, the user uninstalled, and the tile showed the **Install chip with no bar** —
which *looks* like a pass but proves nothing:

```
00:28:44  engine:assets=complete  sdxl-realistic=complete
00:28:58  engine:assets=complete            <- job pruned 14s after completing
00:31:37  engine:assets=complete            <- still absent; uninstall happened AFTER this
```

The job had already left the store via the **`confirmedInstalled` fast-exit** — the path that
always worked and that this change does not touch. So `dropModel` found no job, returned `false`,
and did nothing. The run demonstrates **no regression**; it is not evidence of the fix.

**The precondition the bug needs is an uninstall that lands while the DONE job is still in the
store.** That window is not deterministic: in the MPI-395 session the job was still present
**101 seconds** after completing (poll log in `tasks/MPI-395/validation.md`), which is why the
100% bar reproduced first try; here it was gone in 14.

## How to prove it — LOCALLY, no Pod required

`dropModel` is called on **both** legs, so the local engine exercises the same store settle. This
does not need a Pod, a network volume, or any cloud spend.

1. Full app restart (`routes/` is main-process — Ctrl+R will not pick the fix up).
2. Install any small model on the LOCAL engine.
3. Poll `curl http://127.0.0.1:3000/comfy/downloads/status` and wait until the model's job reads
   `"status":"complete"` — **it must still be listed.**
4. **While it is still listed**, uninstall the model.
5. **PASS:** the tile shows the `↓ INSTALL` chip, the job disappears from
   `/comfy/downloads/status` immediately, and it is still `↓ INSTALL` after Ctrl+R.
   **FAIL:** a full 100% progress bar where the chip belongs.

Step 3 is the whole test. Skipping it is what made the first attempt worthless.

The remote leg then wants one confirmation on the next Pod session — fold it into MPI-385 rather
than holding a card open for it (standing rule: a card whose only leftover is remote closes on
local evidence and adds a line to the MPI-385 brief).

## Not to be confused with

- **MPI-397** — the several-second lag before the tile changes section. Same uninstall, different
  root (install-state is a disk stat; on remote a wrapper round trip). Unfixed by design.
- **MPI-398** — the blank grid on a cold renderer. Renderer-side; `MPI-396` touches `routes/` only.
