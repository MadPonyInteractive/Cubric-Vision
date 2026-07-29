// MPI-387 — a clean Windows 11 install died mid-pip with
// `OSError: [Errno 2] No such file or directory` on a deep `diffusers` file: 266
// characters against Windows' 260-char MAX_PATH. Two fixes are pinned here.
//
// 1. The install-root depth budget. The deepest file pip writes under the engine
//    root measured 171 chars, so a root over 260-171 = 89 chars can never finish
//    an install. If this budget drifts, the app goes back to downloading multiple
//    GB and then failing with an unactionable error.
// 2. The failure ATTRIBUTION. All 14 node zips extracted fine on that machine and
//    three *pip* steps failed, yet the user was told "extractions failed" — which
//    is why an agent told them to press Retry against deterministic failures.
const assert = require('assert');
const { installPathDepthError } = require('../routes/engine');
const { _describeNodeInstallFailures } = require('../routes/downloadManager');

// ── 1. Depth budget ──────────────────────────────────────────────────────────

// The real failing root, verbatim from the captured app.log: the archive name
// landed twice because Explorer's "Extract All" names its destination after the
// zip and the zip carried an inner root of the same name.
const BROKEN_ROOT = 'C:\\Users\\hugom\\Downloads\\CubricVision-windows-x64-v1.2.0\\CubricVision-windows-x64-v1.2.0\\engine';
// The same download after the build fix (build-portable.mjs writes the Windows
// full archive with no inner root folder).
const FIXED_ROOT = 'C:\\Users\\hugom\\Downloads\\CubricVision-windows-x64-v1.2.0\\engine';

assert.strictEqual(BROKEN_ROOT.length, 95, 'the measured broken root is 95 chars — 95 + 171 = 266');
assert.strictEqual(FIXED_ROOT.length, 63, 'dropping the doubled root saves 32 chars');

assert.ok(installPathDepthError(BROKEN_ROOT), 'the root that actually failed must be rejected');
assert.strictEqual(installPathDepthError(FIXED_ROOT), null, 'the same download without the doubled root must pass');

// The message has to tell the user what to DO, not just that something is wrong.
const reason = installPathDepthError(BROKEN_ROOT);
assert.ok(/95 characters/.test(reason), 'must state the measured length');
assert.ok(/89 or fewer/.test(reason), 'must state the budget (260 - 171)');
assert.ok(/closer to the drive root/i.test(reason), 'must state the fix');
assert.ok(reason.includes(BROKEN_ROOT), 'must name the offending path');

// Exact boundary — 89 passes, 90 does not.
assert.strictEqual(installPathDepthError('C'.repeat(89)), null, '89 chars is the last passing length');
assert.ok(installPathDepthError('C'.repeat(90)), '90 chars must be rejected');

// ── 2. Failure attribution ───────────────────────────────────────────────────

// The clean-Win11 case: zero extraction failures, three pip failures.
const pipOnly = _describeNodeInstallFailures([], [
    'comfyui-ltxvideo (requirements: Pip command failed with code 1)',
    'comfyui-impact-pack (requirements: Pip command failed with code 1)',
    'comfyui-frame-interpolation (Custom command "python install.py" failed with exit code 1)',
]);
assert.ok(!/extract/i.test(pipOnly), 'a pip-only batch must NOT claim extraction failed');
assert.ok(/dependency install failed for 3/.test(pipOnly), 'must count and name the real phase');
assert.ok(/comfyui-ltxvideo/.test(pipOnly), 'must name the failing dep');

const extractOnly = _describeNodeInstallFailures(['comfyui-kjnodes (zip missing)'], []);
assert.ok(/could not extract 1/.test(extractOnly), 'an extraction-only batch must say extraction');
assert.ok(!/dependency install/.test(extractOnly), 'and must not mention pip');

const both = _describeNodeInstallFailures(['a (zip missing)'], ['b (requirements: boom)']);
assert.ok(/could not extract 1/.test(both) && /dependency install failed for 1/.test(both),
    'a mixed batch must report both kinds');

console.log('install-path-depth: ok');
