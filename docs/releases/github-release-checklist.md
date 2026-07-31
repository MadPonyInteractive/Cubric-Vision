# GitHub Release Checklist

Use this checklist when drafting a GitHub Release for Cubric Studio Vision
portable artifacts. Keep the release body aligned with
`portable-distribution-contract.md`.

## Required Asset Names

Full portable artifacts:

- `CubricVision-windows-x64-v<version>.zip`
- `CubricVision-linux-x64-v<version>.tar.gz`
- `CubricVision-macos-arm64-v<version>.zip`

Update bundles (attach these too — they are the in-place update path via the
online `update.*` script; GitHub is the only update source):

- `CubricVision-windows-x64-update-v<version>.zip`
- `CubricVision-linux-x64-update-v<version>.zip`
- `CubricVision-macos-arm64-update-v<version>.zip`

Do not publish Vision assets with legacy `CubricStudio` artifact names.

## Platform Disclosure

Include this disclosure, adjusted only when validation evidence has been
recorded for the exact artifact being published:

- Windows: tested locally on the maintainer Windows development machine. Not
  yet validated on a separate clean Windows host unless a later validation note
  says otherwise.
- Linux: install and launch validation only on the maintainer's weak Ubuntu
  laptop. Generation support is unvalidated unless a stronger Linux host or a
  contributor validates it.
- macOS: artifacts are produced mechanically but are maintainer-untested.
  Community validation is needed before stronger macOS support language is used.

Do not claim a platform is supported because an artifact was built. Record the
artifact name, OS version, CPU architecture, GPU and driver stack when relevant,
clean extract location, launch result, engine setup result, generation result
when hardware allows, and app log tail before strengthening release language.

### Windows: prove the test machine BEFORE trusting its result

A clean launch on a box where the blocking condition cannot occur looks exactly
like a clean launch on a box where the fix worked. Run both checks first, or the
Windows result is worth nothing (learned 2026-07-30, MPI-387 D):

```
reg query "HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy" /v VerifiedAndReputablePolicyState
```
`0x1` = Smart App Control **enforced** (what you need) · `0x0` = off · `0x2` = evaluation.

```
dir /r CubricVision.exe
```
Wants a `CubricVision.exe:Zone.Identifier:$DATA` line. **Check the EXTRACTED exe,
not the zip** — Explorer does not always propagate mark-of-the-web through
extraction, and a stripped exe keeps Windows silent no matter what shipped. A
sync client (Google Drive for Desktop and friends) writes files without MOTW at
all; download through a browser.

Also confirm `where git` finds nothing before trusting any git-less install
result, and note whether the machine has a GPU — a GPU-less box launches ComfyUI
with `--cpu`, so a generate smoke there measures nothing useful.

## First-Launch Instructions (must appear in every release body)

Both desktop platforms show an OS security prompt on first launch because the
builds are unsigned. If the release body does not say so, the prompt reads as
"this download is malware" and the user stops there. Include both notes.

**Windows.** From 1.3.0 the zip extracts to a plain folder with `CubricVision.exe`
at its root — there is no start script in the launch chain any more (MPI-387 D:
Smart App Control hard-blocks `.vbs`/`.bat`/`.cmd` with no override, which is
what broke clean Windows 11 installs). Tell the user:

> Extract the zip anywhere and run **`CubricVision.exe`**. Windows may show
> "Windows protected your PC" — click **More info**, then **Run anyway**. The app
> is unsigned; this warning is expected and appears until the build earns
> reputation.

Say "may", not "will". Measured 2026-07-30 on a clean Windows 11 laptop with
Smart App Control **enforced** and a MOTW-carrying unsigned exe: no prompt
appeared at all, the app opened directly. Promising a dialog that does not arrive
makes the rest of the instructions read as wrong.

Say plainly that the build is **not code-signed**. There is no certificate and no
NSIS installer (user decision, 2026-07-29): signing starts SmartScreen's
reputation clock, it does not skip it.

**Windows users on a build older than 1.3.0 cannot be reached by an update** —
Smart App Control blocks the update scripts too. They must download the full zip.
This must be stated in any release that carries a Windows fix.

**macOS.** Any downloaded build is quarantined. Give the clear command and the
launch target:

> ```
> xattr -dr com.apple.quarantine "<extracted folder>"
> ```
> then double-click `start.command`.

This is the only working first-launch path for un-notarized builds.

## Scope Guard

Release copy should describe Cubric Studio Vision as a local image and video
generation app. Do not add claims about bundled language-model, assistant, or
prompt-intelligence features; those are outside Vision release scope.

## Contributor Validation Request

Ask contributors to include these fields when reporting a validation result:

- Platform and OS version
- CPU architecture
- GPU and driver stack
- Artifact name and version
- Clean install or update path tested
- Launcher result
- Engine setup or repair result
- Whether generation was tested
- App log tail from the failed or validated run

For macOS reports, also ask for Gatekeeper behavior and whether the app was
launched through Finder, Terminal, or both.

## Where to get a test machine (surveyed 2026-07-30)

Current kit: the maintainer's Windows dev PC, a weak Ubuntu laptop, a borrowed
**GPU-less** Windows box, and a rented Mac. The gap this section fills: a *clean*
Windows host **with a GPU** — the class of failure that passes on the dev PC and
dies elsewhere (MPI-387 D was exactly this).

### Windows

1. **Windows Sandbox** — built into Windows 11 Pro, free, boots in seconds,
   discards on close. Catches the missing-redist / missing-DLL / first-run /
   silent-no-window class without renting anything. **No CUDA** in the sandbox, so
   it proves *launch*, never *generation*. Run this before paying for anything.
2. **Cloud GPU Windows VM, by the hour, RDP** — a full smoke test costs under a
   dollar, no minimum: Vultr A16 ~$0.51/hr (markets RDP/VNC/Parsec desktops),
   Paperspace M4000 $0.45/hr / A4000 $0.76/hr, AWS `g4dn.xlarge` ~$0.75/hr.
   **Fidelity gap that matters:** these are datacenter cards (T4/A16/L4) on
   datacenter drivers, not GeForce + Game Ready. Reproduces dependency/environment
   bugs perfectly; may *not* reproduce consumer-driver bugs.
   **RESOLVED 2026-07-31 — they are Windows SERVER, not a Win 10/11 desktop**
   (maintainer, from a prior rental attempt; this was left "unverified" here and is
   the reason that attempt was abandoned). Server preinstalls a different
   redistributable set, so a pass on one of these boxes does NOT clear a consumer
   desktop and a *failure* may be Server-only. Treat the GPU rental as a
   generation/dependency probe only — never as the clean-Windows-desktop sign-off.
   For that, use Windows Sandbox above (launch only) or real consumer hardware.

### Linux

**RunPod** is already in the pipeline (`mpi-ci` builder + product pods) — Linux +
NVIDIA by the second, add noVNC for a desktop. Caveat: it is a container, no
systemd, so it proves app + engine, not a distro install. Otherwise Scaleway L4
€0.79/hr, Genesis RTX 3080 $0.08/hr.

### macOS

Rent a cloud Apple Silicon Mac at **https://rentamac.io** ($3.30/day, M4, DeskIn
remote — cheapest verified). Re-subscribe only when something specifically needs
testing on real Apple hardware. Alternatives: MacinCloud $1/hr (25 h prepaid
minimum), Scaleway Mac mini M4 €0.22/hr, AWS `mac-m4.metal` $1.23/hr — but **AWS
and Scaleway both carry a 24 h minimum**; that is Apple's SLA, not the vendor's, so
"hourly Mac" is really daily everywhere.

**macOS cannot be virtualised as a substitute**, on two independent grounds: the
Apple SLA restricts macOS to Apple-branded hardware, and every x86 hackintosh route
physically cannot launch our **arm64-only** build (Rosetta 2 exists only on Apple
Silicon). Rent real hardware.

**macOS gotchas:**

- **Gatekeeper quarantine**: any downloaded build is quarantined. Reliable clear: `xattr -dr com.apple.quarantine "<folder>"` in Terminal, then double-click `start.command`. Include this step in mac release instructions — it is the only working first-launch path for un-notarized builds.
- **GitHub API rate limit**: a rented Mac's datacenter IP shares GitHub's unauthenticated rate limit (60 req/hr per IP). The online updater may 403 even when code is correct. Diagnose with `curl -s https://api.github.com/rate_limit` before blaming the updater.

### Dead ends — do not re-research these

- **BrowserStack / LambdaTest / AWS Device Farm** — browser and mobile testing only.
  BrowserStack's own FAQ: *"installing native applications on Windows or macOS is
  not supported."* Useless for a desktop build.
- **BuildJet** shut down; **Travis CI** dropped macOS (March 2025); **MacStadium** is
  monthly-only from $149/mo.
- **GitLab SaaS runners and Azure Pipelines** give zero interactive access to hosted
  runners. Most CI vendors are pipeline-only — you need a build job to exist before
  you can SSH in (CircleCI "rerun with SSH", Codemagic SSH+VNC, GitHub Actions +
  tmate all work, but all need a pipeline).
- **No single provider rents all three OSes interactively** except AWS EC2 (all three,
  one bill, but the Mac 24 h minimum makes it ~$29.52/session) and **Namespace**
  (`nsc create` on-demand VMs + Devboxes with SSH/VNC/RDP — the only true
  "rent me a machine for an hour" service found, but Windows is early-access and
  macOS pricing is unpublished). No 2025–26 entrant added macOS alongside Win/Linux
  GPU; the Mac niche stays Mac-only.
