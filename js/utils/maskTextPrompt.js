/**
 * maskTextPrompt.js — build the SAM3 open-vocabulary prompt (MPI-384).
 *
 * `_parse_prompts` in `comfy/text_encoders/sam3_clip.py` comma-splits the prompt
 * and reads a trailing `:N` as that category's detection cap. A BARE category
 * silently returns exactly ONE object — proven live: `horn` gave 1 chip on an
 * image where `horn:2` gave 2. So the count has to be stamped on EVERY category,
 * not just the last one.
 *
 * But NEVER stamp `:1`. `SAM3TokenizerWrapper.tokenize_with_weights` early-outs
 * when the prompt has one category capped at 1 — and hands `super()` the RAW
 * string, `:1` included, so the suffix is tokenized as literal text and drags the
 * match under `threshold`. Measured 2026-08-02: `hair:1` and `shirt:1` detected
 * NOTHING where bare `hair` / `shirt` each gave 1 and `hair:2` gave 2. Bare IS
 * `:1` to the parser, so dropping it changes only what the tokenizer sees.
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
        .map(part => (n > 1 ? `${part}:${n}` : part))
        .join(', ');
}
