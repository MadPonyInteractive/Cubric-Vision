/**
 * maskTextPrompt.js — build the SAM3 open-vocabulary prompt (MPI-384).
 *
 * `_parse_prompts` in `comfy/text_encoders/sam3_clip.py` comma-splits the prompt
 * and reads a trailing `:N` as that category's detection cap. A BARE category
 * silently returns exactly ONE object — proven live: `horn` gave 1 chip on an
 * image where `horn:2` gave 2. So the count has to be stamped on EVERY category,
 * not just the last one.
 *
 * Pure string work, no DOM — the tool owns the count, this owns the format.
 */

/**
 * @param {string} raw   - what the user typed, e.g. 'bikini, purse'
 * @param {number} count - how many of each to find
 * @returns {string} '' when nothing was typed (the viewer refuses the run)
 */
export function stampDetectionCount(raw, count) {
    const n = Math.max(1, Math.round(Number(count) || 1));
    return String(raw || '')
        .split(',')
        // Strip any `:N` the user typed themselves — the count input is the
        // single source of truth, and `horn:3:2` would parse as category 'horn:3'.
        .map(part => part.trim().replace(/\s*:\s*[\d.]+\s*$/, '').trim())
        .filter(Boolean)
        .map(part => `${part}:${n}`)
        .join(', ');
}
