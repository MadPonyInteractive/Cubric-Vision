/**
 * displayHelpers.js — Display/formatting utilities.
 */

/**
 * Truncate a card display name to maxLength, adding ellipsis.
 * @param {string} name
 * @param {number} [maxLength=28]
 * @returns {string}
 */
export function truncateCardName(name, maxLength = 28) {
    if (!name) return '';
    return name.length > maxLength ? name.slice(0, maxLength - 1) + '…' : name;
}
