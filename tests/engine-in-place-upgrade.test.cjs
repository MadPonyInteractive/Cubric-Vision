// MPI-457 — /engine/upgrade used to delete the whole ~11 GB engine tree and
// re-download the ~1 GB portable plus every custom node and pip dep. Measured on the
// real 0.29.2 -> 0.30.0 bump, the delta was ONE git checkout and THREE pip packages.
//
// The in-place path installs exactly the requirement lines that MOVED. Two things
// have to hold or it is worse than the wipe it replaces:
//   1. it installs the moved lines and nothing else — an over-broad set re-resolves
//      the whole graph on the user's machine, an under-broad one ships a ComfyUI
//      whose new code imports a package that is not there;
//   2. an ENGINE-OWNED package moving routes to the full reinstall. pip cannot
//      deliver a new portable torch/CUDA stack, and installing it into the embedded
//      python is the exact stomp `--no-deps` exists to prevent (shared.js § curated
//      python deps).
const assert = require('assert');
const { changedRequirements, engineOwnedChange, comfyLoadsNodeFolder } = require('../routes/engine');

// ── 1. The real bump, verbatim ───────────────────────────────────────────────
// Trimmed from ComfyUI's own requirements.txt at the two tags. torch is present in
// BOTH and unpinned, which is the point: it must not read as a change.
const REQ_0292 = `comfyui-frontend-package==1.46.9
comfyui-workflow-templates==0.11.20
comfyui-embedded-docs==0.2.9
comfy-kitchen==0.2.24
comfy-aimdo==0.4.9
torch
torchsde
torchvision
numpy>=1.25.0
`;
const REQ_0300 = `comfyui-frontend-package==1.47.11
comfyui-workflow-templates==0.11.27
comfyui-embedded-docs==0.2.9
comfy-kitchen==0.2.26
comfy-aimdo==0.4.11
torch
torchsde
torchvision
numpy>=1.25.0
`;

const moved = changedRequirements(REQ_0292, REQ_0300);
assert.deepStrictEqual(
    moved,
    [
        'comfyui-frontend-package==1.47.11',
        'comfyui-workflow-templates==0.11.27',
        'comfy-kitchen==0.2.26',
        'comfy-aimdo==0.4.11',
    ],
    'only the lines whose pin moved may be installed'
);
assert.ok(!moved.some((l) => l.startsWith('torch')), 'an unchanged unpinned torch line is NOT a change');
assert.strictEqual(engineOwnedChange(moved), null, 'the real 0.29.2 -> 0.30.0 bump stays on the in-place path');

// ── 2. Nothing moved = no pip at all ─────────────────────────────────────────
assert.deepStrictEqual(changedRequirements(REQ_0300, REQ_0300), [], 'an identical file means no pip work');

// ── 3. A REMOVED line is not an action ───────────────────────────────────────
// Uninstalling a package out from under a custom node that still imports it turns a
// core bump into a node crash. Leaving a spare package installed costs nothing.
assert.deepStrictEqual(
    changedRequirements(REQ_0300, REQ_0300.replace('torchsde\n', '')),
    [],
    'a package disappearing from requirements.txt must not produce pip work'
);

// ── 4. Non-specs are not installable ─────────────────────────────────────────
assert.deepStrictEqual(
    changedRequirements('', '# a comment\n\n-r other.txt\n--extra-index-url https://x\nkornia==0.7.0\n'),
    ['kornia==0.7.0'],
    'comments, blanks, -r and --flag lines are not pip specs'
);
assert.deepStrictEqual(
    changedRequirements('kornia==0.7.0\n', 'kornia==0.7.0  # inline note\n'),
    [],
    'an inline comment is not a version change'
);

// ── 5. Engine-owned moves route to the full reinstall ────────────────────────
// This is the "portable-level python or torch change" signal. Each of these can only
// arrive by re-extracting the portable.
for (const spec of ['torch==2.9.0', 'torchvision==0.24.0', 'torchaudio==2.9.0', 'triton==3.5.0', 'nvidia-cudnn-cu13==9.14.0', 'cuda-toolkit==13.0']) {
    assert.strictEqual(
        engineOwnedChange([spec]),
        spec.split('==')[0].toLowerCase(),
        `a moved ${spec} must force the full reinstall`
    );
}
// pip treats `_` and `-` as the same distribution, so the underscore spelling of an
// nvidia wheel must not slip past a rule written with hyphens.
assert.strictEqual(engineOwnedChange(['nvidia_cudnn_cu13==9.14.0']), 'nvidia-cudnn-cu13',
    'the underscore spelling of an engine-owned wheel is the same package');
// Near-misses that must NOT trip it — these are ordinary pip packages ComfyUI really ships.
assert.strictEqual(engineOwnedChange(['torchsde==0.2.6', 'torchdiffeq==0.2.5']), null,
    'torchsde and torchdiffeq are pip-installable, not portable-owned');

// ── 6. A disabled node folder is not evidence of anything ────────────────────
// The MPI-457 proving run's first attempt: a leftover
// `ComfyUI-MpiNodes.stale-aaa1d2d9.disabled` on the dev machine carried a real
// `.mpi_node_commit` marker from when it was a live install, matched no registry id,
// and sent an 11 GB engine to the full wipe. ComfyUI skips `.disabled` folders, so it
// was never loaded and could never have broken a generation.
assert.strictEqual(comfyLoadsNodeFolder('ComfyUI-MpiNodes.stale-aaa1d2d9.disabled'), false,
    'the exact folder that triggered the false wipe');
assert.strictEqual(comfyLoadsNodeFolder('ComfyUI-KJNodes.disabled'), false, 'upstream opt-out suffix');
assert.strictEqual(comfyLoadsNodeFolder('ComfyUI-KJNodes.DISABLED'), false, 'the suffix is case-insensitive on Windows');
// A stray copy WITHOUT the suffix does get imported, so it stays a real signal.
assert.strictEqual(comfyLoadsNodeFolder('ComfyUI-MpiNodes.stale-aaa1d2d9'), true, 'no suffix = ComfyUI imports it');
assert.strictEqual(comfyLoadsNodeFolder('ComfyUI-LTXVideo'), true, 'an ordinary node loads');
assert.strictEqual(comfyLoadsNodeFolder('some.disabled.node'), true, 'only the SUFFIX disables, not the substring');

console.log('engine-in-place-upgrade: OK');
