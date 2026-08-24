# MPI-616 — Smart App Control can hard-block an unsigned exe

## What was measured, 2026-08-24

A client Windows 11 laptop, Smart App Control **enforced**:

```
HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy\VerifiedAndReputablePolicyState = 1
```

An unsigned Electron app (MPI Shop Assistant — a sibling MadPony
electron-builder NSIS build, same shape as Cubric) would not launch. Three
attempts, three identical entries in `Microsoft-Windows-CodeIntegrity/Operational`:

```
3118  Smart App Control Block Details
3077  Code Integrity determined that a process (\...\Windows\explorer.exe)
      attempted to load \...\Users\hugom\Mpi-Shop-Assistant\MPI Shop Assistant.exe
      that did not meet the Enterprise signing level requirements or violated
      code integrity policy (Policy ID:{0283ac0f-fff1-49ae-ada1-8a933130cad6}).
3033  ...did not meet the Enterprise signing level requirements.
```

No dialog. No **Run anyway**. Clearing mark-of-the-web changed nothing — SAC
judges signature and Microsoft cloud reputation, not MOTW. That is why "unblock
the file" is not a workaround here the way it is for SmartScreen.

**SAC has no per-app exception.** By design. The only user-side escape is turning
SAC off entirely.

## Why this matters to Cubric

`docs/releases/github-release-checklist.md` records the opposite result from
2026-07-30 (MPI-387 D): a MOTW-carrying unsigned `CubricVision.exe`, enforced
SAC, **no prompt at all, app opened directly**.

Both measurements are real. So the conclusion is not "the checklist is wrong" —
it is that **SAC decides per binary**, via a cloud model. One clean box proves
nothing about the next one. A single passing measurement was treated as the
general case, and it is not.

The practical consequence for release notes: the checklist tells authors to say
*"Windows may show a prompt — click More info, then Run anyway."* There is no
branch for the user who gets no prompt and no button, only an app that never
opens. That user has no idea why, and nothing in the release body helps them.

## Signing state of this repo

Grep across `electron-builder.yml`, `package.json`, workflows and `scripts/`
finds **no signing configuration at all**. `win:` carries only the NSIS target
and the ffmpeg/ffprobe extra resources.

The 2026-07-29 decision not to sign is recorded as: *"signing starts
SmartScreen's reputation clock, it does not skip it."* That is true, and it is
about **SmartScreen**. It does not answer **SAC**, where the failure mode is not
a slower click-through — it is a hard block with no override.

## Do the measurement before the decision

1. Get a Windows 11 box with SAC enforced (`VerifiedAndReputablePolicyState = 1`).
   A clean install — SAC is absent entirely on any in-place upgrade.
2. Download the current `CubricVision.exe` **through a browser** so it carries
   MOTW. A sync client writes files without it and the test measures nothing.
3. Launch it. Then, regardless of the outcome:

```powershell
Get-WinEvent -LogName 'Microsoft-Windows-CodeIntegrity/Operational' -MaxEvents 20 |
  Where-Object Id -in 3033,3077,3118 | Select-Object TimeCreated, Id, Message | Format-List
```

The absence of a dialog is not evidence of success — 2026-07-30 looked like a
pass and this log is the only thing that distinguishes "allowed" from
"blocked silently". Record the result in `validation.md` either way.

## If it is blocked: Azure Trusted Signing

~$9.99/month, plugs into electron-builder. Worth evaluating specifically because
its certificates are ones SAC is meant to trust, rather than an ordinary OV cert
that still waits on reputation.

**Do not assume it clears SAC — measure it.** Sign one build, run it on the same
enforced box, read the same log. That is the only thing that settles it.

Practical constraint before spending anything: public-trust **organisation**
validation wants the legal entity to be 3+ years old. If MadPony Interactive is
younger, individual validation is the fallback — the certificate is issued to
Fabio personally.

## Not in scope — already solved

SAC hard-blocking `.vbs` / `.bat` / `.cmd` was fixed in 1.3.0 by removing scripts
from the launch chain and running the updater through the app's own binary. Do
not re-raise it.

## Turning SAC off (what a blocked user has to do)

Worth knowing, but a poor thing to put in a release note — it asks a user to
switch off a security feature, probably permanently.

```powershell
Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-Command',
  'Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy" -Name VerifiedAndReputablePolicyState -Value 0 -Type DWord'
```

Reboot required — CI policy loads at boot. Treat as one-way: the Settings toggle
greys out afterwards, and Microsoft's documented way back is that same registry
value or a "Reset this PC".
