/**
 * js/utils/file.js — File/media type utilities for MpiAiSuite.
 */

'use strict';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']);

/**
 * Returns the lowercase file extension (without the dot).
 * @param {string} filename - The name of the file to extract the extension from.
 * @returns {string} The lowercase extension, or an empty string if none found.
 */
export const getExtension = (filename) =>
    (filename || '').split('.').pop().toLowerCase();

/**
 * Formats bytes as a human-readable string (e.g. "1.4 MB").
 * @param {number} bytes - The number of bytes to format.
 * @param {number} [decimals=1] - Number of decimal places to include.
 * @returns {string} The formatted byte string (e.g., "0 B", "1.5 KB").
 */
export function formatBytes(bytes, decimals = 1) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

/**
 * Checks if the given filename has a supported image extension.
 * @param {string} filename - The name of the file to check.
 * @returns {boolean} True if it is an image file, false otherwise.
 */
export const isImageFile = (filename) => IMAGE_EXTS.has(getExtension(filename));

/**
 * Checks if the given filename has a supported video extension.
 * @param {string} filename - The name of the file to check.
 * @returns {boolean} True if it is a video file, false otherwise.
 */
export const isVideoFile = (filename) => VIDEO_EXTS.has(getExtension(filename));

/**
 * Checks if the given filename has a supported audio extension.
 * @param {string} filename - The name of the file to check.
 * @returns {boolean} True if it is an audio file, false otherwise.
 */
export const isAudioFile = (filename) => AUDIO_EXTS.has(getExtension(filename));

