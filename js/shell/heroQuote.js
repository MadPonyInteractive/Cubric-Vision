/**
 * heroQuote.js — The landing hero's rotating line (MPI-696).
 *
 * The hero used to explain what the app is to somebody who had already opened it.
 * It now shows one short quote for makers, drawn ONCE PER APP BOOT — not per
 * navigation back to the landing page, so the line a user reads while working stays
 * put until they next launch.
 *
 * Draw order is a shuffled DECK, not a random pick: a deck deals every quote once
 * before any repeats, and its position survives a restart (localStorage), so across
 * 50 launches the app never says the same thing twice.
 *
 * The deck is also SPREAD by category — a plain shuffle deals every quote once but
 * happily puts three music lines back to back, which reads as a themed streak rather
 * than variety. See `_spread`.
 */

import { gid } from '../utils/dom.js';
import { Storage } from '../core/storage.js';

/**
 * 50 quotes, spread over image, film, music and the plain act of making.
 * Short enough to read at a glance. Attribution is part of the quote — anything
 * whose author is genuinely disputed (the Einstein and "great artists steal"
 * internet staples) was left out rather than printed under a name it may not own.
 *
 * `c` is the spread key, and it tags what the quote is ABOUT, not who said it — a
 * painter's line about simply getting to work is `craft`, not `art`. Four values:
 *   art   — art and seeing (15)   lens  — film and photography (6)
 *   sound — music (6)             craft — the act of making, and sticking at it (23)
 * No category may exceed ceil(50 / 2) or an alternating deal becomes impossible;
 * the test asserts that ceiling, so a re-tag that breaks it fails loudly.
 */
export const HERO_QUOTES = Object.freeze([
    { t: 'Creativity takes courage.', a: 'Henri Matisse', c: 'craft' },
    { t: "Don't wait for inspiration. It comes while one is working.", a: 'Henri Matisse', c: 'craft' },
    { t: 'Inspiration exists, but it has to find you working.', a: 'Pablo Picasso', c: 'craft' },
    { t: 'Everything you can imagine is real.', a: 'Pablo Picasso', c: 'craft' },
    { t: 'Learn the rules like a pro, so you can break them like an artist.', a: 'Pablo Picasso', c: 'craft' },
    { t: 'Art washes from the soul the dust of everyday life.', a: 'Pablo Picasso', c: 'art' },
    { t: 'The chief enemy of creativity is good sense.', a: 'Pablo Picasso', c: 'craft' },
    { t: 'Art is the lie that enables us to realise the truth.', a: 'Pablo Picasso', c: 'art' },
    { t: 'Art is not what you see, but what you make others see.', a: 'Edgar Degas', c: 'art' },
    { t: 'Art is never finished, only abandoned.', a: 'Leonardo da Vinci', c: 'art' },
    { t: 'Simplicity is the ultimate sophistication.', a: 'Leonardo da Vinci', c: 'craft' },
    { t: 'Painting is poetry that is seen rather than felt.', a: 'Leonardo da Vinci', c: 'art' },
    { t: 'Where the spirit does not work with the hand, there is no art.', a: 'Leonardo da Vinci', c: 'art' },
    { t: 'Great things are done by a series of small things brought together.', a: 'Vincent van Gogh', c: 'craft' },
    { t: 'I dream my painting, and then I paint my dream.', a: 'Vincent van Gogh', c: 'art' },
    { t: 'What is done in love is done well.', a: 'Vincent van Gogh', c: 'craft' },
    { t: "Have no fear of perfection — you'll never reach it.", a: 'Salvador Dalí', c: 'craft' },
    { t: "Don't think about making art. Just get it done.", a: 'Andy Warhol', c: 'craft' },
    { t: 'You can\'t use up creativity. The more you use, the more you have.', a: 'Maya Angelou', c: 'craft' },
    { t: 'Nothing will work unless you do.', a: 'Maya Angelou', c: 'craft' },
    { t: 'Creativity is allowing yourself to make mistakes. Art is knowing which ones to keep.', a: 'Scott Adams', c: 'craft' },
    { t: 'The worst enemy to creativity is self-doubt.', a: 'Sylvia Plath', c: 'craft' },
    { t: 'An artist is not paid for his labour, but for his vision.', a: 'James McNeill Whistler', c: 'art' },
    { t: 'Colour is a power which directly influences the soul.', a: 'Wassily Kandinsky', c: 'art' },
    { t: 'There is no must in art, because art is free.', a: 'Wassily Kandinsky', c: 'art' },
    { t: 'I shut my eyes in order to see.', a: 'Paul Gauguin', c: 'art' },
    { t: 'The job of the artist is always to deepen the mystery.', a: 'Francis Bacon', c: 'art' },
    { t: 'The enemy of art is the absence of limitations.', a: 'Orson Welles', c: 'lens' },
    { t: 'A film is a ribbon of dreams.', a: 'Orson Welles', c: 'lens' },
    { t: "Cinema is a matter of what's in the frame and what's out.", a: 'Martin Scorsese', c: 'lens' },
    { t: 'Film is truth twenty-four times a second.', a: 'Jean-Luc Godard', c: 'lens' },
    { t: "You don't take a photograph, you make it.", a: 'Ansel Adams', c: 'lens' },
    { t: "My favourite photograph is the one I'm going to take tomorrow.", a: 'Imogen Cunningham', c: 'lens' },
    { t: 'Music is the shorthand of emotion.', a: 'Leo Tolstoy', c: 'sound' },
    { t: 'Without music, life would be a mistake.', a: 'Friedrich Nietzsche', c: 'sound' },
    { t: 'You must have chaos within you to give birth to a dancing star.', a: 'Friedrich Nietzsche', c: 'sound' },
    { t: 'Musicians paint their pictures on silence.', a: 'Leopold Stokowski', c: 'sound' },
    { t: 'Do not fear mistakes. There are none.', a: 'Miles Davis', c: 'sound' },
    { t: 'Sometimes you have to play a long time to be able to play like yourself.', a: 'Miles Davis', c: 'sound' },
    { t: 'Amateurs sit and wait for inspiration; the rest of us just get up and go to work.', a: 'Stephen King', c: 'craft' },
    { t: "You can't wait for inspiration. You have to go after it with a club.", a: 'Jack London', c: 'craft' },
    { t: 'Life imitates art far more than art imitates life.', a: 'Oscar Wilde', c: 'art' },
    { t: 'We are all in the gutter, but some of us are looking at the stars.', a: 'Oscar Wilde', c: 'craft' },
    { t: 'Art enables us to find ourselves and lose ourselves at the same time.', a: 'Thomas Merton', c: 'art' },
    { t: 'Art is the only way to run away without leaving home.', a: 'Twyla Tharp', c: 'art' },
    { t: 'The artist is nothing without the gift, but the gift is nothing without the work.', a: 'Émile Zola', c: 'craft' },
    { t: 'To practice any art, no matter how well or badly, is a way to make your soul grow.', a: 'Kurt Vonnegut', c: 'craft' },
    { t: 'Creativity is just connecting things.', a: 'Steve Jobs', c: 'craft' },
    { t: 'Start where you are. Use what you have. Do what you can.', a: 'Arthur Ashe', c: 'craft' },
    { t: 'Every artist was first an amateur.', a: 'Ralph Waldo Emerson', c: 'craft' },
]);

/** Fisher–Yates, in place. */
function _shuffleInPlace(list, rand) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

/**
 * Build a deal order in which NO TWO CONSECUTIVE quotes share a category — including
 * across the deck boundary, which is what `prevCat` (the category of the last quote
 * the previous deck dealt) is for.
 *
 * A plain shuffle deals all 50 before repeating and still produces "three music
 * quotes in a row", because uniform randomness clumps. So: bucket by category,
 * shuffle each bucket, and deal from a bucket that isn't the one just dealt —
 * chosen with probability proportional to what it has left, so the small categories
 * (six film, six music) are sprinkled through the deck at their true share instead
 * of surfacing only once the two big ones are spent.
 *
 * The one exception to that roll is a category holding more than half of what
 * remains: it MUST go now, or its leftovers have to run together at the end. That
 * rule is also why the per-category ceiling of ceil(count / 2) matters at the top of
 * the deck — the test asserts it, since a re-tag is what would quietly break it.
 */
function _spread(count, prevCat, rand) {
    const pools = new Map();
    for (let i = 0; i < count; i++) {
        const c = HERO_QUOTES[i]?.c ?? 'craft';
        if (!pools.has(c)) pools.set(c, []);
        pools.get(c).push(i);
    }
    for (const list of pools.values()) _shuffleInPlace(list, rand);
    // Shuffled key order so the weighted roll walks the categories differently each
    // deck; iterating the Map's insertion order would bias every deck the same way.
    const keys = _shuffleInPlace([...pools.keys()], rand);

    const order = [];
    let last = prevCat;
    while (order.length < count) {
        const remaining = count - order.length;
        const eligible = keys.filter(c => c !== last && pools.get(c).length);

        // Only reachable once every remaining quote is in the just-dealt category.
        if (!eligible.length) { order.push(pools.get(keys.find(c => pools.get(c).length)).pop()); continue; }

        let pick = eligible.find(c => pools.get(c).length * 2 > remaining);
        if (!pick) {
            let roll = rand() * eligible.reduce((sum, c) => sum + pools.get(c).length, 0);
            pick = eligible[eligible.length - 1];
            for (const c of eligible) {
                roll -= pools.get(c).length;
                if (roll < 0) { pick = c; break; }
            }
        }
        order.push(pools.get(pick).pop());
        last = pick;
    }
    return order;
}

/**
 * Pure deck step — given the saved `{ order, pos }` (or anything at all, including
 * junk from an older build), return the index to show and the deck to store back.
 *
 * A deck is reshuffled when it is spent, malformed, or was dealt from a different
 * number of quotes — that last one matters, because editing HERO_QUOTES otherwise
 * leaves stored indices pointing off the end of the shorter list.
 *
 * @param {*} saved                 previously stored deck, or null
 * @param {number} count            HERO_QUOTES.length
 * @param {() => number} [rand]     injectable RNG (tests)
 * @returns {{ index: number, deck: { order: number[], pos: number } }}
 */
export function pickFromDeck(saved, count, rand = Math.random) {
    let order = Array.isArray(saved?.order) ? saved.order : null;
    let pos = Number.isInteger(saved?.pos) ? saved.pos : 0;

    if (order && (order.length !== count || order.some(i => !Number.isInteger(i) || i < 0 || i >= count))) order = null;

    if (!order || pos < 0 || pos >= order.length) {
        const lastIdx = order && pos > 0 ? order[Math.min(pos, order.length) - 1] : -1;
        // Handing the last dealt category forward is what keeps the seam between two
        // decks as varied as the middle of one.
        order = _spread(count, HERO_QUOTES[lastIdx]?.c ?? null, rand);
        // Belt for the degenerate single-category case, where the category rule alone
        // cannot stop a deck opening on the quote that closed the last one.
        if (count > 1 && order[0] === lastIdx) [order[0], order[count - 1]] = [order[count - 1], order[0]];
        pos = 0;
    }

    return { index: order[pos], deck: { order, pos: pos + 1 } };
}

/** Deal one quote into the hero. Called once, at boot. */
export function initHeroQuote() {
    const textEl = gid('heroQuoteText');
    const byEl = gid('heroQuoteBy');
    if (!textEl || !byEl) return;

    const { index, deck } = pickFromDeck(Storage.getHeroQuoteDeck(), HERO_QUOTES.length);
    Storage.setHeroQuoteDeck(deck);

    const quote = HERO_QUOTES[index];
    textEl.textContent = `“${quote.t}”`;
    byEl.textContent = quote.a;
}
