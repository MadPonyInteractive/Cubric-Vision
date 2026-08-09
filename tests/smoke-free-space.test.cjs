// MPI-483 bug 2 — the smoke preflight must refuse to rent on MEASURED free bytes.
//
// It used to compare its estimate against the volume's configured SIZE and nothing else:
// it printed "weights 300.5 GB · volume 350 GB", passed, rented two Pods, filled for ~40
// minutes and died 8 models in with the GPU leg still unproven. Free space is unknowable
// before a Pod mounts the volume (RunPod's API has no live usage), so the gate runs right
// after the download Pod comes up — and `abort` deletes that Pod on its way out.
//
// The pure verdict is what is tested here; the wiring around it needs a Pod.

const assert = require('node:assert');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCRIPT = pathToFileURL(path.join(__dirname, '..', 'scripts', 'smoke-workflows.mjs')).href;

const GiB = 1024 ** 3;
const RP_GB = 1e9;

// The real 2026-08-08 shape: a 350 GB volume and a 300.5 GiB (= 322.7 GB) set.
// FIT_MARGIN is the runner's 5 GB, NOT VOLUME_HEADROOM_GB — see the constant's comment.
const SET_BYTES = 300.5 * GiB;
const HEADROOM = 5 * RP_GB;
const TOTAL = 350 * RP_GB;

let volumeFitVerdict;

test.before(async () => {
    // Importing is safe: the script guards its main() behind INVOKED_DIRECTLY. It used to
    // rent an L4 on import, which is exactly why that guard exists.
    ({ volumeFitVerdict } = await import(SCRIPT));
});

test('empty 350 GB volume: the real set fits, so the run proceeds', () => {
    // 322.7 GB of weights, +5% = 338.9, +5 margin = 343.9 <= 350 free. This is the case a
    // too-strict margin would wrongly refuse — the fill on this volume has worked.
    const v = volumeFitVerdict({ usedBytes: 0, totalBytes: TOTAL, setBytes: SET_BYTES, headroomBytes: HEADROOM });
    assert.equal(v.unknown, false);
    assert.equal(v.ok, true, 'a 350 GB volume does take the 322.7 GB set');
    assert.equal(v.why, '');
});

test('NEGATIVE CONTROL — the same set on a volume one size too small is refused', () => {
    const v = volumeFitVerdict({ usedBytes: 0, totalBytes: 330 * RP_GB, setBytes: SET_BYTES, headroomBytes: HEADROOM });
    assert.equal(v.ok, false, '330 GB cannot take 343.9 GB of requirement');
    assert.match(v.why, /cannot fit the set/);
});

test('mostly-filled volume: only the remainder is still needed, so a resume proceeds', () => {
    // 259 GB already down of a 322.7 GB set -> 63.7 GB still needed, 91 GB free.
    const v = volumeFitVerdict({
        usedBytes: 259 * RP_GB, totalBytes: TOTAL, setBytes: SET_BYTES, headroomBytes: HEADROOM,
    });
    assert.equal(v.ok, true);
    assert.ok(Math.abs(v.freeBytes - 91 * RP_GB) < RP_GB, `free ~91 GB, got ${v.freeBytes}`);
    assert.ok(Math.abs(v.stillNeededBytes - 63.7 * RP_GB) < RP_GB, `still needed ~63.7 GB, got ${v.stillNeededBytes}`);
});

test('the class this card exists to stop: the set outgrew the volume', () => {
    // A grown model set — 400 GB of weights, 100 GB already down, 250 GB free. 300 GB
    // still to fetch does not fit, and the old check (400 vs the 350 GB SIZE) said nothing
    // about it until 40 minutes of filling had already been paid for.
    const v = volumeFitVerdict({
        usedBytes: 100 * RP_GB, totalBytes: TOTAL, setBytes: 400 * RP_GB, headroomBytes: HEADROOM,
    });
    assert.equal(v.ok, false);
    assert.match(v.why, /Refusing to rent/);
    assert.match(v.line, /MEASURED used/);
});

test('a nearly-full volume still passes when the remainder genuinely fits', () => {
    // 300 GB down of 322.7, 50 GB free, 22.7 GB to go. The gate must not turn "nearly
    // full" into a refusal — that would block every late resume.
    const v = volumeFitVerdict({
        usedBytes: 300 * RP_GB, totalBytes: TOTAL, setBytes: SET_BYTES, headroomBytes: HEADROOM,
    });
    assert.equal(v.ok, true);
});

test('a volume holding MORE than the set weighs is flagged, not silently read as 0 needed', () => {
    // used > setBytes -> stillNeeded is 0, and only the headroom term keeps the gate real.
    const v = volumeFitVerdict({
        usedBytes: 348 * RP_GB, totalBytes: TOTAL, setBytes: SET_BYTES, headroomBytes: HEADROOM,
    });
    assert.equal(v.stillNeededBytes, 0);
    assert.equal(v.ok, false, '2 GB free must not pass just because still-needed computed to 0');
    assert.match(v.line, /holds MORE than this set weighs/);
});

test('missing telemetry never blocks a run that would have worked', () => {
    for (const m of [
        { usedBytes: null, totalBytes: TOTAL },
        { usedBytes: 10 * RP_GB, totalBytes: null },
        { usedBytes: 10 * RP_GB, totalBytes: 0 },
    ]) {
        const v = volumeFitVerdict({ ...m, setBytes: SET_BYTES, headroomBytes: HEADROOM });
        assert.equal(v.ok, true, `unknown telemetry must not block: ${JSON.stringify(m)}`);
        assert.equal(v.unknown, true);
        assert.match(v.line, /UNKNOWN/);
    }
});
