/**
 * js/utils/string.js — String utilities for MpiAiSuite.
 */

'use strict';

/**
 * Truncates a string to n characters, appending '…' if truncated.
 * @param {string} str
 * @param {number} n
 * @returns {string}
 */
export const truncate = (str, n) =>
    str.length > n ? str.slice(0, n - 1) + '…' : str;

/**
 * Capitalizes the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
export const capitalize = (str) =>
    str ? str[0].toUpperCase() + str.slice(1) : '';

/**
 * Converts a string to a URL-safe slug.
 * @param {string} str
 * @returns {string}
 */
export const slugify = (str) =>
    str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
