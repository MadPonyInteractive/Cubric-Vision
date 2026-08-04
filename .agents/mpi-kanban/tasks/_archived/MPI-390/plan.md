# MPI-390 Plan — RunPod escape hatch on the engine-install gate

## Product decisions (user-approved 2026-07-30, do not re-litigate)

| Question | Decision | Why |
|---|---|---|
| Which flag? | **New `skipLocalEngine`**, NOT `autoConnectOnStart` | Different intents. `autoConnectOnStart` spins a *billed* Pod at every launch — `js/core/storage.js:57-59` says the OFF default exists precisely to prevent surprise billing. "Don't make me install CUDA I'll never use" must not imply "bill me on every app open". Reusing the flag trades one trap for a worse one, and drags in auto-connect's retry lifecycle (MPI-85/110) which the hatch has no business owning. |
| When visible? | **Always**, setup phase only | Gating on `gpu.vendor === null` re-traps anyone GPU detection misses — MPI-387 F2 just documented that `detectIntelArcGPU` matches Arc/Data-Center only, so Iris/UHD/HD fall through BY DESIGN. A weak-but-present GPU is also a legitimate RunPod user. Cheaper too: no plumbing `gpu.vendor` to the renderer. `upgrading`/`repairing` modes are excluded — a local engine already exists there, nobody is trapped. |
| Where? | **Link on the modal** + a docs/video link | Smallest diff: one control, one handler, no new screen. A pre-install choice screen would be shown to every user on every fresh install, including the ~90% who just want local. |
| Re-arm? | **Toggle off in RunPod settings** | No auto-magic. Settings has NO engine-install section (verified), so without a control the hatch is a one-way door — the mirror image of the trap being fixed. |

## The trap the brief did not name

The boot gate is `await new Promise` resolved **only** by `engine:ready`
(`js/shell.js:268-274`). Hiding the modal is not enough — boot would hang forever
behind a now-invisible gate. The hatch needs its own resolution path. It emits
`engine:install-skipped` rather than faking `engine:ready`, because the engine is
NOT ready and any future `engine:ready` consumer must not be lied to.

## Steps

1. `js/core/storage.js` — add `skipLocalEngine: false` to the runpod config defaults, with a comment stating it is decoupled from `autoConnectOnStart`.
2. `js/shell.js` — new gate branch (`skipLocalEngine` → no local gate); boot promise also resolves on `engine:install-skipped`. The existing `else try` local path stays byte-identical.
3. `MpiEngineInstall.js` — setup phase gets "Use RunPod instead" + a "how to set up RunPod" video link (`https://docs.cubric.studio/#/vision#watch-the-overview`). External link uses the existing plain `<a target="_blank">` pattern already at `:81` — `setWindowOpenHandler` in `main.js:359` routes it to `shell.openExternal`, so no IPC.
4. `MpiEngineInstall.css` — BEM for the hatch.
5. `MpiRunpodSettings.js` — the re-arm toggle, next to auto-connect.

## Verification

**Verify mode:** user-ux

- `node --check` + eslint clean on all five files.
- In-app: with `needsInstall` true, the hatch dismisses the modal and boot completes to landing; RunPod configures and generates with no local engine; toggling `skipLocalEngine` off re-arms the install gate on the next boot.
