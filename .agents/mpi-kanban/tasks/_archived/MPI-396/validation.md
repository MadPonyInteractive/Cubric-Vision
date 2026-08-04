# MPI-396 Validation

## Status: SHIPPED, test-verified, and LIVE-PROVEN on the local engine 2026-07-30T00:19Z.

## What is proven

- `node --test tests/*.test.cjs` → **298/298, 0 fail** (293 baseline + 5 new).
- **Negative control:** with `installStore.js` + `downloadManager.js` reverted to HEAD,
  `tests/uninstall-store-settle.test.cjs` is **1 pass / 4 fail**; restored → 5/5. The one that
  passes both ways is deliberate — it pins that MPI-276's `DONE_TTL_MS` belt still prunes a job
  nobody uninstalled, so it MUST pass in both states.
- eslint clean on both source files and the test.
- The engine-split guard pins `store.dropModel(modelId)` at **exactly two** call sites and their
  position relative to each `download:uninstalled` broadcast, so a future one-leg fix fails loudly.

## The live proof — local engine, 2026-07-30T00:19Z–00:21Z

Driven over HTTP against the running app (PID started 00:26 local, after the fix landed on
disk at 00:06, so the main process carried it). Target was `nvidia-pid` / dep `vae-sd3`
(168MB, owned by **no other model** so the shared-dep guard cannot spare it, and **absent
from disk beforehand** so the run restores the machine to its starting state — it is not
one of the user's installed weights).

**Round 1 — the precondition the first attempt never had.** Install, then poll
`/comfy/downloads/status` every 400ms and fire the uninstall the instant the job read
`complete` *while still listed* (gap: sub-millisecond, scripted — no human reaction time):

```
+0.12s  install POST 200
+4.21s  poll -> complete 100% v10577      <- job listed AND complete
+5.44s  uninstall POST 200 removed=[{"depId":"vae-sd3"}]   (file really deleted)
+5.44s  job AFTER uninstall: GONE, store v10579
+9.45s  job after +4s: GONE
```

Pass, but **not yet attributable**: the job's one dep was on disk at that moment, so
`reconciler.js:139` could have put `nvidia-pid` in `confirmedInstalled` and pruned it if a
15s tick had landed inside that window — roughly a 1-in-11 chance. Same trap as the first
attempt, one layer subtler. Round 1 therefore proves **no regression**, nothing more.

**Round 2 — attribution closed by removing every other prune path.** Same install, then the
dep was deleted **out of band** once the job settled. That makes
`nonNode.every(isInstalled)` false forever, so `confirmedInstalled` can never contain the
model; the job was younger than `DONE_TTL_MS` (120s), so the belt could not drop it; and no
job was active, so the reconciler poll self-idles and never runs the belt anyway. That is
**exactly the immortal-job state the bug leaves behind**:

```
+4.13s  job settled: complete, store v21093
+4.14s  dep removed out of band -> on disk: false
+9.15s  hold  5s: job STILL LISTED: complete 100% v21093
+14.16s hold 10s: job STILL LISTED: complete 100% v21093
+19.16s hold 15s: job STILL LISTED: complete 100% v21093     <- past a full 15s tick
+24.18s hold 20s: job STILL LISTED: complete 100% v21093
+29.19s hold 25s: job STILL LISTED: complete 100% v21093
+29.25s uninstall POST 200 removed=[] kept=[{"vae-sd3","reason":"already-absent"}]
+29.25s job AFTER uninstall: GONE, store v21094 (was 21093)
+32.27s job after +3s: GONE
```

The store version was **frozen at 21093 for 25 seconds** with a terminal job sitting in it —
defect (3), the self-idling reconciler poll, observed live rather than inferred. Then the
uninstall bumped it **exactly once** (`dropModel`'s `_bump`) and the job vanished inside the
POST. With the file absent, no prune path existed: `store.dropModel()` is the only code that
can have dropped that job.

Backend log for the same run, confirming the LOCAL leg (not the remote one) executed:

```
00:19:12.633 [download] Starting download for vae-sd3 from https://models.cubric.studio/...
00:19:16.643 [download] _startPendingDeps: 0 queued deps, 0/3 active
00:19:17.950 [download] uninstall: moved to trash G:\CubricModels\vae\sd3_vae.safetensors
00:19:17.950 [download] uninstall nvidia-pid: removed 1, kept 0 universal, 0 shared, ...
```

Disk state at the end is identical to the start (`vae-sd3` absent). The **remote** leg is
covered by the engine-split guard test plus the round-2 store evidence; per the standing
rule its one live confirmation is folded into the MPI-385 Pod-session brief rather than
holding this card open.

## Historical: why the FIRST attempt was vacuous

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

## The recipe, for the next store-lifecycle bug

Reusable, and the reason round 2 worked. Drive it over HTTP from one script so the
poll→act gap is milliseconds, never human reaction time:

1. Full app restart (`routes/` is main-process — Ctrl+R will not pick a route fix up).
   Confirm the process StartTime post-dates the file mtime.
2. Pick a dep that is **absent from disk and owned by exactly one model**, so the run is
   reversible and the shared-dep guard cannot interfere. `nvidia-pid` / `vae-sd3` (168MB) fits.
3. Install it, polling `/comfy/downloads/status` until the job is `complete` **and still listed**.
4. **Kill the competing explanations before acting** — here, remove the dep from disk so
   `confirmedInstalled` can never form, then hold past a full 15s tick and show the store
   `version` frozen. A test that cannot distinguish the fix from the pre-existing prune is
   still vacuous even when it passes.
5. Act, then re-read status in the same script: assert job absent AND `version` bumped by
   exactly one.

## Not to be confused with

- **MPI-397** — the several-second lag before the tile changes section. Same uninstall, different
  root (install-state is a disk stat; on remote a wrapper round trip). Unfixed by design.
- **MPI-398** — the blank grid on a cold renderer. Renderer-side; `MPI-396` touches `routes/` only.

---

## REMOTE LEG — PASSED LIVE 2026-07-30 (MPI-385 item 6, Pod qrpnumt8p1rm31, L4)

User uninstalled **klein-4b** on the volume through the Model Library (server log:
`remote uninstall klein-4b: removed 14, kept 7 universal, 0 shared, 0 model files`).
A 300ms poll of `/comfy/downloads/status` across the whole window: **no klein job ever
appeared** and `version` did not churn — there was nothing for a tile to draw a 100% bar
from. The card moved sections in ~3s with no bar (the residual lag is MPI-397's, measured
on the same action). Reinstall through the tile then ran clean: live progress at 203MB/s
off R2 in-datacentre, job reached `complete`, card moved instantly. Do-not-reopen
condition never triggered.
