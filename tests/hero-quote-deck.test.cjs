// MPI-696. The landing hero deals one quote per boot from a shuffled DECK whose
// position is persisted, so the promise to the user is "you will not see the same
// line twice until you have seen them all, and you will not get a week of music".
// Four ways that promise breaks silently:
//   1. the deck repeats a quote within itself, or across the reshuffle boundary;
//   2. the deck deals two of the same CATEGORY back to back — every quote still
//      appears once, but a run of film or music reads as a themed streak, not variety;
//   3. a category grows past ceil(n/2) in a re-tag, at which point (2) is arithmetically
//      impossible and the deal quietly starts clumping again;
//   4. a deck stored by an older build indexes off the end of an edited quote list —
//      which would show `undefined` in the hero, not a quote.

const assert = require('node:assert');
const test = require('node:test');

test('HERO_QUOTES is 50 short, attributed, unique, categorised quotes', async () => {
    const { HERO_QUOTES } = await import('../js/shell/heroQuote.js');

    assert.strictEqual(HERO_QUOTES.length, 50);
    assert.ok(Object.isFrozen(HERO_QUOTES));

    const seen = new Set();
    const perCategory = new Map();
    for (const q of HERO_QUOTES) {
        assert.ok(q.t && q.t.length <= 95, `quote too long or empty: ${q.t}`);
        assert.ok(q.a && q.a.trim().length > 0, `missing attribution: ${q.t}`);
        assert.ok(['art', 'lens', 'sound', 'craft'].includes(q.c), `bad category ${q.c}: ${q.t}`);
        assert.ok(!q.t.startsWith('"') && !q.t.startsWith('“'), `quote marks are added by the view: ${q.t}`);
        assert.ok(!seen.has(q.t), `duplicate quote: ${q.t}`);
        seen.add(q.t);
        perCategory.set(q.c, (perCategory.get(q.c) ?? 0) + 1);
    }

    // The alternating deal is only possible while no category owns more than half the
    // deck. Re-tagging quotes is exactly what would breach this, so it fails here first.
    const ceiling = Math.ceil(HERO_QUOTES.length / 2);
    for (const [c, n] of perCategory) {
        assert.ok(n <= ceiling, `category ${c} holds ${n} of ${HERO_QUOTES.length}, over the ${ceiling} ceiling`);
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

test('no two consecutive quotes share a category, deck seams included', async () => {
    const { pickFromDeck, HERO_QUOTES } = await import('../js/shell/heroQuote.js');
    const n = HERO_QUOTES.length;

    // Six decks back to back — a whole year of launches — so the seams are exercised
    // as hard as the middles. A single deck could pass on luck; 300 draws cannot.
    let deck = null;
    let prev = null;
    for (let i = 0; i < n * 6; i++) {
        const { index, deck: next } = pickFromDeck(deck, n);
        deck = next;
        const q = HERO_QUOTES[index];
        if (prev) assert.notStrictEqual(q.c, prev.c, `draw ${i}: "${prev.t}" then "${q.t}" — both ${q.c}`);
        prev = q;
    }
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
