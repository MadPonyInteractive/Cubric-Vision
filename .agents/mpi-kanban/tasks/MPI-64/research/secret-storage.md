# Secret Storage Design — RunPod Remote Engine

**Status:** Design / decision record. No code. Phase 1 output for MPI-64.

---

## Decision Summary

Store both secrets (RunPod API key and per-Pod wrapper token) in the Electron main
process only, using `safeStorage` to encrypt before writing to a JSON file under the
app's user-data directory. The renderer never holds either raw value. IPC verbs let the
renderer set, test, and clear secrets without reading them back. When `safeStorage` is
unavailable (e.g. headless Linux without a keyring), the app uses a derived-key
encrypted-file fallback and warns the user **at the moment they save their API key** —
remote mode is NOT blocked. (User decision 2026-06-11: do not lock Linux users out of
RunPod.)

---

## Secrets in Scope

| Secret | Lifetime | Owner |
|---|---|---|
| **RunPod API key** | Permanent (until user removes it) | User-provided; authenticates against RunPod REST/GraphQL. Must never appear in logs, bug reports, project files, or any serialized state. |
| **Cubric wrapper token** | Per-Pod session (regenerated on each Pod start) | App-generated random token; gates HTTP and WebSocket upgrade on the wrapper. Short-lived but still a real credential — a leaked token allows unauthenticated ComfyUI access for the life of the Pod. |

---

## Storage Location

`<APP_USER_DATA>/runpod-secrets.json`

`APP_USER_DATA` is the Electron `userData` path, set by `main.js` via
`app.setPath('userData', ...)` and forwarded to the Express server as
`process.env.APP_USER_DATA`. The same directory already holds `window-state.json` and
the `logs/` subdirectory, so this is the established user-data root.

This file must NOT be inside any project folder and must NOT be committed to git. It is
excluded from portable-zip distribution by definition (it lives in the OS user profile,
not in the app source tree).

File layout:

```json
{
  "v": 1,
  "runpodApiKey": "<safeStorage-encrypted base64>",
  "wrapperToken": "<safeStorage-encrypted base64>",
  "wrapperTokenPodId": "<pod-id the token belongs to>"
}
```

All `v` fields are encrypted blobs. `wrapperTokenPodId` is unencrypted metadata used to
invalidate the cached wrapper token when the active Pod changes.

---

## Encryption: `safeStorage`

### Why `safeStorage` is preferred

`safeStorage` is the Electron-native mechanism for OS-keychain-backed symmetric
encryption. On each platform it delegates to the OS secret facility:

| Platform | Backend |
|---|---|
| **Windows** | DPAPI (user-scope; bound to the Windows login credential) |
| **macOS** | Keychain (app-scoped entry) |
| **Linux (desktop)** | libsecret (GNOME Keyring) or KWallet — whichever the DE exposes |

`safeStorage` lives entirely in the **main process**. There is no renderer API. This is
a security feature, not a limitation — it means the renderer can never call
`safeStorage.decryptString` directly, and the raw key value never crosses the IPC
boundary in normal operation.

### Detection: `safeStorage.isEncryptionAvailable()`

This method must be called before every encrypt/decrypt call. It returns `false` in
known problematic environments:

- **Linux without a running keyring** (headless CI, server sessions, minimal desktops).
  In this case Electron falls back to `"basic_text"` — which despite the name is
  **plaintext** (XOR with a constant, effectively no protection). This is the dangerous
  silent-fallback case.
- **macOS sandboxing edge cases** (not relevant here — no Mac App Store distribution).

### No SILENT fallback to plaintext

The app MUST NOT silently write the API key in readable form when
`isEncryptionAvailable()` is false. But it also must NOT lock the user out of remote
mode (user decision). The resolution: a **derived-key encrypted-file fallback** plus a
**one-time warning shown at API-key-save time** for the affected user only. See the
Fallback section below. The key is never stored as `"basic_text"` plaintext.

---

## IPC Surface (main ↔ renderer)

All IPC handlers are registered in `main.js` alongside the existing `ipcMain` block.

### Channels

```
secrets:set-api-key       renderer → main    { key: string }
secrets:has-api-key       renderer → main    {}
secrets:clear-api-key     renderer → main    {}

secrets:set-wrapper-token renderer → main    { token: string, podId: string }
secrets:get-wrapper-token main    → renderer (invoked by backend route, not renderer)
secrets:clear-wrapper-token renderer → main  {}

secrets:encryption-status renderer → main    {}
  → returns { available: boolean, platform: string }
```

Design rules for this IPC surface:

1. `secrets:set-api-key` encrypts and writes to the secrets file. Returns `{ ok: boolean }`. Never echoes the key back.
2. `secrets:has-api-key` returns `{ has: boolean }` — truthy/falsy only. Does not decrypt.
3. `secrets:clear-api-key` deletes the `runpodApiKey` field and rewrites the file.
4. The renderer has NO channel to read back the raw API key. The raw key is only ever
   accessed from main-process code (or the Express backend via a trusted IPC path).
5. `secrets:get-wrapper-token` is invoked by the Express backend route (via a
   `main-process ↔ fork` mechanism, see Backend Access below), NOT from the renderer.
6. `secrets:encryption-status` lets the Settings UI surface a warning when no keyring is
   available, before the user attempts to enter their API key.

### Backend Access to Secrets

The Express server (`server.js`) runs as a `child_process.fork` of `main.js`. It does
not have direct access to `safeStorage` (which is only available in the main Electron
process). The bridge is:

- `main.js` exposes a thin `IPC-over-fork` message protocol on the existing fork channel:
  `{ type: 'secrets:get-api-key-request' }` → `{ type: 'secrets:get-api-key-response', value: string }`.
- The `runpodRemote.js` route (new, Phase 2) calls a `getRunPodApiKey()` helper that
  sends this message and awaits the response with a short timeout.
- The raw API key value is held in server memory only for the duration of a single
  RunPod API call. It is not cached in the route module's module-level scope.

This keeps the decryption responsibility in `main.js` and the key lifetime bounded.

---

## Fallback: Encryption Unavailable (Option B — warn-but-allow)

**Decided 2026-06-11 (user):** do NOT block Linux users from RunPod. Use a derived-key
encrypted-file fallback and warn the affected user once, at API-key-save time.

When `safeStorage.isEncryptionAvailable()` returns `false`:

1. The `secrets:set-api-key` IPC handler does NOT refuse. It encrypts the key with the
   **derived-key fallback** (below) and writes it, returning
   `{ ok: true, weakEncryption: true }`.
2. Because `weakEncryption` is true, the renderer shows a **one-time warning pop-up at
   the moment the user submits their API key** (not on every app launch, not before they
   choose to use RunPod):
   > "Your system has no OS secure key store (no GNOME Keyring / KWallet detected). Your
   > RunPod API key is saved with app-level encryption instead of OS-backed encryption.
   > It is still encrypted on disk, but a determined attacker with access to this machine
   > could recover it. For best security, enable a desktop keyring."
3. Remote mode is **NOT disabled**. The user proceeds normally.

### Derived-key fallback mechanism

When `safeStorage` is unavailable, encrypt with AES-256-GCM using a key derived via
`scrypt`/PBKDF2 from a per-install random salt (stored in the user-data dir, NOT next to
the ciphertext) combined with a machine-stable identifier (e.g. `os.hostname()` +
`os.userInfo().username` + the install salt). This is strictly better than `"basic_text"`
plaintext — it resists casual file inspection and backup leakage. It is NOT equivalent to
OS-keychain protection (the derivation inputs live on the same machine), which is exactly
why the user is warned. The fallback path must NEVER write the raw key, and must NEVER
fall through to Electron's `"basic_text"` backend.

The wrapper token follows the same storage path (safeStorage when available, derived-key
fallback otherwise). It expires with the Pod regardless, so its at-rest exposure window is
short.

### UI: API-key entry field

- The RunPod settings section has an API-key field rendered with **MpiInput in password
  mode** (masked). It is never a plaintext-visible field.
- Flow: user pastes key → presses the submit/save button → `secrets:set-api-key` runs →
  on `weakEncryption: true`, the warning pop-up (step 2) is shown once.
- `secrets:encryption-status` is still available so the UI can pre-warn if desired, but
  the authoritative warning fires at save time per the decision.

---

## Wrapper Token Lifecycle

The wrapper token is different from the API key in one important way: it is app-generated
and short-lived. It does not need to survive across Pod stop/start cycles — a fresh token
is generated each time the app starts a Pod.

Storage policy:

- Generated in the Express backend (or main process) using `crypto.randomBytes(32)` →
  hex string.
- Encrypted with `safeStorage` and written to `runpod-secrets.json` alongside the API
  key, with the `wrapperTokenPodId` set to the active Pod ID.
- On Pod stop, `wrapperToken` and `wrapperTokenPodId` are cleared from the file.
- On Pod start (including resume), a new token is generated and stored before any
  connection attempt.
- Stale token detection: if the file contains a `wrapperTokenPodId` that does not match
  the current active Pod ID at session start, the token is considered stale and
  regenerated before use.

The wrapper token is sent to the Pod as an environment variable at Pod-creation time (via
the RunPod `templateEnv` / container env field). The Pod-side wrapper reads it from the
container environment on startup. This means the token is visible in the RunPod Pod
config during the Pod's lifetime — this is acceptable given the RunPod dashboard is
behind the user's own API key. The token must not appear in any Cubric log, bug report,
or `project.json` entry.

---

## Secrets Hygiene — Redaction Hooks

### `routes/logger.js`

The logger has no current awareness of sensitive values. The risk is an inadvertent
`logger.info('runpod', someObjectThatContainsTheKey)`. Mitigation:

1. **Code-path discipline (primary):** `runpodRemote.js` and `remoteEngine.js` must never
   pass the raw API key or wrapper token as the `message` argument to any logger call.
   Variable names carrying secrets should be `apiKey`, `wrapperToken`, or similar — a
   grep-visible convention.
2. **Scrubber function (belt-and-suspenders):** Add a `redact(str)` helper in
   `logger.js` that replaces any 32+-character hex or `[A-Za-z0-9_\-]{32,}` blob that
   matches known-secret prefixes (`rp_` for RunPod keys) with `[REDACTED]`. Apply it
   to the `message` field inside `_write` for categories `runpod` and `remote`.
   This is a safety net, not the primary control — do not design logging to rely on
   redaction catching accidental leaks.
3. **Error objects:** When logging `err.stack` in RunPod route errors, ensure the error
   message was not constructed by interpolating the API key into the string (e.g. avoid
   `new Error(\`Call failed for key ${apiKey}\`)`).

### `routes/system.js` — Bug reporter (`POST /github/create-issue`)

The reporter collects `log` from `/logs/read` (the last 2000 chars of `app.log`) and
sends it to GitHub. The log must not contain secrets. Enforcement:

1. The logger redact function (above) covers secrets that reach `app.log` through the
   logger's own paths.
2. The `trimmedLog` slice in `system.js` line 285–287 needs no structural change — it
   already discards most of the log. The redact pass on the logger side is the correct
   hook.
3. The bug-reporter body fields (`title`, `message`, `summary`) come from user-typed
   text. No automatic injection of state or config is done; the risk is a user
   accidentally typing their key into the summary field. This is out of scope for
   automated redaction — the UI copy for remote-related errors should say "do not
   include your API key in the summary."

### `clientLogger.js` — Frontend log bridge

`clientLogger._send` POSTs `{ level, category, message, detail }` to `/log`. The message
is always a programmer-supplied string literal in the current codebase — the renderer
never has access to raw secrets by design (see IPC rules above). No renderer code path
touches the API key or wrapper token, so `clientLogger` requires no structural change.
The only rule to enforce: renderer-side remote-engine code must not log objects received
from IPC responses if those objects could theoretically contain sensitive fields.

### `project.json` and `.meta/` sidecars

Generation metadata (prompt, model, seed, settings) is written by `routes/projects.js`
`save-generation`. The RunPod API key and wrapper token are not part of any generation
parameter and must not be added to the workflow title injection, node values, or any
history item field. Enforce by code review at the injection boundary — no structural
change to `projects.js` is needed if the secret is never passed into the generation call.

### `state.js`

The Proxy-backed global state must not hold the raw API key. A `runpodConfig` state key
(for the settings UI) should store only: `{ hasApiKey: boolean, activePodId: string |
null, engineMode: 'local' | 'remote' }`. The token is not exposed in state at all.

---

## What is Explicitly Excluded

- **No Cubric auth backend.** The API key is stored locally by the user's own app
  instance. Cubric servers never see it.
- **No cloud secret sync.** Each installed instance has its own `runpod-secrets.json`.
  The user must re-enter their API key after a fresh portable install.
- **No project-scoped secrets.** Secrets live in user-data, not in project directories.
  Moving or sharing a project never leaks credentials.
- **No localStorage entry.** `storageKeys.js` must not gain a RunPod key constant.
- **No environment variable persistence.** The API key is not written to `.env`, shell
  profiles, or any process-env-serialized config that could appear in `process.env`
  dumps.

---

## Implementation Notes for the Parallel Batch Worker

The Phase 2 worker implementing `routes/runpodRemote.js` and the secret-storage module
should:

1. Add `ipcMain` handlers in `main.js` for all channels listed above.
2. Create `js/core/secretsClient.js` (renderer helper) that wraps `ipcRenderer.invoke`
   for `secrets:set-api-key`, `secrets:has-api-key`, `secrets:clear-api-key`, and
   `secrets:encryption-status`. This is the ONLY renderer-side interface to secrets.
3. Create `main/secretsStore.js` (main-process module) that owns: loading/saving
   `runpod-secrets.json`, calling `safeStorage.encryptString` / `safeStorage.decryptString`,
   and enforcing the `isEncryptionAvailable()` guard. Register the `ipcMain` handlers
   here, not inline in `main.js`.
4. Create a `getRunPodApiKey()` helper accessible from the Express fork via the
   process-message bridge described in Backend Access above.
5. After implementing: run a grep for `runpodApiKey\|wrapperToken\|rp_[A-Za-z0-9]` over
   `logs/app.log` after a test session to confirm nothing leaks.
