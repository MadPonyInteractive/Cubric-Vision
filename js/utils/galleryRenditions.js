/**
 * galleryRenditions.js — which image rendition a gallery card mounts (MPI-633).
 *
 * Its own module for one reason: `MpiGalleryGrid.js` imports `/js/utils/dom.js` by
 * absolute browser path, so Node cannot import it and the rule could not be tested
 * where it lived. This file imports nothing, so `tests/gallery-renditions.test.cjs`
 * drives the real thing rather than a copy of it.
 */

/**
 * The box, in DEVICE pixels, above which a card mounts the large rendition instead
 * of the 512 thumb. Mirrors `IMAGE_RENDITION_PX.small` in `services/ffmpegThumb.js`,
 * which is where the ladder and its measurements are documented — a renderer module
 * cannot require a server one, so the number is spelled twice.
 */
export const LARGE_RENDITION_MIN_BOX_PX = 512;

/**
 * Smallest rendition whose pixels cover `boxPx`; `filePath` when neither does.
 *
 * Falling through to `filePath` is not a failure mode — it is the RIGHT answer for a
 * source at or below the large tier, because no rendition is ever written above the
 * source and the original therefore IS that tier (most assets in a Vision project are
 * 1280x800). It is equally the answer for an item that predates thumbs entirely.
 *
 * `boxPx` is the longest edge of the card's RENDERED BOX, in device pixels. Callers
 * pass 0 for a card that is off screen, which is how the scroll-out demote asks for
 * the cheap rendition back.
 *
 * `allowSource: false` removes `filePath` from both fallbacks, for a VIDEO card's
 * poster (MPI-689). Same ladder, same files — but a video's `filePath` is a video,
 * and the `<img>` this src lands in would paint a missing card. A clip is therefore
 * always written a large poster when it is wider than the small tier, so the tier
 * this returns exists whenever the box asks for it.
 *
 * @param {{thumbPath?: string|null, thumbPathLg?: string|null, filePath?: string|null}} item
 * @param {number} boxPx
 * @param {{allowSource?: boolean}} [opts]
 * @returns {string}
 */
export function pickImageRendition(item, boxPx, { allowSource = true } = {}) {
    const source = allowSource ? item?.filePath : null;
    const small = item?.thumbPath || source || '';
    if (!(boxPx > LARGE_RENDITION_MIN_BOX_PX)) return small;
    return item?.thumbPathLg || source || small;
}
