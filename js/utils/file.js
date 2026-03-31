/**
 * js/utils/file.js — File/media type utilities for MpiAiSuite.
 */

'use strict';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']);

/**
 * Returns the lowercase file extension (without dot).
 * @param {string} filename
 * @returns {string}
 */
export const getExtension = (filename) =>
    (filename || '').split('.').pop().toLowerCase();

/**
 * Formats bytes as a human-readable string (e.g. "1.4 MB").
 * @param {number} bytes
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatBytes(bytes, decimals = 1) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

/** @param {string} filename @returns {boolean} */
export const isImageFile = (filename) => IMAGE_EXTS.has(getExtension(filename));

/** @param {string} filename @returns {boolean} */
export const isVideoFile = (filename) => VIDEO_EXTS.has(getExtension(filename));

/** @param {string} filename @returns {boolean} */
export const isAudioFile = (filename) => AUDIO_EXTS.has(getExtension(filename));
