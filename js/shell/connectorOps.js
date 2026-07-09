/**
 * connectorOps.js — renderer-side helpers for the Cubric connector (MPI-5).
 *
 * The broker client lives in the server process; the renderer reaches it over
 * the existing localhost:3000 surface (same pattern as memoryOps.js). Both
 * helpers fail soft: a missing broker / absent Cubric Prompt yields
 * `available:false` or an `{ ok:false }` result, never a thrown error — so the
 * PromptBox stays a clean standalone editor when Prompt is not installed.
 */

/** True if Cubric Prompt is registered and advertises prompt.enhance. */
export async function checkPromptEnhanceAvailable() {
  try {
    const res = await fetch('/connector/capabilities');
    if (!res.ok) return false;
    const data = await res.json();
    return data.promptEnhance === true;
  } catch {
    return false;
  }
}

/**
 * Ask Cubric Prompt (via the broker) to enhance the current prompt.
 * @param {object} payload  { prompt, negativePrompt?, targetModelId?, operation?, injectionParams? }
 * @returns {Promise<{ ok: boolean, prompt?: string, negativePrompt?: string, error?: string }>}
 */
export async function enhancePrompt(payload) {
  try {
    const res = await fetch('/connector/enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ok && data.output) {
      return {
        ok: true,
        prompt: data.output.prompt,
        negativePrompt: data.output.negativePrompt,
        note: data.output.note, // set when Prompt fell back to a default recipe
      };
    }
    return { ok: false, error: data.error?.message || 'Enhance unavailable.' };
  } catch (err) {
    return { ok: false, error: err?.message || 'Enhance request failed.' };
  }
}
