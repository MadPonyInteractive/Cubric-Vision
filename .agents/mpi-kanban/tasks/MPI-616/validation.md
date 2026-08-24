# MPI-616 Validation

## 2026-08-24 — signature census, measured on Fabio's dev box

No SAC machine needed. `Get-AuthenticodeSignature` over both trees, zero system
changes, no boot-policy edit. This is what decided the card.

Box state: `VerifiedAndReputablePolicyState = 0` (SAC off), so nothing here is a
SAC verdict — it is the input SAC's *signature* branch would read.

### The shipped app tree — 19 binaries

```
NotSigned   18
Valid        1    d3dcompiler_47.dll (Microsoft Corporation)
```

`electron.exe`, `ffmpeg.dll`, `libEGL.dll`, `vk_swiftshader.dll`,
`ffmpeg.exe`, `ffprobe.exe` — all `NotSigned`. Electron's npm prebuilts ship
unsigned.

### The downloaded engine — 638 binaries (`.exe`/`.dll`/`.pyd`)

```
NotSigned  563
Valid       75    PSF 28 · NVIDIA 24 · Microsoft 15 · Anaconda 6 · Intel 2
```

### Verdict

Two different risk profiles, only one actionable:

- **The 19 app binaries** are rebuilt every release, so they carry zero hash
  reputation *by construction* — permanently on the losing side of the ISG
  lottery. This is the failure the card exists for, and signing is a complete fix
  for it (Microsoft's rule: SAC allows *publicly trusted signed code* OR *unsigned
  code the ISG predicts safe*).
- **The 563 engine binaries** are byte-identical PyPI/CUDA artifacts downloaded
  millions of times and stable across releases — the same reputation profile as
  ComfyUI's `run_nvidia_gpu.bat`, which demonstrably passes SAC in the wild. They
  cannot be signed by us (third-party, fetched at runtime), and they do not need
  to be: a Cubric user runs no worse a bet than a ComfyUI user already does.

So: sign the app tree, leave the engine on ISG. Not measured under enforced SAC
and deliberately so — the census answers the go/no-go without renting a box.

### Wiring note that changes the implementation

`win.azureSignOptions` in `electron-builder.yml` would be **inert**. The shipped
Windows artifact is not built by electron-builder: `scripts/build-portable.mjs`
copies `node_modules/electron/dist/*` and renames `electron.exe` →
`CubricVision.exe`. The signing pass has to run over the staged tree, after that
rename.

## Still open

- Release wording — fixed 2026-08-24 in `docs/releases/github-release-checklist.md`
  (§ "The third outcome"). Independent of any signing spend.
- Eligibility — UK. Public Trust **Individual** validation is US/Canada only, so the
  individual route is closed; the **Organization / DBA** route is open to UK
  businesses. Blocked on confirming MadPony Interactive's registration status.
- Nothing signed yet. No SAC-enforced run on a Cubric build, before or after.

## Prior measurements (unchanged, now reinterpreted)

- 2026-07-30, MPI-387 D: unsigned `CubricVision.exe` with MOTW, SAC enforced,
  opened directly. Real, and now understood as one binary winning the ISG branch.
- 2026-08-24: sibling app MPI Shop Assistant, unsigned, SAC enforced, hard-blocked
  (CodeIntegrity 3033/3077/3118). Real, and the same branch losing.
