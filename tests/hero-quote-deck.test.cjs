// MPI-696. The landing hero deals one quote per boot from a shuffled DECK whose
// position is persisted, so the promise to the user is "you will not see the same
// line twice until you have seen them all". Two ways that promise breaks silently:
//   1. the deck repeats within itself, or repeats across the reshuffle boundary;
//   2. a deck stored by an older build indexes off the end of an edited quote list —
//      which would show `undefined` in the hero, not a quote.

const assert = require('node:assert');
const test = require('node:test');

test('HERO_QUOTES is 50 short, attributed, unique quotes', async () => {
    const { HERO_QUOTES } = await import('../js/shell/heroQuote.js');

    assert.strictEqual(HERO_QUOTES.length, 50);
    assert.ok(Object.isFrozen(HERO_QUOTES));

    const seen = new Set();
    for (const q of HERO_QUOTES) {
        assert.ok(q.t && q.t.length <= 95, `quote too long or empty: ${q.t}`);
        assert.ok(q.a && q.a.trim().length > 0, `missing attribution: ${q.t}`);
        assert.ok(!q.t.startsWith('"') && !q.t.startsWith('“'), `quote marks are added by the view: ${q.t}`);
        assert.ok(!seen.has(q.t), `duplicate quote: ${q.t}`);
        seen.add(q.t);
    }
});

test('a deck deals every quote once, and never repeats across the reshuffle', async () => {
    const { pickFromDeck, HERO_QUOTES } = await import('../js/shell/heroQuote.js');
    const n = HERO_QUOTES.length;

    let deck = null;
    const drawAll = () => {
        const out = [];
        for (let i = 0; i < n; i++) {
            const r = pickFromDeck(deck, n);
            deck = r.deck;
            out.push(r.index);
        }
        return out;
    };

    const first = drawAll();
    assert.strictEqual(new Set(first).size, n, 'first deck repeated a quote before it was spent');

    const second = drawAll();
    assert.strictEqual(new Set(second).size, n, 'second deck repeated a quote before it was spent');
    assert.notStrictEqual(second[0], first[n - 1], 'new deck opened on the quote that closed the last one');
});

test('a deck from a different-length quote list is discarded, not indexed', async () => {
    const { pickFromDeck } = await import('../js/shell/heroQuote.js');

    // Stored by a build that shipped 3 quotes; the list is 5 now.
    const grown = pickFromDeck({ order: [2, 0, 1], pos: 1 }, 5);
    assert.ok(grown.index >= 0 && grown.index < 5);
    assert.strictEqual(grown.deck.order.length, 5);

    // Stored by a build that shipped 9; the list is 4 now — index 8 would be undefined.
    const shrunk = pickFromDeck({ order: [8, 7, 6, 5, 4, 3, 2, 1, 0], pos: 0 }, 4);
    assert.ok(shrunk.index >= 0 && shrunk.index < 4);
    assert.strictEqual(shrunk.deck.order.length, 4);

    // Junk of every shape a corrupt/absent localStorage value can take.
    for (const junk of [null, undefined, {}, { order: 'nope', pos: 2 }, { order: [0, 1], pos: 'x' }, { order: [0, null], pos: 0 }]) {
        const r = pickFromDeck(junk, 6);
        assert.ok(Number.isInteger(r.index) && r.index >= 0 && r.index < 6, `junk deck yielded ${r.index}`);
        assert.strictEqual(r.deck.pos, 1);
    }
});
