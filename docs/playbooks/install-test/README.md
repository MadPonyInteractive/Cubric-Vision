# Install-Test Playbook — verifying a freshly-built portable

Run this before shipping a build (Patreon promote / GitHub public). It catches the
traps that only appear in a real installed portable, not in `npm start`.

**Standing test location:** builds are extracted to
`D:\cubric-install-test\CubricVision-windows-x64-v<X.Y.Z>\CubricVision-windows-x64-v<X.Y.Z>\`
— the **inner** folder is the app root (`start.vbs`, `start-with-terminal.bat`,
`user-data\`, `update.bat`, `update-from-zip.bat`).

---

## 0. The #1 gotcha — data is PER-FOLDER

The portable launcher sets `CUBRIC_USER_DATA_ROOT=<app-root>\user-data`
(`scripts/portable/windows/start-with-terminal.bat`), so **every extracted build has
its own empty `user-data\`**. A freshly-extracted build therefore has:

- No RunPod API key → Settings shows *"Save a valid API key to load live availability"*.
- No projects, no settings.

This is expected, **not** a bug and **not** "the update wiped my data":

- **In-place update** (`update.bat` / built-in updater) reuses the SAME folder →
  `user-data\` (secrets, projects, settings) is preserved.
- **A fresh download to a NEW folder** starts clean — that's what you're testing.

The dev build (`npm start`, no override) instead uses Electron's default
`%APPDATA%\Cubric Vision\` — the two data stores never share.

---

## 1. Pre-flight — get your RunPod key into the test build

A fresh install has an empty `user-data\`, so the RunPod key is absent — Settings shows
*"Save a valid API key to load live availability."* Getting it back:

**⚠ You cannot just copy `runpod-secrets.json`.** The key is `enc:'safe'` (Electron
`safeStorage`), and on **Windows the AES key lives in each install's `Local State`**
file (DPAPI-wrapped). A blob copied alone won't decrypt in another install →
`getApiKey()` throws → the server returns `400 no_api_key` (no server-side log line) →
client logs `RunPod availability load failed`. The blob is **install-bound**.

Two ways that actually work:

**A — paste the plaintext key (recommended).** Keep your RunPod key in a password
manager and paste it into each fresh test install's Settings → API key. If you've lost
it, recover it from an existing install (`app.setName('Cubric Vision')` → userData =
`%APPDATA%\Cubric Vision`, which owns the matching `Local State`):
```bat
cd /d c:\AI\Mpi\Cubric-Vision
node_modules\electron\dist\electron.exe scripts\recover-runpod-key.js   :: prints RESULT::KEY::<key>
```
(one-shot: `app.whenReady` → `safeStorage.decryptString(runpodApiKey.blob)` → print → quit.)

**B — file copy, app CLOSED.** Copy **`Local State` AND `runpod-secrets.json` together**
(Local State carries the decryption key), then relaunch:
```bat
copy "%APPDATA%\Cubric Vision\Local State"          "D:\cubric-install-test\<build>\<build>\user-data\Local State"
copy "%APPDATA%\Cubric Vision\runpod-secrets.json"  "D:\cubric-install-test\<build>\<build>\user-data\runpod-secrets.json"
```

Then **restart** (availability loads on Settings-panel open). Data centers populate; an
existing network volume shows tagged `· volume` and auto-selects when you pick its DC.

---

## 2. Smoke checklist

- [ ] **Launch both ways:** `start.vbs` (no terminal) and `start-with-terminal.bat` (log visible).
- [ ] **Changelog** — "What's New" shows for this version and reads correctly.
- [ ] **18+ gate** — shows once, dismisses clean, no visual glitch.
- [ ] **Local generation** — run one image and one video end-to-end.
- [ ] **RunPod** — key present → pick DC → volume shows → CONNECT → remote generation.
- [ ] **Update path** — run `update-from-zip.bat` / `update.bat`; confirm `user-data\`
      (projects, secrets, settings) SURVIVES the update.

---

See also: [releases/portable-distribution-contract.md](../../releases/portable-distribution-contract.md)
(what the build produces) and [releases/github-release-checklist.md](../../releases/github-release-checklist.md).
