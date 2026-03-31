/**
 * js/utils/seed.js — Seed generation for generative AI tools.
 * Canonical location. Import from here, not from uiHelpers.js.
 */

'use strict';

/**
 * Generates a random 14-digit integer seed.
 * 14 digits required for FLUX and SDXL high-precision noise resolution.
 * @returns {number}
 */
export const generateSeed = () => Math.floor(Math.random() * 100_000_000_000_000);
