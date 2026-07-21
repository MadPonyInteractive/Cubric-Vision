/**
 * scripts/recover-runpod-key.js — recover the plaintext RunPod API key from an
 * existing Cubric Vision install, so it can be pasted into a fresh test build.
 *
 * WHY THIS EXISTS: the key is stored via Electron safeStorage (enc:'safe'). On
 * Windows the AES key lives in each install's `Local State` (DPAPI-wrapped), so a
 * `runpod-secrets.json` copied to another install won't decrypt. Recover the
 * plaintext here, then paste it into the target build's Settings → API key.
 *
 * `app.setName('Cubric Vision')` makes userData resolve to %APPDATA%\Cubric Vision
 * (the dev/default install that owns the matching Local State), so the blob decrypts.
 * To recover from a DIFFERENT install, set CUBRIC_USER_DATA_ROOT to its user-data dir.
 *
 * Run (from repo root, fresh shell so ELECTRON_RUN_AS_NODE is unset):
 *   node_modules\electron\dist\electron.exe scripts\recover-runpod-key.js
 * Output line: RESULT::KEY::<your key>   (or RESULT::<reason> on failure)
 *
 * Prints a secret to stdout by design — run it yourself, don't pipe to a log.
 */
'use strict';

const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

app.setName('Cubric Vision');
app.disableHardwareAcceleration();

if (process.env.CUBRIC_USER_DATA_ROOT) {
  app.setPath('userData', path.resolve(process.env.CUBRIC_USER_DATA_ROOT));
}

app.whenReady().then(() => {
  try {
    const p = path.join(app.getPath('userData'), 'runpod-secrets.json');
    const field = JSON.parse(fs.readFileSync(p, 'utf8')).runpodApiKey;
    if (!field) {
      console.log('RESULT::NO_KEY_FIELD');
    } else if (field.enc === 'safe') {
      if (!safeStorage.isEncryptionAvailable()) console.log('RESULT::ENC_UNAVAILABLE');
      else console.log('RESULT::KEY::' + safeStorage.decryptString(Buffer.from(field.blob, 'base64')));
    } else {
      console.log('RESULT::UNEXPECTED_ENC::' + field.enc);
    }
  } catch (e) {
    console.log('RESULT::ERR::' + (e && e.message));
  }
  app.quit();
});
