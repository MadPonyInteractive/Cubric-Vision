# Install-Test Playbook — verifying a freshly-built portable

Run this before shipping a build (Patreon promote / GitHub public). It catches the
traps that only appear in a real installed portable, not in `npm start`.

**Standing test location:** builds are extracted to
`D:\cubric-install-test\CubricVision-windows-x64-v<X.Y.Z>\CubricVision-windows-x64-v<X.Y.Z>\`
— the **inner** folder is the app root (`CubricVision.exe`, `user-data\`, `update.bat`,
`update-from-zip.bat`).

---

## 0. The #1 gotcha — data is PER-FOLDER

On Windows the app resolves its own portable root and points user data at
`<app-root>\user-data` (`main.js`, MPI-387 fix D — there is no start script to export
`CUBRIC_USER_DATA_ROOT` any more; Linux and macOS still do it from `start-with-terminal.sh`
/ `start.command`). So **every extracted build has its own empty `user-data\`**. A
freshly-extracted build therefore has:

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

- [ ] **Launch:** double-click `CubricVision.exe`. There is one launcher on Windows now
      (MPI-387 — Smart App Control blocks `.vbs`/`.bat` outright on a clean Windows 11). To
      watch the log live instead, run that same exe from a terminal.
- [ ] **Changelog** — "What's New" shows for this version and reads correctly.
- [ ] **18+ gate** — shows once, dismisses clean, no visual glitch.
- [ ] **Local generation** — run one image and one video end-to-end.
- [ ] **RunPod** — key present → pick DC → volume shows → CONNECT → remote generation.
- [ ] **Update path** — the full leg is § 3 below. A surviving `user-data\` is NOT the
      test; it survives a corrupted install too.

---

## 3. The update leg — the one 1.5.0 walked straight through

This leg used to read *"confirm `user-data\` SURVIVES"*, and a surviving `user-data\` is
exactly what a corrupted install looks like. The 1.4.4 → 1.5.0 delta applied onto a 1.4.0
folder dropped the 67 files added across 1.4.x; the server came up healthy, the renderer
died on the first missing ESM import, and the app sat on the landing screen forever — with
projects, secrets and settings all perfectly intact. The old checklist line would have
reported PASS on the build that was breaking users (MPI-709, 2026-09-08).

Two conditions make it a real test.

**A. Update from the OLDEST install the bundle claims to serve.** Which install that is
depends on what the bundle is, so read its `resources/cubric/update-manifest.json` first and
record the `fromVersion` you find there as `bundleFromVersion` in the evidence:

- **A FULL bundle (`fromVersion: null`) claims every install**, so it must be tested across a
  gap: **at least TWO released versions behind**. A one-behind source passes even with the
  applier completely broken, because a delta's `fromVersion` IS the previous release and that
  one install is the single case it genuinely fits. Shipping 1.5.0 with v1.4.2 / v1.4.3 /
  v1.4.4 published → update from v1.4.2 or older, never from v1.4.4.
- **A DELTA claims exactly one install — its own `fromVersion`.** Test it from precisely that
  version. Demanding a two-behind run of a delta asks for a test that cannot legitimately
  pass, and running it anyway just reproduces the corruption on purpose.

```bash
git tag --list "v*" | sort -V | tail -6
```

Keep a couple of old full portables on disk for this; a fresh extract of an old release is
the source install.

> **Shipping a delta is a decision about who you are NOT serving.** Every install older than
> the delta's `fromVersion` runs an applier that predates the `fromVersion` guard, so it does
> not refuse — it applies the delta silently and corrupts. Those users get no error and no
> warning from the software. The release body is their only protection, and it has to tell
> them to take the full zip rather than the update zip (MPI-709, 2026-09-08).

**B. Assert the app WORKS afterwards, with a real generation.** A file count and a clean
`app.log` prove nothing here — in the 1.5.0 failure the server logged nothing wrong at all,
because the process that died was the renderer. Launch the updated folder and generate one
image, then **open the output and look at it**, per § "A generate smoke is passed by the
IMAGE, never by the log" in
[github-release-checklist.md](../../releases/github-release-checklist.md).

Steps:

1. Extract a full portable of the older version into its own folder (per-folder data — § 0).
2. Launch it once (`CubricVision.exe`), confirm it starts, and create a project so there is
   user data with something to lose.
3. Copy `CubricVision-<platform>-update-v<ver>.zip` into that folder and run
   `update-from-zip.bat`. **Not `update.bat`** — that one fetches from GitHub, which has
   nothing until you publish, and this leg runs BEFORE publication.
4. Read what the applier says. Both outcomes are legitimate results, not just the green one:
   - A **full** bundle (`fromVersion: null`) applies to any starting version.
   - A **delta** whose `fromVersion` does not match the install refuses — *"This
     installation is X, so the Y update was not applied"* — and leaves the folder
     byte-identical. That refusal is the `apply-update.cjs` guard working. It also means
     this release cannot reach that user as a delta: ship a FULL bundle.
5. Launch, run one image generation end to end, open the PNG.
6. Confirm `user-data\` (projects, secrets, settings) survived. Necessary, never sufficient.

**Record the outcome in `dev_configs/update-evidence.json`.**
`npm run release:check:publish` refuses a release without it:

```json
{
  "at": "2026-09-08T14:00:00Z",
  "toVersion": "1.5.0",
  "fromVersion": "1.4.2",
  "bundleFromVersion": null,
  "platform": "win32",
  "bundle": "CubricVision-windows-x64-update-v1.5.0.zip",
  "userDataSurvived": true,
  "generation": {
    "ok": true,
    "artifact": "D:\\cubric-install-test\\CubricVision-windows-x64-v1.4.2\\...\\00021.png",
    "note": "SDXL 832x1024 — opened it, a real image, not grey noise"
  }
}
```

The two version fields are **not** the same thing and the gate compares them:

- `fromVersion` — the version of the **install you updated**.
- `bundleFromVersion` — the `fromVersion` field of the **bundle's own**
  `resources/cubric/update-manifest.json`. `null` for a FULL bundle, a version for a delta.
  It is what tells the gate which installs the bundle claims to serve, and therefore what a
  fair test of it looks like (condition A). Read it, don't assume it — an absent
  `release-baselines/*.json` makes the build emit FULL, and a restored one makes it a delta.

`generation.artifact` names the file you actually opened; the gate refuses an empty one,
because an unopened output is the failure mode MPI-419 already cost us once.

---

See also: [releases/portable-distribution-contract.md](../../releases/portable-distribution-contract.md)
(what the build produces) and [releases/github-release-checklist.md](../../releases/github-release-checklist.md).
