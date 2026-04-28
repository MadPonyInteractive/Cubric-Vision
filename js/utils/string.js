/**
 * js/utils/string.js — String utilities for Cubric Studio.
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

/**
 * Formats seconds into MM:SS.ms display string.
 * @param {number} s
 * @returns {string}
 */
export const formatTime = (s) => {
    if (isNaN(s) || s < 0) return '00:00.00';
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms  = Math.floor((s % 1) * 100);
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
};
