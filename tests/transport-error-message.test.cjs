'use strict';

// MPI-427 — a download that never reaches the host must produce a readable, actionable
// message naming the host, and must NOT swallow real bugs into the same generic text.
// Run: node tests/transport-error-message.test.cjs

const assert = require('node:assert/strict');
const { _describeTransportError, _mirrorUrlsFor, _isSameObjectUrl } = require('../routes/downloadManager.js');

let passed = 0;
function test(name, fn) {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
}

const R2_URL = 'https://models.cubric.studio/vision/models/vae/LTX23_audio_vae_bf16.safetensors';

test('the verbatim report error is classified and names the host', () => {
    // Copied byte-for-byte from the user's app.log, 2026-08-02T12:04:26.934Z. This is a
    // BoringSSL string (the server runs under Electron's fork, not stock OpenSSL) — do
    // not "tidy" it into an OpenSSL-shaped one, the whole point is that it is real input.
    const err = new Error(
        'write EPROTO 108544:error:100000f7:SSL routines:OPENSSL_internal:'
        + 'WRONG_VERSION_NUMBER:..\\..\\third_party\\boringssl\\src\\ssl\\tls_record.cc:127:'
    );
    const msg = _describeTransportError(err, R2_URL);
    assert.ok(msg, 'must classify');
    assert.ok(msg.includes('models.cubric.studio'), 'names the blocked host');
    assert.ok(msg.includes('1.1.1.1'), 'carries the DNS remedy');
    assert.ok(!/boringssl|EPROTO|tls_record/i.test(msg), 'no driver internals leak to the user');
});

test('the other transport failure modes classify too', () => {
    const cases = [
        'getaddrinfo ENOTFOUND models.cubric.studio',      // DNS never resolved
        'getaddrinfo EAI_AGAIN models.cubric.studio',      // resolver timeout
        'connect ECONNREFUSED 104.21.20.96:443',           // refused
        'read ECONNRESET',                                 // reset mid-handshake
        'connect ETIMEDOUT 104.21.20.96:443',              // black-holed
        'connect EHOSTUNREACH 104.21.20.96:443',
        'unable to verify the first certificate SELF_SIGNED_CERT_IN_CHAIN', // AV/proxy MITM
        'Hostname/IP does not match ERR_TLS_CERT_ALTNAME_INVALID',
    ];
    for (const m of cases) {
        assert.ok(_describeTransportError(new Error(m), R2_URL), `should classify: ${m}`);
    }
});

test('a code-only error (no message) still classifies', () => {
    const err = new Error('');
    err.code = 'ENOTFOUND';
    assert.ok(_describeTransportError(err, R2_URL));
});

test('REAL failures are left alone — this must not become a catch-all', () => {
    // Negative control. If any of these start returning the network text, a genuine bug
    // gets reported to the user as "your network blocked it" and becomes undebuggable.
    const notTransport = [
        'SHA256 mismatch: expected abc123, got def456',
        'ENOSPC: no space left on device',
        'EACCES: permission denied, open D:/CubricVision/models/x.safetensors',
        'Request failed with status code 404',
        'UW deps install failed: rife47',
        'Download stalled — no bytes for 120s',
    ];
    for (const m of notTransport) {
        assert.equal(_describeTransportError(new Error(m), R2_URL), null, `must NOT classify: ${m}`);
    }
});

test('a malformed url degrades to a generic noun instead of throwing', () => {
    const msg = _describeTransportError(new Error('getaddrinfo ENOTFOUND x'), 'not-a-url');
    assert.ok(msg && msg.includes('the download server'));
});

// ── Mirror failover (MPI-427) ───────────────────────────────────────────────────

test('mirror list is EMPTY by default — no failover to a host that does not exist', () => {
    // Shipping a non-existent mirror turns one clean error into two slow ones. This
    // must stay empty until a real second origin is live; see _MODEL_MIRRORS.
    assert.deepEqual(_mirrorUrlsFor(R2_URL), []);
});

test('a configured mirror swaps ONLY the origin and keeps the object path', () => {
    // Re-require with the env override to exercise the configured path without
    // hardcoding a host into the shipped default.
    delete require.cache[require.resolve('../routes/downloadManager.js')];
    process.env.CUBRIC_MODEL_MIRRORS = 'https://mirror.example.net/, https://models.cubric.studio';
    const fresh = require('../routes/downloadManager.js');

    const urls = fresh._mirrorUrlsFor(R2_URL);
    assert.deepEqual(urls, ['https://mirror.example.net/vision/models/vae/LTX23_audio_vae_bf16.safetensors'],
        'path preserved, trailing slash trimmed, and the CURRENT origin is skipped');

    delete process.env.CUBRIC_MODEL_MIRRORS;
    delete require.cache[require.resolve('../routes/downloadManager.js')];
});

test('a mirrored url counts as the SAME object so the partial is resumed, not scrapped', () => {
    // MPI-317 deletes the partial when the marker url mismatches. Across mirrors the
    // origin differs but the bytes are identical — scrapping them is exactly the
    // "it jumped back down to 8" data loss this card exists to stop.
    assert.equal(_isSameObjectUrl(R2_URL, R2_URL), true, 'identical');
    assert.equal(
        _isSameObjectUrl(R2_URL, 'https://mirror.example.net/vision/models/vae/LTX23_audio_vae_bf16.safetensors'),
        true, 'same path on another origin');
    assert.equal(
        _isSameObjectUrl(R2_URL, 'https://models.cubric.studio/vision/models/vae/SOMETHING_ELSE.safetensors'),
        false, 'a genuinely different object still invalidates the partial');
    assert.equal(_isSameObjectUrl(R2_URL, 'garbage'), false, 'unparseable is never a match');
});

console.log(`\ntransport-error-message: ${passed} passed`);
