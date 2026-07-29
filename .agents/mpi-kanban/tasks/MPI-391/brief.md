# MPI-391 Brief — 1.3.0 cross-platform validation sweep

Created 2026-07-29. **Coordination umbrella.** Every fix currently sitting in
`validating` that is blocked on *"we need a real build"* or *"we need that
hardware"* is collected here, so a single testing day closes them instead of
each card rotting separately.

This card owns no code. It owns the **order**, the **evidence**, and the
**close-out** — each item is verified, then written back into its OWN card's
`validation.md`, then that card moves.

## Why now

The maintainer has, on 2026-07-29:

- a clean **Windows 11 laptop with Smart App Control ON** — the machine that
  originally reproduced MPI-387
- a separate **Linux** machine
- a **rented Mac** (Apple Silicon)
- a separate agent already running the **RunPod** sweep (MPI-385)

That combination has never existed before and may not again soon. Anything
needing it should be done in this window.

## Hard prerequisite

**None of the platform items can start until the 1.3.0 artifacts are built.**
Windows 1.3.0 is the first build with the standard-Electron layout, and several
items (the transition update, the in-app update prompt, the archive names) only
exist in a real release. Do the § A build-time checks during the cut; everything
else after.

## A — Build-time checks (do these AT the cut, before shipping)

Owner card: **MPI-369**. These are cheap, and getting them wrong is expensive
because shipped updaters glob artifact names.

1. Unzip the Windows update bundle; its root folder must read
   `CubricVision-v1.3.0-update-only`.
2. The update ASSET name must be `CubricVision-windows-x64-update-v1.3.0.zip`.
   **This name is FROZEN** — shipped updaters glob it. Drift breaks every
   existing install's updater.
3. The 1.3.0 update manifest must read `from 1.2.0`, not `null`. A `null` means
   `--from-manifest` was not passed and the delta is silently a full bundle.
4. Sanity-check file counts against MPI-369's recorded baseline: 6362 (win32) /
   6505 (darwin) / 6325 (linux). A few-hundred-file swing is normal; an
   order-of-magnitude one is not.

Also at the cut, from the MPI-387 lineage: **restamp
`release-baselines/win32-x64.json` from the shipped FULL manifest.** It cannot be
done before the build exists, and the next Windows delta is wrong without it.

## B — Windows, on the Smart App Control laptop

Owner card: **MPI-387** (umbrella; see its `validation.md` for the per-fix table).

Run ONE clean install end to end. It exercises eight items at once. Order matters.

0. Confirm git is genuinely absent: `where git` must find nothing, else fix B
   proves nothing.
1. **A** — copy the zip to **Downloads**, right-click → **Extract All**, accept
   the default destination. Not 7-Zip, not a custom folder. Expect ONE folder
   with `CubricVision.exe` directly inside — not two.
2. **D (SAC)** — double-click `CubricVision.exe`. Expect SmartScreen "Windows
   protected your PC" → **More info** → **Run anyway** → app starts. A silent
   block, or an admin-policy message with no Run-anyway path, is a FAILURE and
   the single most important result of the day.
3. Press Install and let the engine install run to completion. Then check the log
   for all of:
   - **B** — no `Cannot find command git` from Impact-Pack
   - **A(2)** — no MAX_PATH / Long-Path HINT from LTXVideo's pip
   - **F1** — no `Illegal transition ComfyUI-Frame-Interpolation: complete -> downloading`
   - **F2** — the new `No NVIDIA, AMD or Intel Arc GPU detected — falling back to
     the NVIDIA (CUDA) portable build…` line SHOULD appear on that laptop. Its
     presence is the fix working, not a fault.
   - **F3** — `Failed to build 'cupy-wheel'` followed by `Custom install command
     succeeded` is EXPECTED and harmless. Do not "fix" it.
   - **C** — if anything DOES fail, the message must name the node and the real
     phase, and must never say "extraction failed" when extraction succeeded.
4. **D (transition update)** — separately, take a real **v1.2.0** Windows install
   and update it to 1.3.0 in-app. This is the FIRST live run of that path, and
   the applier doing the work is the user's OLD one, so none of the 1.3.0 applier
   hardening is in play. Expect: new files copied, `start.vbs` gone, a stale
   `app/` folder left behind on purpose (safe to delete, ~1 GB).
   This item also validates **MPI-334** (the in-app update prompt's real
   fetch+spawn, which has never run against an actual release).

**Evidence to keep:** `<extract root>/user-data/logs/app.log`. That one file
settles A, B, C, F1 and F2.

## C — macOS, on the rented Mac

Owner card: **MPI-370**. Currently `doing`/`validating`, code-verified only.

macOS install was **hard-broken**: `controlnet_aux` requires `onnxruntime-gpu`,
which has no macOS wheel and never will. Fixed in `a851eb18` via
`requirementsDrop`. Never run on Apple hardware.

1. Clear quarantine, then launch:
   `xattr -dr com.apple.quarantine "<extracted folder>"` → double-click
   `start.command`. (macOS keeps its start script — only Windows lost its
   launchers.)
2. **Install a DEPTH model.** That is the specific path that pulls
   `controlnet_aux`. A generic install does not exercise the fix.
3. Look for the `requirementsDrop` log line named in
   `tasks/MPI-370/validation.md`. **Its ABSENCE means the field did not survive
   into the install job** — `_createDepJob` is a WHITELIST, and an unlisted dep
   field vanishes silently. Absence is the failure signal, not the error.
4. While the Mac is rented, also do a plain install → launch → generate smoke.
   macOS has never had a validated generation run.

## D — Linux, on the separate machine

Owner card: **MPI-198**. Currently `todo`/`planned`, attention required.

Loader-path heal (`60b3c95`) is **logic-verified only**. It needs a combination a
Pod cannot provide, which is exactly why MPI-385's brief excludes it:

- a Linux (or mac) **portable build**
- a **LOCAL** engine — not remote, not a Pod
- a **subfoldered** LoRA (a LoRA inside a subdirectory, not at the folder root)

Read `tasks/MPI-198/plan.md` + `checklist.md` for the exact reproduction; there
is no `brief.md` on that card.

Also do a plain install → launch → generate smoke on Linux. The only prior Linux
evidence is install-and-launch on the maintainer's weak Ubuntu laptop;
generation has never been validated.

## E — Explicitly NOT in this sweep

Named so they are not "missed" by accident — each is excluded for a reason:

- **MPI-385** (RunPod umbrella) — already assigned to another agent, running in
  parallel. Not build-gated. Its brief lists what a Pod cannot settle, which is
  where MPI-198 and MPI-370 came from.
- **MPI-387 gap 4** — a SECOND update, applied FROM the new layout, which
  exercises `loadExtractZip`'s `resources/app` branch and `evictBusyFile`. A
  first update never touches either. **Needs 1.3.1 or later** — unreachable at
  1.3.0, and the last thing standing between MPI-387 and `done`.
- **MPI-376** — Add/Subtract bake undo needs a detect run. Testable any time, not
  build-gated.
- **MPI-380** — remote Pod leg, deferred by the user until the mask feature set
  lands.
- **MPI-291** — stalled-download self-heal, code-verified and never seen fire.
  Opportunistic only: if a download stalls during any install above, watch
  whether it self-heals, and note it. Do not try to force it.

## Close-out contract

For each item: verify → write the result into the OWNING card's `validation.md`
(not into this one) → move that card. This card moves to `done` only when every
item is either verified or explicitly re-deferred with a reason.

**Standing rule that applies here:** a card whose only remaining leftover is
unreachable (needs 1.3.1, needs hardware nobody has) does not rot in
`validating` — it closes on the evidence that exists, and the leftover is
recorded as a line in the umbrella that owns it.
