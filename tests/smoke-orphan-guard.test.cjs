// MPI-450 — a smoke op is declared ORPHANED on two readings: absent from the queue AND
// absent from history. `app()` throws alike on a relay 502 and on a network error, so
// `.catch(() => null)` on the history re-read collapsed "could not read" into "absent",
// and one failed read was enough to FAIL a passing op. The queue read above it always had
// this guard ("a queue read we could not make is not evidence the prompt left"); the
// history re-read did not.
//
// This matters because that re-read is the one most likely to fail: it fires at the
// completion boundary, right after the op's heaviest work. minimax-h3/t2v_ms was reported
// orphaned at 162s on the 2026-08-10 matrix and passes in 153s — the same moment.
//
// The negative control is the point of the file: the guard must not buy quiet by
// disabling detection. A history read that SUCCEEDS and comes back empty must still
// report the orphan.

const assert = require('node:assert');
const test = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCRIPT = pathToFileURL(path.join(__dirname, '..', 'scripts', 'smoke-workflows.mjs')).href;

const PROMPT = 'abc-123';
const PAST_GRACE = 60_000; // orphan checks are suppressed for the first 30s

/**
 * Stub globalThis.fetch. `routes` maps a URL fragment to either a JSON body (200) or
 * an { status } object, which app() turns into a throw exactly as a real relay 502 does.
 */
function stubFetch(routes) {
    const calls = [];
    globalThis.fetch = async (url) => {
        calls.push(String(url));
        const hit = Object.entries(routes).find(([frag]) => String(url).includes(frag));
        const spec = hit ? hit[1] : {};
        if (spec && typeof spec === 'object' && 'status' in spec) {
            return { ok: false, status: spec.status, text: async () => 'relay_failed' };
        }
        return { ok: true, status: 200, text: async () => JSON.stringify(spec) };
    };
    return calls;
}

const EMPTY_QUEUE = { queue_running: [], queue_pending: [] };
const realFetch = globalThis.fetch;

test.afterEach(() => { globalThis.fetch = realFetch; });

test('a history re-read that FAILS is not evidence the prompt left', async () => {
    stubFetch({
        '/proxy/queue': EMPTY_QUEUE,
        '/proxy/history/': { status: 502 },   // the relay blip
    });
    const { orphanReason } = await import(SCRIPT);
    assert.strictEqual(await orphanReason(PROMPT, PAST_GRACE), null,
        'a read we could not MAKE must return null (keep waiting), never declare an orphan');
});

test('NEGATIVE CONTROL — a history read that SUCCEEDS and is empty still reports the orphan', async () => {
    stubFetch({
        '/proxy/queue': EMPTY_QUEUE,
        '/proxy/history/': {},                // ComfyUI answered: the prompt is not there
        '/remote/comfy/status': { ready: true, comfyReady: true },
    });
    const { orphanReason } = await import(SCRIPT);
    const why = await orphanReason(PROMPT, PAST_GRACE);
    assert.match(String(why), /absent from/,
        'the guard must not buy quiet by disabling detection — a real absence still reports');
});

test('a prompt still in the queue is never orphaned', async () => {
    stubFetch({
        '/proxy/queue': { queue_running: [[0, PROMPT]], queue_pending: [] },
        '/proxy/history/': {},
    });
    const { orphanReason } = await import(SCRIPT);
    assert.strictEqual(await orphanReason(PROMPT, PAST_GRACE), null, 'queued means running');
});

test('a queue read that FAILS is not evidence either (the guard that already existed)', async () => {
    stubFetch({ '/proxy/queue': { status: 502 } });
    const { orphanReason } = await import(SCRIPT);
    assert.strictEqual(await orphanReason(PROMPT, PAST_GRACE), null, 'no queue read, no verdict');
});

test('no orphan verdict inside the grace window, whatever the reads say', async () => {
    stubFetch({ '/proxy/queue': EMPTY_QUEUE, '/proxy/history/': {} });
    const { orphanReason } = await import(SCRIPT);
    assert.strictEqual(await orphanReason(PROMPT, 5_000), null,
        'the submit -> queue window is not an orphan');
});
