# MPI-390 Brief — a GPU-less user cannot reach RunPod on first run

Surfaced 2026-07-29 while fixing MPI-387 F2. Adjacent to F2 but a DIFFERENT defect:
F2 is *which* engine build gets picked; this is that the remote escape hatch is
unreachable at the moment it is needed.

## The lock (traced, not theorised)

The remote-only boot path already exists and explicitly skips the local engine gate
— `js/shell.js:251`:

```js
const runpodCfg = Storage.getRunpodConfig();
if (runpodCfg.autoConnectOnStart) {
  await _initRemoteBoot(runpodCfg);        // no local engine required
} else try {
  const versionRes = await fetch('/engine/version-check');
  if (versionData.needsInstall) _engineInstall.el.show('installing');
```

The comment at `js/shell.js:244-250` states the intent outright: *"a local engine is
not required when we are auto-spinning a Pod at launch."*

Why a fresh install can never take it:

| Link in the chain | Evidence |
|---|---|
| `autoConnectOnStart` defaults to `false` | `js/core/storage.js:61` |
| So boot takes the `else try` branch and a fresh machine has `needsInstall: true` | `js/shell.js:254-260` |
| The install modal is not dismissible — `backdropClose: false`, no skip/cancel control | `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js:322-330` |
| Only `engine:ready` (or `destroy()`) hides it | `js/shell.js:267-272`, `MpiEngineInstall.js:454-463` |
| The ONLY UI that sets `autoConnectOnStart` is RunPod settings, behind the landing page | `js/components/Compounds/LandingPages/MpiRunpodSettings/MpiRunpodSettings.js:1593` |

Net effect: a machine with no usable GPU must complete a multi-GB CUDA engine
install it will never use, purely to reach the setting that would have let it skip
the install. Not a hard block — the CUDA portable installs fine and ComfyUI falls
back to CPU — but it is a tax levied on exactly the users RunPod exists for.

## Why this matters commercially

RunPod is the answer for GPU-less users. Today the product makes them pay the local
install tax before it will show them the answer.

## What it needs (product/UX decision — do not code blind)

- Where the escape hatch lives: a "Set up RunPod instead" control ON the install
  modal, or a pre-install choice screen.
- Whether it appears always, or only when `resolveDownloadConfig()` found no
  discrete GPU (`gpu.vendor === null` — see the MPI-387 F2 log line in
  `routes/platformEngine.js`).
- The copy, and what happens after RunPod is configured — does the local install
  modal stay dismissed permanently, or re-arm when the user turns remote off?
- Whether `autoConnectOnStart` is the right flag to flip, or a separate
  "skip local engine" preference is cleaner (auto-connect has its own retry
  lifecycle, MPI-85/MPI-110).

## Related

- MPI-387 F2 — no-GPU machines get the CUDA build. Logged as a deliberate fallthrough
  this session; the download-size problem is the same root situation seen from the
  engine side.
- MPI-385 — the RunPod verification umbrella.
