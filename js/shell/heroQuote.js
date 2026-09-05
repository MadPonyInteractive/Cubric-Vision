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
 */

import { gid } from '../utils/dom.js';
import { Storage } from '../core/storage.js';

/**
 * 50 quotes, ~evenly spread over image, film, music and the plain act of making.
 * Short enough to read at a glance. Attribution is part of the quote — anything
 * whose author is genuinely disputed (the Einstein and "great artists steal"
 * internet staples) was left out rather than printed under a name it may not own.
 */
export const HERO_QUOTES = Object.freeze([
    { t: 'Creativity takes courage.', a: 'Henri Matisse' },
    { t: "Don't wait for inspiration. It comes while one is working.", a: 'Henri Matisse' },
    { t: 'Inspiration exists, but it has to find you working.', a: 'Pablo Picasso' },
    { t: 'Everything you can imagine is real.', a: 'Pablo Picasso' },
    { t: 'Learn the rules like a pro, so you can break them like an artist.', a: 'Pablo Picasso' },
    { t: 'Art washes from the soul the dust of everyday life.', a: 'Pablo Picasso' },
    { t: 'The chief enemy of creativity is good sense.', a: 'Pablo Picasso' },
    { t: 'Art is the lie that enables us to realise the truth.', a: 'Pablo Picasso' },
    { t: 'Art is not what you see, but what you make others see.', a: 'Edgar Degas' },
    { t: 'Art is never finished, only abandoned.', a: 'Leonardo da Vinci' },
    { t: 'Simplicity is the ultimate sophistication.', a: 'Leonardo da Vinci' },
    { t: 'Painting is poetry that is seen rather than felt.', a: 'Leonardo da Vinci' },
    { t: 'Where the spirit does not work with the hand, there is no art.', a: 'Leonardo da Vinci' },
    { t: 'Great things are done by a series of small things brought together.', a: 'Vincent van Gogh' },
    { t: 'I dream my painting, and then I paint my dream.', a: 'Vincent van Gogh' },
    { t: 'What is done in love is done well.', a: 'Vincent van Gogh' },
    { t: "Have no fear of perfection — you'll never reach it.", a: 'Salvador Dalí' },
    { t: "Don't think about making art. Just get it done.", a: 'Andy Warhol' },
    { t: 'You can\'t use up creativity. The more you use, the more you have.', a: 'Maya Angelou' },
    { t: 'Nothing will work unless you do.', a: 'Maya Angelou' },
    { t: 'Creativity is allowing yourself to make mistakes. Art is knowing which ones to keep.', a: 'Scott Adams' },
    { t: 'The worst enemy to creativity is self-doubt.', a: 'Sylvia Plath' },
    { t: 'An artist is not paid for his labour, but for his vision.', a: 'James McNeill Whistler' },
    { t: 'Colour is a power which directly influences the soul.', a: 'Wassily Kandinsky' },
    { t: 'There is no must in art, because art is free.', a: 'Wassily Kandinsky' },
    { t: 'I shut my eyes in order to see.', a: 'Paul Gauguin' },
    { t: 'The job of the artist is always to deepen the mystery.', a: 'Francis Bacon' },
    { t: 'The enemy of art is the absence of limitations.', a: 'Orson Welles' },
    { t: 'A film is a ribbon of dreams.', a: 'Orson Welles' },
    { t: "Cinema is a matter of what's in the frame and what's out.", a: 'Martin Scorsese' },
    { t: 'Film is truth twenty-four times a second.', a: 'Jean-Luc Godard' },
    { t: "You don't take a photograph, you make it.", a: 'Ansel Adams' },
    { t: "My favourite photograph is the one I'm going to take tomorrow.", a: 'Imogen Cunningham' },
    { t: 'Music is the shorthand of emotion.', a: 'Leo Tolstoy' },
    { t: 'Without music, life would be a mistake.', a: 'Friedrich Nietzsche' },
    { t: 'You must have chaos within you to give birth to a dancing star.', a: 'Friedrich Nietzsche' },
    { t: 'Musicians paint their pictures on silence.', a: 'Leopold Stokowski' },
    { t: 'Do not fear mistakes. There are none.', a: 'Miles Davis' },
    { t: 'Sometimes you have to play a long time to be able to play like yourself.', a: 'Miles Davis' },
    { t: 'Amateurs sit and wait for inspiration; the rest of us just get up and go to work.', a: 'Stephen King' },
    { t: "You can't wait for inspiration. You have to go after it with a club.", a: 'Jack London' },
    { t: 'Life imitates art far more than art imitates life.', a: 'Oscar Wilde' },
    { t: 'We are all in the gutter, but some of us are looking at the stars.', a: 'Oscar Wilde' },
    { t: 'Art enables us to find ourselves and lose ourselves at the same time.', a: 'Thomas Merton' },
    { t: 'Art is the only way to run away without leaving home.', a: 'Twyla Tharp' },
    { t: 'The artist is nothing without the gift, but the gift is nothing without the work.', a: 'Émile Zola' },
    { t: 'To practice any art, no matter how well or badly, is a way to make your soul grow.', a: 'Kurt Vonnegut' },
    { t: 'Creativity is just connecting things.', a: 'Steve Jobs' },
    { t: 'Start where you are. Use what you have. Do what you can.', a: 'Arthur Ashe' },
    { t: 'Every artist was first an amateur.', a: 'Ralph Waldo Emerson' },
]);

/** Fisher–Yates over 0..count-1. `avoid` never lands first (see pickFromDeck). */
function _shuffle(count, avoid, rand) {
    const order = Array.from({ length: count }, (_, i) => i);
    for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    if (count > 1 && order[0] === avoid) [order[0], order[count - 1]] = [order[count - 1], order[0]];
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
        // Opening a fresh deck on the card that just closed the last one is the only
        // repeat a deck can produce, so hand the shuffle the index to keep off the top.
        const last = order && pos > 0 ? order[Math.min(pos, order.length) - 1] : -1;
        order = _shuffle(count, last, rand);
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
